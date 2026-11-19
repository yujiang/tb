import { strict as assert } from "node:assert";
import { FightAI } from "./FightAI";
import type { FightContex } from "../Fight";
import type { FightUnit } from "../Unit/FightUnit";
import { FightCmdEnum, FightInput } from "../struct";

// 周期技能占本次普通行动，与全体破盾的额外 ultimate 机会无关。
export class FightAITurn extends FightAI {
    private selectedTurn = -1;
    constructor(readonly every: number, readonly skill: number) {
        super();
        assert.ok(Number.isSafeInteger(every) && every > 0, "every must be a positive safe integer");
        assert.ok(Number.isSafeInteger(skill) && skill > 0, "skill must be a positive safe integer");
    }
    override startFight(unit: FightUnit) { this.selectedTurn = -1; }
    override waitInput(unit: FightUnit, turn: number, ctx: FightContex): FightInput | undefined {
        if (turn > 0 && turn % this.every === 0 && this.selectedTurn !== turn) {
            const input = { cmd: FightCmdEnum.skill, skill: this.skill };
            if (ctx.fight.checkPC(unit, input)) { this.selectedTurn = turn; return input; }
        }
        return super.waitInput(unit, turn, ctx);
    }
}
