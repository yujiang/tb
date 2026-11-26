import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
	FightClient,
	FightCmdEnum,
	FightLoopPC,
	FightLoopWest,
	FightLoopYanYu,
	FightUnitUser,
	InsertActionPos,
	getBuffData,
	initBuffs,
	initPassives,
	initFightContex,
	setFightGlobalData,
} from '../../src';
import { setupChain, chainIds as ids } from '../fixtures/skill_chain';

function setup(chain = false) {
	const s = setupChain({
		rootSelfBuff: false,
		finalReactions: false,
		change: (skills) => {
			if (!chain) skills[0].combo = undefined;
		},
	});
	setFightGlobalData({ jiqi: true });
	for (const unit of s.fight.getAllUnits()) {
		unit.attrOri.point.spMax = 100;
		unit.attrOri.point.jpMax = 100;
		unit.calcAttr();
	}
	s.loop.start();
	return s;
}

// 测试：资源增长属于当前属性，Buff固定加成和等级成长应生效，移除后恢复且不改基础属性或当前资源。
test('resources: buffs modify resource growth attributes and removal restores base values', () => {
	const { fight, actor, target } = setup();
	Object.assign(actor.attrOri, { jpAdd: 1, spHurtRate: 0, spOutputRate: 0 });
	actor.calcAttr();
	const buff = 10013201;
	initBuffs([
		Object.assign(
			{
				...getBuffData(ids.rest),
				id: buff,
				class: undefined,
				status: [],
				lastTurn: 0,
				notRemove: false,
				attack: undefined,
				final: undefined,
			},
			{
				attr: { jpAdd: 2, spHurtRate: 0.2, spOutputRate: 0.1 },
				attrLevel: { jpAdd: 1, spHurtRate: 0.05, spOutputRate: 0.05 },
			},
		),
	]);
	const ctx = initFightContex(fight);
	actor.addBuff(actor, 'test', buff, 2, ctx);
	assert.equal(actor.getAttr('jpAdd'), 5);
	assert.ok(Math.abs(actor.getAttr('spHurtRate') - 0.3) < 1e-12);
	assert.equal(actor.getAttr('spOutputRate'), 0.2);
	actor.calcAttr();
	assert.equal(actor.getAttr('jpAdd'), 5);
	target.onHurt(actor, 'test', 50, ctx);
	actor.onHurt(target, 'test', 20, ctx);
	assert.ok(Math.abs(actor.attr.point.sp - 16) < 1e-12);
	actor.removeBuff(actor, 'test', buff, 9999, ctx);
	assert.equal(actor.getAttr('jpAdd'), 1);
	assert.equal(actor.getAttr('spHurtRate'), 0);
	assert.equal(actor.getAttr('spOutputRate'), 0);
	assert.ok(Math.abs(actor.attr.point.sp - 16) < 1e-12);
	assert.equal(actor.attrOri.getAttr('jpAdd'), 1);
});

// 测试：被动与Buff共用公共属性固定值及等级成长，构造时无需绑定战斗，基础属性保持不变。
test('resources: passives modify common attributes during construction', () => {
	const { actor } = setup();
	const passive = 10013202;
	actor.attrOri.speed = 100;
	initPassives([
		{
			...getBuffData(ids.rest),
			id: passive,
			status: [],
			attack: undefined,
			final: undefined,
			attr: { speed: 20, jpAdd: 2, spHurtRate: 0.2 },
			attrLevel: { speed: 5, jpAdd: 1, spOutputRate: 0.05 },
		},
	]);
	const unit = new FightUnitUser(10013203, actor.attrOri, { name: '内功测试' }, [[passive, 2]]);
	assert.equal(unit.attr.speed, 130);
	assert.equal(unit.attr.jpAdd, 5);
	assert.equal(unit.attr.spHurtRate, 0.2);
	assert.equal(unit.attr.spOutputRate, 0.1);
	unit.calcAttr();
	assert.equal(unit.attr.jpAdd, 5);
	assert.equal(actor.attrOri.jpAdd, 1);
	assert.equal(actor.attrOri.speed, 100);
});

