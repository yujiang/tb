// 治疗

import { FightUnit } from "../Unit/FightUnit";
import { calcHeal, mergeTable } from "./Calc";
import { FightSkill } from "./FightSkill";
import { DamageLost, FightContex } from "./NormalAttack";


function heal(attacker: FightUnit, defender: FightUnit, skill:FightSkill, name: string, ctx: FightContex) {
    const f = ctx.fight;
    const a = mergeTable(skill.getAttack(),attacker.attr.heal);
    const d = defender.attr.heal;

    const damage = calcHeal(f, a, d, ctx);
    if (damage <= 0) {
        ctx.msgs.push(["禁疗", defender.uid])
        return false;
    }

    defender.onHeal(attacker, name, damage, ctx);
    return true;
}

export function healFunc(attacker: FightUnit, defender: FightUnit, skill:FightSkill, ctx: FightContex) {

    heal(attacker, defender, skill, "heal", ctx);
    const spread = skill.getSpreadSkill();
    if (spread) {
        spreadHeal(attacker, defender, spread, ctx);
    }
    return true;
}

function spreadHeal(attacker: FightUnit, defender: FightUnit, skill:FightSkill, ctx: FightContex) {
    const f = ctx.fight;
    //const xls = skill.xls;
    const targets = f.selectTargets(defender, skill.getSel());
    if (!targets?.length) return

    const ids = targets.map((target) => {
        return target.uid;
    });
    ctx.msgs.push(["spread", ids]);
    for (const target of targets) {
        heal(attacker, target, skill, "spread", ctx);
    }
}