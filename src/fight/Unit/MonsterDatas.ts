import { FightAttr } from "../FightAttr";
import { FightDisplay, IdLevelArray } from "../struct";
import { AIData } from "../AI/AIDatas";

export interface MonsterData extends FightDisplay {
    id: number; // 模板 ID，不是战斗 uid，同一模板可以生成多个单位
    attr: FightAttr;
    skills?: IdLevelArray;
    passiveSkills?: IdLevelArray;
    attackSkill?: number;
    fbackSkill?: number;
    supportSkill?: number;
    ultimateSkill?: number;
    inputSkill?: number; // 未配置 AI 时的旧固定主动技能
    ais?: AIData[];
}

const monsters = new Map<number, MonsterData>();
export function initMonsters(datas: MonsterData[]) {
    for (const data of datas) monsters.set(data.id, data);
}
export function getMonsterData(id: number): MonsterData | undefined { return monsters.get(id); }
