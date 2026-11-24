// 不屈，如果要死亡，hp=>1
import { FightBuff } from '../FightBuff';
import type { Fight, FightContex } from '../../Fight';
import type { FightUnit, PendingHurt } from '../../Unit/FightUnit';

export class BuffBuqu extends FightBuff {
	// 记录在战斗与单位上，移除、替换或复活后重新附加 Buff 也不会刷新机会。
	// 使用 WeakMap<Fight 可以不修改Fight的字段，把他变得庞大，好像也可以；但是一般我不这样做。
	private static used = new WeakMap<Fight, WeakSet<FightUnit>>();

	override onAdded(unit: FightUnit) {
		this.times = 1;
		this.func = this.onEvent.bind(this);
		unit.onContex('beforeHurt', this.func, this.xls.prior ?? 1000);
	}

	override onRemoved(unit: FightUnit) {
		if (this.func) {
			unit.offContex('beforeHurt', this.func);
			this.func = null;
		}
	}

	override onEvent(unit: FightUnit, ctx: FightContex, attacker: FightUnit, pending: PendingHurt) {
		if (pending.cancelled) return;

		let used = BuffBuqu.used.get(ctx.fight);
		if (used?.has(unit)) {
			this.times = 0;
			unit.expireBuff(this, 'used', ctx);
			return;
		}

		// 已有锁血不会死亡，也不消耗不屈。小数伤害按最终向下取整的结果判断。
		if (unit.minHp > 0 || unit.getHp() <= 0 || Math.floor(pending.damage) < unit.getHp()) {
			return;
		}

		if (!used) {
			used = new WeakSet<FightUnit>();
			BuffBuqu.used.set(ctx.fight, used);
		}
		used.add(unit);
		pending.damage = Math.max(0, unit.getHp() - 1);
		ctx.msgs.push(['buffTrigger', unit.uid, this.getId(), 'buqu']);
		this.consumeTimes(unit, ctx);
	}
}
