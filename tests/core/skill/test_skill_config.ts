import { strict as assert } from 'node:assert';
import { test, TestContext } from 'node:test';
import { initSkills, getSkillData, SkillData, TargetSelectEnum } from '../../../src';

function skill(id: number, extra: Partial<SkillData> = {}): SkillData {
	return {
		id,
		name: `招式${id}`,
		magic: true,
		rand: 1,
		attack: {},
		final: {},
		sel: { target: TargetSelectEnum.enmey },
		...extra,
	};
}
function warnings(t: TestContext) {
	const spy = t.mock.method(console, 'warn', () => {});
	return () => spy.mock.calls.map((call) => call.arguments.join(' ')).join('\n');
}

for (const [index, target] of [TargetSelectEnum.self, TargetSelectEnum.duiwei].entries()) {
	// 测试：群体人数配自身或对位时给出中文目标类型告警，但不修改配置或阻止注册。
	test(`skill config: group target ${TargetSelectEnum[target]} warns without rewriting`, (t) => {
		const output = warnings(t);
		const data = skill(10011240 + index, {
			sel: { target, num: 2 },
			nosupport: true,
			noprotect: true,
		});
		const original = structuredClone(data);
		initSkills([data]);
		assert.match(output(), new RegExp(`${data.name}.*${data.id}.*sel.target.*friend.*enmey`));
		assert.match(output(), new RegExp(TargetSelectEnum[target]));
		assert.deepEqual(data, original);
		assert.equal(getSkillData(data.id), data);
	});
}

// 测试：友方和敌方群体、自身和对位单体均属于合法组合，不产生目标类型告警。
test('skill config: supported group targets and single self or position targets are quiet', (t) => {
	const output = warnings(t);
	const selections = [
		{ target: TargetSelectEnum.friend, num: 2 },
		{ target: TargetSelectEnum.enmey, num: 99 },
		{ target: TargetSelectEnum.self, num: 1 },
		{ target: TargetSelectEnum.duiwei },
	];
	initSkills(
		selections.map((sel, index) =>
			skill(10011242 + index, { sel, nosupport: true, noprotect: true }),
		),
	);
	assert.equal(output(), '');
});

// 群攻漏填禁止协战、保护时用中文告警，但仍原样注册。
test('skill config: group warnings are Chinese and never modify data', (t) => {
	const output = warnings(t);
	const data = skill(10011201, {
		name: '横扫千军',
		sel: { target: TargetSelectEnum.enmey, num: 99 },
	});
	const original = structuredClone(data);
	initSkills([data]);
	assert.match(output(), /横扫千军/);
	assert.match(output(), /10011201/);
	assert.match(output(), /群攻/);
	assert.match(output(), /nosupport/);
	assert.match(output(), /noprotect/);
	assert.deepEqual(data, original);
	assert.equal(getSkillData(data.id), data);
});

// 群攻正确填写开关后不告警，普通单体也无需填写这两个禁止字段。
test('skill config: recommended group and ordinary single configurations are quiet', (t) => {
	const output = warnings(t);
	initSkills([
		skill(10011202),
		skill(10011203, {
			sel: { target: TargetSelectEnum.enmey, num: 3 },
			nosupport: true,
			noprotect: true,
		}),
	]);
	assert.equal(output(), '');
});

// 溅射按引用身份识别，先注册整批后检查，与表内排列顺序无关。
test('skill config: spread children are checked after the whole batch is registered', (t) => {
	const output = warnings(t);
	initSkills([skill(10011204, { spread: 10011205 }), skill(10011205, { rand: 0.5 })]);
	assert.match(output(), /10011205/);
	assert.match(output(), /溅射/);
	assert.match(output(), /nosupport/);
	assert.match(output(), /noprotect/);
	assert.doesNotMatch(output(), /主攻击/);
});

// 分批加载时，已注册的子技能在被引用后也应检查。
test('skill config: references to previously loaded spread skills are checked', (t) => {
	initSkills([skill(10011206)]);
	const output = warnings(t);
	initSkills([skill(10011207, { spread: 10011206 })]);
	assert.match(output(), /10011206/);
	assert.match(output(), /溅射/);
});

