import { strict as assert } from "node:assert";
import { FightRule } from "./FightRule";
import type { FightContex } from "../Fight";
import type { FightUnit } from "../Unit/FightUnit";
import { FightCmdEnum, InsertActionPos } from "../struct";
import type { RuleData } from "./RuleDatas";

// 周期技能插入独立行动，不占普通行动，也不占全体破盾大招机会。
export class FightRuleTurn extends FightRule {
    private selectedTurn = -1;
    get every() { return this.xls.every; }
    get skill() { return this.xls.skill; }
    get pos() { return this.xls.pos ?? InsertActionPos.first; }
    constructor(xls: RuleData) {
        super(xls);
        const { every, skill } = xls;
        const pos = this.pos;
        assert.ok(Number.isSafeInteger(every) && every > 0, "every must be a positive safe integer");
        assert.ok(Number.isSafeInteger(skill) && skill > 0, "skill must be a positive safe integer");
        assert.ok([InsertActionPos.first, InsertActionPos.last, InsertActionPos.random, InsertActionPos.afterSelf].includes(pos), "Invalid insertion position");
    }
    override startFight(unit: FightUnit) { this.selectedTurn = -1; }
    override beforeTurn(unit: FightUnit, turn: number, ctx: FightContex) {
        if (turn > 0 && turn % this.every === 0 && this.selectedTurn !== turn) {
            const input = { cmd: FightCmdEnum.skill, skill: this.skill };
            if (ctx.fight.checkPC(unit, input) && ctx.fight.insertAction(unit, input, this.pos, ctx)) this.selectedTurn = turn;
        }
    }
}
