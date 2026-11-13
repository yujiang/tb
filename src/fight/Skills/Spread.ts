import { FightUnit } from "../Unit/FightUnit";
import { FightSkill } from "./FightSkill";
import { DamageLost, FightContex } from "./NormalAttack";
import { afterSkillAttack, skillAttack, skillAttackFunc } from "./SkillAttack";
import { getSkillById } from "./Skills";

// 溅射的一般认为不搞反击追击那一套
export function spreadFunc(attacker: FightUnit, defender: FightUnit, skill:FightSkill, ctx: FightContex) {
    const rt = skillAttack(attacker, defender, skill, "skill", 0, ctx);
    if (!rt) return ctx;

    spread(attacker, defender, skill, ctx);
    afterSkillAttack(attacker, defender, skill, ctx);
    return ctx;
}

export function spread(attacker: FightUnit, defender: FightUnit, skill:FightSkill, ctx: FightContex) {
    const f = ctx.fight;
    const xls = skill.xls;
    const targets = f.selectTargets(defender, xls.sel);
    if (!targets || targets?.length > 0) return

    const ids = targets.map((target) => {
        return target.uid;
    });
    ctx.msgs.push(["spread", ids]);

    // 有spread技能，优先用spread技能，否则用自身的技能固定0.7的减伤~
    const spreadSkill = getSkillById(xls.spread);
    for (const target of targets) {
        skillAttack(attacker, target, spreadSkill||skill, "", 
            spreadSkill ? 0 : DamageLost.skillSpread, ctx);
    }
}

