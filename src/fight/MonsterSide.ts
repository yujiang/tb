import { strict as assert } from 'node:assert';
import { FightSide } from './FightSide';
import { FightAttr } from './FightAttr';
import { FightUnitMonster } from './Unit/FightUnitMonster';
import { MonsterData, getMonsterData } from './Datas/MonsterDatas';
import { applyUnitTemplate } from './Unit/ApplyUnitTemplate';
import { getZhenPos } from './ZhenDatas';
import { clone } from '../public/Utilts';

export type AllocateMonsterUid = () => number;

export class MonsterSide extends FightSide {
	override units: FightUnitMonster[] = [];
	readonly ids: readonly number[];

	constructor(
		ids: readonly number[],
		readonly zhen: number,
		allocateUid: AllocateMonsterUid,
	) {
		super();
		const positions = getZhenPos(zhen).slice(0, ids.length);
		assert.ok(positions.length === ids.length, `Formation ${zhen} has too few positions`);
		assert.ok(
			positions.every((pos) => Number.isSafeInteger(pos) && pos >= 0),
			'Formation positions must be nonnegative safe integers',
		);
		assert.ok(
			new Set(positions).size === positions.length,
			'Formation positions must not repeat',
		);
		const datas = ids.map((id) => {
			const data = getMonsterData(id);
			assert.ok(data, `Unknown monster: ${id}`);
			return data;
		});
		assert.equal(typeof allocateUid, 'function', 'A monster UID allocator is required');
		const uids = datas.map(() => allocateUid());
		assert.ok(uids.every(Number.isSafeInteger), 'Monster UIDs must be safe integers');
		assert.ok(new Set(uids).size === uids.length, 'Monster UIDs must not repeat');
		this.ids = [...ids];
		this.units = datas.map((data, index) =>
			this.createUnit(data, uids[index], positions[index]),
		);
	}

	private createUnit(data: MonsterData, uid: number, pos: number): FightUnitMonster {
		const attr = Object.assign(new FightAttr(), clone(data.attr));
		const unit = new FightUnitMonster(uid, attr, data);
		unit.monsterId = data.id;
		unit.setPos(pos);
		// 先学习再运行被动，最后以模板显式装配覆盖被动；省略时保留被动装配，0 可卸下。
		applyUnitTemplate(unit, data);
		if (data.inputSkill !== undefined) unit.inputSkill = data.inputSkill;
		if (data.extraAction) unit.setExtraActions(data.extraAction);
		if (data.rules) unit.setRules(data.rules);
		if (data.ai) unit.setAI(data.ai);
		if (unit.getHp() <= 0) unit.die();
		return unit;
	}
}

export function CreateMonsterSide(
	ids: readonly number[],
	zhen: number,
	allocateUid: AllocateMonsterUid,
): MonsterSide {
	return new MonsterSide(ids, zhen, allocateUid);
}
