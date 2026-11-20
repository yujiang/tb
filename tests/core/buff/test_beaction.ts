import { getBuffData, initBuffs } from '../../../src/fight/Buffs/BuffDatas';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
	findForbidStatusByAction,
	findForbidStatusByBeaction,
} from '../../../src/fight/Buffs/FightStatus';
import { FightSkill, getDefaultSkill, FightCmdEnum, initFightContex } from '../../../src';
import { setupChain, chainIds as ids } from '../../fixtures/skill_chain';

// 测试：首次查询受作用限制即可初始化，且不受主动行为表初始化顺序影响。
test('beaction: target restrictions initialize independently of actor restrictions', () => {
	assert.deepEqual(findForbidStatusByBeaction('attack'), ['石化', '死亡']);
	assert.deepEqual(findForbidStatusByAction('attack'), ['封印', '眩晕']);
	assert.deepEqual(findForbidStatusByBeaction('attack'), ['石化', '死亡']);
	assert.equal(findForbidStatusByBeaction('unknown'), undefined);
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
	const attack = getDefaultSkill();
	assert.equal(attack.canTarget(target), true);
	target.die();
	assert.equal(attack.canTarget(target), false);
	const revive = new FightSkill({ ...attack.getXls(), func: 'relife' }, 1);
	assert.equal(revive.canTarget(target), true);
});
