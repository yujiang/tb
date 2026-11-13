// 战斗技能

import { FightUnit } from "../FightUnit";
import { SelectParam } from "../struct";


//表格化数据
export interface SkillData {
    id: number;
    name: string;

    magic: boolean; // 是否魔法攻击
    sel: SelectParam;
    
    func: string; // 技能效果函数名

    rand: number;       //概率；0到1之间
    nobackRand: number; //免于反击

    value: number;
    valuePercent: number;

    // 溅射的skill
    spread: number;
    // 连击的skill
    next: number;
    // 追击的skill
    skill: number;
}

export class FightSkill {
    xls: SkillData;
    constructor(xls: SkillData) {
        this.xls = xls;
    }
    getId() {
        return this.xls.id;
    }
    getValue(){
        return this.xls.value || 0;
    }
    getValuePercent(){
        return this.xls.valuePercent || 0;
    }

    calcValue(v: number){
        return (v + this.getValue()) * (1 + this.getValuePercent());
    }
    calcAttack(attacker: FightUnit){
        const a = attacker.attr;
        const v = this.xls.magic ? a.mattack : a.attack;
        return this.calcValue(v) || 0;
    }
    calcDefend(defend: FightUnit){
        const a = defend.attr;
        return this.xls.magic ? a.mdefend : a.defend;
    }
}

