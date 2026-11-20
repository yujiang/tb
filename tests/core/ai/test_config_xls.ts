import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
	createAI,
	createRule,
	AIData,
	RuleData,
	FightAI,
	FightRule,
	InsertActionPos,
} from '../../../src';

// 测试：工厂必须把完整xls交给AI，getCustom能读取宿主附加数据而不是访问未初始化字段。
test('AI xls: factory-created instances can read their custom configuration', () => {
	const xls = { type: 'rearDoctor', custom: { stage: 'phase-one' } };
	const ai = createAI(xls);
	assert.equal(ai.getXls(), xls);
	assert.equal(ai.getCustom(), xls.custom);
});

for (const xls of [
	{ type: 'topThreat', skill: 1, typeParam: [1, 2], custom: false },
	{ type: 'topHealer', custom: 0 },
	{
		type: 'lowHpHeal',
		skill: 1,
		typeParam: { threshold: 'unused' },
		custom: { label: 'healer' },
	},
] as AIData[]) {
	// 测试：各AI均接收完整xls，保留typeParam和custom，显式false与0不被默认值覆盖。
	test(`AI xls: ${xls.type} retains complete configuration and falsy custom values`, () => {
		const ai = createAI(xls);
		assert.equal(ai.getXls(), xls);
		assert.equal(ai.getXls().typeParam, xls.typeParam);
		assert.equal(ai.getCustom(), xls.custom);
	});
}

for (const xls of [
	{ type: 'hp', lines: [], custom: { phase: 1 } },
	{ type: 'turn', every: 2, skill: 1, pos: InsertActionPos.last, prior: 5, custom: false },
	{ type: 'hurt', every: 3, custom: 0 },
] as RuleData[]) {
	// 测试：各规则由工厂接收完整平铺xls，公共字段和宿主custom不因拆分构造参数而丢失。
	test(`Rule xls: ${xls.type} retains its complete flat configuration`, () => {
		const rule = createRule(xls);
		assert.equal(rule.getXls(), xls);
		assert.equal(rule.getCustom(), xls.custom);
	});
}

// 测试：代码自定义的AI和Rule仍可无参创建，基类提供安全默认配置，读取custom不会抛异常。
test('xls: programmatic base classes have safe default configuration', () => {
	assert.equal(new FightAI().getCustom(), undefined);
	assert.equal(new FightRule().getCustom(), undefined);
});
