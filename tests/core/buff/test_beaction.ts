import { getBuffData, initBuffs } from '../../../src/fight/Datas/BuffDatas';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
	findForbidStatusByAction,
	findForbidStatusByBeaction,
} from '../../../src/fight/Buffs/FightStatus';
import { FightSkill, getDefaultAttackSkill, FightCmdEnum, initFightContex } from '../../../src';
import { setupChain, chainIds as ids } from '../../fixtures/skill_chain';

// 测试：首次查询受作用限制即可初始化，且不受主动行为表初始化顺序影响。
test('beaction: target restrictions initialize independently of actor restrictions', () => {
	assert.deepEqual(findForbidStatusByBeaction('attack'), ['石化', '死亡']);
	assert.deepEqual(findForbidStatusByAction('attack'), ['封印', '眩晕']);
	assert.deepEqual(findForbidStatusByBeaction('attack'), ['石化', '死亡']);
	assert.equal(findForbidStatusByBeaction('unknown'), undefined);
});

// 测试：缠绕禁止移动和普攻，但不跳过行动、不禁止原地技能，也不影响自己成为目标。
test('beaction: entanglement blocks movement and basic attacks but permits skills', () => {
	const { fight, actor, target } = setupChain({
		rootSelfBuff: false,
		finalReactions: false,
		change: (skills) => {
			for (const skill of skills) Object.assign(skill, { nomove: 1 });
		},
	});
	const buff = 1001132;
	initBuffs([
		{ ...getBuffData(ids.rest), id: buff, class: undefined, status: ['缠绕'], lastTurn: 0 },
	]);
	actor.addBuff(target, 'test', buff, 1, initFightContex(fight));
	assert.deepEqual(findForbidStatusByAction('move'), ['缠绕']);
	assert.equal(actor.isForbid('move'), true);
	assert.equal(actor.isForbid('attack'), false);
	assert.equal(actor.isForbid('skill'), false);
	assert.equal(actor.isForbid('action'), false);
	assert.equal(getDefaultAttackSkill().canTarget(actor), true);
	const attack = { cmd: FightCmdEnum.attack, target: target.uid };
	assert.equal(fight.checkPC(actor, attack), false);
	assert.equal(fight.processUnit(actor, attack), undefined);
	assert.equal(target.getHp(), 1000);
	const input = { cmd: FightCmdEnum.skill, skill: ids.first, target: target.uid };
	assert.equal(fight.checkPC(actor, input), true);
	const ctx = fight.processUnit(actor, input);
	assert.ok(ctx);
	assert.equal(target.getHp(), 790);
	assert.equal(actor.attr.point.mp, 90);
});

for (const func of ['normal', 'heal', 'poison', 'nohurt']) {
	// 测试：石化目标不能接受普通攻击或技能，自动选择跳过它，显式输入拒绝且不扣费。
	test(`beaction: petrification excludes ${func} targets before input and execution`, () => {
		const { fight, actor, target, other } = setupChain({
			change: (skills) => {
				skills[0].func = func;
			},
		});
		initBuffs([
			{
				...getBuffData(ids.rest),
				id: 1001130,
				class: undefined,
				status: ['石化'],
				lastTurn: 0,
			},
		]);
		target.addBuff(actor, 'test', 1001130, 1, initFightContex(fight));
		const skill = actor.findSkill(ids.first);
		assert.equal(skill.canTarget(target), false);
		assert.equal(skill.canTarget(other), true);
		assert.equal(fight.selectMainTarget(actor, skill)?.uid, other.uid);
		const input = { cmd: FightCmdEnum.skill, skill: ids.first, target: target.uid };
		assert.equal(fight.checkPC(actor, input), false);
		assert.equal(fight.processUnit(actor, input), undefined);
		assert.equal(actor.attr.point.mp, 100);
		assert.equal(target.getHp(), 1000);
		assert.equal(
			fight.validateInput(actor, { cmd: FightCmdEnum.attack, target: target.uid }),
			false,
		);
	});
}

// 测试：主动封印不会限制成为目标，真实死亡仍禁止普攻，但复活技能可选择尸体。
test('beaction: actor restrictions and death preserve target and revival semantics', () => {
	const { fight, actor, target } = setupChain();
	initBuffs([
		{ ...getBuffData(ids.rest), id: 1001131, class: undefined, status: ['封印'], lastTurn: 0 },
	]);
	target.addBuff(actor, 'test', 1001131, 1, initFightContex(fight));
	const attack = getDefaultAttackSkill();
	assert.equal(attack.canTarget(target), true);
	target.die();
	assert.equal(attack.canTarget(target), false);
	const revive = new FightSkill({ ...attack.getXls(), func: 'relife' }, 1);
	assert.equal(revive.canTarget(target), true);
});
