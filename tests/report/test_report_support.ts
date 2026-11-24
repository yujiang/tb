import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { FightReport, FightMud, fightMsg, initSkills, TargetSelectEnum } from '../../src';

const root = 99550,
	aid = 99551,
	next = 99552;
function initial(): fightMsg[] {
	const common = {
		magic: true,
		rand: 1,
		attack: {},
		final: {},
		sel: { target: TargetSelectEnum.enemy },
	};
	initSkills([
		{ ...common, id: root, name: '主攻', nosupport: false },
		{ ...common, id: aid, name: '援手' },
		{ ...common, id: next, name: '连击', nosupport: false },
	]);
	const unit = (uid: number, name: string) => ({
		uid,
		pos: uid,
		dead: false,
		display: { name },
		point: { hp: 1000, hpMax: 1000, mp: 100, mpMax: 100 },
		buffs: [] as number[][],
	});
	return [
		['start', 99550],
		['side', 0, [unit(0, '主攻者'), unit(1, '协战者')]],
		['side', 1, [unit(2, '敌人'), unit(3, '另一敌人')]],
	];
}
function attack(): fightMsg[] {
	return [
		['skill', root, 0, 2],
		['hurt', 'skill', 2, 0, 100, 900, []],
		['heal', 'blood', 0, 0, 10, 1000, []],
		['skill', aid, 1, 2, 'support'],
		['hurt', 'skill', 2, 1, 40, 860, []],
	];
}

// 测试：整批消息把主攻和协战合为同时出手，伤害仍按实际顺序显示，不修改输入或提前更新生命。
test('report support: combine action announcements without changing damage order or client timing', () => {
	class InspectReport extends FightReport {
		hp(id: number) {
			return this.client.getUnitById(id)?.point.hp;
		}
	}
	const output: string[] = [],
		headerHp: number[] = [];
	const report = new InspectReport((line) => {
		output.push(line);
		if (line.includes('同时攻击')) headerHp.push(report.hp(2));
	}, false);
	const messages = [...initial(), ...attack()],
		before = structuredClone(messages);
	report.onMsg(messages);
	const joint = report.lines.findIndex((line) => line.includes('同时攻击'));
	assert.ok(joint >= 0);
	assert.match(report.lines[joint], /【协战】主攻者.*\[主攻\].*协战者.*\[援手\].*同时攻击 敌人/);
	assert.ok(joint < report.lines.findIndex((line) => line.includes('100 点伤害')));
	assert.ok(
		report.lines.findIndex((line) => line.includes('100 点伤害')) <
			report.lines.findIndex((line) => line.includes('40 点伤害')),
	);
	assert.equal(report.lines.filter((line) => line.includes('[援手]')).length, 1);
	assert.deepEqual(headerHp, [1000]);
	assert.equal(report.hp(2), 860);
	assert.deepEqual(messages, before);
	assert.deepEqual(output, report.lines);
});

// 测试：协战发动但未命中仍显示同时出手，未命中在原位置单独显示蓝色，技能颜色保留。
test('report support: a support miss keeps the joint announcement and its own blue result', () => {
	const output: string[] = [];
	const report = new FightReport((line) => output.push(line));
	report.onMsg([
		...initial(),
		['skill', root, 0, 2],
		['hurt', 'skill', 2, 0, 100, 900, []],
		['miss', aid, 1, 2, 'support'],
	]);
	const header = output.find((line) => line.includes('同时攻击'));
	assert.ok(header?.includes('\x1b[36m[主攻]\x1b[0m'));
	assert.ok(header?.includes('\x1b[36m[援手]\x1b[0m'));
	assert.ok(output.some((line) => line.includes('\x1b[34m未命中\x1b[0m')));
	assert.equal(report.lines.filter((line) => line.includes('[援手]')).length, 1);
	assert.ok(!report.toString().includes('\x1b['));
});

// 测试：连击也可关联其紧随的协战，不能把该协战错误合并到前一段主攻击。
test('report support: pair support with its own preceding attack step', () => {
	const report = new FightReport(() => {}, false);
	report.onMsg([
		...initial(),
		['skill', root, 0, 2],
		['hurt', 'skill', 2, 0, 100, 900, []],
		['skill', next, 0, 2, 'next'],
		['hurt', 'skill', 2, 0, 20, 880, []],
		['skill', aid, 1, 2, 'support'],
		['hurt', 'skill', 2, 1, 40, 840, []],
	]);
	const headers = report.lines.filter((line) => line.includes('同时攻击'));
	assert.equal(headers.length, 1);
	assert.match(headers[0], /【连击】.*\[连击\].*\[援手\]/);
	assert.ok(!headers[0].includes('[主攻]'));
});

// 测试：没有实际协战、目标不同、协战者是敌人或跨行动边界时，保持原简报，不猜测同时出手。
test('report support: unmatched or absent support never creates a joint announcement', () => {
	for (const tail of [
		[],
		[['skill', aid, 1, 3, 'support']],
		[['skill', aid, 3, 2, 'support']],
		[
			['actor', 1, 100],
			['skill', aid, 1, 2, 'support'],
		],
	] as fightMsg[][]) {
		const report = new FightReport(() => {}, false);
		report.onMsg([
			...initial(),
			['skill', root, 0, 2],
			['hurt', 'skill', 2, 0, 100, 900, []],
			...tail,
		]);
		assert.ok(!report.toString().includes('同时攻击'));
	}
});

// 测试：拆批时继续逐条输出，不能丢消息或把残留协战关联带入新战斗。
test('report support: fragmented input falls back to sequential output without stale grouping', () => {
	const report = new FightReport(() => {}, false);
	for (const msg of [...initial(), ...attack()]) report.onMsg(msg);
	assert.ok(!report.toString().includes('同时攻击'));
	assert.match(report.toString(), /【协战】协战者.*\[援手\]/);
	report.onMsg([...initial(), ['skill', aid, 1, 2, 'support']]);
	assert.ok(!report.toString().includes('同时攻击'));
});

// 测试：FightMud 的逐消息描写和技能归属继续由自身处理，不被简报的批量合并截断。
test('report support: mud keeps its individual descriptions and causal messages', () => {
	const mud = new FightMud(() => {}, false);
	mud.onMsg([...initial(), ...attack()]);
	assert.match(mud.toString(), /主攻者.*\[主攻\]/);
	assert.match(mud.toString(), /【协战】协战者.*\[援手\]/);
	assert.ok(!mud.toString().includes('同时攻击'));
});
