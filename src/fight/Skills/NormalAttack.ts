// 普通攻击
import { Fight } from "../Fight";
import { BaseAttack } from "../FightAttr";
import { FightUnit } from "../Unit/FightUnit";
import { calcHurt } from "./FightSkill";
import { skillBack } from "./NomalSkill";

export type fightMsg = [string, ...any[]];

// 上下文, 因为反击,连击, 需要回溯堆栈来得到上下文
export interface FightContex {
    fight: Fight;
    attack: FightUnit;
    defend: FightUnit;    
    
    msgs: fightMsg[];

    //miss?: boolean; // 是否闪避  
    //crit?: boolean; // 是否暴击

    killNum?: number; // 追击次数
    nextNum?: number; // 追击次数
    backNum?: number; // 反击次数
    dbackNum?: number; // 反震次数
}

const AttackBaseRand = {
    next : 0,
    kill : 0,
    back : 0,
}

export const DamageLost = {
    healSpread : 0.75,
    skillSpread : 0.7,
    nextAttack : 0.8,
}


export function attack(attacker: FightUnit, defender: FightUnit, aname: string, ctx: FightContex) {
    const f = ctx.fight;
    const a = attacker.attr.physic;
    const d = defender.attr.physic;
    const d2 = a.hit - d.dodge;
    if (f.random() > d2 / 100) {
        ctx.msgs.push(["attackmiss", attacker.uid, defender.uid])
        return false;
    }

    ctx.msgs.push([aname, attacker.uid, defender.uid])
    let d1 = a.attack - d.defend;
    if (aname == "attackNext"){ //连击降低伤害！
        d1 = d1 * DamageLost.nextAttack;
    }

    let crit = true;
    if (f.random() < a.crit - d.critDefend) {
        d1 *= 1.5 + Math.max(a.critDeep,1);
    }

    const damage = calcHurt(a, d, d1);
    defender.onHurt("attack", attacker, damage, crit, ctx);   
    return true; 
}

export function attackFunc(attacker: FightUnit, defender: FightUnit, ctx: FightContex) {  
    if (!attack(attacker, defender, "attack", ctx)) return ctx;

    if (defender.isDied()){
        //追击
        attackKill(attacker, ctx);
    }
    else {
        //反击
        if (!tryBack(defender, attacker, false, ctx) && !attackDamageBack(defender, attacker, ctx)){
            attackNext(attacker, defender, ctx);
        }
    }
    return ctx;
}

function attackNext(attacker: FightUnit, defender: FightUnit, ctx: FightContex) {
    const f = ctx.fight;
    if (f.random() < AttackBaseRand.next + attacker.attr.physic.randNext) return false;

    ctx.nextNum = (ctx.nextNum || 0) + 1;
    attack(attacker, defender, "attackNext", ctx);
    return true
}

function attackKill(attacker: FightUnit, ctx: FightContex) {
    const f = ctx.fight;
    if (f.random() < AttackBaseRand.kill + attacker.attr.physic.randKill) return false;

    const des = f.randomEnemyAlive(attacker.side);    
    if (des) {
        ctx.killNum = (ctx.killNum || 0) + 1;
        attack(attacker, des, "attackKill", ctx);
    }
    return true
}

// 优先用装备的技能反击，最后采用attackBack
export function tryBack(attacker: FightUnit, defender: FightUnit, skill: boolean, ctx: FightContex) {
    const f = ctx.fight;
    const back = attacker.getBackSkill();
    if (back) {
        skillBack(attacker, defender, back, ctx);
    }
    return attackBack(attacker, defender, ctx);
}

function attackBack(attacker: FightUnit, defender: FightUnit, ctx: FightContex) {
    const f = ctx.fight;
    if (f.random() < AttackBaseRand.back + defender.attr.physic.randFightBack) return false;
    attack(attacker, defender, "attackBack", ctx);
    return true;
}

// 反伤
function attackDamageBack(attacker: FightUnit, defender: FightUnit, ctx: FightContex) {
    if (!defender.attr.physic.damageBack) return false;
    attacker.onHurt("attackdb", defender, defender.attr.physic.damageBack, false, ctx);    
    return true;
}