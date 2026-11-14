import { FightUnit } from "../Unit/FightUnit";
import { FightSkill, } from "./FightSkill";
import { attack, FightContex, tryBack, tryBlood, tryDBack } from "./NormalAttack";

// 普通技能
export function skillAttack(attacker: FightUnit, defender: FightUnit, skill:FightSkill, aname: string,  spread: number, ctx: FightContex) {
    // assert(skill);
    const f = ctx.fight;
    if (f.random() > skill.getRand()) {
        ctx.msgs.push(["skillmiss", skill.getId(), attacker.uid, defender.uid])
        return false;
    }

    // 方便客户端绘制
    ctx.msgs.push([aname, skill.getId(), attacker.uid, defender.uid])

    const ismagic = skill.isMagic();
    const a = ismagic ? attacker.attr.magic : attacker.attr.physic;
    const af = ismagic ? attacker.attr.fmagic : attacker.attr.fphysic;
    const d = ismagic ? defender.attr.magic : defender.attr.physic;
    const df = ismagic ? defender.attr.fmagic : defender.attr.fphysic;
    
    const [damage, crit] = skill.calcValue(f, a, d, af, df, spread);
    defender.onHurt(attacker, aname, damage, crit, ctx);       
    if (damage > 1) {
        if (skill.canBlood()){
            tryBlood(attacker, defender, ismagic, damage, ctx);
        }
        if (skill.canDback()){
            tryDBack(attacker, defender, ismagic, damage, ctx);
        }
    }
    ctx.damage = damage;    
    return true;
}

function skillKill(attacker: FightUnit, sk:FightSkill, ctx: FightContex) {
    const skill = sk.getKillSkill();
    if (!skill) return false;
    const f = ctx.fight;
    const a = skill.isMagic() ? attacker.attr.magic : attacker.attr.physic;
    if (!skill || f.random() > skill.getRand()) return false;

    const des = f.randomEnemyAlive(attacker.side);    
    if (!des) return false;
    ctx.killNum = (ctx.killNum || 0) + 1;
    skillAttack(attacker, des, skill, "skillKill", 0, ctx);
    return true;
}

function skillNext(attacker: FightUnit, sk:FightSkill, ctx: FightContex) {
    const skill = sk.getNextSkill();
    if (!skill) return false;
    const f = ctx.fight;
    const a = skill.isMagic() ? attacker.attr.magic : attacker.attr.physic;
    if (!skill || f.random() > skill.getRand()) return false;

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
        if (skill.canFback()) {
            back = tryBack(defender, attacker, true, ctx);
        }
        if (!back) {
            skillNext(attacker, skill, ctx);
        }
    }    
}

export function skillBack(attacker: FightUnit, defender: FightUnit, skill:FightSkill, ctx: FightContex) {
    const f = ctx.fight;
    const a = skill.isMagic() ? attacker.attr.magic : attacker.attr.physic;
    if (f.random() > skill.getRand()) return false;

    ctx.fbackNum = (ctx.fbackNum || 0) + 1;
    skillAttack(attacker, defender, skill, "skillBack", 0, ctx);
    return true;
}
