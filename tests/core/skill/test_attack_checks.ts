import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { initFightContex } from '../../../src';
import { canAttackSkill } from '../../../src/fight/Skills/AttackChecks';
import { tryFBack } from '../../../src/fight/Skills/FightBack';
import { magicAttackFunc } from '../../../src/fight/Skills/Funcs/NomalSkill';
import { setupChain, chainIds } from '../../fixtures/skill_chain';

// 公共攻击检查统一拒绝action禁止，包括未提供技能的默认攻击和原地技能。
test('attack checks: action prohibition blocks both default and stationary skill attacks', () => {
	const s = setupChain({ change: (skills) => { skills[0].nomove = 1; } });
	s.actor.isForbid = (action) => action === 'action';
	assert.equal(canAttackSkill(s.actor, s.target, null), false);
	assert.equal(canAttackSkill(s.actor, s.target, s.actor.findSkill(chainIds.first)), false);
});

// action禁止也作用于直接攻击及普通反击入口，不抽样、不造成伤害。
test('attack checks: direct attacks and counters honor action prohibition before sampling', () => {
	const s = setupChain();
	s.actor.isForbid = (action) => action === 'action';
	let samples = 0;
	s.fight.random = () => {
		samples++;
		return 0;
	};
	const ctx = initFightContex(s.fight);
	assert.equal(magicAttackFunc(s.actor, s.target, s.actor.findSkill(chainIds.first), ctx), false);
	assert.equal(tryFBack(s.actor, s.target, ctx), false);
	assert.equal(s.target.getHp(), 1000);
	assert.equal(samples, 0);
	assert.deepEqual(ctx.msgs, []);
});
