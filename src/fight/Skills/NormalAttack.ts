// 普通攻击
import { Fight } from "../Fight";
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
    
    damage?: number; // 伤害值

    killNum?: number; // 追击次数
    nextNum?: number; // 追击次数
    fbackNum?: number; // 反击次数
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
    const a = attacker.attr.getBaseAttack(aname);
    const d = defender.attr.getBaseAttack(aname);
    const d2 = a.hit - d.dodge;
    if (f.random() > d2 / 100) {
        ctx.msgs.push([aname, "miss", attacker.uid, defender.uid])
        return false;
    }

    ctx.msgs.push([aname, attacker.uid, defender.uid])
    let d1 = a.attack - d.defend;
    // if (aname == "attackNext"){ //连击降低伤害！
    //     d1 = d1 * DamageLost.nextAttack;
    // }

    let crit = true;
    if (f.random() < a.crit - d.critDefend) {
        d1 *= 1.5 + Math.max(a.critDeep,1);
    }

    const damage = calcHurt(attacker.attr.fphysic, defender.attr.fphysic, d1);
    defender.onHurt(attacker, aname, damage, crit, ctx);   
    if (damage > 1) {
        tryBlood(attacker, defender, false, damage, ctx);
        tryDBack(attacker, defender, false, damage, ctx);
    }
    // ctx.damage = damage;
    return true; 
}

export function attackFunc(attacker: FightUnit, defender: FightUnit, ctx: FightContex) {  
    if (!attack(attacker, defender, "physic", ctx)) return ctx;

    if (defender.isDied()){
        //追击
        attackKill(attacker, ctx);
    }
    else {
        //反击
        if (!tryBack(defender, attacker, false, ctx)){
            attackNext(attacker, defender, ctx);
        }
    }
    return ctx;
}

function passRand(attacker: FightUnit, name: string, ctx: FightContex){
    const f = ctx.fight;
    const a = attacker.attr.getBaseAttack(name);
    if ( a && a.rand > 0) {
        return f.random() >= ((AttackBaseRand as any)[name] || 0) + a.rand;
    } 
    return false;
}

function attackNext(attacker: FightUnit, defender: FightUnit, ctx: FightContex) {
    if (!passRand(attacker, "next", ctx)) return false;

    ctx.nextNum = (ctx.nextNum || 0) + 1;
    attack(attacker, defender, "next", ctx);
    return true
}

function attackKill(attacker: FightUnit, ctx: FightContex) {
    const f = ctx.fight;
    const a = attacker.attr.kill;
    if (!a.rand || f.random() < AttackBaseRand.kill + a.rand) return false;

    const des = f.randomEnemyAlive(attacker.side);    
    if (des) {
        ctx.killNum = (ctx.killNum || 0) + 1;
        attack(attacker, des, "kill", ctx);
    }
    return true
}

// 优先用装备的技能反击，最后采用attackBack
export function tryBack(attacker: FightUnit, defender: FightUnit, skill: boolean, ctx: FightContex) {
    const back = attacker.getBackSkill();
    if (back) {
        skillBack(attacker, defender, back, ctx);
    }
    return attackBack(attacker, defender, ctx);
}

function attackBack(attacker: FightUnit, defender: FightUnit, ctx: FightContex) {
    if (!passRand(attacker, "fback", ctx)) return false;
    attack(attacker, defender, "fback", ctx);
    return true;
}

// 尝试吸血
export function tryBlood(attacker: FightUnit, defender: FightUnit, magic: boolean, damage: number, ctx: FightContex) {
    const p = magic ? 
        attacker.attr.fmagic.bloodP - defender.attr.fmagic.bloodPAnti :
        attacker.attr.fphysic.bloodP - defender.attr.fphysic.bloodPAnti;
    if (p > 0) {
        damage *= Math.max(p, 1);
        attacker.onHeal(attacker, "blood", damage, false, ctx);
    }
}

// 反伤
export function tryDBack(attacker: FightUnit, defender: FightUnit, magic: boolean, damage: number, ctx: FightContex) {
    const p = magic ? 
        defender.attr.fmagic.dbackP - attacker.attr.fmagic.dbackPAnti :
        defender.attr.fphysic.dbackP - attacker.attr.fphysic.dbackPAnti;
     if (p > 0) {
        damage *= Math.max(p, 1);
        attacker.onHurt(attacker, "dback", damage, false, ctx);
    }
}