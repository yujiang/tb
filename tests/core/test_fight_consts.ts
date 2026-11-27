import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { initFightContex } from '../../src';
import { setupChain } from '../fixtures/skill_chain';

// 资源增长读取各单位当前属性，输出与受伤分别按实际伤害增加怒气。
test('resource growth: current unit attributes determine anger gain', () => {
	const { fight, actor, target } = setupChain({ rootSelfBuff: false });
	actor.attr.spOutputRate = 0.1;
	target.attr.spHurtRate = 0.2;
	for (const unit of [actor, target]) unit.attr.point.spMax = 100;
	const ctx = initFightContex(fight);
	target.onHurt(actor, 'test', 40, ctx);
	assert.equal(actor.attr.point.sp, 4);
	assert.equal(target.attr.point.sp, 8);
	actor.attr.spOutputRate = 0;
	target.onHurt(actor, 'test', 10, ctx);
	assert.equal(actor.attr.point.sp, 4);
	assert.equal(target.attr.point.sp, 10);
});
