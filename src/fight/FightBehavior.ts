import { strict as assert } from 'node:assert';
import type { FightContex } from './Fight';
import type { FightAttr } from './FightAttr';
import type { FightUnit, UnitContextEventFunc } from './Unit/FightUnit';
import type { FightUnitEvent } from './Buffs/BuffDatas';
import { EnemySide } from './struct';

// AI与Rule共用的配置、绑定、监听和生命周期；每个实例只能绑定一个单位。
export class FightBehavior<T extends { type: string; custom?: any }> {
	protected xls: T;
	constructor(xls: T) {
		this.xls = xls;
	}
	getXls() {
		return this.xls;
	}
	getCustom() {
		return this.xls.custom;
	}

	private owner: FightUnit | undefined;
	private listeners: { event: FightUnitEvent; listener: UnitContextEventFunc }[] = [];
	bind(unit: FightUnit) {
		assert.ok(
			!this.owner || this.owner === unit,
			'FightBehavior cannot be shared by different units',
		);
		if (this.owner) return false;

		this.owner = unit;
		try {
			this.onAdded(unit);
		} catch (error) {
			this.unbind(unit);
			throw error;
		}

		return true;
	}
	unbind(unit: FightUnit) {
		if (this.owner !== unit) return;

		for (const entry of this.listeners) unit.offContex(entry.event, entry.listener);
		this.listeners.length = 0;
		this.owner = undefined;
	}
	protected isBoundTo(unit: FightUnit) {
		return this.owner === unit;
	}
	protected listen(
		unit: FightUnit,
		event: FightUnitEvent,
		listener: UnitContextEventFunc,
		prior = 0,
	) {
		unit.onContex(event, listener, prior);
		this.listeners.push({ event, listener });
	}
	protected onAdded(unit: FightUnit) {}
	startFight(unit: FightUnit) {}
	modifyAttr(unit: FightUnit, attr: FightAttr) {}
	beforeTurn(unit: FightUnit, turn: number, ctx: FightContex) {}

	// 从仇恨列表拿出对象
	static findContributionsRank(unit: FightUnit, type: string) {
		const f = unit.fight;
		let contributions: ReadonlyMap<number, number>;
		switch (type) {
			case 'unitHurt':
				contributions = unit.enemyHurt;
				break;
			case 'unitHeal':
				contributions = unit.friendHeal;
				break;

			case 'enemyHeal':
				contributions = f.getSide(EnemySide(unit.side)).heal;
				break;
			case 'enemyHurt':
				contributions = f.getSide(EnemySide(unit.side)).hurt;
				break;

			case 'friendHeal':
				contributions = f.getSide(unit.side).heal;
				break;
			case 'friendHurt':
				contributions = f.getSide(unit.side).hurt;
				break;

			default:
				return;
		}

		const ranked = [...contributions]
			.filter(([, value]) => Number.isFinite(value) && value > 0)
			.sort((a, b) => b[1] - a[1]);
		return ranked;
	}

	static findCareerPos(
		unit: FightUnit,
		friend: boolean,
		career: string,
		pos: string,
	): FightUnit[] | undefined {
		const f = unit.fight;
		const map = f.map;
		if (pos && !map) {
			return undefined;
		}

		const side = friend ? unit.side : EnemySide(unit.side);

		const doctors = f
			.getSideUnits(side)
			.filter(
				(candidate) =>
					(!career || candidate.isCareer(career)) &&
					(!pos || map.isPos(candidate.pos, pos)),
			);

		return doctors;
	}

	static inCond(unit: FightUnit, turn: number, cond: string, custom: number) {
		switch (cond) {
			case 'hpLow':
				return !unit.isDied() && unit.getHpPercent() < custom;
		}

		return false;
	}
}
