import { setFightGlobalData } from '../../../src/fight/Fight';
import { BuffTurnEnum } from '../../../src/fight/Buffs/BuffDatas';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
	Fight,
	FightSide,
	FightLoopWest,
	FightUnitMonster,
	FightClient,
	FightReport,
	BuffData,
	initBuffs,
	getBuffData,
	initPassives,
	OverlapEnum,
	initFightContex,
	FightCmdEnum,
	FightResultEnum,
	initSkills,
	TargetSelectEnum,
} from '../../../src';

const reviveId = 97701,
	ordinaryId = 97702,
	passiveId = 97703;

function setup(
	extra: Partial<BuffData> = {},
	forbidden = false,
	configure?: (attacker: FightUnitMonster, unit: FightUnitMonster) => void,
) {
	const data: BuffData = {
		id: reviveId,
		name: '涅槃',
		desc: '死亡自动复活',
		class: 'relife',
		relifeRatio: 0.3,
		overlap: OverlapEnum.REPLACE,
		status: [],
		tags: [],
		magic: false,
		attackType: 'base',
		attack: {},
		final: {},
		lastTurn: 0,
		times: 1,
		event: 'die',
		prior: 1000,
		turnType: BuffTurnEnum.thisTurn,
		skill: 0,
		skillLevel: 1,
		notRemove: true,
		dieNotRemove: true,
		...extra,
	};
	initBuffs([
		data,
		{
			...data,
			id: ordinaryId,
			class: undefined,
			name: '普通增益',
			event: 'hurt',
			dieNotRemove: false,
			times: 2,
			attack: { attack: 10 },
		},
	]);
	initPassives([
		{
			id: passiveId,
			name: '自复活被动',
			desc: '',
			status: forbidden ? ['禁复活'] : [],
			tags: [],
			magic: false,
			attackType: 'base',
			attack: {},
			final: {},
			addbuff: [
				[reviveId, 1],
				[ordinaryId, 1],
			],
		},
	]);
	setFightGlobalData({
		protectBuff: undefined,
		allShieldBreak: false,
		maxTurn: 10,
		waitInputSec: 1,
		duiwei: false,
	});
	const fight = new Fight(
		97700,
		{ runaway: false, runawayGrade: 0, deathPenalty: 0, winRecover: 0, winReward: 0 },
		0,
	);
	const a = new FightSide(),
		b = new FightSide();
	a.createSimpleMonster(fight, [{ id: 0, name: '攻击者', pos: 0 }]);
	b.createSimpleMonster(fight, [{ id: 1, name: '准备单位', pos: 0 }]);
	const unit = new FightUnitMonster(1, b.units[0].attrOri, { name: '涅槃者' }, [[passiveId, 1]]);
	unit.setPos(0);
	b.units[0] = unit;
	if (forbidden) {
		const ally = new FightUnitMonster(2, unit.attrOri, { name: '存活队友' });
		ally.setPos(1);
		b.units.push(ally);
	}
	fight.createSide(a, b);
	const attacker = a.units[0];
	configure?.(attacker as FightUnitMonster, unit);
	const loop = new FightLoopWest(fight),
		client = new FightClient(),
		report = new FightReport(() => {}, false);
	loop.onMsg((msgs) => {
		const wire = JSON.parse(JSON.stringify(msgs));
		client.onMsg(wire);
		report.onMsg(wire);
	});
	loop.start();
	const hurt = (hp: number) => {
		const ctx = initFightContex(fight);
		const damage = fight.resolveAction(() => unit.onHurt(attacker, 'test', hp, ctx));
		loop.bcMsg(ctx.msgs);
		assert.equal(client.checkSame(fight), true);
		return { ctx, damage };
	};
	return { fight, unit, attacker, loop, client, report, hurt };
}

