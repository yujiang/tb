import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
	FightMud,
	resolveMudText,
	FightMudTables,
	fightMsg,
	initSkills,
	TargetSelectEnum,
} from '../../src';
import { wuxiaScene } from './fixtures/wuxia_report';

// 技能表action优先于客户端通用出手文本，姓名、实际兵器名和表现部位均来自对应入口，0号人物有效。
test('mud action: skill action expands N n w l from client display', () => {
	const scene = wuxiaScene();
	scene.messages[1][2][0].display.weaponName = '青钢剑';
	initSkills([
		{
			id: 99598,
			name: '车轮剑',
			magic: false,
			rand: 1,
			attack: {},
			final: {},
			sel: { target: TargetSelectEnum.enemy },
			action: '$N一招「车轮剑」，$w化作一片银盘，平平地向$n的$l卷去',
		},
	]);
	const mud = new FightMud(() => {}, false, {
		...scene.tables,
		xlsCharacter: { 0: { id: 0, 出手文本: '不应使用此回退' } },
	});
	mud.onMsg([...scene.messages.slice(0, 3), ['skill', 99598, 0, 3]]);
	assert.match(
		mud.toString(),
		/陆行舟（#0）一招「车轮剑」，青钢剑化作一片银盘，平平地向黑风寨主（#3）的胸口卷去/,
	);
	assert.doesNotMatch(mud.toString(), /不应使用此回退|\$[Nnwl]/);
});

