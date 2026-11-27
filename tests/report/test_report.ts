import { setFightGlobalData } from '../../src/fight/Datas/FightGlobalData';
import { BuffTurnEnum } from '../../src/fight/Datas/BuffDatas';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { FightReport } from '../../src/fight/Client/FightReport';
import { FightClient } from '../../src/fight/Client/FightClient';
import { Fight } from '../../src/fight/Fight';
import { FightSide } from '../../src/fight/FightSide';
import { FightLoopWest } from '../../src/fight/Loop/FightLoopWest';
import { fightMsg } from '../../src/fight/struct';
import { BuffData, initBuffs, OverlapEnum } from '../../src/fight/Datas/BuffDatas';
import { initSkills } from '../../src/fight/Datas/SkillDatas';
import { TargetSelectEnum } from '../../src/fight/struct';

// 测试：移除 Buff 消息不传名称时从本地配置查询，配置缺失时回退到编号。
test('report: Buff removal resolves its name from local configuration without a transmitted name', () => {
	initBuffs([
		{
			id: 98200,
			name: '本地护盾',
			desc: '',
			magic: false,
			attackType: 'base',
			attack: {},
			final: {},
			overlap: OverlapEnum.NOT,
			status: [],
			tags: [],
			lastTurn: 0,
			times: 0,
			turnType: BuffTurnEnum.thisTurn,
			event: 'hurt',
			skill: 0,
			skillLevel: 1,
		},
	]);
	const report = new FightReport(() => {});
	report.onMsg([
		['start', 98200],
		['removeBuff', 'turn', 1, 1, 98200],
		['removeBuff', 'times', 1, 1, 98201],
	]);
	assert.match(report.toString(), /移除 \[本地护盾\]（持续时间结束）/);
	assert.match(report.toString(), /移除 Buff #98201（次数耗尽）/);
});

function initial(): fightMsg[] {
	const unit = (uid: number, name: string) => ({
		uid,
		pos: 0,
		dead: false,
		display: { name },
		point: { hp: 100, hpMax: 100, mp: 100, mpMax: 100 },
		buffs: [
			[97101, 3, 0, 0],
			[97102, 2, 0, 0],
		],
	});
	return [
		['start', 0],
		['side', 0, [unit(0, '甲')]],
		['side', 1, [unit(1, '乙')]],
	];
}

// 测试：伤害的克和治疗的生标记出现在简报中，标记不改变伤害、治疗数字的颜色。
test('report: elemental effect markers are readable for damage and healing', () => {
	const output: string[] = [],
		report = new FightReport((line) => output.push(line));
	report.onMsg([
		...initial(),
		['hurt', 'skill', 1, 0, 50, 50, ['克']],
		['heal', 'heal', 1, 0, 20, 50, ['生']],
	]);
	assert.match(report.toString(), /50 点伤害（克）/);
	assert.match(report.toString(), /20 点生命（治疗，生）/);
	assert.ok(output.some((line) => line.includes('\x1b[31m50\x1b[0m 点伤害（克）')));
	assert.ok(output.some((line) => line.includes('\x1b[32m20\x1b[0m 点生命（治疗，生）')));
});

// 测试：只给每行开头的人名按阵营着色，后续同名引用保持原色，数字颜色与纯文本不变。
test('report: only the leading unit name gets a side color', () => {
	const output: string[] = [];
	const report = new FightReport((line) => output.push(line));
	report.onMsg([
		...initial(),
		['hurt', 'share', 1, 0, 50, 50, []],
		['heal', 'heal', 1, 1, 10, 50, []],
	]);
	assert.ok(
		output.includes(
			'\x1b[32m甲（#0）\x1b[0m 对 乙（#1） 造成 \x1b[31m50\x1b[0m 点分担伤害，剩余生命 50',
		),
	);
	assert.ok(
		output.includes(
			'\x1b[31m乙（#1）\x1b[0m 为 乙（#1） 恢复 \x1b[32m10\x1b[0m 点生命（治疗），当前生命 60/100',
		),
	);
	assert.ok(!report.toString().includes('\x1b['));
});

// 测试：连击等行首标注不影响首个人名着色，协战合并行的第二个人名和目标不着色。
test('report: reaction labels keep only the first name colored in joint support', () => {
	initSkills([
		{
			id: 99570,
			name: '主攻',
			magic: true,
			rand: 1,
			attack: {},
			final: {},
			nosupport: false,
			sel: { target: TargetSelectEnum.enemy },
		},
	]);
	const init = initial();
	init[1][2].push({ ...structuredClone(init[1][2][0]), uid: 2, display: { name: '丙' } });
	const output: string[] = [];
	const report = new FightReport((line) => output.push(line));
	report.onMsg([
		...init,
		['skill', 99570, 0, 1, 'next'],
		['hurt', 'skill', 1, 0, 20, 80, []],
		['skill', 99570, 2, 1, 'support'],
		['hurt', 'skill', 1, 2, 10, 70, []],
	]);
	const header = output.find((line) => line.includes('同时攻击'));
	assert.ok(header.startsWith('【连击】【协战】\x1b[32m甲（#0）\x1b[0m'));
	assert.ok(header.includes('，丙（#2） 使用'));
	assert.ok(header.endsWith('同时攻击 乙（#1）'));
});

// 测试：简报从本地配置显示带方括号的名称，并分别着色治疗、伤害和暴击数字。
test('report: local configuration names use brackets and healing, damage and critical damage use distinct colors', () => {
	const output: string[] = [];
	const report = new FightReport((line) => output.push(line));
	const init = initial();
	initBuffs(
		(
			[
				[98301, '护体'],
				[98302, '坚守'],
				[97302, '回春'],
			] as const
		).map<BuffData>(([id, name]) => ({
			id,
			name,
			desc: '',
			magic: false,
			attackType: 'base',
			attack: {},
			final: {},
			overlap: OverlapEnum.NOT,
			status: [],
			tags: [],
			lastTurn: 0,
			times: 0,
			turnType: BuffTurnEnum.thisTurn,
			event: 'hurt',
			skill: 0,
			skillLevel: 1,
		})),
	);
	initSkills([
		{
			id: 97301,
			name: '黑虎掏心',
			magic: true,
			rand: 1,
			attack: {},
			final: {},
			sel: { target: TargetSelectEnum.enemy },
		},
	]);
	init[1][2][0].buffs = [
		[98301, 3, 0, 0],
		[98302, 2, 0, 0],
	];
	const messages: fightMsg[] = [
		...init,
		['skill', 97301, 0, 1],
		['hurt', '甲', 1, 0, 20, 80, []],
		['hurt', '甲', 1, 0, 30, 50, ['crit']],
		['heal', 'heal', 1, 1, 10, 50, []],
		['addBuff', 'test', 1, 0, 97302, 2, [0, 3]],
		['removeBuff', 'turn', 1, 1, 97302],
		['removeBuff', 'die', 0, 0, 98302],
		['die', 1],
		['relife', 1],
		['miss', 97301, 0, 1],
	];
	report.onMsg(JSON.parse(JSON.stringify(messages)));
	const text = report.toString();
	assert.match(text, /使用\[黑虎掏心\]/);
	assert.match(text, /初始携带 \[护体\]/);
	assert.match(text, /添加 \[回春\]/);
	assert.match(text, /移除 \[回春\]/);
	assert.match(text, /移除 \[坚守\]/);
	const ally = '\x1b[32m甲（#0）\x1b[0m',
		enemy = '乙（#1）';
	assert.ok(output.includes(`${ally} 对 ${enemy} 造成 \x1b[31m20\x1b[0m 点伤害，剩余生命 80`));
	assert.ok(
		output.includes(
			`${ally} 对 ${enemy} 造成 \x1b[38;5;208m30\x1b[0m 点伤害（暴击），剩余生命 50`,
		),
	);
	assert.ok(
		output.includes(
			`\x1b[31m${enemy}\x1b[0m 为 ${enemy} 恢复 \x1b[32m10\x1b[0m 点生命（治疗），当前生命 60/100`,
		),
	);
	assert.ok(output.includes('\x1b[38;5;88m乙（#1）死亡\x1b[0m'));
	assert.ok(output.includes('\x1b[92m乙（#1）复活\x1b[0m'));
	assert.ok(
		output.includes(
			`${ally} 使用\x1b[36m[黑虎掏心]\x1b[0m攻击 ${enemy}，\x1b[34m未命中\x1b[0m`,
		),
	);
	assert.ok(!text.includes('\x1b['), '保存的纯文本不应混入终端控制码');
	const plain: string[] = [];
	const uncolored = new FightReport((line) => plain.push(line), false);
	uncolored.onMsg(messages);
	assert.deepEqual(plain, report.lines);
});

// 测试：行动条人名保持原色，行动标题只给行首人名加阵营色，编号仍区分同名单位。
test('report: action order stays uncolored and actor headings color their leading names', () => {
	const output: string[] = [];
	const report = new FightReport((line) => output.push(line));
	const init = initial();
	init[1][2][0].display.name = '同名';
	init[2][2][0].display.name = '同名';
	report.onMsg([...init, ['sort', [0, 1]], ['actor', 0, 100], ['actor', 1, 90]]);
	const ally = '同名（#0）',
		enemy = '同名（#1）';
	assert.ok(output.includes(`剩余行动顺序：${ally} → ${enemy}`));
	assert.ok(output.includes(`\x1b[32m${ally}\x1b[0m 行动（速度 100）`));
	assert.ok(output.includes(`\x1b[31m${enemy}\x1b[0m 行动（速度 90）`));
	assert.ok(!report.toString().includes('\x1b['));
});

// 测试：技能名用青色、Buff 名用紫色，即使文字相同也按类型着色，关闭颜色后输出完整纯文本。
test('report: skill and Buff colors stay distinct for identical names and can be disabled', () => {
	initSkills([
		{
			id: 98910,
			name: '同名效果',
			magic: true,
			rand: 1,
			attack: {},
			final: {},
			sel: { target: TargetSelectEnum.enemy },
		},
	]);
	initBuffs([
		{
			id: 98911,
			name: '同名效果',
			desc: '',
			magic: false,
			attackType: 'base',
			attack: {},
			final: {},
			status: [],
			tags: [],
			overlap: OverlapEnum.NOT,
			lastTurn: 1,
			times: 0,
			event: 'hurt',
		},
	]);
	const output: string[] = [];
	const report = new FightReport((line) => output.push(line));
	const messages: fightMsg[] = [
		...initial(),
		['skill', 98910, 0, 1],
		['addBuff', 'test', 0, 0, 98911, 1, [0, 1]],
		['removeBuff', 'turn', 0, 0, 98911],
		['buffTrigger', 0, 98911, 'buqu'],
		['skipAction', 0, 98911],
		['skillFailed', 0, 1, 98910],
	];
	report.onMsg(messages);
	const skill = output.find((line) => line.includes(' 使用'));
	const buff = output.find((line) => line.includes(' 添加 '));
	assert.ok(skill.includes('\x1b[36m[同名效果]\x1b[0m'));
	assert.ok(!skill.includes('\x1b[35m'));
	assert.ok(buff.includes('\x1b[35m[同名效果]\x1b[0m'));
	assert.ok(!buff.includes('\x1b[36m'));
	assert.ok(output.find((line) => line.includes('未发动')).includes('\x1b[36m[同名效果]\x1b[0m'));
	for (const text of ['移除', '触发', '跳过行动']) {
		assert.ok(output.find((line) => line.includes(text)).includes('\x1b[35m[同名效果]\x1b[0m'));
	}
	const plain: string[] = [];
	new FightReport((line) => plain.push(line), false).onMsg(messages);
	assert.deepEqual(plain, report.lines);
	assert.ok(plain.every((line) => !line.includes('\x1b[')));
});

// 测试：连招和普通连击分别显示对应标记，命中与未命中都能区分。
test('report: combo and next use distinct labels for both hits and misses', () => {
	initSkills([
		{
			id: 98901,
			name: '连招末式',
			magic: true,
			rand: 1,
			attack: {},
			final: {},
			sel: { target: TargetSelectEnum.enemy },
		},
		{
			id: 98902,
			name: '追加一击',
			magic: true,
			rand: 1,
			attack: {},
			final: {},
			sel: { target: TargetSelectEnum.enemy },
		},
	]);
	const report = new FightReport(() => {});
	report.onMsg([
		...initial(),
		['skill', 98901, 0, 1, 'combo'],
		['miss', 98901, 0, 1, 'combo'],
		['skill', 98902, 0, 1, 'next'],
		['miss', 98902, 0, 1, 'next'],
	]);
	const text = report.toString();
	assert.match(text, /【连招】甲（#0） 对 乙（#1） 使用\[连招末式\]/);
	assert.match(text, /【连招】甲（#0） 使用\[连招末式\]攻击 乙（#1），未命中/);
	assert.match(text, /【连击】甲（#0） 对 乙（#1） 使用\[追加一击\]/);
	assert.match(text, /【连击】甲（#0） 使用\[追加一击\]攻击 乙（#1），未命中/);
});

// 测试：每个行动前插入空行，终端输出与保存的简报保持一致。
test('report: each actor starts after a blank line in printed and saved reports', () => {
	const output: string[] = [];
	const report = new FightReport((line) => output.push(line), false);
	report.onMsg([
		...initial(),
		['turn', 1],
		['actor', 0, 100],
		['hurt', '甲', 1, 0, 20, 80, []],
		['actor', 1, 90],
		['乙', 'miss', 1, 0],
	]);
	const actorIndexes = report.lines.flatMap((line, index) =>
		line.includes(' 行动（') ? [index] : [],
	);
	assert.equal(actorIndexes.length, 2);
	for (const index of actorIndexes) assert.equal(report.lines[index - 1], '');
	assert.equal(report.lines.filter((line) => line === '').length, 3);
	assert.deepEqual(output, report.lines);
	assert.match(report.toString(), /第 1 回合\n\n甲（#0） 行动/);
	assert.match(report.toString(), /剩余生命 80\n\n乙（#1） 行动/);
});

// 测试：每个回合标题前插入空行，包括后续回合。
test('report: every turn heading starts after a blank line', () => {
	const output: string[] = [];
	const report = new FightReport((line) => output.push(line), false);
	report.onMsg([...initial(), ['turn', 1], ['actor', 0, 100], ['turn', 8]]);
	for (const turn of [1, 8]) {
		const index = report.lines.indexOf(`第 ${turn} 回合`);
		assert.ok(index > 0);
		assert.equal(report.lines[index - 1], '');
	}
	assert.deepEqual(output, report.lines);
	assert.ok(report.toString().includes('\n\n第 8 回合'));
});

// 测试：简报按增量消息顺序展示死亡、Buff 清除和复活，并正确显示结局。
test('report: Chinese text follows incremental death, Buff removal and revival messages', () => {
	const report = new FightReport(() => {});
	const messages: fightMsg[] = [
		...initial(),
		['turn', 1],
		['sort', [1, 0]],
		['actor', 1, 100],
		['乙', 0, 1, 0],
		['hurt', '乙', 0, 1, 100, 0, ['crit']],
		['die', 0],
		['removeBuff', 'die', 0, 0, 97102],
		['relife', 0],
		['heal', 'relife', 0, 0, 200, 0, []],
		['end', 2],
	];
	// 模拟网络，仅有消息，没有服务端 Fight 或技能/Buff 配置。
	for (const msg of JSON.parse(JSON.stringify(messages))) report.onMsg(msg);
	const text = report.toString();
	assert.match(text, /战斗 #0 开始/);
	assert.match(text, /第 1 回合/);
	assert.match(text, /乙.*甲.*普通攻击/);
	assert.match(text, /甲.*100.*暴击/);
	const death = text.indexOf('甲（#0）死亡');
	const removal = text.indexOf('移除 Buff #97102');
	const revival = text.indexOf('甲（#0）复活');
	assert.ok(death >= 0 && removal > death && revival > removal);
	assert.doesNotMatch(text, /移除 Buff #97101/);
	assert.match(text, /恢复 100 点生命.*100\/100/);
	assert.match(text, /平局/);
});

// 测试：空消息不改变简报，新战斗清除旧战斗文字和单位名称。
test('report: empty messages do nothing and start clears previous names and text', () => {
	const report = new FightReport(() => {});
	report.onMsg(initial());
	const before = report.toString();
	report.onMsg([]);
	assert.equal(report.toString(), before);
	report.onMsg([
		['start', 9],
		['die', 0],
		['end', 1],
	]);
	assert.doesNotMatch(report.toString(), /甲|战斗 #0/);
	assert.match(report.toString(), /单位 #0.*死亡/);
	assert.match(report.toString(), /防守方获胜/);
});

// 测试：简报与客户端同时绑定完整战斗循环，输出结局且状态一致。
test('report: binding coexists with FightClient and reports a full battle', async () => {
	setFightGlobalData({
		protectBuff: undefined,
		allShieldBreak: false,
		maxTurn: 1,
		waitInputSec: 0.01,
		duiwei: false,
	});
	const fight = new Fight(
		97103,
		{ id: 1, runaway: false, runawayGrade: 0, deathPenalty: 0, winRecover: 0, winReward: 0 },
		0,
	);
	const a = new FightSide(),
		b = new FightSide();
	a.createSimpleMonster(fight, [{ id: 0, name: '甲', pos: 0 }]);
	b.createSimpleMonster(fight, [{ id: 1, name: '乙', pos: 0 }]);
	fight.createSide(a, b);
	const loop = new FightLoopWest(fight);
	const client = new FightClient();
	client.bindFightLoop(loop);
	const report = new FightReport(() => {});
	report.bindFightLoop(loop);
	await loop.run();
	assert.equal(client.checkSame(fight), true);
	assert.match(report.toString(), /战斗 #97103 开始/);
	assert.match(report.toString(), /第 1 回合/);
	assert.match(report.toString(), /战斗结束/);
});

// 测试：批量消息不被修改，逐条和批量生成的简报一致，并说明费用及反应。
test('report: batches preserve input and output while explaining costs and reactions', () => {
	const output: string[] = [];
	const report = new FightReport((line) => output.push(line), false);
	const messages: fightMsg[] = [
		...initial(),
		['costHp', 0, 10, 90],
		['costMp', 0, 20, 80],
		['甲', 97104, 0, 1],
		['甲', 'miss', 0, 1],
		['hurt', 'dback', 0, 1, 5, 85, []],
		['heal', 'blood', 0, 0, 5, 85, []],
		['addBuff', 'test', 0, 1, 97105, 2, [1, 3]],
		['removeBuff', 'times', 0, 0, 97105],
		['新扩展事件', { value: 1 }],
		['end', 0],
	];
	const before = structuredClone(messages);
	report.onMsg(messages);
	assert.deepEqual(messages, before);
	assert.deepEqual(output, report.lines);
	const singles = new FightReport(() => {});
	for (const msg of messages) singles.onMsg(msg);
	assert.equal(report.toString(), singles.toString());
	assert.match(report.toString(), /消耗 10 点生命/);
	assert.match(report.toString(), /消耗 20 点法力/);
	assert.match(report.toString(), /技能 #97104/);
	assert.match(report.toString(), /未命中/);
	assert.match(report.toString(), /5 点反伤/);
	assert.match(report.toString(), /恢复 5 点生命（吸血）/);
	assert.match(report.toString(), /添加 Buff #97105（等级 2）/);
	assert.match(report.toString(), /移除 Buff #97105（次数耗尽）/);
	assert.match(report.toString(), /未识别消息.*新扩展事件/);
	assert.match(report.toString(), /攻击方获胜/);
});
