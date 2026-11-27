import type { FightContex } from '../Fight';
import { FightCmdEnum, type FightInput } from '../struct';
import type { FightUnit } from '../Unit/FightUnit';
import { FightBehavior } from '../FightBehavior';
import type { AIData } from '../Datas/AIDatas';
import { getDefaultSkill, type FightSkill } from '../Skills/FightSkill';
import { strict as assert } from 'node:assert';

// AI与Rule同级，共用FightBehavior的绑定和生命周期；一个怪物只绑定一个AI，负责普通行动决策。
export const contributionsType = [
	'unitHurt',
	'unitHeal',
	'enemyHurt',
	'enemyHeal',
	'friendHurt',
	'friendHeal',
];
export function isContributionsType(type: string) {
	return contributionsType.includes(type);
}

export abstract class FightAI extends FightBehavior<AIData> {
	constructor(xls: AIData) {
		super(xls);
		if (xls.skill !== undefined) {
			assert.ok(
				Number.isSafeInteger(xls.skill) && xls.skill > 0,
				'AI skill must be a positive safe integer',
			);
		}
	}
	getType() {
		return this.xls.type;
	}

	waitInput(unit: FightUnit, turn: number, ctx: FightContex): FightInput | undefined {
		const skill = this.getSkillInput(unit);
		if (!skill) return;

		const target = this.findTarget(unit, turn, skill);
		if (!target) return;

		return this.getSkillCmd(unit, target);
	}

	abstract findTarget(unit: FightUnit, turn: number, skill: FightSkill): FightUnit | undefined;
}

export { createAI } from './AIFactory';
