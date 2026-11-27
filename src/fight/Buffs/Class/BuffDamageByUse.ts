import { strict as assert } from 'node:assert';
import { FightBuff } from '../FightBuff';
import type { BuffData } from '../../Datas/BuffDatas';
import type { FightUnit, UnitContextEventFunc, UnitEventArgs } from '../../Unit/FightUnit';
import type { SkillUseType } from '../../struct';
import type { FightSkill } from '../../Skills/FightSkill';

// 越战越勇：读取本场累计出手次数，只增强同类型的本次技能，不再维护独立层数。
export class BuffDamageByUse extends FightBuff {
	override func: UnitContextEventFunc<'useSkill'>;
	constructor(xls: BuffData, level: number, attacker: FightUnit, turn: number) {
		super(xls, level, attacker, turn);
		for (const value of [xls.damageUse?.rate ?? 0.05, xls.damageUse?.max ?? 0.5]) {
			assert.ok(Number.isFinite(value) && value >= 0, 'damageUse rate/max must be finite and nonnegative');
		}
	}

	override onAdded(unit: FightUnit) {
		if (this.times <= 0) return;

		this.func = this.onEvent.bind(this);
		unit.onContex('useSkill', this.func, this.xls.prior ?? 0);
	}

	override onRemoved(unit: FightUnit) {
		if (this.func) unit.offContex('useSkill', this.func);
		this.func = null;
	}

	private matchesType(type: SkillUseType): boolean {
		return type === (this.xls.damageUse?.type ?? 'support');
	}

	override getDamageRate(unit: FightUnit, skill: FightSkill, type: SkillUseType): number {
		if (!this.matchesType(type)) return 0;

		const growth = this.xls.damageUse;
		return Math.min(
			unit.getSkillTypeUseCount(type) * (growth?.rate ?? 0.05),
			growth?.max ?? 0.5,
		);
	}

	// 事件只处理次数消耗；本次增伤已在事件前统一汇总，最后一次不会丢失。
	override onEvent(...[unit, ctx, skill, type]: UnitEventArgs<'useSkill'>) {
		if (unit.findBuff(this.getId()) !== this || !this.matchesType(type)) {
			return;
		}

		this.consumeTimes(unit, ctx);
	}
}