// action数组轮换、空白回退、混用中文占位符及缺省兵器均可用，逐条与整批消息保持一致。
test('mud action: action variants retain existing placeholders and generic miss results', () => {
	const scene = wuxiaScene();
	initSkills([
		{
			id: 99597,
			name: '变招',
			magic: false,
			rand: 1,
			attack: {},
			final: {},
			sel: { target: TargetSelectEnum.enemy },
			action: ['$N以$w使出{技能}，直取$n的$l。', '$N忽换一式{技能}，向$n的$l递去。'],
		},
	]);
	const messages: fightMsg[] = [
		...scene.messages.slice(0, 3),
		['skill', 99597, 0, 3],
		['miss', 99597, 0, 3],
		['skill', 99597, 0, 3],
	];
	const batch = new FightMud(() => {}, false),
		single = new FightMud(() => {}, false);
	batch.onMsg(messages);
	for (const msg of messages) single.onMsg(msg);

	assert.equal(batch.toString(), single.toString());
	assert.match(batch.toString(), /陆行舟（#0）以兵器使出\[变招\].*胸口/);
	assert.match(batch.toString(), /忽换一式\[变招\].*肩头/);
	assert.match(batch.toString(), /未命中/);
	assert.doesNotMatch(batch.toString(), /\$[Nnwl]|倒地不起/);
});

// 未识别的效果函数应回退中性动作，即使取值与对象原型字段同名也不能崩溃。
test('mud wuxia: unknown function names safely fall back to neutral prose', () => {
	const scene = wuxiaScene();
	initSkills([
		{
			id: 99599,
			name: '试招',
			magic: false,
			func: 'constructor',
			rand: 1,
			attack: {},
			final: {},
			sel: { target: TargetSelectEnum.enemy },
		},
	]);
	const mud = new FightMud(() => {}, false, scene.tables);
	mud.onMsg(scene.messages.slice(0, 3));
	assert.doesNotThrow(() => mud.onMsg(['skill', 99599, 0, 3]));
	assert.match(mud.toString(), /试招.*劲力.*黑风寨主/);
});

// 相同技能多次出手会轮换文案；刀剑按明确的兵器资料描述，技能、目标与真实数值保留。
test('mud wuxia: weapon prose varies without changing the protocol or actual damage', () => {
	const scene = wuxiaScene(),
		before = structuredClone(scene.messages);
	const mud = new FightMud(() => {}, false, scene.tables);
	mud.onMsg(scene.messages);
	const text = mud.toString();
	assert.match(text, /陆行舟.*刀锋.*黑风寨主/);
	assert.match(text, /青衣客.*剑尖.*回岚剑/);
	assert.match(text, /青衣客.*剑光忽虚忽实/);
	assert.match(text, /灵狼.*爪牙齐张/);
	assert.match(text, /恢复 80 点生命/);
	assert.doesNotMatch(text, /恢复 200 点生命/);
	assert.match(text, /造成 0 点伤害/);
	assert.match(text, /【连击】|【连招】/);
	assert.deepEqual(scene.messages, before);
});

// 疗伤、施毒与辅助不用攻击句式，出招不提前宣告成功、命中或死亡。
test('mud wuxia: utility skills describe their intent and death follows only die', () => {
	const scene = wuxiaScene(),
		lines: string[] = [];
	const mud = new FightMud((line) => lines.push(line), false, scene.tables);
	const end = scene.messages.findIndex((msg) => msg[0] === 'die');
	mud.onMsg(scene.messages.slice(0, end));
	const heal = lines.find((line) => line.includes('[归元诀]'));
	const poison = lines.find((line) => line.includes('[蚀骨散]'));
	const buff = lines.find((line) => line.includes('[护脉诀]'));
	assert.match(heal, /疏导气血/);
	assert.match(poison, /异气/);
	assert.match(buff, /气机/);
	for (const line of [heal, poison, buff]) assert.doesNotMatch(line, /攻向|命中|倒地|中毒了/);

	assert.doesNotMatch(mud.toString(), /倒地不起/);
	mud.onMsg(['die', 3]);
	assert.match(mud.toString(), /黑风寨主.*倒地不起/);
});

// 多句模板逐事件、人物和技能轮换，跳过空白项；全空数组逐级回退，重新start从第一句开始。
test('mud wuxia: template arrays cycle, skip blanks, preserve fallback and reset on start', () => {
	const scene = wuxiaScene();
	initSkills([
		{
			id: 99581,
			name: '断流刀',
			magic: false,
			rand: 1,
			attack: {},
			final: {},
			sel: { target: TargetSelectEnum.enemy },
		},
	]);
	const tables: FightMudTables = {
		...scene.tables,
		xlsCharacter: {
			0: {
				id: 0,
				出手文本: [' ', '{施放者}第一式{技能}。', '{施放者}第二式{技能}。'],
				未命中文本: '人物专属：{未命中}',
			},
		},
	};
	assert.equal(resolveMudText(tables, '未命中文本', 0), '人物专属：{未命中}');
	const mud = new FightMud(() => {}, false, tables);
	const messages: fightMsg[] = [
		...scene.messages.slice(0, 3),
		['skill', 99581, 0, 3],
		['skill', 99581, 0, 3],
		['skill', 99581, 0, 3],
	];
	mud.onMsg(messages);
	assert.equal((mud.toString().match(/第一式/g) ?? []).length, 2);
	assert.equal((mud.toString().match(/第二式/g) ?? []).length, 1);
	mud.onMsg(messages.slice(0, 4));
	assert.equal((mud.toString().match(/第一式/g) ?? []).length, 1);
	assert.doesNotMatch(mud.toString(), /第二式/);
});

// 拆批与整批显示一致，候选文案不使用系统随机或时间；名称、伤害、未命中等颜色仍由原入口处理。
test('mud wuxia: message batching preserves prose and color conventions', () => {
	const scene = wuxiaScene(),
		output: string[] = [];
	const batch = new FightMud((line) => output.push(line), true, scene.tables);
	const single = new FightMud(() => {}, false, scene.tables);
	batch.onMsg(scene.messages);
	for (const msg of scene.messages) single.onMsg(msg);

	assert.equal(batch.toString(), single.toString());
	assert.ok(output.some((line) => line.includes('\x1b[36m[回岚剑]\x1b[0m')));
	assert.ok(output.some((line) => line.includes('\x1b[34m未命中\x1b[0m')));
	assert.ok(output.some((line) => line.includes('\x1b[38;5;208m80\x1b[0m')));
	assert.ok(output.some((line) => line.includes('\x1b[32m80\x1b[0m')));
});
