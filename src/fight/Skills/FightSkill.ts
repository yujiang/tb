// 战斗技能

import { Fight } from "../Fight";
import { BaseAttack, FinalAttack } from "../FightAttr";
import { FightUnit } from "../Unit/FightUnit";
import { calcAttack, calcHurt, mergeTable } from "./Calc";
import { FightContex } from "./NormalAttack";
import { getSkillData, SkillData } from "./SkillDatas";


export interface SkillCost {
    hp?: number;
    mp?: number;
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
    canDBack(){
        return this.hasTag("dback");
    }
    canFBack(){
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
        return this.xls.rand ?? 1;
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

    physicHitTest(f: Fight, defender: FightUnit) {
        // 70 = 100 - 30
        const d2 = this.getAttack().hit - defender.attr.physic.base.dodge;
        return f.randomLess(d2 / 100);
    }

    calcHurt(f: Fight, defender: FightUnit, ctx: FightContex){
        const ismagic = this.isMagic();
        const dft = ismagic ? defender.attr.magic  : defender.attr.physic;
        return calcHurt(f, this.getAttack(), dft.base, this.getFinal(), dft.final, ctx);
    }

    calcAttack(f: Fight, defender: FightUnit, ctx: FightContex){
        const dft = defender.attr.magic;
        return calcAttack(f, this.getAttack(), dft.base, ctx);
    }

    // 动态的才调用
    mergeAttack(attack: BaseAttack, final: FinalAttack){
        this.xls = {...this.xls};
        // TODO: xls.attack 可能有等级成长，
        this.xls.attack = mergeTable(this.xls.attack, attack);
        this.xls.final = mergeTable(this.xls.final, final);
    }
}

