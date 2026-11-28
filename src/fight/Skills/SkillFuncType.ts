import { FightUnit } from '../Unit/FightUnit';
import { afterSelfBuff, nohurtFunc } from './Funcs/NoHurt';
import { FightSkill } from './FightSkill';
import { healFunc } from './Funcs/Heal';
import { skillAttackFunc } from './Funcs/NomalSkill';
import { poisonFunc } from './Funcs/Poison';
import { relifeFunc } from './Funcs/Relife';
import { FightContex } from '../Fight';
import { multiFunc } from './Funcs/Multi';
import { observeFunc } from './Funcs/Observe';
import { entrustFunc } from './Funcs/Entrust';
import { mimicFunc } from './Funcs/Mimic';

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
	observe: observeFunc,
	entrust: entrustFunc,
	mimic: mimicFunc,
};

// ignoreCostCD由可信执行指令传入，只作用于本次技能调用，不影响外层模仿自身费用/CD。
export function skillFunc(
	attacker: FightUnit,
	defender: FightUnit,
	skillId: number,
	ctx: FightContex,
	ignoreCostCD = false,
) {
	const skill = attacker.findSkill(skillId);
	if (!skill) {
		attacker.hintClient('未学会该技能');
		return;
	}

	if (!skill.getNoMove() && attacker.isForbid('move')) {
		attacker.hintClient('当前无法移动，只能使用原地技能');
		return;
	}

	const cd = ignoreCostCD ? 0 : attacker.getSkillCd(skillId);
	if (cd > 0) {
		attacker.hintClient(`[${skill.getName()}]冷却中，还需 ${cd} 回合`);
		return;
	}

	const f = ctx.fight;
	if (skill.isMimicAny() && skill.isMulti()) {
		attacker.hintClient('高级模仿只能选择一个行动来源');
		return false;
	}
	if (
		skill.getFunc() === 'mimic' &&
		!skill.isMimicAny() &&
		!f.canMimic(attacker, ignoreCostCD ? undefined : skill.getCost())
	) {
		attacker.hintClient('没有可模仿的攻击，或当前无法使用原攻击');
		return false;
	}
	if (skill.getFunc() === 'entrust' && (!f.canEntrust(attacker) || skill.isMulti())) {
		attacker.hintClient('托付只能在PC普通行动中使用，且只能指定一名队友');
		return false;
	}

	if (skill.getFunc() === 'entrust' && defender && !f.isLegalTarget(attacker, defender, skill)) {
		attacker.hintClient('托付目标必须是存活的其他队友');
		return false;
	}

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

	if (
		skill.isMimicAny() &&
		(!f.isLegalTarget(attacker, defender, skill) ||
			!f.canMimic(attacker, ignoreCostCD ? undefined : skill.getCost(), defender))
	) {
		attacker.hintClient('当前无法模仿该单位的行动');
		return false;
	}

	const cost = skill.getCost();
	if (!ignoreCostCD && cost && !attacker.costSkill(cost, ctx)) {
		return;
	}

	ctx.actionStarted = true;
	if (!ignoreCostCD) attacker.startSkillCd(skill, ctx);
	if (func === skillAttackFunc) return func(attacker, defender, skill, ctx);

	const taunt = !skill.isMulti() ? f.getTauntBuff(attacker, skill) : undefined;
	let result: boolean;

	if (skill.isMulti()) {
		return multiFunc(attacker, skill, ctx, (actor, target, single, context, useSkill) => {
			useSkill();
			return func(actor, target, single, context);
		});
	}

	// 攻击和群体技能在各自管线判定；单体非攻击技能在执行效果前统一判定一次。
	if (!skill.passRand(f)) {
		ctx.msgs.push(['skillFailed', attacker.uid, defender.uid, skill.getId()]);
		result = false;
	} else {
		attacker.recordSkillUse(skill, ctx);
		result = func(attacker, defender, skill, ctx);
	}
	if (result) {
		afterSelfBuff(attacker, skill, ctx);
	}

	if (taunt && taunt.getTauntTarget() === defender) {
		attacker.emitContext('taunt', ctx, taunt);
	}
	return result;
}
