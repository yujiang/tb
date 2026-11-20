// 挂在被嘲讽者身上，施加者是被强制选择的目标。
// 当施展一个对象是敌方的技能时，自动把主目标变为嘲讽者，而不是禁止他。

import { FightBuff } from '../FightBuff';
import type { FightContex } from '../../Fight';
import type { FightUnit } from '../../Unit/FightUnit';

export class BuffTaunt extends FightBuff {
	override onAdded(unit: FightUnit) {
		if (this.times <= 0) return;
		this.func = this.onEvent.bind(this);
		unit.onContex('taunt', this.func, this.xls.prior ?? 0);
	}

	override onRemoved(unit: FightUnit) {
		if (this.func) unit.offContex('taunt', this.func);
		this.func = null;
	}

	override onEvent(unit: FightUnit, ctx: FightContex, selected: FightBuff) {
		if (selected === this) super.onEvent(unit, ctx);
	}

	override getTauntTarget(): FightUnit {
		return this.attacker;
	}
}