// 测试：四种资源同时存在，新增资源默认零；重算属性保留当前资源，不改写基础数据。
test('resources: four slots coexist and recalculation preserves current values', () => {
	const { actor } = setup();
	assert.equal(actor.attr.jpAdd, 1);
	assert.equal(actor.attr.point.sp, 0);
	assert.equal(actor.attr.point.jp, 0);
	actor.attr.point.sp = 12;
	actor.attr.point.jp = 3.5;
	actor.calcAttr();
	assert.equal(actor.getAttr('sp'), 12);
	assert.equal(actor.getAttr('jp'), 3.5);
	assert.equal(actor.attrOri.point.sp, undefined);
	assert.equal(actor.attrOri.point.jp, undefined);
});

// 测试：混合费用预检不扣款，任何资源不足均整笔拒绝；SP/JP可刚好用完且客户端一致。
test('resources: combined costs are atomic and synchronize all four slots', () => {
	const { fight, actor, client, report, flush } = setup();
	const ctx = initFightContex(fight);
	actor.addSp(10, ctx);
	actor.addJp(5, ctx);
	flush(ctx);
	assert.equal(actor.canCost({ sp: 11 }), false);
	assert.equal(actor.canCost({ jp: 6 }), false);
	assert.equal(actor.costSkill({ hp: 20, mp: 10, sp: 10, jp: 6 }, ctx), false);
	assert.equal(actor.getHp(), 1000);
	assert.equal(actor.attr.point.mp, 100);
	const pay = initFightContex(fight);
	assert.equal(actor.costSkill({ hp: 20, mp: 10, sp: 10, jp: 5 }, pay), true);
	flush(pay);
	assert.equal(actor.getHp(), 980);
	assert.equal(actor.attr.point.mp, 90);
	assert.equal(actor.attr.point.sp, 0);
	assert.equal(actor.attr.point.jp, 0);
	assert.equal(client.checkSame(fight), true);
	assert.match(report.toString(), /消耗 10 点怒气/);
	assert.match(report.toString(), /消耗 5 点集气/);
});

// 测试：怒气按实际受伤、输出及有效治疗增长；倍率可随时改动，溢出治疗和HP费用不产怒气。
test('resources: mutable rage rates use actual damage and healing', () => {
	const { fight, actor, target, flush } = setup();
	actor.attr.spOutputRate = 0.1;
	target.attr.spHurtRate = 0.2;
	const ctx = initFightContex(fight);
	target.onHurt(actor, 'test', 40, ctx);
	assert.equal(actor.attr.point.sp, 4);
	assert.equal(target.attr.point.sp, 8);
	actor.attr.spOutputRate = 0.25;
	target.onHeal(actor, 'test', 1000, ctx);
	assert.equal(actor.attr.point.sp, 14);
	actor.costSkill({ hp: 20 }, ctx);
	assert.equal(actor.attr.point.sp, 14);
	flush(ctx);
	actor.attr.spOutputRate = 0.025;
	target.attr.spHurtRate = 0.02;
	const lethal = initFightContex(fight);
	fight.resolveAction(() => target.onHurt(actor, 'test', 99999, lethal));
	assert.equal(actor.attr.point.sp, 39);
	assert.equal(target.attr.point.sp, 28);
	flush(lethal);
});

