import { IdLevel, IdLevelArray } from "../struct";
import { StaticData } from "../Buffs/StaticData";

// 被动技能 有3种
// 1. 状态，(但是客户端看不到)
// 2. 改变属性attr， 比如增益和减益
// 3. 初始化之后为FightUnit添加一个buff

export interface PassiveData extends StaticData{
    addbuff?: IdLevelArray;
    attackSkill?: number;   // 装配已有技能替代普通攻击，不学习或改变等级
    fbackSkill?: number;    // 反击技
    supportSkill?: number;  // 装配已有的协战技能，不学习或改变技能等级
    ultimateSkill?: number; // 装配已有大招，不学习或改变等级
}


const passives = new Map<number,PassiveData>();

export function initPassives(datas: PassiveData[]){
    for (const data of datas) {
        passives.set(data.id, data);
    }
}

export function getPassiveData(id: number) : PassiveData{
    if (!id) return;
    return passives.get(id);
}
