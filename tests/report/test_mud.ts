import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
	FightReport,
	fightMsg,
	initBuffs,
	initSkills,
	OverlapEnum,
	TargetSelectEnum,
} from '../../src';
import { FightMud } from '../../src/fight/Client/FightMud';
import { runReactionReport } from './fixtures/report_reactions';

function initial(): fightMsg[] {
	const unit = (uid: number, name: string) => ({
		uid,
		pos: 0,
		dead: false,
		display: { name },
		point: { hp: 100, hpMax: 100, mp: 100, mpMax: 100 },
		buffs: [] as number[][],
	});
	return [
		['start', 99000],
		['side', 0, [unit(0, '张三丰')]],
		['side', 1, [unit(1, '李虎')]],
	];
}

function configure() {
	initSkills([
		{
			id: 99001,
			name: '破空掌',
			magic: false,
			rand: 1,
			attack: {},
			final: {},
			sel: { target: TargetSelectEnum.enmey },
		},
	]);
	initBuffs([
		{
			id: 99002,
			name: '休息',
			desc: '',
			status: [],
			tags: [],
			magic: false,
			attackType: 'base',
			attack: {},
			final: {},
			overlap: OverlapEnum.REPLACE,
			lastTurn: 2,
			times: 0,
			event: 'hurt',
		},
	]);
}

// 测试：MUD 复用简报的消息与配色，以武侠叙述展示出招、连招和伤势，不修改输入消息。
test('mud: combat messages become martial prose while retaining actual damage and reaction labels', () => {
	configure();
	const output: string[] = [];
	const mud = new FightMud((line) => output.push(line));
	const messages: fightMsg[] = [
		...initial(),
		['turn', 1],
		['sort', [0, 1]],
		['actor', 0, 100],
		['skill', 99001, 0, 1],
		['hurt', 'skill', 1, 0, 20, 80, []],
		['skill', 99001, 0, 1, 'combo'],
		['hurt', 'skill', 1, 0, 35, 45, []],
		['skill', 99001, 0, 1, 'combo'],
		['hurt', 'skill', 1, 0, 30, 15, []],
		['addBuff', 'skill', 0, 0, 99002, 1, [0, 2]],
		['skipAction', 0, 99002],
	];
	const before = structuredClone(messages);
	mud.onMsg(messages);
	assert.ok(mud instanceof FightReport);
	const text = mud.toString();
	assert.match(text, /张三丰.*\[破空掌\].*李虎/);
	assert.match(text, /【连招】/);
	assert.match(text, /受了轻伤/);
	assert.match(text, /身受重伤/);
	assert.match(text, /气若游丝/);
	assert.match(text, /\[休息\].*未能行动/);
	assert.doesNotMatch(text, /剩余行动顺序|位置 0/);
	assert.match(text, /\[休息\].*施于/);
	assert.ok(output.some((line) => line.includes('\x1b[36m[破空掌]\x1b[0m')));
	assert.ok(output.some((line) => line.includes('\x1b[35m[休息]\x1b[0m')));
	assert.ok(output.some((line) => line.includes('\x1b[31m20\x1b[0m')));
	assert.ok(!text.includes('\x1b['));
	assert.deepEqual(messages, before);
});

// 测试：伤势按消息中的剩余生命比例描述，零血只描述濒死，收到死亡消息才叙述倒地。
test('mud: injury descriptions follow remaining HP and death is never inferred from damage alone', () => {
	const bands = [
		[80, '受了轻伤'],
		[79, '伤势渐重'],
		[50, '伤势渐重'],
		[49, '身受重伤'],
		[20, '身受重伤'],
		[19, '气若游丝'],
		[1, '气若游丝'],
	] as const;
	for (const [hp, description] of bands) {
		const mud = new FightMud(() => {}, false);
		mud.onMsg([...initial(), ['hurt', 'skill', 1, 0, 100 - hp, hp, []]]);
		assert.ok(mud.toString().includes(description));
	}
	const mud = new FightMud(() => {}, false);
	mud.onMsg([...initial(), ['hurt', 'skill', 1, 0, 100, 0, []]]);
	assert.doesNotMatch(mud.toString(), /倒地不起/);
	mud.onMsg(['die', 1]);
	assert.match(mud.toString(), /李虎.*倒地不起/);
});

// 测试：吸血与反震保留真实数值，治疗按上限后的实际恢复量叙述，不夸大零伤害效果。
test('mud: healing uses actual capped recovery and special damage keeps its meaning', () => {
	const mud = new FightMud(() => {}, false);
	mud.onMsg([
		...initial(),
		['hurt', 'skill', 0, 1, 10, 90, []],
		['heal', 'blood', 0, 0, 50, 90, []],
		['hurt', 'dback', 0, 1, 5, 95, []],
		['hurt', 'share', 1, 0, 7, 93, []],
		['hurt', 'reflect', 0, 1, 3, 92, []],
		['hurt', 'skill', 1, 0, 0, 93, []],
	]);
	const text = mud.toString();
	assert.match(text, /吸血.*恢复 10 点生命/);
	assert.doesNotMatch(text, /恢复 50 点生命/);
	assert.match(text, /反震.*5 点/);
	assert.match(text, /分担 7 点/);
	assert.match(text, /反射.*3 点/);
	assert.match(text, /未能伤及/);
});