// 协战及其后续攻击链建议禁止反击和反伤，循环引用不会造成无限遍历。
test('skill config: support recommendations cover its reaction chain', (t) => {
	const output = warnings(t);
	initSkills([
		skill(10011208, { supportSkill: 10011209 }),
		skill(10011209, { next: 10011210, rand: 0.5, nofback: true, nodback: true }),
		skill(10011210, { combo: 10011209, rand: 0.3 }),
	]);
	assert.match(output(), /10011210/);
	assert.match(output(), /协战/);
	assert.match(output(), /nofback/);
	assert.match(output(), /nodback/);
	assert.doesNotMatch(output(), /主攻击/);
});

// 大招建议禁止保护，概率子技能可小于一，主攻击发动概率不足一则提醒。
test('skill config: primary probability and ultimate protection are checked', (t) => {
	const output = warnings(t);
	initSkills([
		skill(10011211, { rand: 0.5, next: 10011212, ultimateSkill: 10011213 }),
		skill(10011212, { rand: 0.5 }),
		skill(10011213),
	]);
	assert.match(output(), /10011211.*主攻击.*rand/);
	assert.match(output(), /10011213.*大招.*noprotect/);
	assert.doesNotMatch(output(), /10011212/);
});

// 同时配置 next 和 combo 时提醒实际 next 优先，保留两项原值。
test('skill config: ambiguous next and combo are reported without rewriting', (t) => {
	const output = warnings(t);
	const data = skill(10011214, { next: 10011215, combo: 10011216 });
	initSkills([data, skill(10011215), skill(10011216)]);
	assert.match(output(), /next.*combo/);
	assert.equal(data.next, 10011215);
	assert.equal(data.combo, 10011216);
});

// 新批次不重复报告无关旧技能的问题。
test('skill config: unrelated later batches do not repeat old warnings', (t) => {
	initSkills([skill(10011217, { sel: { target: TargetSelectEnum.enmey, num: 99 } })]);
	const output = warnings(t);
	initSkills([skill(10011218)]);
	assert.equal(output(), '');
});

// 修好一项只提示剩余缺项，false 和省略都代表没有禁止。
test('skill config: warnings name only missing recommendations', (t) => {
	const output = warnings(t);
	initSkills([
		skill(10011219, {
			name: '部分配置',
			sel: { target: TargetSelectEnum.enmey, num: 2 },
			nosupport: true,
			noprotect: false,
		}),
	]);
	assert.match(output(), /noprotect: true/);
	assert.doesNotMatch(output(), /nosupport/);
});

// 完整配置的协战链、大招和溅射不告警，子技能可使用概率发动。
test('skill config: compliant support ultimate and spread chains are quiet', (t) => {
	const output = warnings(t);
	initSkills([
		skill(10011220, { supportSkill: 10011221, ultimateSkill: 10011223, spread: 10011224 }),
		skill(10011221, { rand: 0.5, next: 10011222, nofback: true, nodback: true }),
		skill(10011222, { rand: 0.2, nofback: true, nodback: true }),
		skill(10011223, { noprotect: true }),
		skill(10011224, { rand: 0.4, nosupport: true, noprotect: true }),
	]);
	assert.equal(output(), '');
});

// 协战若引用治疗类技能，应提醒使用攻击类，但不替换 func。
test('skill config: unsupported support functions are diagnosed without coercion', (t) => {
	const output = warnings(t);
	const data = skill(10011226, { func: 'heal', nofback: true, nodback: true });
	initSkills([skill(10011225, { supportSkill: data.id }), data]);
	assert.match(output(), /10011226.*协战.*攻击类.*func/);
	assert.equal(data.func, 'heal');
});

// 先注册父技能再加载子技能时，也能从已有引用识别其溅射身份。
test('skill config: late-loaded children retain roles from earlier references', (t) => {
	initSkills([skill(10011227, { spread: 10011228 })]);
	const output = warnings(t);
	initSkills([skill(10011228, { rand: 0.5 })]);
	assert.match(output(), /10011228.*溅射/);
	assert.doesNotMatch(output(), /主攻击/);
});
