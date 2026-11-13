import { FightUnit } from "../Unit/FightUnit";
import { FightSkill, } from "./FightSkill";
import { attack, FightContex } from "./NormalAttack";
import { getSkillById } from "./Skills";

// 普通技能
export function skillAttack(attacker: FightUnit, defender: FightUnit, skill:FightSkill, name: string,  spread: number, ctx: FightContex) {
    // assert(skill);
    const f = ctx.fight;
    if (f.random() > skill.xls.rand) {
        ctx.msgs.push(["skillmiss", skill.getId(), attacker.uid, defender.uid])
        return false;
    }

    // 方便客户端绘制
    if (name) {
        ctx.msgs.push([name, skill.getId(), attacker.uid, defender.uid])
    }

    const a = skill.xls.magic ? attacker.attr.magic : attacker.attr.physic;
    const d = skill.xls.magic ? defender.attr.magic : defender.attr.physic;
    
    const [damage, crit] = skill.calcValue(f, a, d, spread);
    defender.onHurt("skill",attacker, damage, crit, ctx);       
    return true;
}

export function skillKill(attacker: FightUnit, sk:FightSkill, ctx: FightContex) {
    const f = ctx.fight;
    const skill = getSkillById(sk.xls.kill);
    if (!skill || f.random() > skill.xls.rand + attacker.attr.magic.randKill) return false;

    const des = f.randomEnemyAlive(attacker.side);    
    if (!des) return false;
    ctx.killNum = (ctx.killNum || 0) + 1;
    skillAttack(attacker, des, skill, "skillKill", 0, ctx);
    return true;
}

export function skillNext(attacker: FightUnit, sk:FightSkill, ctx: FightContex) {
    const f = ctx.fight;
    const skill = getSkillById(sk.xls.next);
    if (!skill || f.random() > skill.xls.rand + attacker.attr.magic.randNext) return false;

    const des = f.randomEnemyAlive(attacker.side);    
    if (!des) return false;
    ctx.nextNum = (ctx.nextNum || 0) + 1;
    skillAttack(attacker, des, skill, "skillNext", 0, ctx);
    return true;
}

export function skillAttackFunc(attacker: FightUnit, defender: FightUnit, skill:FightSkill, ctx: FightContex) {
    const rt = skillAttack(attacker, defender, skill, "skill", 0, ctx);
    if (!rt) return ctx;
    afterSkillAttack(attacker, defender, skill, ctx);
    return ctx;
}

export function afterSkillAttack(attacker: FightUnit, defender: FightUnit, skill:FightSkill, ctx: FightContex) {
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
        if (!back && !skillDamageBack(defender, attacker, ctx)) {
            skillNext(attacker, skill, ctx);
        }
    }    
}

export function skillBack(attacker: FightUnit, defender: FightUnit, ctx: FightContex) {
    const f = ctx.fight;
    if (f.random() < defender.attr.magic.randFightBack) return false;

    // TODO: 也可能用技能反击,要看defender装备的反击技能
    attack(attacker, defender, "skillBack", ctx);
    return true;
}

// 反伤
export function skillDamageBack(attacker: FightUnit, defender: FightUnit, ctx: FightContex) {
    if (!defender.attr.magic.damageBack) return false;
    attacker.onHurt("skilldb", defender, defender.attr.magic.damageBack, false, ctx);    
    return true;
}