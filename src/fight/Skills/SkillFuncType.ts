import { FightUnit } from '../Unit/FightUnit';
import { afterSelfBuff, nohurtFunc } from './Funcs/Buff';
import { FightSkill } from './FightSkill';
import { healFunc } from './Funcs/Heal';
import { skillAttackFunc } from './Funcs/NomalSkill';
import { poisonFunc } from './Funcs/Poison';
import { relifeFunc } from './Funcs/Relife';
import { FightContex } from '../Fight';
import { multiFunc } from './Funcs/Multi';

export type SkillFuncType = (
	attacker: FightUnit,
	defender: FightUnit,
	skill: FightSkill,
	ctx: FightContex,
) => boolean;
const SkillFuncMap: Record<string, SkillFuncType> = {
	normal: skillAttackFunc,
	heal: healFunc,
	poison: poisonFunc,
	relife: relifeFunc,
	nohurt: nohurtFunc, //没有伤害
};

export function skillFunc(
	attacker: FightUnit,
	defender: FightUnit,
	skillId: number,
	ctx: FightContex,
) {
	const skill = attacker.findSkill(skillId);
	if (!skill) {
		attacker.hintClient('未学会该技能');
		return;
	}
	const cd = attacker.getSkillCd(skillId);
	if (cd > 0) {
		attacker.hintClient(`[${skill.getName()}]冷却中，还需 ${cd} 回合`);
		return;
	}

	const f = ctx.fight;

	// defender 可能不合适了，因为可能被前面的人打飞了~
	if (skill.isMulti()) {
		if (!f.getAllUnits().some((target) => f.isLegalTarget(attacker, target, skill))) {
			attacker.hintClient('没有可用目标');
			return false;
		}
	} else if (defender && !skill.canTarget(defender)) {
		attacker.hintClient(skill.getTargetHint(defender) ?? '目标不符合要求');
		return false;
	} else if (!defender) {
		defender = f.selectMainTarget(attacker, skill);
		if (!defender) {
			attacker.hintClient('没有可用目标');
			return;
		}
	}

	const func = SkillFuncMap[skill.getFunc()] || skillAttackFunc;
	if (!func) return;

	const cost = skill.getCost();
	if (cost && !attacker.costSkill(cost, ctx)) return;
	attacker.startSkillCd(skill, ctx);

	if (skill.isMulti() && func !== skillAttackFunc) return multiFunc(attacker, skill, ctx, func);
	const taunt = !skill.isMulti() ? f.getTauntBuff(attacker, skill) : undefined;
	const result = func(attacker, defender, skill, ctx);
	// 普通攻击类在整条反应链结束后处理自身效果；其余技能在本次执行完成后处理。
	if (result && func !== skillAttackFunc) afterSelfBuff(attacker, skill, ctx);
	if (taunt && taunt.getTauntTarget() === defender) attacker.emitContext('taunt', ctx, taunt);
	return result;
}
