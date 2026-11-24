import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
	FightMud,
	fightMsg,
	initSkills,
	TargetSelectEnum,
	MudCharacter,
	MudTexts,
	resolveMudText,
} from '../../src';

type Tables = {
	xlsCharacter: Record<string, MudCharacter>;
	xlsText: Record<string, MudTexts>;
	xlsSkillDesc: Record<number, MudTexts>;
};
const skillId = 99100,
	counterId = 99101;

// 测试：组合匹配消耗各项特征，重复条件不能借用同一个值，同具体程度保持表中顺序。
test('mud templates: duplicate traits require separate fields and ties keep table order', () => {
	const data = tables();
	data.xlsText['普通+普通'] = { 出手文本: '重复匹配' };
	data.xlsText['男+剑'] = { 出手文本: '第一组合' };
	data.xlsText['剑+男'] = { 出手文本: '第二组合' };
	assert.equal(resolveMudText(data, '出手文本', 100), '第一组合');
	data.xlsCharacter[100].武功 = '普通';
	assert.equal(resolveMudText(data, '出手文本', 100), '重复匹配');
	assert.equal(resolveMudText(data, '出手文本', '不存在'), undefined);
});

// 测试：治疗、复活与未命中文案使用实际数值及对应颜色，未知占位符保留原文。
test('mud templates: heal revival and miss templates keep their colors and actual healing', () => {
	const data = tables();
	data.xlsText[200] = {
		治疗文本: '{人物}恢复{治疗}，生命{生命}/{最大生命}。{自定义}',
		复活文本: '{人物}重新起身。',
	};
	data.xlsSkillDesc[skillId] = { 未命中文本: '{施放者}以{技能}攻向{目标}，{未命中}。' };
	const output: string[] = [];
	const mud = new FightMud((line) => output.push(line), true, data);
	mud.onMsg([
		...initial(),
		['hurt', 'buff', 1, 0, 20, 80, []],
		['heal', 'heal', 1, 0, 100, 80, []],
		['miss', skillId, 0, 1],
		['relife', 1],
	]);
	assert.match(mud.toString(), /恢复20，生命100\/100。\{自定义\}/);
	assert.ok(output.some((line) => line.includes('\x1b[32m20\x1b[0m')));
	assert.ok(output.some((line) => line.includes('\x1b[34m未命中\x1b[0m')));
	assert.ok(output.some((line) => line.startsWith('\x1b[92m') && line.includes('重新起身')));
});

function initial(character: number | string = 100): fightMsg[] {
	const unit = (uid: number, name: string, character: number | string) => ({
		uid,
		pos: 0,
		dead: false,
		display: { name, character },
		point: { hp: 100, hpMax: 100, mp: 100, mpMax: 100 },
		buffs: [] as number[][],
	});
	return [
		['start', 99100],
		['side', 0, [unit(0, '张三丰', character)]],
		['side', 1, [unit(1, '李虎', 200)]],
	];
}

function tables(): Tables {
	initSkills([
		{
			id: skillId,
			name: '破空掌',
			magic: false,
			rand: 1,
			attack: {},
			final: {},
			sel: { target: TargetSelectEnum.enemy },
		},
		{
			id: counterId,
			name: '回风剑',
			magic: false,
			rand: 1,
			attack: {},
			final: {},
			sel: { target: TargetSelectEnum.enemy },
		},
	]);
	return {
		xlsCharacter: {
			100: { 武功: '绝顶', sex: '男', 年纪: '老年', 相貌: '普通', 兵器: '剑', 门派: '武当' },
			200: { 武功: '菜鸟', sex: '男', 年纪: '少年', 相貌: '英俊', 兵器: '刀', 门派: '华山' },
		},
		xlsText: {},
		xlsSkillDesc: {},
	};
}

