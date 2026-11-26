import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
	FightMud,
	fightMsg,
	initSkills,
	TargetSelectEnum,
	CharacterData,
	resolveMudText,
} from '../../src';

const skillId = 99100,
	counterId = 99101;
function initial(character = 100): fightMsg[] {
	const unit = (uid: number, name: string, character: number, weaponName: string) => ({
		uid,
		pos: 0,
		dead: false,
		display: { name, character, weaponName },
		point: { hp: 100, hpMax: 100, mp: 100, mpMax: 100 },
		buffs: [] as number[][],
	});
	return [
		['start', 99100],
		['side', 0, [unit(0, '张三丰', character, '青钢剑')]],
		['side', 1, [unit(1, '李虎', 200, '钢刀')]],
	];
}
function tables(): { xlsCharacter: Record<number, CharacterData> } {
	initSkills(
		[skillId, counterId].map((id) => ({
			id,
			name: id === skillId ? '破空掌' : '回风剑',
			magic: false,
			rand: 1,
			attack: {},
			final: {},
			sel: { target: TargetSelectEnum.enemy },
		})),
	);
	return { xlsCharacter: { 100: { id: 100 }, 200: { id: 200 } } };
}

// 每个事件只按人物编号直接取文案，未知编号或空白字段不借用其他人物配置。
test('mud templates: direct character lookup falls back per field without trait matching', () => {
	const data = tables();
	data.xlsCharacter[100].受伤文本 = '甲受伤';
	data.xlsCharacter[200].死亡文本 = [' ', '乙倒下'];
	assert.equal(resolveMudText(data, '受伤文本', 100), '甲受伤');
	assert.equal(resolveMudText(data, '死亡文本', 100), undefined);
	assert.equal(resolveMudText(data, '死亡文本', 200), '乙倒下');
	assert.equal(resolveMudText(data, '受伤文本', 999), undefined);
});

// 治疗、复活与闪避读取对应承受者文案，使用实际恢复量并保留未知占位符及颜色。
test('mud templates: heal revival and miss keep affected character colors and actual healing', () => {
	const data = tables();
	Object.assign(data.xlsCharacter[200], {
		治疗文本: '$N恢复{治疗}，生命{生命}/{最大生命}。{自定义}',
		复活文本: '$N重新起身。',
		未命中文本: '$N避开$n，{未命中}。',
	});
	const output: string[] = [],
		mud = new FightMud((line) => output.push(line), true, data);
	mud.onMsg([
		...initial(),
		['hurt', 'buff', 1, 0, 20, 80, []],
		['heal', 'heal', 1, 0, 100, 80, []],
		['miss', skillId, 0, 1],
		['relife', 1],
	]);
	assert.match(mud.toString(), /李虎.*恢复20，生命100\/100。\{自定义\}/);
	assert.ok(output.some((line) => line.includes('\x1b[32m20\x1b[0m')));
	assert.ok(output.some((line) => line.includes('\x1b[34m未命中\x1b[0m')));
	assert.ok(output.some((line) => line.startsWith('\x1b[92m') && line.includes('重新起身')));
});

// 技能action优先控制出招，人物只覆盖自己的受伤与死亡，不能误取施放者的角色文案。
test('mud templates: skill action and victim character have separate responsibilities', () => {
	const data = tables();
	initSkills([
		{
			id: skillId,
			name: '破空掌',
			magic: false,
			rand: 1,
			attack: {},
			final: {},
			sel: { target: TargetSelectEnum.enemy },
			action: '技能出手：$N使出{技能}攻向$n。',
		},
	]);
	Object.assign(data.xlsCharacter[100], { 出手文本: '错误角色出手', 受伤文本: '错误施放者受伤' });
	Object.assign(data.xlsCharacter[200], {
		受伤文本: '$N手中的$w微颤，受到{伤害}点伤害。',
		死亡文本: '$N倒在$n的{技能}之下。',
	});
	const mud = new FightMud(() => {}, false, data);
	mud.onMsg([
		...initial(),
		['skill', skillId, 0, 1],
		['hurt', 'skill', 1, 0, 100, 0, []],
		['die', 1],
	]);
	assert.match(mud.toString(), /技能出手：张三丰.*破空掌.*李虎/);
	assert.match(mud.toString(), /李虎.*钢刀.*100点伤害/);
	assert.match(mud.toString(), /李虎.*倒在张三丰.*破空掌/);
	assert.doesNotMatch(mud.toString(), /错误/);
});

// 按display.character查找而非运行uid，零编号有效，未配置技能action时可用人物出手文本。
test('mud templates: character zero is independent from unit UID', () => {
	const data = tables();
	data.xlsCharacter[0] = { id: 0, 出手文本: '零号人物：$N出手。' };
	const mud = new FightMud(() => {}, false, data);
	mud.onMsg([...initial(0), ['skill', skillId, 0, 1]]);
	assert.match(mud.toString(), /零号人物：张三丰/);
	const other = new FightMud(() => {}, false, data);
	other.onMsg([...initial(), ['skill', skillId, 0, 1]]);
	assert.doesNotMatch(other.toString(), /零号人物/);
});

