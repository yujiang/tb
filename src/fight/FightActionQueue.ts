import { strict as assert } from "node:assert";
import { FightUnit } from "./Unit/FightUnit";
import { FightActionDisplay, FightInput, InsertActionPos } from "./struct";

export interface FightAction {
    id: number;
    unit: FightUnit;
    input?: FightInput; // 追加行动保存自己的指令，不占用 unit.input
    inserted: boolean;
    after?: number;
}

// 同一单位可以有多个独立行动；速度排序只调整普通行动，插入位置不参与速度竞争。
export class FightActionQueue {
    private entries: FightAction[] = [];
    private nextId = 0;
    private firstActions = new Set<number>();
    private insertedCount = 0;
    get actions(): readonly FightAction[] { return this.entries; }
    get units(): FightUnit[] { return this.entries.map(action => action.unit); }
    get length() { return this.entries.length; }
    clear() { this.entries = []; this.nextId = 0; this.firstActions.clear(); this.insertedCount = 0; }
    reset(units: FightUnit[]) {
        this.entries = units.map(unit => ({ id: this.nextId++, unit, inserted: false }));
        this.firstActions.clear(); this.insertedCount = 0;
    }
    shift() {
        const action = this.entries.shift();
        if (action) this.firstActions.delete(action.id);
        return action;
    }
    display(): FightActionDisplay[] {
        return this.entries.map(action => ({ id: action.id, uid: action.unit.uid,
            ...(action.inserted ? { inserted: true, ...(action.input?.skill !== undefined ? { skill: action.input.skill } : {}) } : {}) }));
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
                const firstTail = [...this.firstActions].pop();
                const tail = this.entries.findIndex(action => action.id === firstTail);
                index = tail < 0 ? 0 : tail + 1;
            }
        }
        const action: FightAction = { id: this.nextId++, unit, input: { ...input }, inserted: true, ...(after !== undefined ? { after } : {}) };
        this.entries.splice(index, 0, action);
        if (pos === InsertActionPos.first || (pos === InsertActionPos.afterSelf && after === undefined)) this.firstActions.add(action.id);
        this.insertedCount++;
        return action;
    }
    cancel(id: number): boolean {
        const index = this.entries.findIndex(action => action.id === id);
        if (index < 0 || !this.entries[index].inserted) return false;
        this.entries.splice(index, 1); this.firstActions.delete(id); return true;
    }
    sort(compare: (a: FightUnit, b: FightUnit) => number) {
        const ordinary = this.entries.filter(action => !action.inserted).sort((a, b) => compare(a.unit, b.unit));
        let index = 0;
        this.entries = this.entries.map(action => action.inserted ? action : ordinary[index++]);
        // 随速度移动的普通行动仍携带其“自己行动后”的追加行动。
        for (const anchor of ordinary) {
            const following = this.entries.filter(action => action.after === anchor.id);
            if (!following.length) continue;
            this.entries = this.entries.filter(action => action.after !== anchor.id);
            this.entries.splice(this.entries.indexOf(anchor) + 1, 0, ...following);
        }
    }
}
