import { strict as assert } from 'node:assert';
import { FightRule } from './FightRule';
import type { FightContex } from '../Fight';
import type { FightAttr } from '../FightAttr';
import type { FightUnit } from '../Unit/FightUnit';
import type { RuleData } from './RuleDatas';

export interface HpAxisLine {
	/** 血线比例，有限数(0,1]；当前 hp/hpMax <= 此值时触发，包括初始生命已在血线以下。 */
	hp: number;
	/** 增攻比例，非负有限数；0.2 表示增加20%，多条累计相加，只影响物理/魔法各攻击分组。 */
	attackRate: number;
}

export class FightRuleHp extends FightRule {
	private lines: HpAxisLine[];
	private reached = new Set<number>();
	private attackBonus = 0;

	constructor(xls: RuleData) {
		super(xls);
		const lines = xls.lines;
		assert.ok(Array.isArray(lines), 'hp rule lines must be an array');
		for (const line of lines) {
			assert.ok(
				Number.isFinite(line.hp) && line.hp > 0 && line.hp <= 1,
				'hp must be in (0, 1]',
			);
			assert.ok(
				Number.isFinite(line.attackRate) && line.attackRate >= 0,
				'attackRate must be finite and nonnegative',
			);
		}
		this.lines = lines.map((line) => ({ ...line }));
	}

	protected override onAdded(unit: FightUnit) {
		this.startFight(unit);
		this.listen(unit, 'hp', (owner, ctx) => {
			if (this.checkLines(owner, ctx)) owner.calcAttr();
		});
	}

	override startFight(unit: FightUnit) {
		this.reached.clear();
		this.attackBonus = 0;
		this.checkLines(unit);
	}

	private checkLines(unit: FightUnit, ctx?: FightContex): boolean {
		if (unit.getHpMax() <= 0) return false;

		let changed = false;
		this.lines.forEach((line, index) => {
			if (!this.reached.has(index) && unit.getHp() / unit.getHpMax() <= line.hp) {
				this.reached.add(index);
				this.attackBonus += line.attackRate;
				changed = true;
				ctx?.msgs.push(['aiHp', unit.uid, line.hp, this.attackBonus]);
			}
		});
		return changed;
	}

	override modifyAttr(unit: FightUnit, attr: FightAttr) {
		for (const group of [attr.physic, attr.magic]) {
			for (const name of ['base', 'next', 'kill', 'spread', 'fback'] as const) {
				group[name].attack *= 1 + this.attackBonus;
			}
		}
	}
}
