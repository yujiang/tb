import { FightSkill, SkillData } from "./FightSkill";

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

// 临时的子技能~
export function getRelativeSkill(skill:FightSkill, id: number) {
    const data = getSkillData(id);
    if (!data) return;
    return new FightSkill(data, skill.level);
}

