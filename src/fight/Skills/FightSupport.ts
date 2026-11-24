import { FightContex } from '../Fight';
import { FightUnit } from '../Unit/FightUnit';
import { skillAttackFunc } from './Funcs/NomalSkill';
import { canAttack, canUseAttackMovement } from './AttackChecks';

function canSupport(unit: FightUnit, attacker: FightUnit, turn: number): boolean {
	if (
		unit === attacker ||
		!canAttack(unit) ||
		unit.isForbid('action') ||
		unit.lastSupportTurn === turn
	) {
		return false;
	}

	const skill = unit.getSupportSkill();
	return skill?.getFunc() === 'normal' && canUseAttackMovement(unit, skill);
}

// 先选一名队友，再由公共技能流程判定 rand；失败不改选、不多抽一次概率。
export function trySupport(attacker: FightUnit, defender: FightUnit, ctx: FightContex) {
	const fight = ctx.fight;
	if (
		ctx.supporting ||
		attacker.isDied() ||
		defender.isDied() ||
		attacker.side === defender.side
	) {
		return false;
	}

	const candidates = fight
		.getSideUnits(attacker.side)
		.filter((unit) => canSupport(unit, attacker, fight.turn));
	if (!candidates.length) return false;

	const supporter = candidates.length === 1 ? candidates[0] : fight.randArray(candidates);
	const skill = supporter.getSupportSkill();
	// 选中并尝试就占用次数，rand 失败或未命中也不返还；同时防止伤害回调重入。
	supporter.lastSupportTurn = fight.turn;
	const previous = ctx.supporting;
	ctx.supporting = true;
	try {
		return skillAttackFunc(supporter, defender, skill, ctx, 'support');
	} finally {
		ctx.supporting = previous;
	}
}
