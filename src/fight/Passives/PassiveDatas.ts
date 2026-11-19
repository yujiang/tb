import { IdLevel, IdLevelArray } from "../struct";
import { StaticData } from "../Buffs/StaticData";

// 被动技能 有3种
// 1. 状态，(但是客户端看不到)
// 2. 改变属性attr， 比如增益和减益
// 3. 初始化之后为FightUnit添加一个buff

export interface PassiveData extends StaticData{
    /** 初始化时给自身附加 [Buff ID, Buff 等级][]；缺省无附加 Buff，等级不自动继承被动等级。 */
    addbuff?: IdLevelArray;
    /** 初始化时装配已学替代普攻技能，不学习或改等级；缺省不变，0 卸下。 */
    attackSkill?: number;
    /** 初始化时装配已学反击技能；缺省不变，当前此入口忽略0，模板显式装配仍可用0卸下。 */
    fbackSkill?: number;
    /** 初始化时装配已学协战技能；缺省不变，0 卸下，不学习或改等级。 */
    supportSkill?: number;
    /** 初始化时装配已学破盾大招；缺省不变，0 卸下，不学习或改等级。 */
    ultimateSkill?: number;
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
