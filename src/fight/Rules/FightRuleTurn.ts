import { strict as assert } from 'node:assert';
import { FightRule } from './FightRule';
import type { FightContex } from '../Fight';
import type { FightUnit } from '../Unit/FightUnit';
import { FightCmdEnum, InsertActionPos } from '../struct';
import type { RuleData } from '../Datas/RuleDatas';

// 周期技能插入独立行动，不占普通行动，也不触发全体破盾大招槽的主动输入。
export class FightRuleTurn extends FightRule {
	private selectedTurn = -1;
	get everyTurn() {
		return this.xls.everyTurn;
	}
	get skill() {
		return this.xls.skill;
	}
	get pos() {
		return this.xls.pos;
	}
	get speedRate() {
		return this.xls.speedRate ?? 1;
	}
	constructor(xls: RuleData) {
		super(xls);
		const { everyTurn, skill } = xls;
		const pos = this.pos;
		assert.ok(
			Number.isSafeInteger(everyTurn) && everyTurn > 0,
			'everyTurn must be a positive safe integer',
		);
		assert.ok(
			Number.isSafeInteger(skill) && skill > 0,
			'skill must be a positive safe integer',
		);
		if (pos === undefined) {
			assert.ok(
				Number.isFinite(this.speedRate) && this.speedRate >= 0,
				'speedRate must be finite and nonnegative',
			);
		} else {
			assert.ok(
				[
					InsertActionPos.first,
					InsertActionPos.last,
					InsertActionPos.random,
					InsertActionPos.afterSelf,
				].includes(pos),
				'Invalid insertion position',
			);
		}
	}
	override startFight(unit: FightUnit) {
		this.selectedTurn = -1;
	}
	override beforeTurn(unit: FightUnit, turn: number, ctx: FightContex) {
		if (turn > 0 && turn % this.everyTurn === 0 && this.selectedTurn !== turn) {
			const input = { cmd: FightCmdEnum.skill, skill: this.skill };
			if (
				ctx.fight.checkPC(unit, input) &&
				ctx.fight.insertAction(unit, input, this.pos, this.speedRate, ctx)
			) {
				this.selectedTurn = turn;
			}
		}
	}
}
