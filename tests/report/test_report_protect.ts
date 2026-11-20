import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { FightReport, FightMud, fightMsg } from '../../src';

function initial(): fightMsg[] {
	const unit = (uid: number, name: string) => ({
		uid,
		pos: uid,
		dead: false,
		display: { name },
		point: { hp: 1000, hpMax: 1000, mp: 100, mpMax: 100 },
		buffs: [] as number[][],
	});
	return [
		['start', 99600],
		['side', 0, [unit(0, '剑客')]],
		['side', 1, [unit(1, '铁卫'), unit(2, '少侠')]],
	];
}
function hits(): fightMsg[] {
	return [
		['hurt', 'share', 1, 0, 50, 30, []],
		['hurt', 'skill', 2, 0, 50, 950, []],
	];
}

// 测试：同次保护伤害合为一句，双方状态先逐条更新，数字各自着色且只给行首人名上色。
test('report protect: combine shared and direct damage after both client updates', () => {
	class Inspect extends FightReport {
		hp(id: number) {
			return this.client.getUnitById(id)?.point.hp;
		}
	}
	const output: string[] = [],
		observed: number[][] = [];
	const report = new Inspect((line) => {
		output.push(line);
		if (line.includes('；对')) observed.push([report.hp(1), report.hp(2)]);
	});
	const messages = [...initial(), ...hits()],
		before = structuredClone(messages);
	report.onMsg(messages);
	const damage = report.lines.filter((line) => line.includes('造成'));
	assert.deepEqual(damage, [
		'剑客（#0） 对 铁卫（#1） 造成 50 点分担伤害，剩余生命 30；对 少侠（#2） 造成 50 点伤害，剩余生命 950',
	]);
	assert.deepEqual(observed, [[30, 950]]);
	const rendered = output.find((line) => line.includes('；对'));
	assert.ok(rendered.startsWith('\x1b[32m剑客（#0）\x1b[0m 对 铁卫（#1）'));
	assert.equal((rendered.match(/\x1b\[31m50\x1b\[0m/g) ?? []).length, 2);
	assert.deepEqual(messages, before);
});

// 测试：保护者分担致死也先展示双方伤害，暴击数字分别为橙色，死亡仍整句暗红。
test('report protect: preserve independent critical colors and death order', () => {
	const output: string[] = [],
		report = new FightReport((line) => output.push(line));
	report.onMsg([
		...initial(),
		['hurt', 'share', 1, 0, 10, 0, []],
		['hurt', 'skill', 2, 0, 50, 950, ['crit']],
		['die', 1],
	]);
	const joint = output.findIndex((line) => line.includes('；对'));
	assert.ok(joint >= 0);
	assert.ok(output[joint].includes('\x1b[31m10\x1b[0m'));
	assert.ok(output[joint].includes('\x1b[38;5;208m50\x1b[0m 点伤害（暴击）'));
	assert.ok(output[joint + 1].startsWith('\x1b[38;5;88m铁卫（#1）死亡'));
});

// 测试：攻击者不同、目标相同、普通反伤或拆批消息不合并，避免错误关联与丢失输出。
test('report protect: ambiguous or fragmented damage stays sequential', () => {
	for (const second of [
		['hurt', 'skill', 2, 2, 50, 950, []],
		['hurt', 'skill', 1, 0, 50, 950, []],
		['hurt', 'dback', 2, 0, 50, 950, []],
	] as fightMsg[]) {
		const report = new FightReport(() => {}, false);
		report.onMsg([...initial(), hits()[0], second]);
		assert.equal(report.lines.filter((line) => line.includes('造成')).length, 2);
	}
	const report = new FightReport(() => {}, false);
	for (const msg of [...initial(), ...hits()]) report.onMsg(msg);
	assert.equal(report.lines.filter((line) => line.includes('造成')).length, 2);
});

// 测试：关闭颜色保留合并纯文本，MUD 的逐消息受伤描写不被简报合并影响。
test('report protect: plain output and mud keep their own formatting', () => {
	const output: string[] = [],
		report = new FightReport((line) => output.push(line), false);
	report.onMsg([...initial(), ...hits()]);
	assert.deepEqual(output, report.lines);
	assert.ok(report.toString().includes('；对'));
	assert.ok(!report.toString().includes('\x1b['));
	const mud = new FightMud(() => {}, false);
	mud.onMsg([...initial(), ...hits()]);
	assert.ok(!mud.toString().includes('；对'));
	assert.match(mud.toString(), /分担 50/);
});
