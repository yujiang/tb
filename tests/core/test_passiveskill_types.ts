import '../fixtures/default_skills';
import { setFightGlobalData } from '../../src/fight/Datas/FightGlobalData';
import { BuffTurnEnum } from '../../src/fight/Datas/BuffDatas';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { Fight } from '../../src/fight/Fight';
import { BaseAttack, FightAttr } from '../../src/fight/FightAttr';
import { FightSide } from '../../src/fight/FightSide';
import { BuffData, initBuffs, OverlapEnum } from '../../src/fight/Datas/BuffDatas';
import { initPassives, PassiveData } from '../../src/fight/Datas/PassiveDatas';
import { initFightContex } from '../../src/fight/Fight';
import { initSkills } from '../../src/fight/Datas/SkillDatas';
import { FightUnitMonster } from '../../src/fight/Unit/FightUnitMonster';
import { FightCmdEnum, IdLevelArray, TargetSelectEnum } from '../../src/fight/struct';

function attackData(attack = 0): BaseAttack {
	return {
		rand: 0,
		hitP: 0, dodgeP: 0, parryAnit: 0, attackP: 0, defendP: 0,
		hit: 100,
		dodge: 0,
		parry: 0,
		attack,
		defend: 0,
		hurt: 0,
		hurtP: 0,		critP: 0,
		critPAnit: 0,
		critDeep: 0,
		critDeepAnit: 0,
	};
}

function attributes(): FightAttr {
	const attr = new FightAttr();
	attr.point = { hp: 100, hpMax: 100, mp: 100, mpMax: 100 };
	attr.speed = 100;
	const group = () => ({
		base: { ...attackData(20), rand: 1 },
		next: attackData(),
		kill: attackData(),
		spread: attackData(),
		fback: attackData(),
		final: { bloodPAnit: 0, bloodP: 0, dbackP: 0, immunity: 0, immunityP: 0 },
	});
	attr.physic = group();
	attr.magic = group();
	attr.heal = attackData();
	attr.poison = attackData();
	return attr;
}

function passive(id: number, extra: Partial<PassiveData>): PassiveData {
	return {
		id,
		name: `被动-${id}`,
		desc: '',
		status: [],
		tags: [],
		magic: false,
		attackType: 'base',
		attack: {},
		final: {},
		...extra,
	};
}

function setup(passives: IdLevelArray) {
	setFightGlobalData({
		protectBuff: undefined,
		allShieldBreak: false,
		maxTurn: 10,
		waitInputSec: 1,
		duiwei: false,
	});
	const fight = new Fight(
		1,
		{ id: 1, runaway: false, runawayGrade: 0, deathPenalty: 0, winRecover: 0, winReward: 0 },
		123,
	);
	const attacker = new FightUnitMonster(1, attributes(), { name: '被动单位' }, passives);
	const defender = new FightUnitMonster(2, attributes(), { name: '目标' });
	attacker.setPos(0);
	defender.setPos(0);
	const attackSide = new FightSide(),
		defendSide = new FightSide();
	attackSide.units.push(attacker);
	defendSide.units.push(defender);
	fight.createSide(attackSide, defendSide);
	return { fight, attacker, defender, ctx: initFightContex(fight) };
}

// 测试：类型1被动直接提供封印状态，无需添加 Buff 就能阻止普通攻击和技能。
test('passive type 1: status forbids ordinary attacks and skills without a buff', () => {
	initPassives([passive(9601, { status: ['封印'] })]);
	initSkills([
		{
			id: 9602,
			name: '普通技能',
			magic: true,
			rand: 1,
			sel: { target: TargetSelectEnum.enemy },
			attack: { attack: 10 },
			final: {},
		},
	]);
	const { fight, attacker, defender } = setup([[9601, 1]]);
	attacker.addSkill(9602, 1);

	assert.equal(attacker.buffs.size, 0);
	assert.equal(attacker.inStatus('封印'), true);
	assert.equal(attacker.isForbid('attack'), true);
	assert.equal(attacker.isForbid('skill'), true);
	assert.equal(
		fight.processUnit(attacker, { cmd: FightCmdEnum.attack, target: defender.uid }),
		undefined,
	);
	assert.equal(
		fight.processUnit(attacker, { cmd: FightCmdEnum.skill, skill: 9602, target: defender.uid }),
		undefined,
	);
	assert.equal(defender.getHp(), 100);
});