// 测试：第二段致死时普通三连击不再攻击复活者，连招同样要等外层完整行动结束才复活。
for (const field of ['next', 'combo'] as const) {
	// 测试：按配置连接三段，死亡保持到完整动作边界，复活在后续结算标记之后且胜负检查之前。
	test(`auto relife: ${field} lethal second hit revives only after the whole action`, () => {
		const { fight, attacker, unit, loop, client } = setup({}, false, (a, u) => {
			a.attrOri.magic.base.attack = 100;
			a.attrOri.magic.base.critP = 0;
			a.attrOri.magic.next.attack = 100;
			a.attrOri.magic.next.critP = 0;
			u.attrOri.magic.base.defend = 0;
			u.attrOri.magic.final.immunity = 0;
			a.calcAttr();
			u.calcAttr();
		});
		const first = 97720,
			second = 97721,
			third = 97722;
		const common = {
			magic: true,
			rand: 1,
			attack: {},
			final: {},
			nofback: true,
			nodback: true,
			sel: { target: TargetSelectEnum.enemy },
		};
		initSkills([
			{ ...common, id: first, name: '一段', damageRate: 0.4, [field]: second },
			{ ...common, id: second, name: '二段', damageRate: 0.7, [field]: third },
			{ ...common, id: third, name: '三段' },
		]);
		attacker.addSkill(first, 1);
		const ctx = fight.resolveAction(() => {
			const result = fight.processUnit(attacker, {
				cmd: FightCmdEnum.skill,
				skill: first,
				target: unit.uid,
			});
			assert.ok(result);
			assert.equal(unit.isDied(), true, '内层技能执行完毕仍需等待整次行动结束');
			assert.ok(!result.msgs.some((msg) => msg[0] === 'relife'));
			result.msgs.push(['actionTail']);
			return result;
		});
		loop.bcMsg(ctx.msgs);
		assert.deepEqual(
			ctx.msgs.filter((msg) => msg[0] === 'skill').map((msg) => msg[1]),
			[first, second],
		);
		assert.deepEqual(
			ctx.msgs.filter((msg) => msg[0] === 'hurt').map((msg) => msg[4]),
			[40, 60],
		);
		assert.ok(
			ctx.msgs.findIndex((msg) => msg[0] === 'actionTail') <
				ctx.msgs.findIndex((msg) => msg[0] === 'relife'),
		);
		assert.equal(unit.isDied(), false);
		assert.equal(unit.getHp(), 30);
		assert.equal(fight.result, FightResultEnum.ongoing);
		assert.ok(client.checkSame(fight));
	});
}

// 测试：延迟复活前如果 Buff 被移除，待处理效果失效，不消耗本场复活机会。
test('auto relife: removing a pending revival buff cancels revival', () => {
	const { fight, unit, attacker, loop, client } = setup({ notRemove: false });
	const ctx = initFightContex(fight);
	fight.resolveAction(() => {
		unit.onHurt(attacker, 'test', 1000, ctx);
		unit.removeBuff(attacker, 'dispel', reviveId, 99, ctx);
	});
	loop.bcMsg(ctx.msgs);
	assert.ok(unit.isDied());
	assert.ok(!ctx.msgs.some((msg) => msg[0] === 'relife' || msg[0] === 'buffTrigger'));
	assert.equal(fight.result, FightResultEnum.attack);
	assert.ok(client.checkSame(fight));
});

// 测试：本次行动中已被其他效果复活时，不再触发或消耗自动复活机会。
test('auto relife: external revival before action end preserves the automatic opportunity', () => {
	const { fight, unit, attacker, loop, client, hurt } = setup();
	const ctx = initFightContex(fight);
	fight.resolveAction(() => {
		unit.onHurt(attacker, 'test', 1000, ctx);
		unit.onRelife(attacker, 'test', ctx);
		unit.onHeal(attacker, 'test', 10, ctx, { revive: true });
	});
	loop.bcMsg(ctx.msgs);
	assert.equal(unit.getHp(), 10);
	assert.equal(unit.findBuff(reviveId)?.times, 1);
	assert.equal(ctx.msgs.filter((msg) => msg[0] === 'relife').length, 1);
	assert.ok(!ctx.msgs.some((msg) => msg[0] === 'buffTrigger'));
	assert.ok(client.checkSame(fight));
	hurt(1000);
	assert.equal(unit.getHp(), 30);
});