// 缺失、空白和全空数组逐事件回退，渲染不能修改人物表或传入的消息。
test('mud templates: blank character fields fall back without mutation', () => {
	const data = tables();
	data.xlsCharacter[100].出手文本 = [' ', ''];
	const before = structuredClone(data),
		messages: fightMsg[] = [...initial(), ['skill', skillId, 0, 1]],
		wire = structuredClone(messages);
	const mud = new FightMud(() => {}, false, data);
	mud.onMsg(messages);
	assert.match(mud.toString(), /凝神蓄势.*破空掌/);
	assert.deepEqual(data, before);
	assert.deepEqual(messages, wire);
});

// 嵌套攻击仍按出招与伤害配对，死亡专属文案引用的是实际致死那层技能。
test('mud templates: nested attacks retain the actual fatal skill for character death prose', () => {
	const data = tables();
	Object.assign(data.xlsCharacter[200], {
		受伤文本: '$N受{技能}之伤{伤害}。',
		死亡文本: '$N死于{技能}。',
	});
	const mud = new FightMud(() => {}, false, data);
	mud.onMsg([
		...initial(),
		['skill', skillId, 0, 1],
		['skill', counterId, 0, 1],
		['hurt', 'skill', 1, 0, 10, 90, []],
		['hurt', 'skill', 1, 0, 90, 0, []],
		['die', 1],
	]);
	assert.match(mud.toString(), /回风剑.*之伤10[\s\S]*破空掌.*之伤90[\s\S]*死于\[破空掌\]/);
});

// 反伤等反应伤害使用受害人物专属文案，不能借用最近一次普通技能的编号。
test('mud templates: reaction damage uses its affected character without stale skill context', () => {
	const data = tables();
	Object.assign(data.xlsCharacter[100], {
		受伤文本: '$N反应受伤{伤害}，技能{技能}',
		死亡文本: '$N反应死亡{技能}',
	});
	const mud = new FightMud(() => {}, false, data);
	mud.onMsg([
		...initial(),
		['skill', skillId, 0, 1],
		['hurt', 'skill', 1, 0, 20, 80, []],
		['hurt', 'dback', 0, 1, 100, 0, []],
		['die', 0],
	]);
	assert.match(mud.toString(), /张三丰.*反应受伤100，技能\n张三丰.*反应死亡/);
});

// 角色模板保留技能和数值配色，零伤害不触发受创描写，死亡依然整句暗红。
test('mud templates: zero damage and color conventions remain intact', () => {
	const data = tables();
	Object.assign(data.xlsCharacter[100], { 出手文本: '$N施展{技能}。' });
	Object.assign(data.xlsCharacter[200], {
		受伤文本: '$N吐血，受到{伤害}。',
		死亡文本: '$N倒下。',
	});
	const output: string[] = [],
		mud = new FightMud((line) => output.push(line), true, data);
	mud.onMsg([
		...initial(),
		['skill', skillId, 0, 1, 'combo'],
		['hurt', 'skill', 1, 0, 0, 100, []],
	]);
	assert.doesNotMatch(mud.toString(), /吐血/);
	mud.onMsg([
		['skill', skillId, 0, 1],
		['hurt', 'skill', 1, 0, 100, 0, ['crit']],
		['die', 1],
	]);
	assert.ok(
		output.some(
			(line) => line.includes('【连招】') && line.includes('\x1b[36m[破空掌]\x1b[0m'),
		),
	);
	assert.ok(output.some((line) => line.includes('\x1b[38;5;208m100\x1b[0m')));
	assert.ok(
		output.some(
			(line) =>
				line.startsWith('\x1b[38;5;88m') &&
				line.includes('倒下') &&
				line.endsWith('\x1b[0m'),
		),
	);
});

// 新战斗清除旧致死上下文，单条与整批消息得出相同人物文案。
test('mud templates: batching and start reset preserve character causality', () => {
	const data = tables();
	data.xlsCharacter[200].死亡文本 = '$N死于{技能}';
	const messages: fightMsg[] = [
		...initial(),
		['skill', skillId, 0, 1],
		['hurt', 'skill', 1, 0, 100, 0, []],
		...initial(),
		['die', 1],
	];
	const batch = new FightMud(() => {}, false, data),
		single = new FightMud(() => {}, false, data);
	batch.onMsg(messages);
	for (const msg of messages) single.onMsg(msg);

	assert.equal(batch.toString(), single.toString());
	assert.match(batch.toString(), /李虎.*死于$/);
	assert.doesNotMatch(batch.toString(), /破空掌/);
});
