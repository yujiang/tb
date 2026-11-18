import { FightUnit } from "../Unit/FightUnit";
import { afterSelfBuff, nohurtFunc } from "./Funcs/Buff";
import { FightSkill } from "./FightSkill";
import { healFunc } from "./Funcs/Heal";
import { skillAttackFunc } from "./Funcs/NomalSkill";
import { poisonFunc } from "./Funcs/Poison";
import { relifeFunc } from "./Funcs/Relife";
import { FightContex } from "../Fight";


export type SkillFuncType = (attacker: FightUnit, defender: FightUnit, skill: FightSkill, ctx: FightContex) => boolean;
const SkillFuncMap: Record<string, SkillFuncType> = {
    normal: skillAttackFunc,
    heal: healFunc,
    poison: poisonFunc,
    relife: relifeFunc,
    nohurt: nohurtFunc, //没有伤害
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

    const result = func(attacker, defender, skill, ctx);
    // 普通攻击类在整条反应链结束后处理自身效果；其余技能在本次执行完成后处理。
    if (result && func !== skillAttackFunc) afterSelfBuff(attacker, skill, ctx);
    return result;
}
