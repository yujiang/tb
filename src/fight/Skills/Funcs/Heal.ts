// 治疗

import { FightUnit } from "../../Unit/FightUnit";
import { attrFunc, AttrSkill } from "../AttrSkill";
import { afterHurt } from "./Buff";
import { FightSkill } from "../FightSkill";
import { FightContex } from "../../Fight";

export function heal(attacker: FightUnit, defender: FightUnit, skill:AttrSkill, name: string, ctx: FightContex) {
    if (defender.inStatus("禁疗")) {
        ctx.msgs.push(["禁疗", defender.uid])
        return false;
    }

    const heal = skill.calcHeal(ctx.fight, defender, ctx, attacker);
    if (heal <= 0) {
        ctx.msgs.push(["禁疗", defender.uid])
        return false;
    }

    defender.onHeal(attacker, name, heal, ctx);
    afterHurt(attacker, defender, skill, ctx);
    return true;
}


export function healFunc(attacker: FightUnit, defender: FightUnit, skill:FightSkill, ctx: FightContex) {
    return attrFunc("heal", heal, attacker, defender, skill, ctx);
}
