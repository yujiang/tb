// 普通攻击
import { Fight } from "../Fight";
import { BaseAttack, FightTypeAttr, FinalAttack } from "../FightAttr";
import { FightUnit } from "../Unit/FightUnit";
import { FightSkill, } from "./FightSkill";
import { magicAttackFunc} from "./NomalSkill";
import { SkillData } from "./SkillDatas";

export type fightMsg = [string, ...any[]];

// 上下文, 因为反击,连击, 需要回溯堆栈来得到上下文
export interface FightContex {
    fight: Fight;
    attack: FightUnit;
    defend: FightUnit;    
    
    msgs: fightMsg[];
    effects: string[];

    //miss?: boolean; // 是否闪避  
    //crit?: boolean; // 是否暴击
    
    damage?: number; // 伤害值

    killNum?: number; // 追击次数
    nextNum?: number; // 追击次数
    fbackNum?: number; // 反击次数
    dbackNum?: number; // 反震次数
    reactionSteps?: number; // 单次动作共享的结算预算，防止回调无限触发
}

// const AttackBaseRand = {
//     next : 0,
//     kill : 0,
//     back : 0,
// }

// const DamageLost = {
//     healSpread : 0.75,
//     skillSpread : 0.7,
//     nextAttack : 0.8,
// }

const PhysicData : SkillData = {
    id: 0,
    name : "physic",
    magic: false,
    property : 0,
    rand: 1,

    sel: null,
    attack: null,
    final: null,
}

class PhysicSkill extends FightSkill {
    unit: FightUnit;
    physic: FightTypeAttr;
    
    constructor(name: string, unit: FightUnit, attack: BaseAttack, final: FinalAttack) {
        super({...PhysicData, attack, final, rand: name === "physic" ? 1 : attack.rand} , 1);
        this.unit = unit;
        this.physic = unit.attr.physic;
        this.name = name;
    }

    name: string;
    override getName() {
        return this.name;
    }
    
    override getNextSkill(): FightSkill {
        return new PhysicSkill("next",this.unit, this.physic.next, this.physic.final);
    }
    override getKillSkill(): FightSkill {
        return new PhysicSkill("kill",this.unit, this.physic.kill, this.physic.final);
    }
    override getSpreadSkill(): FightSkill {
        return new PhysicSkill("spread",this.unit, this.physic.spread, this.physic.final);
    }

    override canBlood(){
        return true
    }
    override canDBack(){
        return true;
    }
    override canFBack(){
        return true
    }    
}

export function attackFunc(attacker: FightUnit, defender: FightUnit, ctx: FightContex) {  
    const skill = new PhysicSkill(
        "physic",attacker, attacker.attr.physic.base, attacker.attr.physic.final);
    return magicAttackFunc(attacker, defender, skill, ctx);
}


