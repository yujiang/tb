import { FightUnit } from "../Unit/FightUnit";
import { FightSkill } from "./FightSkill";
import { FightContex } from "./NormalAttack";

export function relifeFunc(attacker: FightUnit, defender: FightUnit, skill:FightSkill, ctx: FightContex) {
    // return attrFunc("heal", heal, attacker, defender, skill, ctx);
    if (!defender.isDied()) {
        ctx.msgs.push(["无效", defender.uid])
        return false;
    }

    if (defender.inStatus("禁复活")) {
        ctx.msgs.push(["无法复活", defender.uid])
        return false;
    }

    defender.onRelife(attacker, "relife", ctx);    
    const heal = skill.getAttack().attack * attacker.getHpMax() ;
    defender.onHeal(attacker, "relife", heal, ctx);
    return true;
}