import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { FightPreParse, fightMsg, initSkills, TargetSelectEnum } from '../../src';

const skillId = 99700;
function initial(): fightMsg[] {
	// 预解析只需 ID 与阵营，不需要单位名称、生命、技能实例等展示状态。
	return [
		['start', 99700],
		['side', 0, [{ uid: 0 }, { uid: 1 }]],
		['side', 1, [{ uid: 2 }, { uid: 3 }]],
	];
}
function hits(): fightMsg[] {
	return [
		['skill', skillId, 0, 2],
		['hurt', 'skill', 2, 0, 100, 900, []],
		['skill', 99701, 1, 2, 'support'],
		['hurt', 'skill', 2, 1, 40, 860, []],
	];
}
function parser() {
	return new FightPreParse((id) => id === skillId);
}

// 测试：协战出手与保护受伤分组可以交叠，所有原始协议、位置和死亡顺序保持不变。
test('preparse: support and protection coexist without reordering or losing protocol messages', () => {
	const messages: fightMsg[] = [
		...initial(),
		['skill', skillId, 0, 2],
		['buffTrigger', 2, 99702, 'protect', 3],
		['hurt', 'share', 3, 0, 50, 30, []],
		['hurt', 'skill', 2, 0, 50, 950, []],
		['skill', 99701, 1, 2, 'support'],
		['hurt', 'share', 3, 1, 20, 10, []],
		['hurt', 'skill', 2, 1, 20, 930, []],
		['die', 3],
		['customEffect', 2, '宿主效果'],
	];
	const before = structuredClone(messages);
	for (const msg of messages) Object.freeze(msg);
	Object.freeze(messages);
	const result = parser().parse(messages);
	assert.deepEqual(result.messages, before);
	assert.notEqual(result.messages, messages);
	assert.deepEqual(
		result.groups.map((group) => group.kind),
		['support', 'protect', 'protect'],
	);
	for (const group of result.groups) {
		const members =
			group.kind === 'support' ? [group.attack, group.support] : [group.share, group.target];
		for (const member of members) assert.equal(member.message, messages[member.index]);
	}
	const support = result.groups[0];
	assert.equal(support.kind, 'support');
	if (support.kind === 'support') {
		assert.equal(support.attack.index, 3);
		assert.equal(support.support.index, 7);
	}
	assert.deepEqual(messages, before);
});

// 测试：协战未命中仍是实际出手，组成员保留 miss；未发生协战则不生成预测事件。
test('preparse: support misses remain in groups and absent support is never invented', () => {
	const result = parser().parse([
		...initial(),
		...hits().slice(0, 2),
		['miss', 99701, 1, 2, 'support'],
	]);
	assert.equal(result.groups.length, 1);
	const group = result.groups[0];
	if (group.kind !== 'support') assert.fail('应为协战组');
	assert.equal(group.support.message[0], 'miss');
	assert.equal(parser().parse([...initial(), ...hits().slice(0, 2)]).groups.length, 0);
});

// 测试：遇到行动边界、其他出手、主攻未命中或目标死亡时停止关联，错误阵营及目标也不合并。
test('preparse: only unambiguous same-target allied support is grouped', () => {
	const support: fightMsg = ['skill', 99701, 1, 2, 'support'];
	const prefix = hits().slice(0, 2);
	const tails: fightMsg[][] = [
		[['actor', 1, 100], support],
		[['turn', 2], support],
		[['end', 0], support],
		[['die', 2], support],
		[['die', 0], support],
		[['skill', 99703, 0, 2], support],
		[['skill', 99701, 3, 2, 'support']],
		[['skill', 99701, 1, 3, 'support']],
	];
	for (const tail of tails)
		assert.equal(parser().parse([...initial(), ...prefix, ...tail]).groups.length, 0);
	assert.equal(parser().parse([...initial(), ['miss', skillId, 0, 2], support]).groups.length, 0);
	assert.equal(
		parser().parse([...initial(), ['skill', skillId, 0, 2], support]).groups.length,
		0,
	);
});

// 测试：分批保存阵营但不保存半个动作，新战斗、阵营重新初始化及不同解析器之间不串状态。
test('preparse: retain side knowledge but never merge across batches or battles', () => {
	const p = parser();
	p.parse(initial());
	assert.equal(p.parse(hits()).groups.length, 1);
	assert.equal(p.parse(hits().slice(0, 2)).groups.length, 0);
	assert.equal(p.parse(hits().slice(2)).groups.length, 0);
	assert.equal(parser().parse(hits()).groups.length, 0);
	p.parse(['side', 0, [{ uid: 0 }]]);
	assert.equal(p.parse(hits()).groups.length, 0);
	p.parse(initial());
	p.parse(['start', 99704]);
	assert.equal(p.parse(hits()).groups.length, 0);
	assert.deepEqual(p.parse([]), { messages: [], groups: [] });
});

// 测试：保护仅合并相邻同源的分担和直接伤害，未匹配消息完整保留。
test('preparse: protected damage requires adjacent hits by the same attacker', () => {
	const share: fightMsg = ['hurt', 'share', 3, 0, 50, 30, []];
	const damage: fightMsg = ['hurt', 'skill', 2, 0, 50, 950, []];
	const p = parser();
	const result = p.parse([share, damage, ['die', 3]]);
	assert.equal(result.groups[0].kind, 'protect');
	for (const messages of [
		[share, ['heal', 'blood', 0, 0, 10, 900, []], damage],
		[share, ['hurt', 'skill', 2, 1, 50, 950, []]],
		[share, ['hurt', 'skill', 3, 0, 50, 0, []]],
		[share, ['hurt', 'dback', 2, 0, 50, 950, []]],
	] as fightMsg[][]) {
		const parsed = p.parse(messages);
		assert.equal(parsed.groups.length, 0);
		assert.deepEqual(parsed.messages, messages);
	}
	assert.equal(p.parse(share).groups.length, 0);
	assert.equal(p.parse(damage).groups.length, 0);
});

// 测试：默认从本地技能表查询协战开关，也可注入宿主查询，不需要服务器战斗对象。
test('preparse: resolve skill flags locally or through a host callback', () => {
	initSkills([
		{
			id: skillId,
			name: '主攻',
			magic: true,
			rand: 1,
			attack: {},
			final: {},
			nosupport: false,
			sel: { target: TargetSelectEnum.enmey },
		},
	]);
	assert.equal(new FightPreParse().parse([...initial(), ...hits()]).groups.length, 1);
	assert.equal(new FightPreParse(() => false).parse([...initial(), ...hits()]).groups.length, 0);
});

// 测试：省略 nosupport 默认允许，显式禁止则不分组，普通攻击 ID 0 无需技能表也可关联协战。
test('preparse: negative support flags and ordinary attacks follow the same defaults', () => {
	const common = {
		id: skillId,
		name: '主攻',
		magic: true,
		rand: 1,
		attack: {},
		final: {},
		sel: { target: TargetSelectEnum.enmey },
	};
	initSkills([common]);
	assert.equal(new FightPreParse().parse([...initial(), ...hits()]).groups.length, 1);
	initSkills([{ ...common, nosupport: true }]);
	assert.equal(new FightPreParse().parse([...initial(), ...hits()]).groups.length, 0);
	const ordinary: fightMsg[] = [['skill', 0, 0, 2], ...hits().slice(1)];
	assert.equal(new FightPreParse().parse([...initial(), ...ordinary]).groups.length, 1);
});
