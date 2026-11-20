import { strict as assert } from "node:assert";
import { FightUnit } from "./Unit/FightUnit";
import { FightActionDisplay, FightCmdEnum, FightInput, InsertActionPos } from "./struct";

export interface FightAction {
    id: number;
    unit: FightUnit;
    input?: FightInput; // 追加行动保存自己的指令，不占用 unit.input
    inserted: boolean;
    after?: number;
    speedRate?: number; // 模板额外行动随单位速度参与排序；动态插队不设置此字段。
}

// 同一单位可以有多个独立行动；普通行动和模板额外行动按速度排序，动态插队保留指定位置。
export class FightActionQueue {
    private entries: FightAction[] = [];
    private nextId = 0;
    // 尚未执行的队首插队行动ID；Set保留添加顺序，用于让多次队首插入保持先来先执行。
    // 例如原队列[A,B]，依次插入X、Y后为[X,Y,A,B]，而不是每次插下标0得到[Y,X,A,B]。
    private firstActions = new Set<number>();
    private insertedCount = 0;
    get actions(): readonly FightAction[] { return this.entries; }
    get units(): FightUnit[] { return this.entries.map(action => action.unit); }
    get length() { return this.entries.length; }
    clear() { this.entries = []; this.nextId = 0; this.firstActions.clear(); this.insertedCount = 0; }
    reset(units: FightUnit[]) {
        this.firstActions.clear(); this.insertedCount = 0;
        this.entries = [];
        for (const unit of units) {
            this.entries.push({ id: this.nextId++, unit, inserted: false });
            for (const [speedRate, skill] of unit.getExtraActions()) {
                assert.ok(Number.isFinite(speedRate) && speedRate >= 0, "extraAction speed rate must be finite and nonnegative");
                assert.ok(Number.isSafeInteger(skill) && skill >= 0, "extraAction skill must be a nonnegative safe integer");
                if (this.insertedCount >= 64) throw new Error("Action insertion limit exceeded (64 per round)");
                this.entries.push({ id: this.nextId++, unit, inserted: true, speedRate,
                    ...(skill !== 0 ? { input: { cmd: FightCmdEnum.skill, skill } } : {}) });
                this.insertedCount++;
            }
        }
    }
    shift() {
        const action = this.entries.shift();
        // 已出队的行动不再作为下一次队首插入的锚点。
        if (action) this.firstActions.delete(action.id);
        return action;
    }
    display(): FightActionDisplay[] {
        return this.entries.map(action => ({ id: action.id, uid: action.unit.uid,
            ...(action.inserted ? { inserted: true, ...(action.input?.skill !== undefined ? { skill: action.input.skill } : {}) } : {}),
            ...(action.speedRate !== undefined ? { speedRate: action.speedRate } : {}) }));
    }
    insert(unit: FightUnit, input: FightInput, pos: InsertActionPos, random: () => number, current?: FightAction): FightAction {
        assert.ok([InsertActionPos.first, InsertActionPos.last, InsertActionPos.random, InsertActionPos.afterSelf].includes(pos), "Invalid insertion position");
        if (this.insertedCount >= 64) throw new Error("Action insertion limit exceeded (64 per round)");
        let index: number;
        let after: number | undefined;
        if (pos === InsertActionPos.last) index = this.entries.length;
        else if (pos === InsertActionPos.random) index = this.entries.length ? Math.floor(random() * (this.entries.length + 1)) : 0;
        else {
            if (pos === InsertActionPos.afterSelf) {
                const anchor = current?.unit === unit ? current : this.entries.find(action => !action.inserted && action.unit === unit);
                if (anchor) {
                    after = anchor.id;
                    const anchorIndex = this.entries.findIndex(action => action.id === after);
                    index = anchorIndex + 1;
                    while (index < this.entries.length && this.entries[index].after === after) index++;
                }
            }
            if (index === undefined) {
                // first，或afterSelf找不到自身行动时：接在最后一条尚未执行的队首插队后面。
                // 集合为空时才插入下标0；取消尾项后，也能自然退回上一条仍在队列中的插队行动。
                const firstTail = [...this.firstActions].pop();
                const tail = this.entries.findIndex(action => action.id === firstTail);
                index = tail < 0 ? 0 : tail + 1;
            }
        }
        const action: FightAction = { id: this.nextId++, unit, input: { ...input }, inserted: true, ...(after !== undefined ? { after } : {}) };
        this.entries.splice(index, 0, action);
        // 只登记采用队首插入规则的行动；指定队尾、随机位置或已有afterSelf锚点的不登记。
        if (pos === InsertActionPos.first || (pos === InsertActionPos.afterSelf && after === undefined)) this.firstActions.add(action.id);
        this.insertedCount++;
        return action;
    }
    cancel(id: number): boolean {
        const index = this.entries.findIndex(action => action.id === id);
        if (index < 0 || !this.entries[index].inserted) return false;
        // 取消时同步移除锚点，避免后续插队仍引用已不存在的行动。
        this.entries.splice(index, 1); this.firstActions.delete(id); return true;
    }
    sort(compare: (a: FightUnit, b: FightUnit) => number, compareActions?: (a: FightAction, b: FightAction) => number) {
        const sortable = (action: FightAction) => !action.inserted || action.speedRate !== undefined;
        const ordinary = this.entries.filter(sortable).sort((a, b) => compareActions ? compareActions(a, b) : compare(a.unit, b.unit));
        let index = 0;
        this.entries = this.entries.map(action => sortable(action) ? ordinary[index++] : action);
        // 随速度移动的普通行动仍携带其“自己行动后”的追加行动。
        for (const anchor of ordinary) {
            const following = this.entries.filter(action => action.after === anchor.id);
            if (!following.length) continue;
            this.entries = this.entries.filter(action => action.after !== anchor.id);
            this.entries.splice(this.entries.indexOf(anchor) + 1, 0, ...following);
        }
    }
}
