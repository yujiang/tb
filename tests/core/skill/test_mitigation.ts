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
			skills[0].damageRate = 1;
		},
	});
}

// 公式防御、固定免伤和比例免伤减少的伤害统一通知，仍按原公式扣血。
test('mitigation: formula defenses report reduced damage without changing calculation', () => {
	const s = setup();
	s.target.attr.magic.base.defend = 20;
	s.target.attr.magic.final.immunity = 10;
	s.target.attr.magic.final.immunityP = 0.5;
	const ctx = s.cast();
	assert.equal(s.target.getHp(), 965);
	assert.deepEqual(
		ctx.msgs.find((msg) => msg[0] === 'mitigate'),
		['mitigate', s.target.uid, s.actor.uid, 100, 35],
	);
});

// 防御、格挡和弱点盾的减伤也显示内功，合并为当前受击者本次的一条通知。
test('mitigation: defense block and shield reductions share one notification', () => {
	const s = setup();
	s.skills[0].magic = false;
	s.target.attr.physic.base.parry = 100;
	s.target.attr.shield = 2;
	s.target.doDefend();
	s.client.onMsg(['side', 1, s.fight.getSide(1).units.map((unit) => unit.getUnitMsg())]);
	const ctx = s.cast();
	assert.equal(s.target.getHp(), 988); // 100 * 格挡0.5 * 防御0.5 * 非弱点盾0.5，向下取整
	assert.equal(ctx.msgs.filter((msg) => msg[0] === 'mitigate').length, 1);
	assert.deepEqual(ctx.msgs.find((msg) => msg[0] === 'mitigate').slice(3), [100, 12]);
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
