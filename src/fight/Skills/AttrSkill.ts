// 治疗

import { Fight } from "../Fight";
import { FightUnit } from "../Unit/FightUnit";
import { calcAttack, calcPoison, mergeTable } from "./Calc";
import { FightSkill, } from "./FightSkill";
import { FightContex } from "./NormalAttack";
import { getSkillData, SkillData } from "./SkillDatas";

export type AttrFunc =(attacker: FightUnit, defender: FightUnit, skill:AttrSkill, name: string, ctx: FightContex)=>boolean;

export class AttrSkill extends FightSkill {
    attr: string;
    constructor(xls: SkillData, level: number, attr: string) {
        super(xls, level);
        this.attr = attr;
    }

    getAttrSpreadSkill(attacker: FightUnit){
        return this.createSpreadSkill(this.getSpread(), attacker);
    }

    createSpreadSkill(id: number, attacker: FightUnit) {        
        const data = getSkillData(id);
        if (!data) return;
        const skill = new AttrSkill(data, this.level, this.attr);
        skill.mergeAttr(attacker);
        return skill;
    }

    mergeAttr(attacker: FightUnit){
        this.xls = {...this.xls};
        this.xls.attack = mergeTable(this.xls.attack, this.getAttr(attacker));
    }

    calcHeal(f: Fight, defender: FightUnit, ctx: FightContex){
        return calcAttack(f, this.getAttack(), this.getAttr(defender), ctx);    
    }

    calcPoison(f: Fight, defender: FightUnit, ctx: FightContex){
        return calcPoison(f, this.getAttack(), this.getAttr(defender), defender.getHp(), ctx);    
    }

    getAttr(u: FightUnit){
        return (u.attr as any)[this.attr];
    }
}

export function attrFunc(attr: string, func: AttrFunc, attacker: FightUnit, defender: FightUnit, skill:FightSkill, ctx: FightContex) {
    const magic = new AttrSkill(skill.getXls(), skill.level, attr);
    magic.mergeAttr(attacker);

    func(attacker, defender, magic, "heal", ctx);
    const spread = magic.getAttrSpreadSkill(attacker);
    if (spread) {
        spreadAttr(func, attacker, defender, spread, ctx);
    }
    return true;
}


function spreadAttr(func: AttrFunc, attacker: FightUnit, defender: FightUnit, skill:AttrSkill, ctx: FightContex) {
    const f = ctx.fight;
    //const xls = skill.xls;
    const targets = f.selectTargets(defender, skill.getSel());
    if (!targets?.length) return

    const ids = targets.map((target) => {
        return target.uid;
    });
    ctx.msgs.push(["spread", ids]);
    for (const target of targets) {
        func(attacker, target, skill, "spread", ctx);
    }
}