// 测试：类型2被动按等级增加攻击和减伤，实际结算生效且不修改原始属性。
test('passive type 2: leveled attribute bonuses affect outgoing and incoming damage', () => {
	initPassives([
		passive(9610, {
			attack: { attack: 5 },
			attackLevel: { attack: 2 },
			finalLevel: { immunityP: 0.1 },
		}),
	]);
	for (const level of [1, 3]) {
		const { fight, attacker, defender } = setup([[9610, level]]);
		const damage = 20 + 5 + level * 2;
		assert.equal(attacker.attr.physic.base.attack, damage);
		assert.equal(attacker.attrOri.physic.base.attack, 20);
		assert.equal(attacker.attrOri.physic.final.immunityP, 0);
		assert.equal(attacker.buffs.size, 0);

		fight.processUnit(attacker, { cmd: FightCmdEnum.attack, target: defender.uid });
		assert.equal(defender.getHp(), 100 - damage);
		fight.processUnit(defender, { cmd: FightCmdEnum.attack, target: attacker.uid });
		assert.equal(attacker.getHp(), 100 - Math.floor(20 * (1 - level * 0.1)));
		attacker.calcAttr();
		assert.equal(attacker.attr.physic.base.attack, damage);
	}
});

// 测试：类型3被动在构造时添加指定等级的 Buff，属性、周期效果及不可驱散和死亡保留标签均生效。
test('passive type 3: initialization grants configured buffs with their own levels and lifecycle', () => {
	const common: Omit<BuffData, 'id'> = {
		name: '被动附加',
		desc: '',
		overlap: OverlapEnum.NOT,
		status: [],
		tags: [],
		magic: false,
		attackType: 'base',
		attack: {},
		final: {},
		turnType: BuffTurnEnum.thisTurn,
		lastTurn: 0,
		times: 0,
		event: 'hurt',
		skill: 0,
		skillLevel: 1,
	};
	initBuffs([
		{
			...common,
			id: 9620,
			notRemove: true,
			dieNotRemove: true,
			attack: { attack: 5 },
			attackLevel: { attack: 2 },
		},
		{ ...common, id: 9621, func: 'heal', skill: 9622, lastTurn: 1 },
	]);
	initSkills([
		{
			id: 9622,
			name: '周期治疗',
			magic: true,
			rand: 1,
			func: 'heal',
			sel: { target: TargetSelectEnum.friend },
			attack: { attack: 10 },
			final: {},
		},
	]);
	initPassives([
		passive(9623, {
			addbuff: [
				[9620, 2],
				[9621, 1],
			],
		}),
	]);
	const { attacker, ctx } = setup([[9623, 4]]);

	assert.equal(attacker.buffs.size, 2);
	assert.equal(attacker.findBuff(9620)?.getLevel(), 2);
	assert.equal(attacker.findBuff(9620)?.attacker, attacker);
	assert.equal(attacker.attr.physic.base.attack, 29);
	assert.equal(attacker.removeBuff(attacker, '驱散', 9620, 99, ctx), undefined);

	attacker.attr.point.hp = 50;
	attacker.processBeforeTurn(1, ctx);
	assert.equal(attacker.getHp(), 60);
	assert.equal(attacker.findBuff(9621), undefined);
	attacker.die();
	assert.deepEqual([...attacker.buffs.keys()], [9620]);
	assert.equal(attacker.attr.physic.base.attack, 29);
	attacker.relife();
	assert.equal(attacker.attr.physic.base.attack, 29);
});
