import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
	Fight,
	FightAttr,
	FightSide,
	FightUnitMonster,
	TargetSelectEnum,
	initSkills,
	initFightContex,
	setFightGlobalData,
} from '../../../src';
import { FightUltimate } from '../../../src/fight/FightUltimate';
import { setupChain } from '../../fixtures/skill_chain';

const ultimate = 10015601;
function setup() {
	const base = setupChain({ rootSelfBuff: false, finalReactions: false });
	base.loop.end();
	initSkills([
		{
			id: ultimate,
			name: '双方破盾大招',
			magic: true,
			rand: 1,
			nomove: 1,
			sel: { target: TargetSelectEnum.enemy },

			attack: { attack: 10 },
			final: {},
			nosupport: true,
			noprotect: true,
			nofback: true,
			nodback: true,
		},
	]);
	setFightGlobalData({ allShieldBreak: true, duiwei: false });
	const sides = [new FightSide(), new FightSide()] as const;
	const units = sides.map((side, index) => {
		const attr = Object.assign(new FightAttr(), structuredClone(base.actor.attrOri));
		attr.shield = 1;
		const unit = new FightUnitMonster(10 + index, attr, { name: `阵营${index}` });
		unit.addSkill(ultimate, 1);
		unit.setUltimateSkill(ultimate);
		unit.setPos(0);
		// 回盾不取消已登记机会，同时避免破盾眩晕影响这组顺序验证。
		unit.onContex('break', (_unit, ctx) => {
			unit.attr.shield = 1;
			ctx.msgs.push(['shield', unit.uid, 1, 'recover']);
		});
		side.units.push(unit);
		return unit;
	});
	const fight = new Fight(10015600, base.fight.xls, 0);
	fight.createSide(sides[0], sides[1]);
	fight.turn = 1;
	const breakBoth = (f = fight, first = 0) => {
		const ctx = initFightContex(f);
		f.resolveAction(() => {
			units[1 - first].onHurt(units[first], 'test', 1, ctx, { weakPoint: true });
			units[first].onHurt(units[1 - first], 'test', 1, ctx, { weakPoint: true });
			assert.ok(!ctx.msgs.some((m) => m[0] === 'actor' && m[3] === 'ultimate'));
		});
		return ctx;
	};
	return { fight, sides, units, breakBoth };
}

// 测试：每个阵营各自持有独立大招状态，不再共享一个含双边数组的管理器。
test('ultimate side: each side owns an independent ultimate manager', () => {
	const { sides } = setup();
	const a = sides[0].ultimate;
	const b = sides[1].ultimate;
	assert.ok(a instanceof FightUltimate);
	assert.ok(b instanceof FightUltimate);
	assert.notEqual(a, b);
});

for (const first of [0, 1]) {
	// 测试：同一完整动作双方各登记一次，保持触发顺序，后续嵌套大招收尾不能提前消费另一边。
	test(`ultimate side: both sides cast in registration order starting with side ${first}`, () => {
		const s = setup();
		const ctx = s.breakBoth(s.fight, first);
		assert.deepEqual(
			ctx.msgs.filter((m) => m[0] === 'actor' && m[3] === 'ultimate').map((m) => m[1]),
			[s.units[first].uid, s.units[1 - first].uid],
		);
		const again = s.breakBoth(s.fight, first);
		assert.ok(!again.msgs.some((m) => m[0] === 'actor' && m[3] === 'ultimate'));
	});
}

// 测试：阵营对象重用于另一场同回合号战斗时，大招回合限制不会从上一场带入。
test('ultimate side: rebinding sides resets their per-battle state', () => {
	const s = setup();
	s.breakBoth();
	const next = new Fight(10015602, s.fight.xls, 0);
	next.createSide(s.sides[0], s.sides[1]);
	next.turn = 1;
	const ctx = s.breakBoth(next);
	assert.equal(ctx.msgs.filter((m) => m[0] === 'actor' && m[3] === 'ultimate').length, 2);
});

// 测试：完整动作失败时同时丢弃两边待放记录，后续空结算不能补放任何一边的大招。
test('ultimate side: failed actions discard both pending slots', () => {
	const s = setup(),
		ctx = initFightContex(s.fight);
	assert.throws(
		() =>
			s.fight.resolveAction(() => {
				s.units[1].onHurt(s.units[0], 'test', 1, ctx, { weakPoint: true });
				s.units[0].onHurt(s.units[1], 'test', 1, ctx, { weakPoint: true });
				throw new Error('both breaks failed');
			}),
		/both breaks failed/,
	);
	s.fight.resolveAction(() => {});
	assert.ok(!ctx.msgs.some((m) => m[0] === 'actor' && m[3] === 'ultimate'));
});

// 测试：先登记方的大招结束战斗后，另一边已登记的大招不再执行。
test('ultimate side: the first ultimate ending the fight skips the other side', () => {
	const s = setup();
	s.units[1].attr.point.hp = 5;
	const ctx = s.breakBoth();
	assert.deepEqual(
		ctx.msgs.filter((m) => m[0] === 'actor' && m[3] === 'ultimate').map((m) => m[1]),
		[s.units[0].uid],
	);
	assert.equal(s.fight.getWinSide(), 0);
	assert.equal(s.fight.isEnd(), true);
});