// 测试：死亡时尚未禁复活，行动后续才增加的禁复活状态也能阻止收尾复活。
test('auto relife: revival eligibility is checked again at action end', () => {
	const { fight, unit, attacker, loop, client } = setup();
	initBuffs([
		{
			...getBuffData(reviveId),
			id: 97723,
			class: undefined,
			name: '禁复活',
			status: ['禁复活'],
		},
	]);
	const ctx = initFightContex(fight);
	fight.resolveAction(() => {
		unit.onHurt(attacker, 'test', 1000, ctx);
		unit.addBuff(attacker, 'test', 97723, 1, ctx);
	});
	loop.bcMsg(ctx.msgs);
	assert.ok(unit.isDied());
	assert.equal(unit.findBuff(reviveId)?.times, 1);
	assert.ok(ctx.msgs.some((msg) => msg[0] === '无法复活'));
	assert.ok(!ctx.msgs.some((msg) => msg[0] === 'relife'));
	assert.ok(client.checkSame(fight));
});

// 测试：双方最后单位在同一行动死亡时，先完成双方自动复活再判断胜负，不能提前判平局。
test('auto relife: both sides revive before mutual death is checked for an outcome', () => {
	const { fight, unit, attacker, loop, client } = setup();
	const ctx = initFightContex(fight);
	attacker.addBuff(attacker, 'test', reviveId, 1, ctx);
	fight.resolveAction(() => {
		unit.onHurt(attacker, 'test', 1000, ctx);
		attacker.onHurt(unit, 'test', 1000, ctx);
		assert.ok(unit.isDied());
		assert.ok(attacker.isDied());
		assert.equal(fight.result, FightResultEnum.ongoing);
	});
	loop.bcMsg(ctx.msgs);
	assert.equal(ctx.msgs.filter((msg) => msg[0] === 'relife').length, 2);
	assert.equal(unit.getHp(), 30);
	assert.equal(attacker.getHp(), 30);
	assert.equal(fight.result, FightResultEnum.ongoing);
	assert.ok(client.checkSame(fight));
});

// 测试：完整动作抛错时丢弃待复活任务，下一次动作不能执行失败动作的残留效果。
test('auto relife: a failed action discards its pending revival tasks', () => {
	const { fight, unit, attacker } = setup();
	const ctx = initFightContex(fight);
	assert.throws(
		() =>
			fight.resolveAction(() => {
				unit.onHurt(attacker, 'test', 1000, ctx);
				throw new Error('action failed');
			}),
		/action failed/,
	);
	fight.resolveAction(() => {});
	assert.ok(unit.isDied());
	assert.equal(unit.findBuff(reviveId)?.times, 1);
	assert.ok(!ctx.msgs.some((msg) => msg[0] === 'relife'));
});

// 测试：自动复活先经历真实死亡和普通 Buff 清理，再在胜负检查前恢复生命。
test('auto relife: actual death clears normal buffs then revives before outcome checking', () => {
	const { fight, unit, report, hurt } = setup();
	const deadStates: boolean[] = [];
	unit.onContex('die', (u) => deadStates.push(u.isDied()), 0);
	const result = hurt(1000);
	assert.equal(result.damage, 100);
	assert.deepEqual(deadStates, [true]);
	assert.equal(unit.isDied(), false);
	assert.equal(unit.getHp(), 30);
	assert.equal(fight.result, FightResultEnum.ongoing);
	assert.equal(unit.findBuff(ordinaryId), undefined);
	assert.equal(unit.findBuff(reviveId), undefined);
	assert.equal(unit.contextEmitter.listenerCount('hurt'), 0);
	assert.equal(unit.contextEmitter.listenerCount('die'), 1); // 仅保留测试观察者
	const kinds = result.ctx.msgs.map((msg) => msg[0]);
	assert.ok(kinds.indexOf('die') < kinds.indexOf('buffTrigger'));
	assert.ok(kinds.indexOf('buffTrigger') < kinds.indexOf('relife'));
	assert.ok(kinds.indexOf('relife') < kinds.indexOf('heal'));
	assert.match(report.toString(), /死亡[\s\S]*\[涅槃\]触发[\s\S]*复活[\s\S]*恢复 30 点生命/);
	assert.doesNotMatch(report.toString(), /未识别消息/);
	hurt(1000);
	assert.equal(unit.isDied(), true);
	assert.equal(fight.result, FightResultEnum.attack);
});

