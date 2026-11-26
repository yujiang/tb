import type { FightUnit } from '../Unit/FightUnit';
import type { FightSkill } from './FightSkill';

function canAttack(unit: FightUnit): boolean {
	return !unit.isDied() && !unit.isForbid('attack');
}

// 原地技能可在禁移动时使用。未传技能时按需要移动的普通反击处理。
function canUseAttackMovement(unit: FightUnit, skill?: FightSkill): boolean {
	return (skill && !skill.isMove()) || !unit.isForbid('move');
}
export function canAttackSkill(
	attacker: FightUnit,
	defender: FightUnit,
	skill: FightSkill,
	forbid?: string,
): boolean {
	return canAttack(attacker) &&
		!attacker.isForbid('action') &&
		!defender.isDied() &&
		(!skill || skill.canTarget(defender)) &&
		canUseAttackMovement(attacker, skill) &&
		(!forbid || !attacker.isForbid(forbid));
}
