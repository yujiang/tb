import { BaseAttack, FinalAttack } from "../FightAttr";
import { FightUnit } from "../Unit/FightUnit";
import { mergeTable } from "./Calc";
import { FightSkill, SkillData } from "./FightSkill";
import { magicAttackFunc, skillAttackFunc } from "./NomalSkill";
import { FightContex } from "./NormalAttack";

// 优先用装备的技能反击，最后采用attackBack

const PhysicFbackData : SkillData = {
    id: 0,
    name : "fback",
    magic: false,
    property : 0,
    rand: 1,

    sel: null,
    attack: null,
    final: null,
}

class PhysicFbackSkill extends FightSkill {
    constructor(unit: FightUnit) {
        super({...PhysicFbackData, attack: unit.attr.physic.fback, final: unit.attr.physic.final} , 1);
    }    

    // 否则没完没了
    override canFback(){
        return false;
    }        
}

class MagicFbackSkill extends FightSkill {
    mergeAttack(attack: BaseAttack, final: FinalAttack){
        this.xls = {...this.xls};
        this.xls.attack = mergeTable(this.xls.attack, attack);
        this.xls.final = mergeTable(this.xls.final, final);
    }

    // 否则没完没了
    override canFback(){
        return false;
    }   
}

// 物理反击
function attackBack(attacker: FightUnit, defender: FightUnit, ctx: FightContex) {
    const skill = new PhysicFbackSkill(attacker);
    return magicAttackFunc(attacker, defender, skill, ctx);
}

export function skillBack(attacker: FightUnit, defender: FightUnit, skill:FightSkill, ctx: FightContex) {
    ctx.fbackNum = (ctx.fbackNum || 0) + 1;
    const magic = new MagicFbackSkill(skill.getXls(), skill.level);

    const ft = skill.isMagic() ? attacker.attr.magic : attacker.attr.physic;
    magic.mergeAttack(ft.fback, ft.final);

    return skillAttackFunc(attacker, defender, skill, ctx);
}

export function tryBack(attacker: FightUnit, defender: FightUnit, ctx: FightContex) {
    const back = attacker.getBackSkill();
    if (back) {
        return skillBack(attacker, defender, back, ctx);
    }
    return attackBack(attacker, defender, ctx);
}


// 尝试吸血
export function tryBlood(attacker: FightUnit, defender: FightUnit, magic: boolean, damage: number, ctx: FightContex) {
    const p = magic ? 
        attacker.attr.magic.final.bloodP :
        attacker.attr.physic.final.bloodP ;
    if (p > 0) {
        damage *= Math.max(p, 1);
        attacker.onHeal(attacker, "blood", damage, ctx);
    }
}

// 反伤
export function tryDBack(attacker: FightUnit, defender: FightUnit, magic: boolean, damage: number, ctx: FightContex) {
    const p = magic ? 
        defender.attr.magic.final.dbackP  :
        defender.attr.physic.final.dbackP ;
     if (p > 0) {
        damage *= Math.max(p, 1);
        attacker.onHurt(attacker, "dback", damage, ctx);
    }
}