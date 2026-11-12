import { Fight } from "./Fight";
import { FightUnit } from "./FightUnit";

export type fightMsg = [string, ...any[]];

// 上下文, 因为反击,连击, 需要回溯堆栈来得到上下文
export interface FightContex {
    fight: Fight;
    attack: FightUnit;
    defend: FightUnit;    
    
    msgs: fightMsg[];

    nextNum?: number;
}

export function attack(attacker: FightUnit, defender: FightUnit, ctx: FightContex) {
    const a = attacker.attr;
    const d = defender.attr;
    ctx.msgs.push(['attack', attacker.uid, defender.uid])
    const damage = Math.floor(a.attack - d.defend);
    defender.onHurt(attacker, damage, ctx);    
}

export function attackFirst(attacker: FightUnit, defender: FightUnit, ctx: FightContex) {
    attack(attacker, defender, ctx)

    if (defender.isDied()){
        //追击
        attackNext(attacker, ctx);
    }
    else {
        //反击
        attackBack(defender, attacker, ctx);
    }
    return ctx;
}


export function attackNext(attacker: FightUnit, ctx: FightContex) {
    const f = ctx.fight;
    if (f.random() < 0.5) return;

    const des = f.randomEnemyAlive(attacker.side);    
    if (des) {
        ctx.nextNum = (ctx.nextNum || 0) + 1;
        attackFirst(attacker, des, ctx);
    }
}

export function attackBack(attacker: FightUnit, defender: FightUnit, ctx: FightContex) {
    const f = ctx.fight;
    if (f.random() < 0.5) return;

    attack(attacker, defender, ctx);
}