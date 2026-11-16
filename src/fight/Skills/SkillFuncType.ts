import { FightUnit } from "../Unit/FightUnit";
import { FightSkill } from "./FightSkill";
import { healFunc } from "./Heal";
import { skillAttackFunc } from "./NomalSkill";
import { FightContex } from "./NormalAttack";


export type SkillFuncType = (attacker: FightUnit, defender: FightUnit, skill: FightSkill, ctx: FightContex) => boolean;
const SkillFuncMap: Record<string, SkillFuncType> = {
    normal: skillAttackFunc,
    heal: healFunc,
};

export function skillFunc(attacker: FightUnit, defender: FightUnit, skillId: number, ctx: FightContex) {
    const skill = attacker.findSkill(skillId);
    if (!skill) return;

    const f = ctx.fight;

    // defender 可能不合适了，因为可能被前面的人打飞了~
    const sel = skill.getSel();
    if (!defender || !defender.isFillterDie(sel.die)) {
        defender = f.selectMainTarget(attacker, sel);
        if (!defender) return;
    }

    const func = SkillFuncMap[skill.getFunc()] || skillAttackFunc;
    if (!func) return;

    const cost = skill.getCost();
    if (cost && !attacker.costSkill(cost, ctx)) return;

    return func(attacker, defender, skill, ctx);
}
