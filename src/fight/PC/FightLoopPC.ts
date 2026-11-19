
// 单机游戏

import { initFightContex } from "../Fight";
import { FightLoop } from "../FightLoop";
import { FightCmdEnum, FightInput } from "../struct";
import { FightUnit } from "../Unit/FightUnit";

// 每个玩家单位单独下指令
export class FightLoopPC extends FightLoop {
    private started = false;
    private running: Promise<void> | undefined;
    private waiting: { unit: FightUnit; turn: number; resolve: (input?: FightInput) => void } | undefined;

    get inputUnit(): FightUnit | undefined { return this.waiting?.unit; }

    override start() {
        this.closeInput();
        this.started = true;
        super.start();
        this.fight.offUnitEvent("die", this.onWaitingUnitDied);
        this.fight.onUnitEvent("die", this.onWaitingUnitDied);
    }

    override nextTurn() {
        this.closeInput();
        return super.nextTurn();
    }

    override processOneTurn(turn: number): Promise<void> {
        if (!this.started || this.fight.isEnd() || turn !== this.fight.turn) return Promise.resolve();
        if (!this.running) this.running = this.processQueue(turn);
        return this.running;
    }

    private async processQueue(turn: number) {
        // 先完成 running 赋值，输入与消息回调重入时复用同一轮调度。
        await Promise.resolve();
        try {
            while (this.started && !this.fight.isEnd() && this.fight.turn === turn && this.processUnits?.length) {
                const unit = this.processUnits.shift();
                if (unit.isDied()) {
                    this.bcMsg(["sort", this.processUnits.map(unit => unit.uid)]);
                    continue;
                }
                this.bcMsg(["actor", unit.uid, unit.getSpeed()]);
                const before = initFightContex(this.fight);
                this.fight.resolveAction(() => unit.inputStart(turn, before));
                this.bcMsg(before.msgs);
                if (before.msgs.length) {
                    await this.waitDrawOver();
                    await this.processUltimate(turn);
                }
                if (!this.started || this.fight.isEnd() || this.fight.turn !== turn) break;
                if (unit.isDied()) continue;

                let input = unit.input ?? { cmd: FightCmdEnum.none };
                if (unit.needInput() && !unit.getActionBlockBuff()) {
                    input = await this.waitUnitInput(unit, turn);
                    if (!this.started || this.fight.isEnd() || this.fight.turn !== turn) break;
                    if (!input) continue;
                    if (!this.fight.checkPC(unit, input)) continue;
                }
                const ctx = this.fight.processUnit(unit, input);
                if (ctx) this.bcMsg(ctx.msgs);
                await this.waitDrawOver();
                await this.processUltimate(turn);
            }
        } catch (error) {
            this.started = false;
            this.fight.offUnitEvent("die", this.onWaitingUnitDied);
            throw error;
        } finally {
            this.closeInput();
            this.running = undefined;
        }
    }

    private waitUnitInput(unit: FightUnit, turn: number): Promise<FightInput | undefined> {
        const input = new Promise<FightInput | undefined>(resolve => {
            this.waiting = { unit, turn, resolve };
        });
        // 回调放在 Promise executor 外，提交同步完成后再抛错也必须传给宿主。
        this.emitEvent("input", unit, turn);
        return input;
    }

    override onInput(id: number, input: FightInput): boolean {
        const pending = this.waiting;
        if (!this.started || !pending || this.fight.isEnd() || id !== pending.unit.uid ||
            pending.turn !== this.fight.turn || !input || (input.turn !== undefined && input.turn !== pending.turn)) return false;
        const unit = pending.unit;
        if (unit.isDied() || !unit.needInput()) {
            this.closeInput();
            return false;
        }
        if (unit.getActionBlockBuff()) {
            unit.hintClient("当前无法行动");
            this.closeInput({ cmd: FightCmdEnum.none });
            return false;
        }
        if (!this.fight.checkPC(unit, input)) return false;
        if (input.cmd === FightCmdEnum.cancel) {
            unit.input = null;
            return true;
        }
        const prepared = this.fight.preparePCInput(unit, input);
        if (!prepared) return false;
        unit.input = prepared;
        this.closeInput({ ...unit.input });
        return true;
    }

    private closeInput(input?: FightInput) {
        const pending = this.waiting;
        this.waiting = undefined;
        pending?.resolve(input);
    }

    private onWaitingUnitDied = (unit: FightUnit) => {
        if (this.waiting?.unit === unit) this.closeInput();
    };

    // 每个行动已经单独等待动画，回合末无须再等一次。
    protected override async waitTurnDrawOver() {}

    override end() {
        this.started = false;
        this.closeInput();
        this.fight.offUnitEvent("die", this.onWaitingUnitDied);
        super.end();
    }
}
 
