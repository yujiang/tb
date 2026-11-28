import '../fixtures/default_skills';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { FightMud, FightMudTables, fightMsg, initPassives } from '../../src';

const ids = { wugong: 10019801, neigong: 10019802, qinggong: 10019803 };
function setup() {
	initPassives(
		Object.entries(ids).map(([kind, id]) => ({
			id,
			name: kind === 'wugong' ? '回风剑意' : kind === 'neigong' ? '护体真气' : '掠水步',
			desc: '',
			magic: false,
			attackType: 'base',
			attack: {},
			final: {},
			status: [] as string[],
			tags: [] as string[],
			action:
				kind === 'wugong'
					? '$N晃动$w，施展{技能}，架住了$n的来势。'
					: kind === 'neigong'
						? '$N运起{技能}，卸去{减伤}点伤害。'
						: ['$N以{技能}蜻蜓点水般滑开。', '$N以{技能}轻轻一转，让过来势。'],
		})),
	);
	const unit = (uid: number) => ({
		uid,
		pos: uid,
		dead: false,
		display: { name: uid ? '剑客' : '来敌', character: uid, weaponName: '青钢剑', ...ids },
		point: { hp: 100, hpMax: 100, mp: 0, mpMax: 0 },
		buffs: [] as number[][],
	});
	const messages: fightMsg[] = [
		['start', 1],
		['side', 0, [unit(0)]],
		['side', 1, [unit(1)]],
	];
	return messages;
}

// 闪避用轻功、格挡用武功，分别读取被动action，并正确替换被动名、本人和实际兵器。
test('passive render: miss uses qinggong and block uses wugong actions', () => {
	const messages = setup();
	const mud = new FightMud(() => {}, false);
	mud.onMsg([...messages, ['miss', 0, 0, 1], ['block', 1, 0], ['miss', 0, 0, 1]]);
	assert.match(mud.toString(), /剑客（#1）以\[掠水步\]蜻蜓点水般滑开/);
	assert.match(mud.toString(), /剑客（#1）晃动青钢剑，施展\[回风剑意\]，架住了来敌（#0）的来势/);
	assert.match(mud.toString(), /轻轻一转，让过来势/);
});

// character专属优先于被动，未知被动或空白action回退通用，不改变原始消息或表。
test('passive render: character overrides passive and missing actions use generic prose', () => {
	const messages = setup();
	const tables: FightMudTables = {
		xlsCharacter: {
			1: { id: 1, 未命中文本: '$N专属闪避，{未命中}。', 格挡文本: '$N专属格挡。' },
		},
	};
	const before = structuredClone(messages);
	const mud = new FightMud(() => {}, false, tables);
	mud.onMsg([...messages, ['miss', 0, 0, 1], ['block', 1, 0]]);
	assert.match(mud.toString(), /专属闪避/);
	assert.match(mud.toString(), /专属格挡/);
	assert.doesNotMatch(mud.toString(), /掠水步|回风剑意/);
	assert.deepEqual(messages, before);
	messages[2][2][0].display.qinggong = 999999;
	const fallback = new FightMud(() => {}, false);
	fallback.onMsg([...messages, ['miss', 0, 0, 1]]);
	assert.match(fallback.toString(), /未命中/);
});

// 内功与随后实际扣血合并一行，实际伤害使用hurt而不是减伤后的理论值。
test('passive render: mitigation and actual damage share a line', () => {
	const messages = setup();
	const mud = new FightMud(() => {}, false);
	mud.onMsg([...messages, ['mitigate', 1, 0, 68, 22], ['hurt', 'skill', 1, 0, 12, 0, []]]);
	const line = mud.lines.find((line) => line.includes('卸去46点伤害'));
	assert.ok(line.includes('受到了12点伤害。'), line);
	assert.equal(mud.lines.filter((line) => line.includes('12点伤害')).length, 1);
});

// 完全免伤仍显示零伤害；取消受伤或拆批消息保持独立文案，不吞掉后续伤害。
test('passive render: zero damage and unpaired mitigation retain their results', () => {
	const mud = new FightMud(() => {}, false);
	mud.onMsg([...setup(), ['mitigate', 1, 0, 68, 0], ['hurt', 'skill', 1, 0, 0, 100, []]]);
	assert.match(mud.toString(), /卸去68点伤害。剑客受到了0点伤害。/);
	mud.onMsg(['mitigate', 1, 0, 68, 22]);
	mud.onMsg(['hurt', 'skill', 1, 0, 22, 78, []]);
	assert.match(mud.lines[mud.lines.length - 1], /22/);
	assert.equal(mud.lines.filter((line) => line.includes('卸去46点伤害')).length, 1);
});

// 减伤通知通过单位表现入口调用内功action，保留实际减伤数值；不从剩余生命猜测内功触发。
test('passive render: mitigation uses neigong only when notified', () => {
	const messages = setup(),
		output: string[] = [];
	const mud = new FightMud((line) => output.push(line), true);
	mud.onMsg([...messages, ['mitigate', 1, 0, 100, 40], ['hurt', 'skill', 1, 0, 40, 60, []]]);
	assert.match(mud.toString(), /剑客（#1）运起\[护体真气\]，卸去60点伤害/);
	assert.ok(output.some((line) => line.includes('\x1b[36m[护体真气]\x1b[0m')));
	const other = new FightMud(() => {}, false);
	other.onMsg([...messages, ['hurt', 'skill', 1, 0, 40, 60, []]]);
	assert.doesNotMatch(other.toString(), /护体真气/);
});
