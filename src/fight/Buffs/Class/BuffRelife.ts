// 自动复活：真实死亡后等完整动作结束，按自身最大生命比例复活，每场成功触发一次。
import { FightBuff } from '../FightBuff';
import type { BuffData } from '../BuffDatas';
import type { Fight, FightContex } from '../../Fight';
import type { FightUnit } from '../../Unit/FightUnit';

export class BuffRelife extends FightBuff {
	private static used = new WeakMap<Fight, WeakSet<FightUnit>>();
	private readonly ratio: number;

	constructor(xls: BuffData, level: number, attacker: FightUnit, turn: number) {
		super(xls, level, attacker, turn);
		this.ratio = xls.classParam ?? 0.2;
		if (!Number.isFinite(this.ratio) || this.ratio <= 0 || this.ratio > 1) {
			throw new RangeError('relife classParam must be a number in (0, 1]');
		}
	}

	override onAdded(unit: FightUnit) {
		this.times = 1;
		this.func = this.onEvent.bind(this);
		unit.onContex('die', this.func, this.xls.prior ?? 1000);
	}

	override onRemoved(unit: FightUnit) {
		if (this.func) {
			unit.offContex('die', this.func);
			this.func = null;
		}
	}

	override onEvent(unit: FightUnit, ctx: FightContex) {
		if (unit.findBuff(this.getId()) !== this || !unit.isDied()) {
			return;
		}

		ctx.fight.afterAction(() => this.revive(unit, ctx));
	}

	private revive(unit: FightUnit, ctx: FightContex) {
		// 排队期间可能被其他效果复活、驱散或替换，也可能离开战斗。
		if (
			!ctx.fight.getUnitById(unit.uid) ||
			unit.findBuff(this.getId()) !== this ||
			!unit.isDied()
		) {
			return;
		}

		let used = BuffRelife.used.get(ctx.fight);
		if (used?.has(unit)) {
			this.times = 0;
			unit.expireBuff(this, 'used', ctx);
			return;
		}

		if (unit.inStatus('禁复活')) {
			ctx.msgs.push(['无法复活', unit.uid]);
			return;
		}

		if (!used) {
			used = new WeakSet<FightUnit>();
			BuffRelife.used.set(ctx.fight, used);
		}
		// 先消耗并解绑，防止移除/复活回调再次触发同一次机会。
		used.add(unit);
		ctx.msgs.push(['buffTrigger', unit.uid, this.getId(), 'relife']);
		this.consumeTimes(unit, ctx);
		const hp = Math.max(1, Math.floor(unit.getHpMax() * this.ratio));
		unit.onRelife(unit, 'relife', ctx);
		unit.onHeal(unit, 'relife', hp, ctx, { revive: true });
	}
}
