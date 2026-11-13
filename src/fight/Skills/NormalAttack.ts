// 普通攻击
import { Fight } from "../Fight";
import { FightUnit } from "../FightUnit";

export type fightMsg = [string, ...any[]];

// 上下文, 因为反击,连击, 需要回溯堆栈来得到上下文
export interface FightContex {
    fight: Fight;
    attack: FightUnit;
    defend: FightUnit;    
    
    msgs: fightMsg[];

    killNum?: number; // 追击次数
    nextNum?: number; // 追击次数
}

export function attack(attacker: FightUnit, defender: FightUnit, aname: string, ctx: FightContex) {
    const a = attacker.attr;
    const d = defender.attr;
    ctx.msgs.push([aname, attacker.uid, defender.uid])
    let d1 = a.attack - d.defend;
    if (aname == "attackNext"){ //连击降低伤害！
        d1 = d1 * 0.8;
    }
    const damage = Math.max(Math.floor(d1),1);
    defender.onHurt(attacker, damage, ctx);    
}

export function attackFunc(attacker: FightUnit, defender: FightUnit, ctx: FightContex) {
    attack(attacker, defender, "attack", ctx)

    if (defender.isDied()){
        //追击
        attackKill(attacker, ctx);
    }
    else {
        //反击
        if (!attackBack(defender, attacker, ctx)){
            attackNext(attacker, defender, ctx);
        }
    }
    return ctx;
}

export function attackNext(attacker: FightUnit, defender: FightUnit, ctx: FightContex) {
    const f = ctx.fight;
    if (f.random() < 0.3) return false;

    ctx.nextNum = (ctx.nextNum || 0) + 1;
    attack(attacker, defender, "attackNext", ctx);
    return true
}

export function attackKill(attacker: FightUnit, ctx: FightContex) {
    const f = ctx.fight;
    if (f.random() < 0.5) return false;

    const des = f.randomEnemyAlive(attacker.side);    
    if (des) {
        ctx.killNum = (ctx.killNum || 0) + 1;
        attack(attacker, des, "attackKill", ctx);
    }
    return true
}

export function attackBack(attacker: FightUnit, defender: FightUnit, ctx: FightContex) {
    const f = ctx.fight;
    if (f.random() < 0.5) return false;

    attack(attacker, defender, "attackBack", ctx);
    return true;
}