import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
	getBuffData,
	getDebugHurtHpLimit,
	initBuffs,
	initFightContex,
	setFightDebug,
} from '../../src';
import { setupChain, chainIds } from '../fixtures/skill_chain';

for (const limit of [undefined, 0, 20]) {
	// 测试：调试受伤上限省略或0时不限制，正数限制实际扣血，返回值、消息、事件及统计保持一致。
	test(`debug hurt limit: limit=${limit} caps actual damage consistently`, (t) => {
		t.after(() => setFightDebug());
		setFightDebug({ hurtHpLimit: limit });
		const s = setupChain({ rootSelfBuff: false });
		const expected = limit || 100;
		const ctx = initFightContex(s.fight);
		let received = -1;
		s.target.onContex('hurt', (_unit, _ctx, _attacker, amount) => {
			received = amount;
		});
		const actual = s.fight.resolveAction(() => s.target.onHurt(s.actor, 'test', 100, ctx));
		assert.equal(getDebugHurtHpLimit(), limit ?? 0);
		assert.equal(actual, expected);
		assert.equal(received, expected);
		assert.equal(s.target.getHp(), 1000 - expected);
		assert.equal(ctx.msgs.find((msg) => msg[0] === 'hurt')?.[4], expected);
		assert.equal(s.target.enemyHurt.get(s.actor.uid), expected);
		assert.equal(s.fight.getSide(s.actor.side).hurt.get(s.actor.uid), expected);
		s.flush(ctx);
	});
}

// 测试：技能受伤上限先于实际扣血生效，吸血、反伤与怒气只使用被截断后的实际数值。
test('debug hurt limit: skill reactions and rage use capped actual damage', (t) => {
	t.after(() => setFightDebug());
	setFightDebug({ hurtHpLimit: 20 });
	const s = setupChain({
		actorHp: 500,
		rootSelfBuff: false,
		finalReactions: false,
		change: (skills) => {
			Object.assign(skills[0], {
				combo: undefined,
				damageRate: 1,
				final: { bloodP: 0.5 },
				nodback: false,
			});
		},
	});
	s.actor.attr.spOutputRate = 0.1;
	s.target.attr.spHurtRate = 0.2;
	for (const unit of [s.actor, s.target]) unit.attr.point.spMax = 100;
	for (const side of [0, 1])
		s.loop.bcMsg(['side', side, s.fight.getSide(side).units.map((unit) => unit.getUnitMsg())]);
	const ctx = s.cast();
	assert.equal(s.target.getHp(), 980);
	assert.equal(s.actor.getHp(), 506);
	assert.equal(s.actor.attr.point.sp, 3);
	assert.equal(s.target.attr.point.sp, 4);
	assert.equal(ctx.damage, 20);
	assert.deepEqual(
		ctx.msgs.filter((msg) => msg[0] === 'hurt').map((msg) => msg[4]),
		[20, 4],
	);
});

// 测试：限伤后的非致命伤害不能误触发不屈，锁血下限也仍按更小的实际可扣生命生效。
test('debug hurt limit: buffs see capped damage before checking lethality and minHp still applies', (t) => {
	t.after(() => setFightDebug());
	setFightDebug({ hurtHpLimit: 10 });
	const s = setupChain({ targetHp: 50, rootSelfBuff: false });
	const buffId = 10014003;
	initBuffs([
		{ ...getBuffData(chainIds.rest), id: buffId, class: 'buqu', status: [], lastTurn: 0 },
	]);
	const before = initFightContex(s.fight);
	const buff = s.target.addBuff(s.target, 'test', buffId, 1, before);
	s.flush(before);
	const ctx = initFightContex(s.fight);
	assert.equal(s.target.onHurt(s.actor, 'test', 100, ctx), 10);
	assert.equal(s.target.getHp(), 40);
	assert.equal(s.target.findBuff(buffId), buff);
	assert.equal(buff.times, 1);
	assert.equal(
		ctx.msgs.some((msg) => msg[0] === 'buffTrigger'),
		false,
	);
	s.target.minHp = 35;
	assert.equal(s.target.onHurt(s.actor, 'test', 100, ctx), 5);
	assert.equal(s.target.getHp(), 35);
	s.flush(ctx);
});

// 测试：保护在限伤后分担，双方实际扣血之和不超过本次上限，主目标返回值仍不包含保护者。
test('debug hurt limit: protection splits the capped hit', (t) => {
	t.after(() => setFightDebug());
	setFightDebug({ hurtHpLimit: 20 });
	const s = setupChain({ rootSelfBuff: false });
	const buffId = 10014004;
	initBuffs([
		{ ...getBuffData(chainIds.rest), id: buffId, class: 'protect', status: [], lastTurn: 0 },
	]);
	const ctx = initFightContex(s.fight);
	s.target.addBuff(s.other, 'test', buffId, 1, ctx);
	const actual = s.fight.resolveAction(() => s.target.onHurt(s.actor, 'test', 100, ctx));
	assert.equal(actual, 10);
	assert.equal(s.target.getHp(), 990);
	assert.equal(s.other.getHp(), 990);
	assert.equal(s.fight.getSide(s.actor.side).hurt.get(s.actor.uid), 20);
	s.flush(ctx);
});

// 测试：周期等非技能来源也经过公共限伤入口，清空调试配置后恢复正常伤害。
test('debug hurt limit: non-skill damage is capped and clearing restores normal damage', (t) => {
	t.after(() => setFightDebug());
	setFightDebug({ hurtHpLimit: 20 });
	const s = setupChain({ rootSelfBuff: false });
	const ctx = initFightContex(s.fight);
	assert.equal(s.target.onHurt(s.actor, 'buff', 100, ctx, { source: 'buff' }), 20);
	setFightDebug();
	assert.equal(getDebugHurtHpLimit(), 0);
	assert.equal(s.target.onHurt(s.actor, 'buff', 100, ctx, { source: 'buff' }), 100);
	assert.equal(s.target.getHp(), 880);
	s.flush(ctx);
});
