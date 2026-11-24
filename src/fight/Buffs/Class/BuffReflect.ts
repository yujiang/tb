// 默认反射魔法伤害给攻击者，治疗转移给随机存活敌人；自身不承受已转移的效果。
import { FightBuff } from '../FightBuff';
import type {
	FightUnit,
	PendingHurt,
	PendingHeal,
	UnitContextEventFunc,
} from '../../Unit/FightUnit';
import { FightContex } from '../../Fight';

export class BuffReflect extends FightBuff {
	private healListener: UnitContextEventFunc;

	override onAdded(unit: FightUnit) {
		this.func = this.onReflectHurt.bind(this);
		this.healListener = this.onReflectHeal.bind(this);
		unit.onContex('beforeHurt', this.func, this.xls.prior ?? 0);
		unit.onContex('beforeHeal', this.healListener, this.xls.prior ?? 0);
	}

	override onRemoved(unit: FightUnit) {
		if (this.func) unit.offContex('beforeHurt', this.func);
		if (this.healListener) unit.offContex('beforeHeal', this.healListener);
		this.func = null;
		this.healListener = null;
	}

	private consume(unit: FightUnit, ctx: FightContex) {
		this.consumeTimes(unit, ctx);
	}

	private onReflectHurt(
		unit: FightUnit,
		ctx: FightContex,
		attacker: FightUnit,
		pending: PendingHurt,
	) {
		if (
			unit.findBuff(this.getId()) !== this ||
			unit.isDied() ||
			pending.cancelled ||
			pending.reflected ||
			pending.source === 'share'
		) {
			return;
		}

		if ((this.xls.classParam?.magicOnly ?? true) && !pending.magic) {
			return;
		}

		if (
			Math.floor(pending.damage) <= 0 ||
			attacker === unit ||
			attacker.isDied() ||
			!ctx.fight.getUnitById(attacker.uid)
		) {
			return;
		}

		const damage = pending.damage;
		pending.damage = 0;
		pending.cancelled = true;
		ctx.fight.resolveAction(() => {
			ctx.msgs.push(['buffTrigger', unit.uid, this.getId(), 'reflectHurt', attacker.uid]);
			attacker.onHurt(unit, 'reflect', damage, ctx, {
				magic: pending.magic,
				reflected: true,
				source: 'reflect',
			});
			this.consume(unit, ctx);
		});
	}

	private onReflectHeal(
		unit: FightUnit,
		ctx: FightContex,
		_healer: FightUnit,
		pending: PendingHeal,
	) {
		if (
			unit.findBuff(this.getId()) !== this ||
			unit.isDied() ||
			pending.cancelled ||
			pending.reflected ||
			pending.revive ||
			Math.floor(pending.heal) <= 0
		) {
			return;
		}

		const target = ctx.fight.randomEnemyAlive(unit.side);
		if (!target) return;

		const heal = pending.heal;
		pending.heal = 0;
		pending.cancelled = true;
		ctx.fight.resolveAction(() => {
			ctx.msgs.push(['buffTrigger', unit.uid, this.getId(), 'reflectHeal', target.uid]);
			if (target.inStatus('禁疗')) {
				ctx.msgs.push(['禁疗', target.uid]);
			} else {
				target.onHeal(unit, 'reflect', heal, ctx, { reflected: true });
			}
			this.consume(unit, ctx);
		});
	}
}
