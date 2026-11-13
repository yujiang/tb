import { FightUnit } from "../Unit/FightUnit";
import { FightSkill, } from "./FightSkill";
import { attack, FightContex, tryBack } from "./NormalAttack";

// 普通技能
export function skillAttack(attacker: FightUnit, defender: FightUnit, skill:FightSkill, name: string,  spread: number, ctx: FightContex) {
    // assert(skill);
    const f = ctx.fight;
    if (f.random() > skill.getRand()) {
        ctx.msgs.push(["skillmiss", skill.getId(), attacker.uid, defender.uid])
        return false;
    }

    // 方便客户端绘制
    if (name) {
        ctx.msgs.push([name, skill.getId(), attacker.uid, defender.uid])
    }

    const a = skill.isMagic() ? attacker.attr.magic : attacker.attr.physic;
    const d = skill.isMagic() ? defender.attr.magic : defender.attr.physic;
    
    const [damage, crit] = skill.calcValue(f, a, d, spread);
    defender.onHurt("skill",attacker, damage, crit, ctx);       
    return true;
}

function skillKill(attacker: FightUnit, sk:FightSkill, ctx: FightContex) {
    const skill = sk.getKillSkill();
    if (!skill) return false;
    const f = ctx.fight;
    const a = skill.isMagic() ? attacker.attr.magic : attacker.attr.physic;
    if (!skill || f.random() > skill.getRand() + a.randKill) return false;

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
    if (!skill || f.random() > skill.getRand() + a.randNext) return false;

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
        const rand = skill.getNobackRand();
        if (!rand || f.random() > rand) {
            back = tryBack(defender, attacker, true, ctx);
        }
        if (!back && !skillDamageBack(defender, attacker, skill, ctx)) {
            skillNext(attacker, skill, ctx);
        }
    }    
}

export function skillBack(attacker: FightUnit, defender: FightUnit, skill:FightSkill, ctx: FightContex) {
    const f = ctx.fight;
    const a = skill.isMagic() ? attacker.attr.magic : attacker.attr.physic;
    if (f.random() > skill.getRand() + a.randFightBack) return false;

    ctx.backNum = (ctx.backNum || 0) + 1;
    skillAttack(attacker, defender, skill, "skillBack", 0, ctx);
    return true;
}

// 反伤
function skillDamageBack(attacker: FightUnit, defender: FightUnit, skill:FightSkill, ctx: FightContex) {
    const a = skill.isMagic() ? attacker.attr.magic : attacker.attr.physic;
    if (!a.damageBack) return false;

    ctx.dbackNum = (ctx.dbackNum || 0) + 1;
    attacker.onHurt("skilldb", defender, a.damageBack, false, ctx);    
    return true;
}