import { strict as assert } from 'node:assert';
import { FightSide } from './FightSide';
import { FightAttr } from './FightAttr';
import { FightUnitMonster } from './Unit/FightUnitMonster';
import { MonsterData, getMonsterData } from './Unit/MonsterDatas';
import { getSkillData } from './Skills/SkillDatas';
import { getPassiveData } from './Passives/PassiveDatas';
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
		const display = {
			name: data.name,
			...(data.character !== undefined ? { character: data.character } : {}),
		};
		const unit = new FightUnitMonster(uid, attr, display);
		unit.monsterId = data.id;
		unit.setPos(pos);
		for (const [id, level] of data.skills ?? []) {
			assert.ok(getSkillData(id), `Monster ${data.id}: unknown skill ${id}`);
			unit.addSkill(id, level);
		}
		for (const [id] of data.passiveSkills ?? [])
			assert.ok(getPassiveData(id), `Monster ${data.id}: unknown passive ${id}`);
		// 先学习再运行被动，最后以模板显式装配覆盖被动；省略时保留被动装配，0 可卸下。
		if (data.passiveSkills) unit.setPassiveSkills(clone(data.passiveSkills));
		if (data.attackSkill !== undefined) unit.setAttackSkill(data.attackSkill);
		if (data.fbackSkill !== undefined) unit.setFBackSkill(data.fbackSkill);
		if (data.supportSkill !== undefined) unit.setSupportSkill(data.supportSkill);
		if (data.ultimateSkill !== undefined) unit.setUltimateSkill(data.ultimateSkill);
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
