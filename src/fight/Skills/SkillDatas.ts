import { BaseAttack, FinalAttack, PropEnum } from "../FightAttr";
import { IdLevelRand, IdRand, SelectParam, SkillCost } from "../struct";

//表格化数据
export interface SkillData {
    id: number;
    name: string;
    desc?: string;      // 描述

    magic: boolean;     // 是否魔法攻击
    skillProp?: PropEnum;  // 技能属性；未填时攻击/毒伤用武器属性，治疗用人物属性；显式 none 不回退

    rand: number;       // 发生概率；不是闪避

    sel: SelectParam;   // 选择
    cost?: SkillCost;   // 消耗
    cd?: number;       // 主动施放冷却的全局回合数，默认 0；第 t 回合施放后 t+cd 可再次施放
    
    func?: string;      // 技能效果函数名, 默认noraml

    // 数据与level加成 => al*(level)+a;
    attack: Partial<BaseAttack>;
    final: Partial<FinalAttack>;
    attackLevel?: Partial<BaseAttack>; // 升级的加成
    finalLevel?: Partial<FinalAttack>; // 升级的加成

    // rate作用与skill的最后一步
    attackRate?: number;    // 单位攻击力倍率，默认 1；先缩放单位 attack，再加技能固定值及等级成长
    damageRate?: number;    // 最终伤害倍率，默认 1，应用于 onHurt 前
    healRate?: number;      // 治疗公式结果倍率，默认 1；复活时表示目标最大生命的恢复比例
    poisonRate?: number;    // 毒伤公式结果倍率，默认 1

    spread?: number;        // 溅射的skill， 比如有的溅射不减伤，就自己写skill
    next?: number;          // 连击的skill    
    combo?: number;         // 复用 next 的连招 skill，自动继承主目标，末段统一反击/反伤；同时配置时 next 优先
    kill?: number;          // 追击的kill

    // 命中后可能加buff，减buff！
    addBuff?: IdLevelRand[];        // id,level,rand,
    rmeoveBuff?: IdRand[];          // id,rand,
    removeBuffTag?: string;
    removeBuffNum?:  number;
    afterSelfBuff?: IdLevelRand[];  // 当前技能及后续链结束后给自身添加 [Buff ID, 等级, 概率]
    power?: number;                 // 1.现在removeBuff用到；2.将来战力统计用到

    attackSkill?: number;           // 装配替代普通攻击的攻击技能；0 卸下
    fbackSkill?: number;            // 装备反击技能
    supportSkill?: number;          // 装备协战技能
    ultimateSkill?: number;         // 装配已学的大招技能，0 卸下

    // 类型集合
    tags?: string[];
    // 程序逻辑，从tags分离出来
    noblood?: boolean; //禁止吸血，省略为 false
    nodback?: boolean; //禁止受到普通反伤，省略为 false
    nofback?: boolean; //禁止触发目标反击，省略为 false
    nosupport?: boolean; //禁止队友协战，省略为 false
    noprotect?: boolean; //禁止目标被保护分担伤害，省略为 false
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


