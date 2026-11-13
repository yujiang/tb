// 治疗

import { FightUnit } from "../FightUnit";
import { FightSkill } from "./FightSkill";
import { FightContex } from "./NormalAttack";

export function healFunc(attacker: FightUnit, defender: FightUnit, skill:FightSkill, ctx: FightContex) {
    const a = attacker.attr;
    const heal = a.getAttr("heal") || 0
    const fheal = (heal + skill.getValue()) * (1 + skill.getValuePercent());
    defender.onHeal(attacker, fheal, ctx);
    return ctx;
}