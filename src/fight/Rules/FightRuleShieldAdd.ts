import { strict as assert } from 'node:assert';
import { FightRule } from './FightRule';
import type { RuleData } from '../Datas/RuleDatas';
import type { FightUnit } from '../Unit/FightUnit';

export class FightRuleShieldAdd extends FightRule {
	private times = 0;

	constructor(xls: RuleData) {
		super(xls);
		assert.ok(
			Number.isSafeInteger(xls.shieldAdd) && xls.shieldAdd > 0,
			'shieldAdd must be a positive safe integer',
		);
	}

	protected override onAdded(unit: FightUnit) {
		this.listen(unit, 'break', (owner) => {
			this.times++;
			owner.setShieldMax(owner.attrOri.shield + this.xls.shieldAdd * this.times);
		});
	}

	override startFight() {
		this.times = 0;
	}
}
