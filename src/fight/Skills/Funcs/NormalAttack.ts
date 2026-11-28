// 普通攻击

import { FightContex } from "../../Fight";
import { FightUnit } from "../../Unit/FightUnit";
import { skillAttackFunc } from "./NomalSkill";


export function attackFunc(attacker: FightUnit, defender: FightUnit, ctx: FightContex) {
	const skill = attacker.getAttackSkillOrDefault();
	return skillAttackFunc(attacker, defender, skill, ctx);
}
