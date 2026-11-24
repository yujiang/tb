import { FightContex } from '../../Fight';
import { FightUnit } from '../../Unit/FightUnit';
import { FightSkill } from '../FightSkill';
import { afterSelfBuff } from './NoHurt';

// 整组目标属于同一次动作，复用各类技能的单体结算，保留共享反应预算和动作结束回调。
// 群攻与溅射不同，溅射不追击连击反击~
export function multiFunc(
	attacker: FightUnit,
	skill: FightSkill,
	ctx: FightContex,
	func: (attacker: FightUnit, target: FightUnit, skill: FightSkill, ctx: FightContex) => boolean,
	force = false,
) {
	return ctx.fight.resolveAction(()=>multi(attacker,skill,ctx,func,force));
}

function multi(
	attacker: FightUnit,
	skill: FightSkill,
	ctx: FightContex,
	func: (attacker: FightUnit, target: FightUnit, skill: FightSkill, ctx: FightContex) => boolean,
	force = false,
) {	
	const targets = ctx.fight.selectGroupTargets(attacker, skill);
	if (!targets.length) {
		attacker.hintClient('没有可用目标');
		return false;
	}

	if (!force && ctx.fight.randomGreat(skill.getRand())) {
		ctx.msgs.push(['skillFailed', attacker.uid, targets[0].uid, skill.getId()]);
		return false;
	}

	const single = skill.forSingleTarget();
	const previous = ctx.defend;
	try {
		for (const target of targets) {
			if (attacker.isDied()) break;
			if (!ctx.fight.isLegalTarget(attacker, target, skill)) continue;
			ctx.defend = target;
			func(attacker, target, single, ctx);
		}
		afterSelfBuff(attacker, skill, ctx);
		return true;
	} finally {
		ctx.defend = previous;
	}	
}
