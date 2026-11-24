import type { FightUnit } from '../Unit/FightUnit';
import type { FightSkill } from './FightSkill';

export function canAttack(unit: FightUnit): boolean {
	return !unit.isDied() && !unit.isForbid('attack');
}

// 原地技能可在禁移动时使用。未传技能时按需要移动的普通反击处理。
export function canUseAttackMovement(unit: FightUnit, skill?: FightSkill): boolean {
	return skill?.getNoMove() === 1 || !unit.isForbid('move');
}
