import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { getBuffData, initBuffs, initFightContex } from '../../../src';
import { setupChain, chainIds } from '../../fixtures/skill_chain';

const stunId = 1001040;
function setup(combo = false) {
	const s = setupChain({
		rootSelfBuff: false,
		finalReactions: false,
		change: (skills) => {
			if (!combo) skills[0].combo = undefined;
			for (const skill of skills) {
				skill.magic = false;
				skill.attack = { ...skill.attack, hurtP: 0 };
			}
		},
	});
	initBuffs([
		{
			...getBuffData(chainIds.rest),
			id: stunId,
			name: '眩晕',
			class: undefined,
			status: ['眩晕'],
			lastTurn: 0,
			notRemove: false,
		},
	]);
	const stun = (unit = s.target) => {
		const ctx = initFightContex(s.fight);
		const buff = unit.addBuff(s.actor, 'test', stunId, 1, ctx);
		s.flush(ctx);
		return buff;
	};
	return { ...s, stun };
}

// 测试：Buff 眩晕期间物理攻击必中，解除后恢复原闪避数值及未命中行为，不修改基础属性。
test('stun: cannot dodge and removing stun restores evasion', () => {
	const s = setup();
	s.target.attrOri.physic.base.dodge = 1000;
	s.target.calcAttr();
	const buff = s.stun();
	const hit = s.cast();
	assert.equal(s.target.getHp(), 900);
	assert.ok(!hit.msgs.some((msg) => msg[0] === 'miss'));
	assert.equal(s.target.attr.physic.base.dodge, 1000);
	const ctx = initFightContex(s.fight);
	s.target.expireBuff(buff, 'test', ctx);
	s.flush(ctx);
	const miss = s.cast();
	assert.equal(s.target.getHp(), 900);
	assert.ok(miss.msgs.some((msg) => msg[0] === 'miss'));
});

// 测试：命中检查只读取 dodge 禁止项，不依赖写死的眩晕状态名，不额外抽样。
test('stun: hit testing honors the configured dodge action independently', () => {
	const s = setup();
	s.target.attr.physic.base.dodge = 1000;
	s.target.isForbid = (action) => action === 'dodge';
	let samples = 0;
	s.fight.random = () => {
		samples++;
		return 0.5;
	};
	s.cast();
	assert.equal(s.target.getHp(), 900);
	assert.equal(samples, 0);
});

// 测试：行动中途被眩晕后停止后续连招，已完成的第一段伤害保留。
test('stun: interrupts remaining combo segments after an on-hit stun', () => {
	const s = setup(true);
	s.target.onContex('hurt', (_unit, ctx) => s.actor.addBuff(s.target, 'test', stunId, 1, ctx));
	const ctx = s.cast();
	assert.equal(s.actor.inStatus('眩晕'), true);
	assert.equal(s.target.getHp(), 900);
	assert.deepEqual(
		ctx.msgs.filter((msg) => msg[0] === 'skill').map((msg) => msg[1]),
		[chainIds.first],
	);
});

// 测试：破盾眩晕与 Buff 眩晕一样禁止闪避，回盾后恢复闪避能力。
test('stun: shield break disables evasion until the global round refill', () => {
	const s = setup();
	s.target.attrOri.shield = 1;
	s.target.calcAttr();
	s.target.attr.shield = 0;
	s.target.attr.physic.base.dodge = 1000;
	s.client.onMsg(['side', 1, s.fight.getSide(1).units.map((unit) => unit.getUnitMsg())]);
	const hit = s.cast();
	assert.equal(s.target.getHp(), 900);
	assert.ok(!hit.msgs.some((msg) => msg[0] === 'miss'));
	s.loop.nextTurn();
	const ctx = initFightContex(s.fight);
	s.loop.processBeforeTurn(2, ctx);
	s.flush(ctx);
	assert.equal(s.target.inStatus('眩晕'), false);
	const miss = s.cast();
	assert.equal(s.target.getHp(), 900);
	assert.ok(miss.msgs.some((msg) => msg[0] === 'miss'));
});
