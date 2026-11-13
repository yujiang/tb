// 战斗技能

import { Fight } from "../Fight";
import { BaseAttack } from "../FightAttr";
import { FightUnit } from "../Unit/FightUnit";
import { SelectParam } from "../struct";


export interface SkillCost {
    hp?: number;
    mp?: number;
}

//表格化数据
export interface SkillData {
    id: number;
    name: string;

    magic: boolean; // 是否魔法攻击
    sel: SelectParam;
    
    func?: string; // 技能效果函数名, 默认noraml

    rand: number;       //概率；0到1之间
    nobackRand: number; //免于反击；0到1之间
    crit?: number;
    critDeep?: number;    

    attack?: number;
    attackPercent?: number;
    damage?: number;
    damagePercent?: number;

    cost?: SkillCost;

    // 溅射的skill， 比如有的溅射不减伤~
    spread?: number;
    // 连击的skill
    next?: number;
    // 追击的kill
    kill?: number;
}

export function calcHurt(a: BaseAttack, d: BaseAttack, d1: number) {
    if (d.hurtDec){
        d1 -= d.hurtDec;
    }
    if (d.hurtDecPercent){
        d1 -= d1 * d.hurtDecPercent;
    }
    const damage = Math.max(Math.floor(d1),1);
    return damage;
}


export class FightSkill {
    xls: SkillData;
    level = 0; //但是user身上是有level的！
    constructor(xls: SkillData) {
        this.xls = xls;
    }
    getId() {
        return this.xls.id;
    }

    calcAttack(v: number){
        //TODO use skill level..
        return (v +(this.xls.attack || 0)) * (1 + (this.xls.attackPercent || 0));
    }

    calcDamage(v: number){
        //TODO use skill level..
        return (v +(this.xls.damage || 0)) * (1 + (this.xls.damagePercent || 0));
    }
    
    calcValue(f: Fight, a: BaseAttack, d: BaseAttack, damgePrecent: number) : [number, boolean] {
        const [d1, crit] = this.calcHeal(f, a, d, damgePrecent);
        const damage = calcHurt(a, d, d1);
        return [damage, crit]
    }

    calcHeal(f: Fight, a: BaseAttack, d: BaseAttack, damgePrecent: number) : [number, boolean] {
        const xls = this.xls;
        let d1 = this.calcAttack(a.attack) - d.defend;    
        if (damgePrecent) {
            d1 = d1 * damgePrecent;
        }
        let crit = false;
        if (f.random() < (xls.crit||0) + a.crit - d.critDefend) {
            d1 *= 1.5 + Math.max(a.critDeep + (xls.critDeep||0), 1);
            crit = true;
        }
        return [d1, crit];
    }
}

