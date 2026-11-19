import { setImmediate } from "node:timers/promises";
import { FightContex } from "../Fight";
import { FightCmdEnum, FightInput } from "../struct";
import { FightLoopOnline } from "./FightLoopOnline";
import { FightUnitMonster } from "../Unit/FightUnitMonster";
import type { FightUnit } from "../Unit/FightUnit";

// 烟雨江湖
// 对位自动普攻自动打, 玩家只需要按技能
// 技能不排序，不进入行动条，一按就立即释放（这个要严格检查是否可放）。
// 但是有可能在动画中，a,b同时按了技能，还是有一个技能队列在。

export class FightLoopYanYu extends FightLoopOnline {
    private started = false;
    private accepting = false;
    private skills: { id: number; input: FightInput }[] = [];
    private running: Promise<void> | undefined;
    private automaticTurn: number | undefined;

    override start() {
        this.started = true;
        this.accepting = false;
        this.skills.length = 0;
        this.automaticTurn = undefined;
        super.start();
    }

    override nextTurn() {
        this.accepting = false;
        this.skills.length = 0;
        return super.nextTurn();
    }

    override async waitInput(turn: number, ctx: FightContex): Promise<number> {
        this.accepting = false;
        if (!this.started || this.fight.isEnd() || turn !== this.fight.turn) return 0;
        this.fight.resolveAction(() => {
            for (const unit of this.fight.getAllUnits()) unit.inputStart(turn, ctx);
        });
        this.accepting = !this.fight.isEnd();
        return 1; // 自动普攻不等待玩家收齐指令。
    }

    override async processOneTurn(turn: number) {
        if (!this.started || this.fight.isEnd() || turn !== this.fight.turn) return;
        this.automaticTurn = turn;
        await this.drain(turn);
    }

    // 返回是否接受入队；实际执行时仍复验，等待期间可能死亡、封印或资源不足。
    override async onInput(id: number, input: FightInput): Promise<boolean> {
        try {
            if (!this.canCast(id, input)) return false;
            this.skills.push({ id, input: { ...input } });
            await this.drain(this.fight.turn);
            return !this.failed;
        } catch (error) { this.fail(error, this.fight.getUnitById(id), input); return false; }
    }

    private canCast(id: number, input: FightInput): boolean {
        const fight = this.fight;
        if (!this.started || !this.accepting || fight.isEnd() || !Number.isSafeInteger(id) || input?.turn !== fight.turn ||
            input.cmd !== FightCmdEnum.skill) return false;
        const unit = fight.getUnitById(id);
        if (!unit?.needInput()) return false;
        if (unit.isDied()) {
            unit.hintClient("自身已死亡，无法行动");
            return false;
        }
        if (unit.getActionBlockBuff()) {
            unit.hintClient("当前无法行动");
            return false;
        }
        if (!fight.checkOnline(unit, input)) return false;
        const cost = unit.findSkill(input.skill).getCost();
        return !cost || unit.canCost(cost);
    }

    private drain(turn: number): Promise<void> {
        if (!this.running) this.running = this.processQueue(turn);
        return this.running;
    }

    private async processQueue(turn: number) {
        let activeUnit: FightUnit | undefined;
        let activeInput: FightInput | undefined;
        // 先让 running 完成赋值，消息回调中的重入输入只入队，不另开结算循环。
        await Promise.resolve();
        try {
            while (this.started && !this.fight.isEnd() && this.fight.turn === turn) {
                activeUnit = undefined; activeInput = undefined;
                const queued = this.skills.shift();
                let ctx: FightContex;
                if (queued) {
                    activeUnit = this.fight.getUnitById(queued.id); activeInput = queued.input;
                    if (!this.canCast(queued.id, queued.input)) continue;
                    const unit = this.fight.getUnitById(queued.id);
                    ctx = this.fight.processUnit(unit, queued.input);
                    if (ctx) ctx.msgs.unshift(["actor", unit.uid, unit.getSpeed(), "skill"]);
                } else if (this.automaticTurn === turn && this.processUnits?.length) {
                    const action = this.takeAction(), unit = action.unit;
                    // 显式 FightAI 可以选择主动技能；未配置 AI 的单位保留原自动普攻行为。
                    const input = unit instanceof FightUnitMonster && unit.ai ? unit.input : undefined;
                    ctx = action.inserted ? this.insertedContext(action) : this.fight.processUnit(unit, input ?? { cmd: FightCmdEnum.attack });
                    if (ctx) ctx.msgs.unshift(this.actorMessage(action));
                    else this.syncActionOrder();
                } else break;
                if (ctx) {
                    this.bcMsg(ctx.msgs);
                    await this.waitDrawOver();
                    await this.processUltimate(turn);
                }
            }
            if (this.automaticTurn === turn || this.fight.isEnd()) this.accepting = false;
        } catch (error) {
            this.fail(error, activeUnit, activeInput);
        } finally {
            if (this.automaticTurn === turn) this.automaticTurn = undefined;
            if (!this.accepting || this.fight.isEnd()) this.skills.length = 0;
            this.running = undefined;
        }
    }

    // 无图形宿主时也让出事件循环，网络输入可在两次自动攻击之间到达。
    override async waitDrawOver() { await setImmediate(); }

    // 每次自动普攻和即时技能已各自等待，回合末不再等待一段没有对应消息的动画。
    protected override async waitTurnDrawOver() {}

    override end() {
        this.started = false;
        this.accepting = false;
        this.skills.length = 0;
        this.automaticTurn = undefined;
        super.end();
    }
}
