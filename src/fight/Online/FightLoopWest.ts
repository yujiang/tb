import { setTimeout as delay } from "node:timers/promises";
import { FightContex } from "../Fight";
import { FightInput } from "../struct";
import { FightUnit } from "../Unit/FightUnit";
import { FightLoopOnline } from "./FightLoopOnline";

// 梦幻西游
// 网游的常规流程, 指令全部下完,统一处理

export class FightLoopWest extends FightLoopOnline {
    loopUnits: FightUnit[];
    private inputOrderReady = false;

    override sortUnitsByProcess(withInput = true) {
        this.inputOrderReady = withInput;
        return super.sortUnitsByProcess(withInput);
    }
    override async processOneTurn(turn: number) {
        // 根据玩家速度来建立出手列表
        // 按出手列表顺序,依次处理
        let index = 0;
        let all = this.processUnits;
        this.inputOrderReady = true;
        // 指令收齐后按优先级、速度统一排序，先同步行动条，再逐个执行。
        all.sort((a, b) => this.compareProcessUnits(a, b));
        this.bcMsg(["sort", all.map(u => u.uid)]);
        while (all.length && !this.fight.isEnd() && !this.stopped) {
            const u = all.shift();
            let ctx = u.processOneTurn(turn);
            if (ctx) {
                ctx.msgs.unshift(["actor", u.uid, u.getSpeed()]);
                this.bcMsg(ctx.msgs);
                if (this.fight.xls.allShieldBreak) await this.processUltimate(turn, true);
            }
            index++;
        }
    }

    override onChangeSpeed(u: FightUnit) {
        const all = this.processUnits;
        if (all?.includes(u)) {
            // this.processUnits 重新排序？
            all.sort((a, b) => this.compareProcessUnits(a, b, this.inputOrderReady));
            this.bcMsg(["sort", all.map(u => u.uid)]);
        }
    }

    input = 0;
    inputed = 0;
    inputResolve: (value: number) => void = null;
    override async waitInput(turn: number, ctx: FightContex): Promise<number> {
        const all = this.fight.getAllUnits();
        let input = 0;
        this.fight.resolveAction(() => {
            for (const u of all) {
                u.inputStart(turn, ctx);
                if (u.needInput()) input++;
            }
        });
        this.input = this.fight.isEnd() ? 0 : input;
        this.inputed = 0;
        this.inputResolve = null;
        if (this.input == 0) return 1;
        const p = new Promise<number>((resolve) => {
            this.inputResolve = resolve;
        });
        const wait = this.fight.xls.waitInputSec || 30;
        const timer = new AbortController();
        const p2 = delay(wait * 1000, 0, { signal: timer.signal });
        try {
            return await Promise.race([p, p2]);
        } finally {
            this.input = 0;
            this.inputResolve = null;
            timer.abort();
        }
    }

    onInput(id: number, input: FightInput) {
        if (this.input == 0 || this.fight.isEnd() || input?.turn !== this.fight.turn) return;

        const unit = this.fight.getUnitById(id);
        if (unit && unit.needInput()) {
            const isnull = (unit.input == null);
            if (unit.onInput(input) && unit.needInput()) {
                if (unit.input && isnull) {
                    this.inputed++;
                    if (this.inputed >= this.input) {
                        this.input = 0;
                        this.inputResolve?.(1);
                    }
                }
                else if (!unit.input && !isnull) { //取消输入
                    this.inputed--;
                }
            }
        }
    }
}
