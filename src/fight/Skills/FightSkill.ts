// 战斗技能

import { BaseAttack, FinalAttack } from "../FightAttr";
import { SelectParam } from "../struct";
import { getSkillData } from "./SkillDatas";


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

    // crit?: number;      // 暴击率；0到1之间
    // critDeep?: number;  // 暴击加深， 基础是1.5  

    // base: BaseAttack; 

    // attack?: number;
    // attackPercent?: number;
    // damage?: number;
    // damagePercent?: number;
    attack: BaseAttack;
    final: FinalAttack;

    cost?: SkillCost;   // 消耗

    // 溅射的skill， 比如有的溅射不减伤，就自己写skill
    spread?: number;
    // 连击的skill
    next?: number;
    // 追击的kill
    kill?: number;

    tags?: string[];
}


export class FightSkill {
    protected xls: SkillData; //因为很多都跟自身level有关，所以外部直接用xls多半不行
    level = 0; //但是user身上是有level的！
    constructor(xls: SkillData, level: number) {
        this.xls = xls;
        this.level = level;
    }

    getName() {
        return this.xls.name;
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
    isPhysic(){
        return !this.isMagic();
    }

    // 可能升到level才有kill,next...
    getKill(){
        return this.xls.kill;
    }
    getKillSkill(){
        return this.getRelativeSkill(this.getKill());
    }
    getNext(){
        return this.xls.next;
    }
    getNextSkill(){
        return this.getRelativeSkill(this.getNext());
    }
    getSpread(){
        return this.xls.spread;
    }
    getSpreadSkill(){
        return this.getRelativeSkill(this.getSpread());
    }

    // 临时的子技能~
    getRelativeSkill(id: number) {
        const data = getSkillData(id);
        if (!data) return;
        return new FightSkill(data, this.level);
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

    getAttack(){
        return this.xls.attack;
    }
    getFinal(){
        return this.xls.final;
    }
}

