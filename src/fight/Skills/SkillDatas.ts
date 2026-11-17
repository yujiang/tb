import { BaseAttack, FinalAttack } from "../FightAttr";
import { IdLevelRand, IdRand, SelectParam } from "../struct";
import { SkillCost } from "./FightSkill";

//表格化数据
export interface SkillData {
    id: number;
    name: string;
    desc?: string;       // 描述

    magic: boolean;     // 是否魔法攻击
    property?: number;  // 属性, 金木水火土有克制关系~

    sel: SelectParam;
    
    func?: string;      // 技能效果函数名, 默认noraml

    rand: number;       // 发生概率；不是闪避

    attack: Partial<BaseAttack>;
    final: Partial<FinalAttack>;
    attackLevel?: Partial<BaseAttack>; // 升级的加成
    finalLevel?: Partial<FinalAttack>; // 升级的加成

    cost?: SkillCost;   // 消耗

    // 溅射的skill， 比如有的溅射不减伤，就自己写skill
    spread?: number;
    // 连击的skill
    next?: number;
    // 追击的kill
    kill?: number;

    // 技能命中可能加buff，减buff！
    noHurt?: boolean; // 并没有伤害，仅仅加buff
    addBuff?: IdLevelRand[]; //id,level,rand,
    rmeoveBuff?: IdRand[]; //id,rand,
    removeBuffTag?: string;
    removeBuffNum?:  number;

    tags?: string[];

    power?: number; //removeBuff用到， 低power不能移除高power的buff
}

const skills = new Map<number,SkillData>();

export function initSkills(datas: SkillData[]){
    for (const data of datas) {
        skills.set(data.id, data);
    }
}

export function getSkillData(id: number) : SkillData{
    if (!id) return;
    return skills.get(id);
}


