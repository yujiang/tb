import { EmptyAI } from '../../fixtures/empty_ai';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { createAI, createRule, AIData, RuleData, FightRule, InsertActionPos } from '../../../src';

// 测试：工厂必须把完整xls交给AI，getXls能读取完整配置。
test('AI xls: factory-created instances can read their condData configuration', () => {
	const xls = { type: 'target', career: '医生', pos: 'back', condData: { stage: 'phase-one' } };
	const ai = createAI(xls);
	assert.equal(ai.getXls(), xls);
	assert.equal(ai.getXls().condData, xls.condData);
});

for (const xls of [
	{ type: 'target', contributions: 'unitHurt', skill: 1, condData: false },
	{ type: 'target', contributions: 'enemyHeal', condData: 0 },
	{
		type: 'target',
		self: true,
		cond: 'hpLow',
		condData: 0.5,
		skill: 1,
	},
] as AIData[]) {
	// 测试：各AI均接收完整xls，保留配置和condData，显式false与0不被默认值覆盖。
	test(`AI xls: ${xls.type} retains complete configuration and falsy condData values`, () => {
		const ai = createAI(xls);
		assert.equal(ai.getXls(), xls);
		assert.equal(ai.getXls().skill, xls.skill);
		assert.equal(ai.getXls().condData, xls.condData);
	});
}

for (const xls of [
	{ type: 'hp', lines: [] },
	{ type: 'turn', everyTurn: 2, skill: 1, pos: InsertActionPos.last, prior: 5 },
	{ type: 'hurt', everyHurt: 3 },
	{ type: 'shieldAdd', shieldAdd: 3 },
] as RuleData[]) {
	// 测试：规则工厂接收完整平铺配置并保留各规则的显式字段。
	test(`Rule xls: ${xls.type} retains its complete flat configuration`, () => {
		const rule = createRule(xls);
		assert.equal(rule.getXls(), xls);
	});
}

// 测试：自定义AI的条件参数默认省略，Rule无参构造时保留默认类型。
test('xls: programmatic base classes have safe default configuration', () => {
	assert.equal(new EmptyAI().getXls().condData, undefined);
	assert.deepEqual(new FightRule().getXls(), { type: 'custom' });
});
