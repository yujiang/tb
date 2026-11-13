import { FightUnit } from "../FightUnit";
import { FightSkill } from "./FightSkill";
import { FightContex } from "./NormalAttack";
import { skillAttack, skillAttackFunc } from "./SkillAttack";

export class SpreadSkill extends FightSkill {
    override getValue(){
        return this.xls.value || 0;
    }
    override getValuePercent(){
        return this.xls.valuePercent || 0;
    }
    override calcValue(v: number){
        return (v + this.getValue()) * (1 + this.getValuePercent());
    }
}

export function spreadFunc(attacker: FightUnit, defender: FightUnit, skill:FightSkill, ctx: FightContex) {
    skillAttackFunc(attacker, defender, skill, ctx);

    const f = ctx.fight;
    const xls = skill.xls;
    const targets = f.selectTargets(defender, xls.sel);
    if (!targets || targets.length == 0) return;

    const ids = targets.map((target) => {
        return target.uid;
    });
    ctx.msgs.push(["spread", ids]);
    for (const target of targets) {
        skillAttack(attacker, target, skill, "", ctx);
    }
    return ctx;
}