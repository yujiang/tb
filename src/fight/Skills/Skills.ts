import { FightUnit } from "../Unit/FightUnit";
import { FightSkill, SkillData } from "./FightSkill";
import { healFunc } from "./Heal";
import { FightContex } from "./NormalAttack";
import { skillAttackFunc } from "./NomalSkill";
import { spreadFunc } from "./Spread";

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

export type SkillFuncType = (attacker: FightUnit, defender: FightUnit, skill:FightSkill, ctx: FightContex) => FightContex;
const SkillFuncMap: Record<string,SkillFuncType> = {
    normal: skillAttackFunc,
    heal: healFunc,
    spread: spreadFunc,
}

export function skillFunc(attacker: FightUnit, defender: FightUnit, skillId: number, ctx: FightContex) {
    const skill = attacker.findSkill(skillId);
    if (!skill) return;

    const f = ctx.fight;

    // defender 可能不合适了，因为可能被前面的人打飞了~
    const sel = skill.getSel();
    if (!defender || !defender.isFillterDie(sel.die)) {
        defender = f.selectMainTarget(attacker, sel);
        if (!defender) return;
    }

    const func = SkillFuncMap[skill.getFunc()] || skillAttackFunc;
    if (!func) return;
    
    const cost = skill.getCost();
    if (cost && !attacker.costSkill(cost, ctx)) return;

    return func(attacker, defender, skill, ctx);
}