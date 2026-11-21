import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { getBuffData, initBuffs, initFightContex } from '../../src';
import { setupChain, chainIds } from '../fixtures/skill_chain';

for (const [hp, minHp, damage, expected] of [
	[100, 50, 100, 50],
	[100, 100, 100, 0],
	[40, 50, 100, 0],
	[100, 0, 1000, 100],
]) {
	// 测试：锁血和过量伤害都按实际扣血返回、发消息及统计，当前生命低于锁血线时受伤不能回血。
	test(`minHp: hp=${hp}, floor=${minHp} reports ${expected} actual damage`, () => {
		const { fight, actor, target, loop, flush } = setupChain({
			targetHp: hp,
			rootSelfBuff: false,
		});
		target.minHp = minHp;
		actor.attr.point.spMax = 1000;
		target.attr.point.spMax = 1000;
		actor.attr.spOutputRate = 0.1;
		target.attr.spHurtRate = 0.2;
		// 上限变化属于测试初始化，重新发送初始单位数据，之后只通过增量协议同步。
		for (const side of [0, 1]) {
			loop.bcMsg(['side', side, fight.getSide(side).units.map((unit) => unit.getUnitMsg())]);
		}
		const received: number[] = [];
		const changes: number[][] = [];
		target.onContex('hurt', (_unit, _ctx, _attacker, amount) => received.push(amount));
		target.onContex('hp', (_unit, _ctx, _attacker, before, after) =>
			changes.push([before, after]),
		);
		const ctx = initFightContex(fight);
		const actual = fight.resolveAction(() => target.onHurt(actor, 'test', damage, ctx));
		assert.equal(actual, expected);
		assert.equal(target.getHp(), hp - expected);
		assert.deepEqual(ctx.msgs.find((msg) => msg[0] === 'hurt')?.slice(4, 6), [
			expected,
			hp - expected,
		]);
		assert.deepEqual(received, [expected]);
		assert.deepEqual(changes, expected ? [[hp, hp - expected]] : []);
		assert.equal(target.enemyHurt.get(actor.uid) ?? 0, expected);
		assert.equal(fight.getSide(actor.side).hurt.get(actor.uid) ?? 0, expected);
		assert.equal(actor.attr.point.sp, expected * 0.1);
		assert.equal(target.attr.point.sp, expected * 0.2);
		assert.equal(target.isDied(), hp === expected);
		flush(ctx);
	});
}

function setupAttack(combo: boolean) {
	return setupChain({
		actorHp: 500,
		targetHp: 100,
		rootSelfBuff: false,
		finalReactions: false,
		change: (skills) => {
			skills[0].damageRate = 1;
			if (!combo) skills[0].combo = undefined;

			for (const skill of skills) {
				skill.final = { bloodP: 0.5 };
				skill.nodback = false;
			}
		},
	});
}

for (const combo of [false, true]) {
	// 测试：单击及连招遇到锁血都只按实际扣血吸血和反伤，达到锁血线后不能继续获得虚假收益。
	test(`minHp: combo=${combo} uses actual damage for lifesteal and reflection`, () => {
		const { actor, target, fight, cast } = setupAttack(combo);
		target.minHp = 50;
		const ctx = cast();
		assert.equal(target.getHp(), 50);
		assert.equal(actor.getHp(), 515);
		assert.deepEqual(
			ctx.msgs
				.filter((msg) => msg[0] === 'hurt' && msg[2] === target.uid)
				.map((msg) => msg[4]),
			combo ? [50, 0, 0] : [50],
		);
		assert.deepEqual(
			ctx.msgs.filter((msg) => msg[0] === 'heal').map((msg) => msg[4]),
			[25],
		);
		assert.deepEqual(
			ctx.msgs.filter((msg) => msg[0] === 'hurt' && msg[1] === 'dback').map((msg) => msg[4]),
			[10],
		);
		assert.equal(target.enemyHurt.get(actor.uid), 50);
		assert.equal(fight.getSide(actor.side).hurt.get(actor.uid), 50);
		cast();
		assert.equal(actor.getHp(), 515);
		assert.equal(target.getHp(), 50);
	});
}

// 测试：保护双方分别锁血时各自统计实际扣血，吸血和反伤只读取主目标实际扣血，不补转分担伤害。
test('minHp: protection applies each floor before damage statistics and reactions', () => {
	const { actor, target, other, fight, cast, flush } = setupAttack(false);
	const protectId = 10013401;
	initBuffs([
		{
			...getBuffData(chainIds.rest),
			id: protectId,
			class: 'protect',
			lastTurn: 0,
			notRemove: false,
		},
	]);
	target.minHp = 80;
	other.minHp = 990;
	const before = initFightContex(fight);
	target.addBuff(other, 'test', protectId, 1, before);
	flush(before);
	const ctx = cast();
	assert.equal(target.getHp(), 80);
	assert.equal(other.getHp(), 990);
	assert.equal(actor.getHp(), 506);
	assert.deepEqual(
		ctx.msgs.filter((msg) => msg[0] === 'hurt').map((msg) => [msg[1], msg[4]]),
		[
			['share', 10],
			['skill', 20],
			['dback', 4],
		],
	);
	assert.equal(target.enemyHurt.get(actor.uid), 20);
	assert.equal(other.enemyHurt.get(actor.uid), 10);
	assert.equal(fight.getSide(actor.side).hurt.get(actor.uid), 30);
});
