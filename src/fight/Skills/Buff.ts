
// 没有伤害的

import { FightUnit } from "../Unit/FightUnit";
import { FightSkill } from "./FightSkill";
import { FightContex } from "./NormalAttack";

export function addBuffFunc(attacker: FightUnit, defender: FightUnit, skill:FightSkill, ctx: FightContex) {
    const addbuff = skill.getXls().addBuff;
    if (!addbuff) return false;
    const f = ctx.fight;
    for (const buff of addbuff) {
        let [id, lv, rand]  = buff;
        if (rand < 1 && f.random() > rand) continue;
        defender.addBuff(attacker, "buff", id, lv, ctx);
    }
    return true;
}

export function removeBuffFunc(attacker: FightUnit, defender: FightUnit, skill:FightSkill, ctx: FightContex) {
    const xls = skill.getXls();
    const buffs = xls.rmeoveBuff;
    if (buffs){
        const f = ctx.fight;
        for (const buff of buffs) {
            let [id, rand]  = buff;
            if (rand < 1 && f.random() > rand) continue;
            defender.removeBuff(attacker, "buff", id, ctx);
        }
    }
    const tag = xls.removeBuffTag;   
    if (tag){
        defender.removeBuffByTag(attacker, "buff", tag, xls.removeBuffNum, ctx);
    }        
    return !!(buffs || tag);
}

export function afterHurt(attacker: FightUnit, defender: FightUnit, skill:FightSkill, ctx: FightContex) {
    addBuffFunc(attacker, defender, skill, ctx);
    removeBuffFunc(attacker, defender, skill, ctx);
}
