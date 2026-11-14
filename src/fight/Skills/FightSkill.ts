// 战斗技能

import { Fight } from "../Fight";
import { BaseAttack, FightAttr, FinalAttack } from "../FightAttr";
import { SelectParam } from "../struct";
import { getRelativeSkill } from "./SkillDatas";


export interface SkillCost {
    hp?: number;
    mp?: number;
}

//表格化数据
export interface SkillData {
    id: number;
    name: string;
    desc?: string;       // 描述

    magic: boolean;     // 是否魔法攻击
    property?: number;  // 属性, 金木水火土有克制关系~

    sel: SelectParam;
    
    func?: string;      // 技能效果函数名, 默认noraml

    rand: number;       // 概率；0到1之间

    crit?: number;      // 暴击率；0到1之间
    critDeep?: number;  // 暴击加深， 基础是1.5  

    attack?: number;
    attackPercent?: number;
    damage?: number;
    damagePercent?: number;

    cost?: SkillCost;   // 消耗

    // 溅射的skill， 比如有的溅射不减伤，就自己写skill
    spread?: number;
    // 连击的skill
    next?: number;
    // 追击的kill
    kill?: number;

    tags?: string[];
}

export function calcHurt(a: FinalAttack, d: FinalAttack, d1: number) {
    if (d.immunity && d.immunity - a.immunityAnti > 0){
        d1 -= (d.immunity - a.immunityAnti);
    }
    if (d.immunityP && d.immunityP - a.immunityPAnti > 0){
        d1 -= d1 * (d.immunityP - a.immunityPAnti);
    }
    const damage = Math.max(Math.floor(d1),1);
    return damage;
}


export class FightSkill {
    private xls: SkillData; //因为很多都跟自身level有关，所以外部直接用xls多半不行
    level = 0; //但是user身上是有level的！
    constructor(xls: SkillData, level: number) {
        this.xls = xls;
        this.level = level;
    }

    hasTag(tag: string) {
        return this.xls.tags?.indexOf(tag) >= 0;
    }
    canBlood(){
        return this.hasTag("blood");
    }
    canDback(){
        return this.hasTag("dback");
    }
    canFback(){
        return this.hasTag("fback");
    }

    getXls() {
        return this.xls;
    }

    getId() {
        return this.xls.id;
    }
    // 命中率
    getRand() {
        return this.xls.rand || 1;
    }
    isMagic(){
        return this.xls.magic;
    }

    // 可能升到level才有kill,next...
    getKill(){
        return this.xls.kill;
    }
    getKillSkill(){
        return getRelativeSkill(this, this.getKill());
    }
    getNext(){
        return this.xls.next;
    }
    getNextSkill(){
        return getRelativeSkill(this, this.getNext());
    }
    getSpread(){
        return this.xls.spread;
    }
    getSpreadSkill(){
        return getRelativeSkill(this, this.getSpread());
    }

    getCost(){
        return this.xls.cost;
    }

    getFunc(){
        return this.xls.func || "normal";
    }
    getSel(){
        return this.xls.sel;
    }



    calcAttack(v: number){
        //TODO use skill level..
        return (v +(this.xls.attack || 0)) * (1 + (this.xls.attackPercent || 0));
    }

    calcDamage(v: number){
        //TODO use skill level..
        return (v +(this.xls.damage || 0)) * (1 + (this.xls.damagePercent || 0));
    }
    
    calcValue(f: Fight, a: BaseAttack, d: BaseAttack, af: FinalAttack, df: FinalAttack, damgePrecent: number) : [number, boolean] {
        const [d1, crit] = this.calcHeal(f, a, d, damgePrecent);
        const damage = calcHurt(af, df, d1);
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
        return [Math.floor(d1), crit];
    }
}

