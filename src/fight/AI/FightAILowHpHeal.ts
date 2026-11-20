import { strict as assert } from 'node:assert';
import { FightAI } from './FightAI';
import type { AIData } from './AIDatas';
import type { FightContex } from '../Fight';
import type { FightUnit } from '../Unit/FightUnit';
import { FightCmdEnum, FightInput } from '../struct';

// 血量严格低于50%时尝试单体自疗，其余情况不干预普通行动的默认回退。
export class FightAILowHpHeal extends FightAI {
	constructor(xls: AIData) {
		super(xls);
		assert.ok(
			Number.isSafeInteger(xls.skill) && xls.skill > 0,
			'AI skill must be a positive safe integer',
		);
	}

	override waitInput(unit: FightUnit, turn: number, ctx: FightContex): FightInput | undefined {
		if (unit.isDied() || unit.getHp() >= unit.getHpMax() * 0.5) return undefined;
		const skill = unit.findSkill(this.xls.skill);
		if (!skill || skill.getFunc() !== 'heal' || skill.isMulti()) return undefined;
		const input = { cmd: FightCmdEnum.skill, skill: this.xls.skill, target: unit.uid };
		return ctx.fight.checkPC(unit, input) ? input : undefined;
	}
}
