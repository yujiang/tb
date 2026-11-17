// 战斗技能

import { Fight, FightContex } from "../Fight";
import { BaseAttack, FinalAttack } from "../FightAttr";
import { FightUnit } from "../Unit/FightUnit";
import { calcAttack, calcHurt, mergeTableLevel } from "./Calc";
import { getSkillData, SkillData } from "./SkillDatas";
import { strict as assert } from "node:assert";


export class FightSkill {
    protected xls: SkillData; //因为很多都跟自身level有关，所以外部直接用xls多半不行
    level = 0; //但是user身上是有level的！
    constructor(xls: SkillData, level: number) {
        this.xls = xls;
        this.level = level;
        // 未与单位属性合并的技能（周期 Buff、复活、普攻）也能直接读取等级数值。
        this.attack = this.mergeAttackData({
            property: 0, rand: 0, hit: 0, dodge: 0, attack: 0, defend: 0,
            hurt: 0, hurtP: 0, hurtAnti: 0, hurtPAnti: 0,
            critP: 0, critPAnit: 0, critDeep: 0, critDeepAnit: 0,
        });
        this.final = mergeTableLevel({bloodP: 0, dbackP: 0, immunity: 0, immunityP: 0},
            xls.final, xls.finalLevel, level);
    }

    getName() {
        return this.xls.name;
    }

    hasTag(tag: string) {
        return this.xls.tags?.indexOf(tag) >= 0;
    }
    canBlood(){
        return this.xls.blood ?? false;
    }
    canDBack(){
        return this.xls.dback ?? false;
    }
    canFBack(){
        return this.xls.fback ?? false;
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

    getXlsAttack(){
        return this.xls.attack;
    }
    getXlsFinal(){
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
        const rate = this.xls.damageRate ?? 1;
        assert.ok(Number.isFinite(rate) && rate >= 0, "damageRate must be finite and nonnegative");
        return calcHurt(f, this.getAttack(), dft.base, this.getFinal(), dft.final, ctx) * rate;
    }

    calcAttack(f: Fight, defender: FightUnit, ctx: FightContex){
        const dft = defender.attr.magic;
        return calcAttack(f, this.getAttack(), dft.base, ctx);
    }

    // 动态的才调用
    mergeAttack(attack: BaseAttack, final: FinalAttack){
        // 每次由单位属性与原始配置重算，避免重复合并时累计等级成长。
        this.attack = this.mergeAttackData(attack);
        this.final = mergeTableLevel(final, this.xls.final, this.xls.finalLevel, this.level);
    }

    protected mergeAttackData(attack: BaseAttack): BaseAttack {
        const rate = this.xls.attackRate ?? 1;
        assert.ok(Number.isFinite(rate) && rate >= 0, "attackRate must be finite and nonnegative");
        const unitAttack = { ...attack, attack: attack.attack * rate };
        return mergeTableLevel(unitAttack, this.xls.attack, this.xls.attackLevel, this.level);
    }

    attack: BaseAttack;
    getAttack(){
        return this.attack;
    }

    final: FinalAttack;
    getFinal(){
        return this.final;
    }

    getPower(){
        return this.xls.power ?? this.level;
    }
}

