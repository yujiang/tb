// 有休息 Buff 时跳过主动行动；施放后的下一完整回合结束时到期。
import { FightBuff } from "../FightBuff";
import type { FightContex } from "../../Fight";
import type { FightUnit } from "../../Unit/FightUnit";

export class BuffRest extends FightBuff {
    override blocksAction(): boolean {
        return true;
    }

    override onAdded(unit: FightUnit) {
        this.start = unit.fight?.turn ?? 0;
        this.lastTurn = this.xls.lastTurn ?? 1;
        this.func = this.onEvent.bind(this);
        unit.onContex("afterTurn", this.func, this.xls.prior ?? 0);
    }

    override onRemoved(unit: FightUnit) {
        if (this.func) unit.offContex("afterTurn", this.func);
        this.func = null;
    }

    override onEvent(unit: FightUnit, ctx: FightContex, turn: number) {
        if (unit.findBuff(this.getId()) === this && this.lastTurn > 0 && turn >= this.start + this.lastTurn) {
            unit.expireBuff(this, "turn", ctx);
        }
    }

    // 休息的持续时间由回合后处理，不能在回合前或输入时提前移除。
    override doTurn(): boolean {
        return false;
    }
}