// 测试：技能、人物专属与特征组合按每个事件分别回退，受伤和死亡使用受伤者的人物配置。
test('mud templates: per-event precedence is skill, character, matching traits, then builtin', () => {
	const data = tables();
	data.xlsSkillDesc[skillId] = { 出手文本: '技能出手：{施放者}以{技能}攻向{目标}。' };
	data.xlsText[100] = { 出手文本: '施放者专属不应出现。', 受伤文本: '施放者受伤不应出现。' };
	data.xlsText[200] = { 受伤文本: '人物受伤：{人物}的{兵器}脱手，受到{伤害}点伤害。' };
	data.xlsText['菜鸟+男+少年+英俊+刀'] = {
		死亡文本: '组合死亡：{人物}倒在{施放者}的{技能}之下。',
	};
	const mud = new FightMud(() => {}, false, data);
	mud.onMsg([
		...initial(),
		['skill', skillId, 0, 1],
		['hurt', 'skill', 1, 0, 100, 0, []],
		['die', 1],
	]);
	const text = mud.toString();
	assert.match(text, /技能出手：张三丰.*\[破空掌\].*李虎/);
	assert.match(text, /人物受伤：李虎.*刀.*100点伤害/);
	assert.match(text, /组合死亡：李虎.*张三丰.*\[破空掌\]/);
	assert.doesNotMatch(text, /不应出现/);
});

// 测试：技能受伤和死亡文案优先于受伤人物的专属文案，角色特征可分别引用施放者与目标。
test('mud templates: skill text overrides victim-specific text and substitutes both character profiles', () => {
	const data = tables();
	data.xlsText[200] = { 受伤文本: '人物受伤不应出现', 死亡文本: '人物死亡不应出现' };
	data.xlsSkillDesc[skillId] = {
		受伤文本:
			'技能受伤：{人物}被{施放者门派}的{施放者兵器}击中，{目标门派}的{目标兵器}无力招架，损失{伤害}。',
		死亡文本: '技能死亡：{目标}倒在{施放者}面前，生命{生命}/{最大生命}。',
	};
	const mud = new FightMud(() => {}, false, data);
	mud.onMsg([
		...initial(),
		['skill', skillId, 0, 1],
		['hurt', 'skill', 1, 0, 100, 0, []],
		['die', 1],
	]);
	assert.match(mud.toString(), /技能受伤：李虎.*武当的剑.*华山的刀.*100/);
	assert.match(mud.toString(), /技能死亡：李虎.*张三丰.*生命0\/100/);
	assert.doesNotMatch(mud.toString(), /不应出现/);
});

// 测试：特征越具体优先级越高，门派条件可选，未配置文本的字段继续回退到较通用组合。
test('mud templates: trait specificity includes optional faction and falls back per field', () => {
	const data = tables();
	data.xlsText['剑'] = {
		出手文本: '兵器通用：{人物}挥剑。',
		未命中文本: '兵器未中：{人物}{未命中}。',
	};
	data.xlsText['绝顶+男+老年+普通+剑'] = { 出手文本: '五项组合：{人物}出剑。' };
	data.xlsText['绝顶+男+老年+普通+剑+武当'] = { 出手文本: '六项组合：{人物}来自{门派}。' };
	const mud = new FightMud(() => {}, false, data);
	mud.onMsg([...initial(), ['skill', skillId, 0, 1], ['miss', skillId, 0, 1]]);
	assert.match(mud.toString(), /六项组合：张三丰.*武当/);
	assert.match(mud.toString(), /兵器未中：张三丰.*未命中/);
	assert.doesNotMatch(mud.toString(), /兵器通用|五项组合/);
});

// 测试：人物专属按 display.character 而非单位 uid 查询，零编号同样有效。
test('mud templates: character lookup uses display.character including zero rather than unit ID', () => {
	const data = tables();
	data.xlsCharacter[0] = data.xlsCharacter[100];
	data.xlsText[0] = { 出手文本: '零号人物：{人物}出手。' };
	const mud = new FightMud(() => {}, false, data);
	mud.onMsg([...initial(0), ['skill', skillId, 0, 1]]);
	assert.match(mud.toString(), /零号人物：张三丰/);
	const other = new FightMud(() => {}, false, data);
	other.onMsg([...initial(100), ['skill', skillId, 0, 1]]);
	assert.doesNotMatch(other.toString(), /零号人物/);
});

