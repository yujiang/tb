import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { fightConsts, initFightConsts, initFightContex } from '../../src';
import { setupChain } from '../fixtures/skill_chain';

// 测试：统一常量为新单位提供默认值，实际受伤及输出按配置增加怒气，单位仍可单独覆盖。
test('fight constants: new units use configured defaults and can override them independently', () => {
	const original = { ...fightConsts };
	try {
		assert.deepEqual(original, { spHurtRate: 0, spOutputRate: 0, jpAdd: 1 });
		initFightConsts({ spHurtRate: 0.2, spOutputRate: 0.1, jpAdd: 1.5 });
		const { fight, actor, target } = setupChain({ rootSelfBuff: false });
		assert.equal(actor.attr.jpAdd, 1.5);
		assert.equal(actor.attr.spHurtRate, 0.2);
		assert.equal(actor.attr.spOutputRate, 0.1);
		for (const unit of [actor, target]) unit.attr.point.spMax = 100;
		const ctx = initFightContex(fight);
		target.onHurt(actor, 'test', 40, ctx);
		assert.equal(actor.attr.point.sp, 4);
		assert.equal(target.attr.point.sp, 8);
		actor.attr.spOutputRate = 0;
		actor.attr.jpAdd = 2;
		target.onHurt(actor, 'test', 10, ctx);
		assert.equal(actor.attr.point.sp, 4);
		assert.equal(target.attr.point.sp, 10);
		assert.equal(target.attr.jpAdd, 1.5);
		assert.equal(fightConsts.jpAdd, 1.5);
		assert.equal(fightConsts.spOutputRate, 0.1);
	} finally {
		initFightConsts(original);
	}
});

// 测试：更新公共默认值不改变已有单位，省略字段保留原值，显式零对后续新单位生效。
test('fight constants: partial updates and zero apply only to subsequently created units', () => {
	const original = { ...fightConsts };
	try {
		initFightConsts({ spHurtRate: 0.3, spOutputRate: 0.1, jpAdd: 2 });
		const before = setupChain({ rootSelfBuff: false }).actor;
		initFightConsts({ spHurtRate: 0, jpAdd: 0 });
		const after = setupChain({ rootSelfBuff: false }).actor;
		assert.equal(before.attr.spHurtRate, 0.3);
		assert.equal(before.attr.jpAdd, 2);
		assert.equal(after.attr.spHurtRate, 0);
		assert.equal(after.attr.jpAdd, 0);
		assert.equal(after.attr.spOutputRate, 0.1);
	} finally {
		initFightConsts(original);
	}
});

for (const field of ['spHurtRate', 'spOutputRate', 'jpAdd'] as const) {
	// 测试：负数、无穷及NaN常量被拒绝，混合更新失败时其他合法字段也不会部分生效。
	test(`fight constants: invalid ${field} rejects the entire update`, () => {
		const original = { ...fightConsts };
		try {
			for (const value of [-1, Infinity, NaN]) {
				assert.throws(
					() => initFightConsts({ jpAdd: 7, spOutputRate: 0.5, [field]: value }),
					new RegExp(field),
				);
				assert.deepEqual(fightConsts, original);
			}
		} finally {
			initFightConsts(original);
		}
	});
}
