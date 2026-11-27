import { FightLoopWest } from '../../src/fight/Loop/FightLoopWest';
import { BaseAttack, FinalAttack } from '../../src/fight/FightAttr';
import { initSkills, SkillData } from '../../src/fight/Datas/SkillDatas';
import { MapShapeEnum, SelectParam, TargetSelectEnum } from '../../src/fight/struct';
import { FightUnitMonster } from '../../src/fight/Unit/FightUnitMonster';
import { createFightAndSide } from './help';
import { FightClient } from '../../src/fight/Client/FightClient';
import { FightReport } from '../../src/fight/Client/FightReport';

const sel: SelectParam = {
	target: TargetSelectEnum.enemy,
};

function baseAttack(attack: number): BaseAttack {
	return {
		rand: 1,
		hit: 100,
		dodge: 0,
		parry: 0,
		attack,
		defend: 0,
		critP: 0,
		critPAnit: 0,
		critDeep: 1,
		critDeepAnit: 0,
		hurt: 0,
		hurtP: 0,
		hurtAnti: 0,
		hurtPAnti: 0,
	};
}

const finalAttack: FinalAttack = {
	dbackP: 0,
	bloodP: 0,
	immunity: 0,
	immunityP: 0,
};

const normalSkill: SkillData = {
	id: 1,
	name: '普通魔法',
	magic: true,
	sel: { target: TargetSelectEnum.enemy },
	rand: 1,

	cost: { mp: 10 },

	attack: baseAttack(20),
	final: finalAttack,
	noblood: false,
};

const healSkill: SkillData = {
	id: 2,
	name: '治疗',
	magic: true,
	sel: { target: TargetSelectEnum.friend, sortAttr: 'hp', num: 3 },
	func: 'heal',

	rand: 1,

	cost: { mp: 20 },

	attack: baseAttack(20),
	final: finalAttack,
};

const spreadSkill: SkillData = {
	id: 3,
	name: '溅射',
	magic: true,
	sel: { target: TargetSelectEnum.enemy, shape: MapShapeEnum.x_line },
	func: 'spread',

	rand: 1,
	cost: { mp: 30 },

	attack: baseAttack(10),
	final: finalAttack,
};

function prepareSkills() {
	const datas = [normalSkill, healSkill, spreadSkill];
	initSkills(datas);
}

// 测试：运行手写技能示例，观察攻击、治疗等配置下的战斗流程。
async function run() {
	prepareSkills();

	const fight = createFightAndSide(100);

	const s0 = fight.Sides[0];
	// attack 都用技能
	for (const u of s0.units) {
		if (u instanceof FightUnitMonster) {
			u.addSkill(normalSkill.id, 2);
			// u.inputSkill = normalSkill.id;
		}
	}

	const s1 = fight.Sides[1];
	const u1 = s1.units[0];
	if (u1 instanceof FightUnitMonster) {
		u1.addSkill(healSkill.id, 6);
		// u1.inputSkill = healSkill.id;
	}
	const u2 = s1.units[1];
	if (u2 instanceof FightUnitMonster) {
		u2.addSkill(spreadSkill.id, 8);
		// u1.inputSkill = healSkill.id;
	}

	const loop = new FightLoopWest(fight);

	const client = new FightClient();
	client.bindFightLoop(loop);
	const report = new FightReport();
	report.bindFightLoop(loop);

	const win = await loop.run();

	// 大概率0win， 因为用了技能有加成
	console.log('win', win, 'at turn', fight.turn);
}

run();