// 测试：空白单元格继续回退，缺少人物或技能表时仍保留默认描写，模板不修改输入或表数据。
test('mud templates: blank cells and missing data fall back without mutating tables or messages', () => {
	const data = tables();
	data.xlsSkillDesc[skillId] = { 出手文本: '   ' };
	data.xlsText[100] = { 出手文本: '' };
	data.xlsText['剑'] = { 出手文本: '通用剑招：{人物}对{目标}出手。' };
	const before = structuredClone(data);
	const messages: fightMsg[] = [...initial(), ['skill', skillId, 0, 1]];
	const wire = structuredClone(messages);
	const mud = new FightMud(() => {}, false, data);
	mud.onMsg(messages);
	assert.match(mud.toString(), /通用剑招：张三丰/);
	assert.deepEqual(data, before);
	assert.deepEqual(messages, wire);
	const fallback = new FightMud(() => {}, false, {});
	fallback.onMsg(messages);
	assert.match(fallback.toString(), /凝神蓄势.*\[破空掌\]/);
});

// 测试：嵌套攻击按出招与受伤配对关联技能，不能把内层技能错误套到外层伤害和死亡。
test('mud templates: nested attacks pair their own skill descriptions with damage and death', () => {
	const data = tables();
	data.xlsSkillDesc[skillId] = { 受伤文本: '外层伤害{伤害}。', 死亡文本: '外层死亡。' };
	data.xlsSkillDesc[counterId] = { 受伤文本: '内层伤害{伤害}。', 死亡文本: '内层死亡。' };
	const mud = new FightMud(() => {}, false, data);
	mud.onMsg([
		...initial(),
		['skill', skillId, 0, 1],
		['skill', counterId, 0, 1],
		['hurt', 'skill', 1, 0, 10, 90, []],
		['hurt', 'skill', 1, 0, 90, 0, []],
		['die', 1],
	]);
	assert.match(mud.toString(), /内层伤害10[\s\S]*外层伤害90[\s\S]*外层死亡/);
	assert.doesNotMatch(mud.toString(), /内层死亡/);
});

// 测试：反伤和分担伤害不借用最近技能的文案，受害人物专属文案仍可生效。
test('mud templates: reaction damage does not reuse unrelated skill descriptions', () => {
	const data = tables();
	data.xlsSkillDesc[skillId] = { 受伤文本: '技能受伤', 死亡文本: '错误技能死亡' };
	data.xlsText[100] = { 受伤文本: '人物反应受伤{伤害}', 死亡文本: '人物反应死亡' };
	const mud = new FightMud(() => {}, false, data);
	mud.onMsg([
		...initial(),
		['skill', skillId, 0, 1],
		['hurt', 'skill', 1, 0, 20, 80, []],
		['hurt', 'dback', 0, 1, 100, 0, []],
		['die', 0],
	]);
	assert.match(mud.toString(), /人物反应受伤100[\s\S]*人物反应死亡/);
	assert.doesNotMatch(mud.toString(), /错误技能死亡/);
});

// 测试：模板中的技能和数字保留原配色，零伤害不套用吐血描写，死亡仍整句暗红。
test('mud templates: placeholders preserve colors and zero damage never uses injury prose', () => {
	const data = tables();
	data.xlsSkillDesc[skillId] = {
		出手文本: '{施放者}施展{技能}。',
		受伤文本: '{人物}吐血，受到{伤害}。',
		死亡文本: '{人物}倒下。',
	};
	const output: string[] = [];
	const mud = new FightMud((line) => output.push(line), true, data);
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
	assert.ok(!mud.toString().includes('\x1b['));
});

// 测试：分批接收或一次接收获得相同模板结果，新战斗清空技能关联，不能串用上一场技能死亡文案。
test('mud templates: batch boundaries preserve causality and new battle clears pending descriptions', () => {
	const data = tables();
	data.xlsSkillDesc[skillId] = { 受伤文本: '对应伤害{伤害}', 死亡文本: '旧技能死亡' };
	data.xlsText[200] = { 死亡文本: '人物死亡' };
	const messages: fightMsg[] = [
		...initial(),
		['skill', skillId, 0, 1],
		['hurt', 'skill', 1, 0, 100, 0, []],
		['die', 1],
	];
	const batch = new FightMud(() => {}, false, data),
		single = new FightMud(() => {}, false, data);
	batch.onMsg(messages);
	for (const msg of messages) single.onMsg(msg);
	assert.equal(batch.toString(), single.toString());
	batch.onMsg([...initial(), ['die', 1]]);
	assert.match(batch.toString(), /人物死亡/);
	assert.doesNotMatch(batch.toString(), /旧技能死亡/);
});