// 测试：自动复活成功后重新施加 Buff，不刷新本场战斗的一次复活机会。
test('auto relife: reapplying the buff does not refresh the battle opportunity', () => {
	const { fight, unit, loop, hurt } = setup();
	hurt(1000);
	assert.equal(unit.isDied(), false);
	assert.equal(unit.getHp(), 30);
	const ctx = initFightContex(fight);
	unit.addBuff(unit, 'reapply', reviveId, 1, ctx);
	loop.bcMsg(ctx.msgs);
	const next = hurt(1000);
	assert.equal(unit.isDied(), true);
	assert.ok(!next.ctx.msgs.some((msg) => msg[0] === 'relife' || msg[0] === 'buffTrigger'));
});

// 测试：禁止复活时不触发效果，也不消耗本场复活机会。
test('auto relife: forbidden revival does not trigger or consume the opportunity', () => {
	const { fight, unit, attacker, loop, hurt } = setup({}, true);
	const blocked = hurt(1000);
	assert.equal(unit.isDied(), true);
	assert.equal(unit.findBuff(reviveId)?.times, 1);
	assert.equal(fight.result, FightResultEnum.ongoing);
	assert.ok(blocked.ctx.msgs.some((msg) => msg[0] === '无法复活'));
	assert.ok(!blocked.ctx.msgs.some((msg) => msg[0] === 'relife' || msg[0] === 'buffTrigger'));
	// 队友维持战斗，外部复活并解除禁止后，自动复活机会应仍未消耗。
	unit.setPassiveSkills([]);
	const ctx = initFightContex(fight);
	unit.onRelife(attacker, 'test', ctx);
	unit.onHeal(attacker, 'test', 100, ctx);
	loop.bcMsg(ctx.msgs);
	assert.equal(hurt(1000).ctx.msgs.filter((msg) => msg[0] === 'relife').length, 1);
});

// 测试：自动复活默认恢复五分之一生命，极小正比例至少恢复一点生命。
test('auto relife: default ratio is one fifth and small positive ratios restore at least 1 HP', () => {
	for (const [ratio, hp] of [
		[undefined, 20],
		[0.001, 1],
		[1, 100],
	] as const) {
		const { unit, hurt } = setup({ relifeRatio: ratio });
		hurt(1000);
		assert.equal(unit.getHp(), hp);
		assert.equal(unit.isDied(), false);
	}
});

// 测试：未配置死亡保留时自动复活 Buff 随死亡清除，不能触发复活。
test('auto relife: death removal is respected when dieNotRemove is false', () => {
	const { unit, hurt } = setup({ dieNotRemove: false });
	const result = hurt(1000);
	assert.equal(unit.isDied(), true);
	assert.equal(unit.contextEmitter.listenerCount('die'), 0);
	assert.ok(!result.ctx.msgs.some((msg) => msg[0] === 'relife'));
});

// 测试：致命攻击按完整实际扣血统计，自动复活后原反应链仍继续结算。
test('auto relife: the attack pipeline counts full lethal damage and continues reactions', () => {
	const { fight, unit, attacker, loop, client } = setup({}, false, (a, u) => {
		a.attr.point.hp = 20;
		a.attrOri.physic.base.attack = 150;
		a.attrOri.physic.base.critP = 0;
		a.attrOri.physic.base.hit = 100;
		a.attrOri.physic.final.bloodP = 0.5;
		a.attrOri.physic.next.rand = 0;
		a.attrOri.physic.kill.rand = 0;
		a.attrOri.physic.spread.rand = 0;
		u.attrOri.physic.base.defend = 0;
		u.attrOri.physic.base.dodge = 0;
		u.attrOri.physic.final.dbackP = 0.2;
		u.attrOri.physic.fback.rand = 0;
		a.calcAttr();
		u.calcAttr();
	});
	const ctx = fight.processUnit(attacker, { cmd: FightCmdEnum.attack, target: unit.uid });
	assert.ok(ctx);
	loop.bcMsg(ctx.msgs);
	assert.equal(unit.getHp(), 30);
	assert.equal(unit.enemyHurt.get(attacker.uid), 100);
	assert.equal(attacker.getHp(), 50); // 20 + 50 吸血 - 20 反伤
	assert.equal(fight.result, FightResultEnum.ongoing);
	assert.equal(client.checkSame(fight), true);
});

