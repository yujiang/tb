import { strict as assert } from 'node:assert';
import { FightRule } from './FightRule';
import type { FightUnit, HurtOptions } from '../Unit/FightUnit';
import type { RuleData } from '../Datas/RuleDatas';
import { FightContex } from '../Fight';

// 只在允许攻击时计次；完整 action 结束后，对伤害来源发动普通攻击，不走 fback, 不进入行动条。
export class FightRuleHurt extends FightRule {
	private hits = 0;
	get everyHurt() {
		return this.xls.everyHurt;
	}
	get skill() {
		return this.xls.skill;
	}

	constructor(xls: RuleData) {
		super(xls);
		assert.ok(
			Number.isSafeInteger(xls.everyHurt) && xls.everyHurt > 0,
			'everyHurt must be a positive safe integer',
		);
		if (xls.skill !== undefined) {
			assert.ok(
				Number.isSafeInteger(xls.skill) && xls.skill > 0,
				'skill must be a positive safe integer',
			);
		}
	}

	override startFight(unit: FightUnit) {
		this.hits = 0;
	}
	protected override onAdded(unit: FightUnit) {
		this.hits = 0;
		this.listen(unit, 'hurt', this.onHurt.bind(this));
	}

	onHurt(
		owner: FightUnit,
		ctx: FightContex,
		attacker: FightUnit,
		hp: number,
		source?: HurtOptions,
	) {
		if (owner.isForbid('attack')) return;

		if (
			hp <= 0 ||
			source?.source !== 'skill' ||
			attacker === owner ||
			attacker.side === owner.side
		) {
			return;
		}

		if (++this.hits % this.everyHurt !== 0) return;

		ctx.fight.afterAction(() => {
			if (!this.isBoundTo(owner)) return;

			const skill = this.getSkillInput(owner);
			if (!skill) return;

			const cmd = this.getSkillCmd(owner, attacker);
			if (!cmd) return;

			// 新攻击沿用普通攻击属性与反应预算，不走反击属性，也不进入行动条。
			ctx.msgs.push(['aiAttack', owner.uid, attacker.uid]);
			ctx.fight.exeSkillAttackContext(owner, cmd, attacker, ctx);
		});
	}
}
