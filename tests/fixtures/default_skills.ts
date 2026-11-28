import { initSkills } from '../../src/fight/Datas/SkillDatas';
import { setFightGlobalData } from '../../src/fight/Datas/FightGlobalData';
import { TargetSelectEnum } from '../../src/fight/struct';
import type { FightUnit } from '../../src/fight/Unit/FightUnit';
import { FightSkill } from '../../src/fight/Skills/FightSkill';

// 测试宿主显式注册默认技能，普攻和保护共用正式技能表入口。
export const defaultAttackSkill = 990001;
export const defaultProtectSkill = 990002;
export const defaultDuiweiAttackSkill = 990003;
export const defaultFBackSkill = 990004;
initSkills([
	{
		id: defaultAttackSkill,
		name: '普通攻击',
		magic: false,
		rand: 1,
		sel: { target: TargetSelectEnum.enemy },
		attack: {},
		final: {},
	},
	{
		id: defaultProtectSkill,
		name: '保护',
		magic: false,
		rand: 1,
		sel: { target: TargetSelectEnum.friend },
		func: 'nohurt',
		attack: {},
		final: {},
	},
	{
		id: defaultDuiweiAttackSkill,
		name: '普通攻击',
		magic: false,
		rand: 1,
		sel: { target: TargetSelectEnum.duiwei },
		attack: {},
		final: {},
	},
	{
		id: defaultFBackSkill,
		name: '测试默认反击',
		magic: false,
		// 通用夹具默认不发动反击；涉及反击的场景显式配置，正式表格另测10%。
		rand: 0,
		sel: { target: TargetSelectEnum.enemy },
		attack: {},
		final: {},
		nofback: true,
	},
]);
setFightGlobalData({ defaultAttackSkill, defaultProtectSkill, defaultFBackSkill });

// 旧夹具通过fback.rand控制反击，现统一改为显式配置装配反击技能的rand。
export function setCounterChance(unit: FightUnit, rand: number, magic = false) {
	const equipped = unit.findSkill(unit.fbackSkill);
	if (equipped) {
		equipped.getXls().rand = rand;
		return;
	}

	const id = 990100 + unit.uid;
	const data = {
		id,
		name: '测试反击',
		magic,
		rand,
		nofback: true,
		sel: { target: TargetSelectEnum.enemy },
		attack: {},
		final: {},
	};
	initSkills([data]);
	const counter = new FightSkill(data, 0);
	// 夹具只配置反击查询，不把反击加入主动技能列表，避免改变无AI怪物的默认输入。
	unit.getFBackSkill = () => unit.findSkill(unit.fbackSkill) || counter;
}
