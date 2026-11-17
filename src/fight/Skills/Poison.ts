import { FightUnit } from "../Unit/FightUnit";
import { attrFunc, AttrSkill } from "./AttrSkill";
import { afterHurt } from "./Buff";
import { FightSkill } from "./FightSkill";
import { FightContex } from "./NormalAttack";

export function poison(attacker: FightUnit, defender: FightUnit, skill:AttrSkill, name: string, ctx: FightContex) {
    if (defender.inStatus("禁毒")) {
        ctx.msgs.push(["百毒不侵", defender.uid])
        return false;
    }
    
    const damage = skill.calcPoison(ctx.fight, defender, ctx);
    if (damage <= 0) {
        ctx.msgs.push(["百毒不侵", defender.uid])
        return false;
    }

    defender.onHurt(attacker, name, damage, ctx);
    afterHurt(attacker, defender, skill, ctx);
    return true;
}

export function poisonFunc(attacker: FightUnit, defender: FightUnit, skill:FightSkill, ctx: FightContex) {
    return attrFunc("poison", poison, attacker, defender, skill, ctx);
}
