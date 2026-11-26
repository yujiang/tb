import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { initFightContex } from '../../../src';
import { setupChain } from '../../fixtures/skill_chain';

// 测试：治疗贡献按实际恢复生命累加，满血和溢出治疗不能虚增治疗者排名。
test('healing contribution: only restored HP counts toward healer ranking', () => {
	const { fight, actor, target } = setupChain({ rootSelfBuff: false, targetHp: 950 });
	const ctx = initFightContex(fight);
	target.onHeal(actor, 'heal', 1000, ctx);
	assert.equal(target.getHp(), 1000);
	assert.equal(target.friendHeal.get(actor.uid), 50);
	target.onHeal(actor, 'heal', 1000, ctx);
	assert.equal(target.friendHeal.get(actor.uid), 50);
});

// 测试：自疗也是治疗者对己方队伍的有效治疗，按实际回血记录，溢出不增加贡献。
test('healing contribution: effective self healing counts toward team healing totals', () => {
	const { fight, actor } = setupChain({ rootSelfBuff: false, actorHp: 950 });
	actor.onHeal(actor, 'heal', 1000, initFightContex(fight));
	assert.equal(actor.friendHeal.get(actor.uid), 50);
});
