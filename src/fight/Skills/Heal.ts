// 治疗

import { FightUnit } from "../Unit/FightUnit";
import { FightSkill } from "./FightSkill";
import { DamageLost, FightContex } from "./NormalAttack";

export function heal(attacker: FightUnit, defender: FightUnit, skill:FightSkill, spread: number, ctx: FightContex) {
    const f = ctx.fight;
    const a = attacker.attr.heal;
    const d = defender.attr.heal;

    let d1 = skill.calcAttack(a.attack) - d.defend;
    if (d1 < 0) {
        ctx.msgs.push(["禁疗", defender.uid])
        return ctx;
    }

    const [damage, crit] = skill.calcHeal(f, a, d, spread);
    defender.onHeal(attacker, damage, crit, ctx);
    return ctx;
}

export function healFunc(attacker: FightUnit, defender: FightUnit, skill:FightSkill, ctx: FightContex) {
    heal(attacker, defender, skill, 0, ctx);

    return ctx;
}

export function spreadHeal(attacker: FightUnit, defender: FightUnit, skill:FightSkill, ctx: FightContex) {
    const f = ctx.fight;
    const xls = skill.xls;
    const targets = f.selectTargets(defender, xls.sel);
    if (!targets || targets?.length > 0) return

    const ids = targets.map((target) => {
        return target.uid;
    });
    ctx.msgs.push(["spread", ids]);
    for (const target of targets) {
        heal(attacker, target, skill, DamageLost.healSpread, ctx);
    }
}