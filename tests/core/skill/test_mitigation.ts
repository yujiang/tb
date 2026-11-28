import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { initFightContex } from '../../../src';
import { setupChain } from '../../fixtures/skill_chain';

function setup() {
	return setupChain({
		rootSelfBuff: false,
		finalReactions: false,
		change: (skills) => {
			skills[0].combo = undefined;
			skills[0].attack = { ...skills[0].attack, hurtP: 0 };
		},
	});
}

// 公式内防御与免伤直接合并为伤害，不额外生成一个未减伤的理论数字。
test('mitigation: formula defenses are included in the reported damage', () => {
	const s = setup();
	s.target.attr.magic.base.defend = 20;
	s.target.attr.magic.final.immunity = 10;
	s.target.attr.magic.final.immunityP = 0.5;
	const ctx = s.cast();
	assert.equal(s.target.getHp(), 965);
	assert.equal(ctx.msgs.find((msg) => msg[0] === 'hurt')?.[4], 35);
	assert.equal(ctx.msgs.find((msg) => msg[0] === 'mitigate'), undefined);
});

// 格挡先得到50点伤害；受伤入口将防御与弱点盾进一步减伤，按该输入数字通知。
test('mitigation: defense and shield report reduction from the blocked damage', () => {
	const s = setup();
	s.skills[0].magic = false;
	s.target.attr.physic.base.parry = 100;
	s.target.attr.shield = 2;
	s.target.doDefend();
	s.client.onMsg(['side', 1, s.fight.getSide(1).units.map((unit) => unit.getUnitMsg())]);
	const ctx = s.cast();
	assert.equal(s.target.getHp(), 988); // 100 * 格挡0.5 * 防御0.5 * 非弱点盾0.5，向下取整
	assert.equal(ctx.msgs.filter((msg) => msg[0] === 'mitigate').length, 1);
	assert.deepEqual(ctx.msgs.find((msg) => msg[0] === 'mitigate').slice(3), [50, 12]);
});

// beforeHurt降低或取消伤害都会通知；仅因目标残血截断实际扣血不当作减伤。
test('mitigation: beforeHurt reduction and immunity are reported but overkill is not', () => {
	for (const mode of ['reduce', 'cancel', 'overkill']) {
		const s = setup();
		if (mode === 'overkill') {
			s.target.attr.point.hp = 20;
			s.client.onMsg(['side', 1, s.fight.getSide(1).units.map((unit) => unit.getUnitMsg())]);
		} else {
			s.target.onContex('beforeHurt', (_unit, _ctx, _source, pending) => {
				if (mode === 'cancel') pending.cancelled = true;
				else pending.damage *= 0.5;
			});
		}
		const ctx = s.cast();
		assert.equal(
			ctx.msgs.some((msg) => msg[0] === 'mitigate'),
			mode !== 'overkill',
		);
	}
});

// 无技能上下文的直接受伤也可通知防御减伤，不借用之前技能的原始伤害。
test('mitigation: direct damage uses its own original value', () => {
	const s = setup();
	s.target.doDefend();
	const ctx = initFightContex(s.fight);
	s.target.onHurt(s.actor, 'test', 60, ctx);
	assert.deepEqual(
		ctx.msgs.find((msg) => msg[0] === 'mitigate'),
		['mitigate', s.target.uid, s.actor.uid, 60, 30],
	);
});
