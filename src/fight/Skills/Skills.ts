import { FightUnit } from "../FightUnit";
import { FightSkill, SkillData } from "./FightSkill";
import { healFunc } from "./Heal";
import { FightContex } from "./NormalAttack";
import { skillAttackFunc } from "./SkillAttack";
import { spreadFunc } from "./Spread";

const skills = new Map<number,FightSkill>();

export function initSkills(datas: SkillData[]){
    for (const data of datas) {
        const skill = new FightSkill(data);
        skills.set(data.id, skill);
    }
}

export function getSkillById(id: number) : FightSkill{
    if (!id) return;
    return skills.get(id);
}

export type SkillFuncType = (attacker: FightUnit, defender: FightUnit, skill:FightSkill, ctx: FightContex) => FightContex;
const SkillFuncMap: Record<string,SkillFuncType> = {
    normal: skillAttackFunc,
    heal: healFunc,
    溅射: spreadFunc,
}

export function skillFunc(attacker: FightUnit, defender: FightUnit, skillId: number, ctx: FightContex) {
    const skill = getSkillById(skillId);
    if (!skill) return;

    const xls = skill.xls;

    const f = ctx.fight;

    // defender 可能不合适了，因为可能被前面的人打飞了~
    if (!defender || !defender.isFillterDie(xls.sel.die)) {
        defender = f.selectMainTarget(attacker, xls.sel);
        if (!defender) return;
    }

    const func = SkillFuncMap[xls.func] || skillAttackFunc;
    // if (!func) return;
    return func(attacker, defender, skill, ctx);
}