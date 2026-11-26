// 挂在被保护者身上，施加者承担攻击伤害的一半；到期由 BuffData 配置。
import { FightBuff } from '../FightBuff';
import type { FightUnit, UnitContextEventFunc, UnitEventArgs } from '../../Unit/FightUnit';

export class BuffProtect extends FightBuff {
	override func: UnitContextEventFunc<'beforeHurt'>;
	override onAdded(unit: FightUnit) {
		this.func = this.onEvent.bind(this);
		unit.onContex('beforeHurt', this.func, this.xls.prior ?? 500);
	}

	override onRemoved(unit: FightUnit) {
		if (this.func) unit.offContex('beforeHurt', this.func);
		this.func = null;
	}

	override onEvent(...[unit, ctx, attacker, pending]: UnitEventArgs<'beforeHurt'>) {
		if (this.isHpPendingInvalid(unit,pending) || 
			pending.source !== 'skill' ||
			pending.noprotect  //禁止分担
		) {
			return;
		}

		const protector = this.attacker;
		if (
			!protector ||
			protector === unit ||
			protector.isDied() ||
			protector.side !== unit.side ||
			!ctx.fight.hasUnit(protector.uid)
		) {
			return;
		}

		const damage = Math.max(0, Math.floor(pending.damage));
		const share = Math.floor(damage * 0.5);
		if (share <= 0) return;

		pending.damage = damage - share;
		pending.shared = true;
		pending.share = { unit: protector, damage: share, buffId: this.getId() };
	}
}
