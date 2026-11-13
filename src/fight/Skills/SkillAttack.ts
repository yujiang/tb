import { FightUnit } from "../FightUnit";
import { FightSkill, } from "./FightSkill";
import { attack,  FightContex } from "./NormalAttack";
import { getSkillById } from "./Skills";

// 普通技能
export function skillAttack(attacker: FightUnit, defender: FightUnit, skill:FightSkill, name: string, ctx: FightContex) {
    if (name) ctx.msgs.push([name, skill.getId(), attacker.uid, defender.uid])

    const attack = skill.calcAttack(attacker);
    const defend = skill.calcDefend(defender);
    const d1 = attack - defend;
    const damage = Math.max(Math.floor(d1),1);
    defender.onHurt(attacker, damage, ctx);    
    
    return ctx;
}

export function skillKill(attacker: FightUnit, sk:FightSkill, ctx: FightContex) {
    const f = ctx.fight;
    const skill = getSkillById(sk.xls.skill);
    if (!skill || f.random() > skill.xls.rand) return;

    const des = f.randomEnemyAlive(attacker.side);    
    if (des) {
        ctx.killNum = (ctx.killNum || 0) + 1;
        skillAttack(attacker, des, skill, "skillKill", ctx);
    }
}

export function skillNext(attacker: FightUnit, sk:FightSkill, ctx: FightContex) {
    const f = ctx.fight;
    const skill = getSkillById(sk.xls.next);
    if (!skill || f.random() > skill.xls.rand) return;

    const des = f.randomEnemyAlive(attacker.side);    
    if (des) {
        ctx.nextNum = (ctx.nextNum || 0) + 1;
        skillAttack(attacker, des, skill, "skillNext", ctx);
    }
}

export function skillAttackFunc(attacker: FightUnit, defender: FightUnit, skill:FightSkill, ctx: FightContex) {
    skillAttack(attacker, defender, skill, "skill", ctx);
    if (defender.isDied()){
        //追击
        skillKill(attacker, skill, ctx);
    }
    else {
        //反击
        const f = ctx.fight;
        let back = false;
        const rand = skill.xls.nobackRand
        if (!rand || f.random() > rand) {
            back = skillBack(defender, attacker, ctx);
        }
        if (!back) {
            skillNext(attacker, skill, ctx);
        }
    }    
    return ctx;
}

export function skillBack(attacker: FightUnit, defender: FightUnit, ctx: FightContex) {
    const f = ctx.fight;
    if (f.random() < 0.5) return false;

    // TODO: 也可能用技能反击,要看defender装备的反击技能
    attack(attacker, defender, "skillBack", ctx);
    return true;
}