// 测试：非法复活比例被拒绝，避免产生存活但零血的单位。
test('auto relife: invalid ratios are rejected instead of producing a living unit with zero HP', () => {
	for (const relifeRatio of [0, -0.1, 1.1, NaN, Infinity, '0.5']) {
		assert.throws(
			() => setup({ relifeRatio: relifeRatio as number }),
			/relifeRatio must be a number in \(0, 1\]/,
		);
	}
});

// 测试：替换、驱散和到期都解绑自动复活的死亡监听器。
test('auto relife: replacement, dispel and expiration unregister death listeners', () => {
	const { unit, fight, loop, client, hurt } = setup({ notRemove: false, lastTurn: 1 });
	const ctx = initFightContex(fight);
	const old = unit.findBuff(reviveId);
	unit.addBuff(unit, 'replace', reviveId, 1, ctx);
	assert.notEqual(unit.findBuff(reviveId), old);
	assert.equal(unit.contextEmitter.listenerCount('die'), 1);
	unit.removeBuff(unit, 'dispel', reviveId, 99, ctx);
	assert.equal(unit.contextEmitter.listenerCount('die'), 0);
	unit.addBuff(unit, 'test', reviveId, 1, ctx);
	unit.processBeforeTurn(1, ctx);
	assert.equal(unit.findBuff(reviveId), undefined);
	assert.equal(unit.contextEmitter.listenerCount('die'), 0);
	loop.bcMsg(ctx.msgs);
	assert.equal(client.checkSame(fight), true);
	hurt(1000);
	assert.equal(unit.isDied(), true);
});

// 测试：不屈优先抵挡第一次致命伤害，下一次真正死亡时才触发自动复活。
test('auto relife: unyielding triggers first, then auto revival on the next lethal hit', () => {
	const { unit, fight, loop, hurt } = setup();
	initBuffs([
		{ ...getBuffData(reviveId), id: 97704, class: 'buqu', name: '不屈', event: 'beforeHurt' },
	]);
	const ctx = initFightContex(fight);
	unit.addBuff(unit, 'test', 97704, 1, ctx);
	loop.bcMsg(ctx.msgs);
	const first = hurt(1000);
	assert.equal(unit.getHp(), 1);
	assert.equal(unit.findBuff(reviveId)?.times, 1);
	assert.ok(!first.ctx.msgs.some((msg) => msg[0] === 'die' || msg[0] === 'relife'));
	const second = hurt(1000);
	assert.equal(unit.getHp(), 30);
	assert.ok(second.ctx.msgs.some((msg) => msg[0] === 'die'));
	assert.ok(second.ctx.msgs.some((msg) => msg[0] === 'relife'));
	hurt(1000);
	assert.equal(unit.isDied(), true);
});

// 测试：单位进入新的战斗后重新获得一次自动复活机会。
test('auto relife: a new battle grants a reused unit another successful revival', () => {
	const { unit, attacker, hurt } = setup();
	hurt(1000);
	setFightGlobalData({
		protectBuff: undefined,
		allShieldBreak: false,
		maxTurn: 1,
		waitInputSec: 1,
		duiwei: false,
	});
	const nextFight = new Fight(
		97705,
		{ runaway: false, runawayGrade: 0, deathPenalty: 0, winRecover: 0, winReward: 0 },
		0,
	);
	const a = new FightSide(),
		b = new FightSide();
	a.units.push(attacker);
	b.units.push(unit);
	nextFight.createSide(a, b);
	const ctx = initFightContex(nextFight);
	unit.addBuff(unit, 'new battle', reviveId, 1, ctx);
	nextFight.resolveAction(() => unit.onHurt(attacker, 'test', 1000, ctx));
	assert.equal(unit.isDied(), false);
	assert.equal(unit.getHp(), 30);
	assert.equal(nextFight.result, FightResultEnum.ongoing);
});