// 测试：HP/MP/SP/JP每次扣费、恢复及受伤都通过协议同步，客户端仅消费消息即可与服务端一致。
test('resources: every resource change reaches the client through battle messages', () => {
	const { fight, actor, target, client, flush } = setup();
	const prepare = initFightContex(fight);
	actor.addSp(20, prepare);
	actor.addJp(10, prepare);
	flush(prepare);
	const pay = initFightContex(fight);
	assert.equal(actor.costSkill({ hp: 10, mp: 10, sp: 5, jp: 3 }, pay), true);
	assert.deepEqual(pay.msgs, [
		['costHp', actor.uid, 10, 990],
		['costMp', actor.uid, 10, 90],
		['costSp', actor.uid, 5, 15],
		['costJp', actor.uid, 3, 7],
	]);
	flush(pay);
	assert.deepEqual(client.getUnitById(actor.uid)?.point, { ...actor.attr.point });
	const recover = initFightContex(fight);
	actor.onHeal(actor, 'test', 100, recover);
	actor.addMp(100, recover);
	actor.addSp(100, recover);
	actor.addJp(100, recover);
	assert.deepEqual(
		recover.msgs.filter((msg) => msg[0] === 'addPoint'),
		[
			['addPoint', actor.uid, 'mp', 10, 100],
			['addPoint', actor.uid, 'sp', 85, 100],
			['addPoint', actor.uid, 'jp', 93, 100],
		],
	);
	assert.equal(
		recover.msgs.some((msg) => msg[0] === 'heal'),
		true,
	);
	flush(recover);
	assert.deepEqual(client.getUnitById(actor.uid)?.point, { ...actor.attr.point });
	const hurt = initFightContex(fight);
	actor.onHurt(target, 'test', 25, hurt);
	assert.equal(
		hurt.msgs.some((msg) => msg[0] === 'hurt' && msg[5] === 975),
		true,
	);
	flush(hurt);
	assert.equal(client.getUnitById(actor.uid)?.point.hp, 975);
	assert.equal(client.checkSame(fight), true);
});

// 测试：主动技能预检检查SP/JP，资源不足时不收费；整条连招仅支付根技能的混合费用一次。
test('resources: active skill checks rage and qi and charges only the root of a combo', () => {
	const { fight, actor, target, skills, flush } = setup(true);
	skills[0].cost = { mp: 10, sp: 10, jp: 2 };
	skills[1].cost = { sp: 100, jp: 100 };
	skills[2].cost = { sp: 100, jp: 100 };
	const input = { cmd: FightCmdEnum.skill, skill: ids.first, target: target.uid };
	assert.equal(fight.checkPC(actor, input), false);
	const failed = fight.processUnit(actor, input);
	assert.ok(failed);
	assert.equal(failed.actionStarted, undefined);
	assert.equal(actor.attr.point.mp, 100);
	assert.equal(target.getHp(), 1000);
	const before = initFightContex(fight);
	actor.addSp(10, before);
	actor.addJp(2, before);
	flush(before);
	assert.equal(fight.checkPC(actor, input), true);
	const ctx = fight.processUnit(actor, input);
	assert.ok(ctx);
	assert.equal(ctx.nextNum, 2);
	assert.equal(actor.attr.point.mp, 90);
	assert.equal(actor.attr.point.sp, 0);
	assert.equal(actor.attr.point.jp, 0);
	assert.equal(ctx.msgs.filter((msg) => msg[0] === 'costSp').length, 1);
	assert.equal(ctx.msgs.filter((msg) => msg[0] === 'costJp').length, 1);
	flush(ctx);
});

// 测试：反射按实际承受方和输出方增加怒气，原本取消的零伤害不再计算怒气。
test('resources: reflected damage grants rage to the actual recipient and source only', () => {
	const { fight, actor, target, flush } = setup();
	const reflect = 10013021;
	initBuffs([
		{ ...getBuffData(ids.rest), id: reflect, class: 'reflect', status: [], lastTurn: 0 },
	]);
	const before = initFightContex(fight);
	target.addBuff(target, 'test', reflect, 1, before);
	flush(before);
	for (const unit of [actor, target]) {
		unit.attr.spHurtRate = 0.2;
		unit.attr.spOutputRate = 0.1;
	}
	const ctx = fight.processUnit(actor, {
		cmd: FightCmdEnum.skill,
		skill: ids.first,
		target: target.uid,
	});
	assert.ok(ctx);
	assert.equal(ctx.damage, 0);
	assert.equal(actor.getHp(), 960);
	assert.equal(target.getHp(), 1000);
	assert.equal(actor.attr.point.sp, 8);
	assert.equal(target.attr.point.sp, 4);
	flush(ctx);
});

