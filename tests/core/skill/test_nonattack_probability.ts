import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { getBuffData, initBuffs, initFightContex } from '../../../src';
import { setupChain, chainIds } from '../../fixtures/skill_chain';

for (const func of ['heal', 'poison', 'relife', 'nohurt']) {
	for (const num of [1, 99]) {
		for (const [rand, sample, success] of [
			[0, 0, false],
			[0.5, 0.25, true],
			[0.5, 0.75, false],
			[1, 0.99, true],
		] as const) {
			// 测试：单体和群体非攻击技能每次施放只判一次概率，失败仍扣费和启动冷却，但不执行效果或自身Buff。
			test(`nonattack probability: ${func}, num=${num}, rand=${rand}, success=${success}`, (t) => {
				t.mock.method(console, 'warn', () => {});
				const buffId = 10013410;
				const s = setupChain({
					rootSelfBuff: false,
					targetHp: func === 'relife' ? 0 : 500,
					otherHp: func === 'relife' ? 0 : 500,
					change: (skills) => {
						Object.assign(skills[0], {
							func,
							rand,
							cd: 2,
							combo: undefined,
							sel: { ...skills[0].sel, num },
							healRate: 0.1,
							addBuff: [[buffId, 1, 1]],
							afterSelfBuff: [[buffId, 1, 1]],
							nosupport: true,
							noprotect: true,
						});
					},
				});
				initBuffs([
					{
						...getBuffData(chainIds.rest),
						id: buffId,
						class: undefined,
						status: [],
						lastTurn: 0,
					},
				]);
				if (func === 'relife') {
					s.target.die();
					s.other.die();
					s.loop.bcMsg([
						'side',
						1,
						s.fight.getSide(1).units.map((unit) => unit.getUnitMsg()),
					]);
				}
				let samples = 0;
				s.fight.random = () => {
					samples++;
					return sample;
				};
				const ctx = s.cast();
				assert.equal(samples, rand === 0.5 ? 1 : 0);
				assert.equal(s.actor.attr.point.mp, 90);
				assert.equal(s.actor.getSkillCd(chainIds.first), 2);
				assert.equal(ctx.actionStarted, true);
				assert.equal(
					ctx.msgs.filter((msg) => msg[0] === 'skillFailed').length,
					success ? 0 : 1,
				);
				assert.equal(!!s.actor.findBuff(buffId), success);
				const affected = num === 1 ? [s.target] : [s.target, s.other];
				for (const target of affected) {
					if (func === 'nohurt') {
						assert.equal(!!target.findBuff(buffId), success);
					} else if (func === 'relife') {
						assert.equal(target.isDied(), !success);
						assert.equal(target.getHp(), success ? 100 : 0);
					} else {
						const amount = func === 'heal' ? 10 : -100;
						assert.equal(target.getHp(), 500 + (success ? amount : 0));
					}
				}
				if (num === 1) assert.equal(s.other.getHp(), func === 'relife' ? 0 : 500);
			});
		}
	}
}

// 测试：嘲讽约束的单体非攻击技能发动失败仍消耗本次嘲讽，效果与施放后自身Buff均不执行。
test('nonattack probability: failed single casts still consume the selected taunt', (t) => {
	t.mock.method(console, 'warn', () => {});
	const s = setupChain({
		rootSelfBuff: false,
		change: (skills) => {
			Object.assign(skills[0], { func: 'poison', rand: 0, combo: undefined });
		},
	});
	const tauntId = 10013411;
	initBuffs([
		{
			...getBuffData(chainIds.rest),
			id: tauntId,
			class: 'taunt',
			status: [],
			times: 1,
			lastTurn: 0,
		},
	]);
	const before = initFightContex(s.fight);
	s.actor.addBuff(s.target, 'test', tauntId, 1, before);
	s.flush(before);
	const ctx = s.cast();
	assert.equal(s.target.getHp(), 1000);
	assert.equal(!!s.actor.findBuff(tauntId), false);
	assert.ok(ctx.msgs.some((msg) => msg[0] === 'skillFailed'));
});
