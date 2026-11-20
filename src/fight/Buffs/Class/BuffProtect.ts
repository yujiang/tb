// 挂在被保护者身上，施加者承担攻击伤害的一半；到期由 BuffData 配置。
import { FightBuff } from '../FightBuff';
import type { FightContex } from '../../Fight';
import type { FightUnit, PendingHurt } from '../../Unit/FightUnit';

export class BuffProtect extends FightBuff {
	override onAdded(unit: FightUnit) {
		this.func = this.onEvent.bind(this);
		unit.onContex('beforeHurt', this.func, this.xls.prior ?? 500);
	}

	override onRemoved(unit: FightUnit) {
		if (this.func) unit.offContex('beforeHurt', this.func);
		this.func = null;
	}

	override onEvent(unit: FightUnit, ctx: FightContex, attacker: FightUnit, pending: PendingHurt) {
		if (
			unit.findBuff(this.getId()) !== this ||
			unit.isDied() ||
			pending.cancelled ||
			pending.shared ||
			pending.source !== 'skill' ||
			pending.noprotect
		)
			return;
		const protector = this.attacker;
		if (
			!protector ||
			protector === unit ||
			protector.isDied() ||
			protector.side !== unit.side ||
			protector.fight !== ctx.fight ||
			!ctx.fight.getAllUnits().includes(protector)
		)
			return;
		const damage = Math.max(0, Math.floor(pending.damage));
		const share = Math.floor(damage * 0.5);
		if (share <= 0) return;
		pending.damage = damage - share;
		pending.shared = true;
		pending.share = { unit: protector, damage: share, buffId: this.getId() };
	}
}
