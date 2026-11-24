import { strict as assert } from 'node:assert';
import { FightAI } from './FightAI';
import type { AIData } from './AIDatas';
import type { FightContex } from '../Fight';
import type { FightUnit } from '../Unit/FightUnit';
import { FightCmdEnum, FightInput } from '../struct';
import { FightBehavior } from '../FightBehavior';

// 条件满足时向自身施放配置技能；资格、费用与冷却复用公共预检。
export class FightAICond extends FightAI {
	constructor(xls: AIData) {
		super(xls);
		assert.ok(
			Number.isSafeInteger(xls.skill) && xls.skill > 0,
			'Condition AI skill must be a positive safe integer',
		);
	}

	override waitInput(unit: FightUnit, turn: number, ctx: FightContex): FightInput | undefined {
		if (!FightBehavior.inCond(unit, turn, this.xls.cond, this.getCustom())) return;

		const skill = unit.findSkill(this.xls.skill);
		if (!skill) {
			return undefined;
		}

		const input = { cmd: FightCmdEnum.skill, skill: this.xls.skill, target: unit.uid };
		return ctx.fight.checkPC(unit, input) ? input : undefined;
	}
}
