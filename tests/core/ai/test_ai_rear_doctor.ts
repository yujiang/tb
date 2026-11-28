import '../../fixtures/default_skills';
import { setFightGlobalData } from '../../../src/fight/Datas/FightGlobalData';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
	BaseAttack,
	Fight,
	FightAITarget,
	FightAttr,
	FightSide,
	FightUnitMonster,
	FightUnitUser,
	FightCmdEnum,
	FightLoopPC,
	FightClient,
	initFightContex,
	initBuffs,
	OverlapEnum,
} from '../../../src';

function attr(career = '战士') {
	const base = (attack = 100, rand = 0): BaseAttack => ({
		attack,
		rand,
		hitP: 0, dodgeP: 0, parryAnit: 0, attackP: 0, defendP: 0,

		hit: 100,
		dodge: 0,
		parry: 0,
		defend: 0,
		hurt: 0,
		hurtP: 0,		critP: 0,
		critPAnit: 0,
		critDeep: 0,
		critDeepAnit: 0,
	});
	const data = new FightAttr();
	data.career = career;
	data.speed = 100;
	data.point = { hp: 1000, hpMax: 1000, mp: 100, mpMax: 100 };
	const group = () => ({
		base: base(),
		next: base(0),
		kill: base(0),
		spread: base(0),
		fback: base(0),
		final: { bloodPAnit: 0, bloodP: 0, dbackP: 0, immunity: 0, immunityP: 0 },
	});
	data.physic = group();
	data.magic = group();
	data.heal = base();
	data.poison = base();
	return data;
}

function setup(nx = 3, ny = 3) {
	setFightGlobalData({
		protectBuff: undefined,
		allShieldBreak: false,
		maxTurn: 2,
		waitInputSec: 1,
		duiwei: true,
	});
	const fight = new Fight(
		1001500,
		{ id: 1, runaway: false, runawayGrade: 0, deathPenalty: 0, winRecover: 0, winReward: 0 },
		0,
	);
	fight.createMap(nx, ny);
	const doctor = new FightUnitUser(0, attr('医生'), { name: '后排医生' });
	const frontDoctor = new FightUnitUser(1, attr('医生'), { name: '前排医生' });
	const warrior = new FightUnitUser(2, attr(), { name: '后排战士' });
	const monster = new FightUnitMonster(3, attr(), { name: '刺客' });
	doctor.setPos(fight.map.getPos(0, ny - 1));
	frontDoctor.setPos(fight.map.getPos(nx - 1, 0));
	warrior.setPos(fight.map.getPos(1, ny - 1));
	monster.setPos(0);
	const a = new FightSide(),
		b = new FightSide();
	a.units.push(doctor, frontDoctor, warrior);
	b.units.push(monster);
	fight.createSide(a, b);
	monster.ai = new FightAITarget({ id: 1, type: 'target', career: '医生', pos: 'back' });
	const loop = new FightLoopPC(fight),
		client = new FightClient();
	loop.onMsg((msgs) => client.onMsg(structuredClone(msgs)));
	loop.start();
	loop.nextTurn();
	const decide = () => {
		monster.inputStart(fight.turn, initFightContex(fight));
		return monster.input;
	};
	return { fight, doctor, frontDoctor, warrior, monster, loop, client, decide };
}

// 对位前排有医生时，仍优先选择后排医生；单位 ID 为零也应作为明确目标保留。
test('rear doctor AI: prefer a living rear doctor over a front doctor and rear warrior', () => {
	const s = setup();
	assert.deepEqual(s.decide(), { cmd: FightCmdEnum.attack, target: s.doctor.uid });
	const ctx = s.fight.processUnit(s.monster, s.monster.input);
	s.loop.bcMsg(ctx.msgs);
	assert.deepEqual(
		[s.doctor.getHp(), s.frontDoctor.getHp(), s.warrior.getHp()],
		[900, 1000, 1000],
	);
	assert.ok(s.client.checkSame(s.fight));
});

for (const [nx, ny] of [
	[3, 3],
	[5, 5],
	[5, 3],
	[3, 5],
]) {
	// 后排行号按地图高度判断，覆盖三排、五排和非正方形地图的中线边界。
	test(`rear doctor AI: rear rows follow map height on ${nx}x${ny}`, () => {
		const s = setup(nx, ny);
		for (let row = 1; row <= ny; row++) {
			s.doctor.setPos(s.fight.map.getPos(0, row - 1));
			const expected = row > Math.ceil(ny / 2);
			assert.equal(s.fight.map.isBackRow(s.doctor.pos), expected);
			assert.deepEqual(
				s.decide(),
				expected
					? { cmd: FightCmdEnum.attack, target: s.doctor.uid }
					: { cmd: FightCmdEnum.attack },
			);
		}
	});
}

