import { strict as assert } from "node:assert";
import { FightRule } from "./FightRule";
import type { FightUnit, HurtOptions } from "../Unit/FightUnit";
import { skillAttackFunc } from "../Skills/Funcs/NomalSkill";
import { attackFunc } from "../Skills/Funcs/NormalAttack";

// 只在允许攻击时计次；完整 action 结束后，对伤害来源发动普通攻击，不走 fback。
export class FightRuleHurt extends FightRule {
    private hits = 0;
    constructor(readonly every: number, readonly skill?: number) {
        super();
        assert.ok(Number.isSafeInteger(every) && every > 0, "every must be a positive safe integer");
        assert.ok(skill === undefined || (Number.isSafeInteger(skill) && skill > 0), "skill must be a positive safe integer");
    }
    override startFight(unit: FightUnit) { this.hits = 0; }
    protected override onAdded(unit: FightUnit) {
        this.hits = 0;
        this.listen(unit, "hurt", (owner, ctx, attacker: FightUnit, hp: number, source?: HurtOptions) => {
            if (owner.isForbid("attack")) return;
            if (hp <= 0 || source?.source !== "skill" || attacker === owner || attacker.side === owner.side) return;
            if (++this.hits % this.every !== 0) return;
            ctx.fight.afterAction(() => {
                if (!this.isBoundTo(owner) || owner.isDied() || owner.getHp() <= 0 || attacker.isDied() ||
                    owner.fight !== ctx.fight || attacker.fight !== ctx.fight ||
                    !ctx.fight.getAllUnits().includes(owner) || !ctx.fight.getAllUnits().includes(attacker) ||
                    owner.side === attacker.side || owner.getActionBlockBuff() || owner.isForbid("attack")) return;
                const skill = this.skill === undefined ? undefined : owner.findSkill(this.skill);
                if (this.skill !== undefined && (!skill || skill.getFunc() !== "normal")) return;
                // 新攻击沿用普通攻击属性与反应预算，不走反击属性，也不进入行动条。
                ctx.msgs.push(["aiAttack", owner.uid, attacker.uid]);
                if (skill) skillAttackFunc(owner, attacker, skill, ctx);
                else attackFunc(owner, attacker, ctx);
            });
        });
    }
}
