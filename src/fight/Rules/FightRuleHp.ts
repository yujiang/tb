import { strict as assert } from 'node:assert';
import { FightRule } from './FightRule';
import type { FightContex } from '../Fight';
import type { FightUnit } from '../Unit/FightUnit';
import type { RuleData } from './RuleDatas';
import type { IdLevel } from '../struct';
import type { FightBuff } from '../Buffs/FightBuff';

export interface HpAxisLine {
	/** 血线比例，有限数(0,1]；当前hp/hpMax <= 此值时触发，包括初始生命已在血线以下；配置必须按hp严格递减；一次跨多条血线直接进入最深阶段，跳过中间阶段，回血不回退。 */
	hp: number;
	/** 阶段Buff的[已注册BuffID, 等级]，必填二元组；ID为正安全整数，等级为非负安全整数，0级有效。触发时先强制移除本规则上一阶段的Buff，再添加本项，不累计旧阶段效果。 */
	buff: IdLevel;
}

export class FightRuleHp extends FightRule {
	private readonly lines: HpAxisLine[];
	private reached = -1;
	private phaseBuff: FightBuff | undefined;
	private checking = false;

	constructor(xls: RuleData) {
		super(xls);
		assert.ok(Array.isArray(xls.lines), 'lines must be an array');
		for (const [index, line] of xls.lines.entries()) {
			assert.ok(
				Number.isFinite(line.hp) && line.hp > 0 && line.hp <= 1,
				'hp must be in (0, 1]',
			);
			if (index > 0) {
				assert.ok(
					xls.lines[index - 1].hp > line.hp,
					'hp lines must be strictly descending',
				);
			}
			assert.ok(
				Array.isArray(line.buff) &&
					line.buff.length === 2 &&
					Number.isSafeInteger(line.buff[0]) &&
					line.buff[0] > 0 &&
					Number.isSafeInteger(line.buff[1]) &&
					line.buff[1] >= 0,
				'buff must contain a positive ID and nonnegative level',
			);
		}
		this.lines = xls.lines.map((line) => ({ hp: line.hp, buff: [...line.buff] as IdLevel }));
	}

	protected override onAdded(unit: FightUnit) {
		this.listen(unit, 'hp', (owner, ctx) => this.checkLines(owner, ctx));
	}

	override startFight(unit: FightUnit, ctx?: FightContex) {
		this.removePhaseBuff(unit, ctx);
		this.reached = -1;
		this.checkLines(unit, ctx);
	}

	private removePhaseBuff(unit: FightUnit, ctx?: FightContex) {
		const previous = this.phaseBuff;
		this.phaseBuff = undefined;
		if (!previous || unit.findBuff(previous.getId()) !== previous) {
			return;
		}

		if (ctx) unit.expireBuff(previous, 'hp', ctx);
		else {
			// 初始化阶段没有消息上下文，初始单位快照会包含最终Buff状态。
			unit.deleteBuff(previous);
			unit.onBuffChanged('hp', previous);
		}
	}

	private checkLines(unit: FightUnit, ctx?: FightContex) {
		if (this.checking || unit.getHpMax() <= 0) {
			return;
		}

		const percent = unit.getHpPercent();
		let next = this.reached;
		for (let index = this.reached + 1; index < this.lines.length; index++) {
			if (percent > this.lines[index].hp) break;

			next = index;
		}
		if (next === this.reached) return;

		this.checking = true;
		try {
			this.reached = next;
			const line = this.lines[next];
			this.removePhaseBuff(unit, ctx);
			if (!this.isBoundTo(unit)) return;

			this.phaseBuff = unit.addBuff(unit, 'hp', line.buff[0], line.buff[1], ctx);
			ctx?.msgs.push(['aiHp', unit.uid, line.hp, ...line.buff]);
		} finally {
			this.checking = false;
		}
	}
}