// 只有一位后排医生时不抽样，多位候选时只用战斗随机源随机选择。
test('rear doctor AI: samples only when multiple rear doctors are available', () => {
	const s = setup();
	let samples = 0;
	s.fight.random = () => {
		samples++;
		return 0.99;
	};
	assert.equal(s.decide().target, s.doctor.uid);
	assert.equal(samples, 0);
	s.warrior.attr.career = '医生';
	assert.equal(s.decide().target, s.warrior.uid);
	assert.equal(samples, 1);
});

// 后排医生死亡后不再锁定，回退原有对位普攻，仍能通过客户端增量一致性检查。
test('rear doctor AI: dead rear doctors are excluded and default targeting remains', () => {
	const s = setup(),
		death = initFightContex(s.fight);
	s.doctor.onHurt(s.monster, 'buff', 1000, death, { source: 'buff' });
	s.loop.bcMsg(death.msgs);
	assert.deepEqual(s.decide(), { cmd: FightCmdEnum.attack });
	const ctx = s.fight.processUnit(s.monster, s.monster.input);
	s.loop.bcMsg(ctx.msgs);
	assert.deepEqual([s.frontDoctor.getHp(), s.warrior.getHp()], [900, 1000]);
	assert.ok(s.client.checkSame(s.fight));
});

// 医生位于己方时不能成为目标，没有地图时也回退普通输入而不是猜测站位。
test('rear doctor AI: allies and missing maps never become preferred targets', () => {
	const s = setup();
	s.doctor.attr.career = '战士';
	s.monster.attr.career = '医生';
	s.monster.setPos(8);
	assert.deepEqual(s.decide(), { cmd: FightCmdEnum.attack });
	s.fight.map = undefined;
	assert.deepEqual(s.decide(), { cmd: FightCmdEnum.attack });
});

// 负数、越界和小数站位不被误判为后排，避免非法位置参与优先选择。
test('rear doctor AI: invalid positions are excluded', () => {
	const s = setup();
	for (const pos of [-1, 9, 8.5, NaN]) {
		s.doctor.setPos(pos);
		assert.equal(s.fight.map.isBackRow(pos), false);
		assert.deepEqual(s.decide(), { cmd: FightCmdEnum.attack });
	}
});

// AI 只决定原始意图，有效嘲讽仍在执行时将攻击重定向到嘲讽者。
test('rear doctor AI: existing taunt execution overrides the preferred doctor', () => {
	const s = setup(),
		buffId = 1001501;
	initBuffs([
		{
			id: buffId,
			name: '嘲讽',
			desc: '',
			class: 'taunt',
			overlap: OverlapEnum.REPLACE,
			magic: false,
			attackType: 'base',
			attack: {},
			final: {},
			status: [],
			tags: [],
			lastTurn: 0,
			times: 0,
			event: 'hurt',
		},
	]);
	const initial = initFightContex(s.fight);
	s.monster.addBuff(s.frontDoctor, 'test', buffId, 1, initial);
	s.loop.bcMsg(initial.msgs);
	const input = s.decide();
	assert.equal(input.target, s.doctor.uid);
	const ctx = s.fight.processUnit(s.monster, input);
	s.loop.bcMsg(ctx.msgs);
	assert.deepEqual([s.doctor.getHp(), s.frontDoctor.getHp()], [1000, 900]);
	assert.equal(input.target, s.doctor.uid);
	assert.ok(s.client.checkSame(s.fight));
});

// 相同种子和场面得到相同的多医生选择序列，AI 不使用系统随机源。
test('rear doctor AI: target decisions are deterministic for the same seed', () => {
	const first = setup(),
		second = setup();
	first.warrior.attr.career = second.warrior.attr.career = '医生';
	assert.deepEqual(
		Array.from({ length: 10 }, () => first.decide().target),
		Array.from({ length: 10 }, () => second.decide().target),
	);
});

// 仅职业筛选不依赖地图，未配置站位时前排与位置零都可以被选中。
test('target AI: career-only selection works without a map', () => {
	const s = setup();
	s.monster.setAI({ id: 1, type: 'target', career: '医生' });
	s.fight.map = undefined;
	s.fight.random = () => 0.99;
	assert.equal(s.decide().target, s.frontDoctor.uid);
});

// 位置零属于前排，不能因为数值为零而绕过后排过滤。
test('target AI: position zero does not bypass the rear filter', () => {
	const s = setup();
	s.doctor.setPos(0);
	assert.deepEqual(s.decide(), { cmd: FightCmdEnum.attack });
});