// 测试：资源恢复按各自上限截断，保留小数，零增量不发送消息，默认上限零不启用增长。
test('resources: recovery clamps to caps without rounding fractional points', () => {
	const { fight, actor, flush } = setup();
	const ctx = initFightContex(fight);
	assert.equal(actor.addJp(0.5, ctx), 0.5);
	assert.equal(actor.addJp(999, ctx), 99.5);
	assert.equal(actor.addJp(1, ctx), 0);
	assert.equal(actor.addSp(0, ctx), 0);
	actor.attr.point.mp = 99;
	assert.equal(actor.addMp(20, ctx), 1);
	flush(ctx);
	const legacy = setupChain({ rootSelfBuff: false });
	assert.equal(legacy.actor.addJp(1, initFightContex(legacy.fight)), 0);
	assert.equal(legacy.actor.addSp(1, initFightContex(legacy.fight)), 0);
});

// 测试：直接执行技能的连招管线不推进集气，只有消费行动条才推进。
test('resources: direct skill execution and its reaction chain do not grant qi', () => {
	const { fight, actor, target, flush } = setup(true);
	const ctx = fight.processUnit(actor, {
		cmd: FightCmdEnum.skill,
		skill: ids.first,
		target: target.uid,
	});
	assert.ok(ctx);
	assert.equal(ctx.nextNum, 2);
	assert.equal(actor.attr.point.jp, 0);
	assert.equal(target.attr.point.jp, 0);
	flush(ctx);
});

for (const Loop of [FightLoopPC, FightLoopWest, FightLoopYanYu]) {
	// 测试：三种循环均按普通行动和Boss额外行动增加全体集气，规则插入技能不增加。
	test(`resources: ${Loop.name} grants qi for scheduled slots and not inserted skills`, async () => {
		const s = setup();
		s.loop.end();
		s.fight.turn = 0;
		s.target.addSkill(ids.first, 1);
		s.target.setExtraActions([[0.5, ids.first]]);
		const qiBuff = 10013204;
		initBuffs([
			{
				...getBuffData(ids.rest),
				id: qiBuff,
				class: undefined,
				status: [],
				lastTurn: 0,
				attr: { jpAdd: 1 },
			},
		]);
		s.actor.addBuff(s.actor, 'test', qiBuff, 1, initFightContex(s.fight));
		s.other.attrOri.jpAdd = 0.5;
		s.other.calcAttr();
		const loop = new Loop(s.fight),
			client = new FightClient();
		loop.onMsg((msgs) => client.onMsg(JSON.parse(JSON.stringify(msgs))));
		loop.on('input', (unit) => loop.onInput(unit.uid, { cmd: FightCmdEnum.defend }));
		loop.start();
		loop.nextTurn();
		const before = initFightContex(s.fight);
		const waiting = loop.waitInput(s.fight.turn, before);
		if (loop instanceof FightLoopWest) {
			loop.onInput(s.actor.uid, { cmd: FightCmdEnum.defend, turn: s.fight.turn });
		}
		await waiting;
		loop.bcMsg(before.msgs);
		assert.equal(
			loop.insertAction(
				s.target,
				{ cmd: FightCmdEnum.skill, skill: ids.first, target: s.actor.uid },
				InsertActionPos.first,
			),
			true,
		);
		await loop.processOneTurn(s.fight.turn);
		assert.equal(s.actor.attr.point.jp, 8);
		assert.equal(s.target.attr.point.jp, 4);
		assert.equal(s.other.attr.point.jp, 2);
		assert.equal(client.checkSame(s.fight), true);
		loop.end();
	});
}

// 测试：烟雨即时技能不占行动条，也不增加任何单位的集气。
test('resources: yanyu instant skills never grant qi', async () => {
	const s = setup();
	s.loop.end();
	const loop = new FightLoopYanYu(s.fight),
		client = new FightClient();
	loop.onMsg((msgs) => client.onMsg(JSON.parse(JSON.stringify(msgs))));
	loop.start();
	loop.nextTurn();
	const before = initFightContex(s.fight);
	await loop.waitInput(s.fight.turn, before);
	loop.bcMsg(before.msgs);
	assert.equal(
		await loop.onInput(s.actor.uid, {
			turn: s.fight.turn,
			cmd: FightCmdEnum.skill,
			skill: ids.first,
			target: s.target.uid,
		}),
		true,
	);
	assert.equal(s.actor.attr.point.jp, 0);
	assert.equal(s.target.attr.point.jp, 0);
	assert.equal(client.checkSame(s.fight), true);
	loop.end();
});