// 测试：未命中只着色三个字，暴击数字橙色、治疗数字绿色，死亡与复活仍整句着色。
test('mud: prose retains miss, critical, healing, death and revival color conventions', () => {
	configure();
	const output: string[] = [];
	const mud = new FightMud((line) => output.push(line));
	mud.onMsg([
		...initial(),
		['miss', 99001, 0, 1, 'next'],
		['hurt', 'skill', 1, 0, 30, 70, ['crit']],
		['die', 1],
		['relife', 1],
		['heal', 'relife', 1, 0, 20, 0, []],
	]);
	assert.ok(output.some((line) => line.includes('\x1b[34m未命中\x1b[0m')));
	assert.ok(output.some((line) => line.includes('\x1b[38;5;208m30\x1b[0m')));
	assert.ok(output.some((line) => line.includes('\x1b[32m20\x1b[0m')));
	assert.ok(
		output.some(
			(line) =>
				line.startsWith('\x1b[38;5;88m') &&
				line.includes('倒地不起') &&
				line.endsWith('\x1b[0m'),
		),
	);
	assert.ok(
		output.some(
			(line) =>
				line.startsWith('\x1b[92m') &&
				line.includes('重新站起') &&
				line.endsWith('\x1b[0m'),
		),
	);
	assert.match(mud.toString(), /【连击】/);
	assert.ok(!mud.toString().includes('\x1b['));
});

// 测试：逐条与批量消息生成相同文字，空消息不改变输出，新战斗清空历史和旧单位信息。
test('mud: single and batch input agree and start clears prior story and unit names', () => {
	configure();
	const messages: fightMsg[] = [
		...initial(),
		['skill', 99001, 0, 1],
		['hurt', 'skill', 1, 0, 20, 80, []],
	];
	const output: string[] = [];
	const batch = new FightMud((line) => output.push(line), false);
	const single = new FightMud(() => {}, false);
	batch.onMsg(messages);
	for (const msg of messages) single.onMsg(msg);
	assert.equal(batch.toString(), single.toString());
	assert.deepEqual(output, batch.lines);
	const before = batch.toString();
	batch.onMsg([]);
	assert.equal(batch.toString(), before);
	batch.onMsg([
		['start', 99010],
		['die', 1],
		['end', 2],
	]);
	assert.doesNotMatch(batch.toString(), /张三丰|李虎|战斗 #99000/);
	assert.match(batch.toString(), /单位 #1.*倒地不起/);
	assert.match(batch.toString(), /平局/);
});

// 测试：完整反应链的同一份增量消息可复现 MUD 描写，且保留连击、追击、反击、吸血与反震。
test('mud: replaying a complete battle preserves deterministic prose and all reactions', async () => {
	const { messages, client, fight } = await runReactionReport(() => {});
	const mud = new FightMud(() => {}, false),
		replay = new FightMud(() => {}, false);
	const before = structuredClone(messages);
	mud.onMsg(messages);
	for (const msg of messages) replay.onMsg(msg);
	assert.equal(mud.toString(), replay.toString());
	assert.equal(client.checkSame(fight), true);
	assert.deepEqual(messages, before);
	for (const word of ['【连击】', '【追击】', '【反击】', '吸血', '反震', '倒地不起']) {
		assert.ok(mud.toString().includes(word), `缺少 ${word}`);
	}
	assert.doesNotMatch(mud.toString(), /未识别消息/);
});

// 测试：MUD 通过继承的绑定接口实时描写完整战斗，打印示例且不改变消息、战斗结果或随机抽样。
test('mud: live loop binding prints a complete story without changing battle state or random sampling', async () => {
	const live = await runReactionReport((line) => console.log(line), FightMud);
	const baseline = await runReactionReport(() => {});
	assert.ok(live.report instanceof FightMud);
	assert.equal(live.client.checkSame(live.fight), true);
	assert.deepEqual(live.messages, baseline.messages);
	assert.equal(live.fight.result, baseline.fight.result);
	assert.equal(live.fight.turn, baseline.fight.turn);
	assert.equal(live.fight.random(), baseline.fight.random());
	assert.match(live.report.toString(), /凝神|窥见破绽/);
	assert.match(live.report.toString(), /倒地不起/);
	assert.match(live.report.toString(), /攻击方获胜/);
});
