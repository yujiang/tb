import { strict as assert } from 'node:assert';
import { FightUnit } from './FightUnit';
import type { MonsterData } from '../Datas/MonsterDatas';
import { getSkillData } from '../Datas/SkillDatas';
import { getPassiveData } from '../Datas/PassiveDatas';
import { clone } from '../../public/Utilts';

/** 玩家、宠物与怪物共用学习/被动/装配顺序；AI和规则仍由怪物入口处理。 */
export function applyUnitTemplate(unit: FightUnit, data: MonsterData) {
	for (const [id, level] of data.skills ?? []) {
		assert.ok(getSkillData(id), `Unit ${data.id}: unknown skill ${id}`);
		unit.addSkill(id, level);
	}
	for (const [id] of data.passiveSkills ?? []) {
		assert.ok(getPassiveData(id), `Unit ${data.id}: unknown passive ${id}`);
	}
	if (data.passiveSkills) unit.setPassiveSkills(clone(data.passiveSkills));
	if (data.attackSkill !== undefined) unit.setAttackSkill(data.attackSkill);
	if (data.fbackSkill !== undefined) unit.setFBackSkill(data.fbackSkill);
	if (data.supportSkill !== undefined) unit.setSupportSkill(data.supportSkill);
	if (data.ultimateSkill !== undefined) unit.setUltimateSkill(data.ultimateSkill);
}
