import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { runTrapReport } from '../fixtures/trap_report';

// 直接运行陷阱示例时输出FightReport的彩色文本，返回的断言文本仍不含颜色码。
test('report trap: prints colored report text while returning plain lines', (t) => {
	const output: string[] = [];
	t.mock.method(console, 'log', (line: string) => output.push(line));
	const lines = runTrapReport(true);
	assert.ok(output.some((line) => line.includes('\x1b[36m[三连斩·一式]\x1b[0m')));
	assert.ok(output.some((line) => line.includes('\x1b[35m[陷阱]\x1b[0m')));
	assert.ok(output.some((line) => line.includes('\x1b[31m50\x1b[0m')));
	assert.ok(lines.every((line) => !line.includes('\x1b[')));
});

// 实战战报先显示物理攻击出手，再显示陷阱触发、伤害与缠绕，原目标不受伤。
test('report trap: shows an attack before a root trap interrupts it', () => {
	console.log('缠绕陷阱：踩中后中断原攻击');
	const lines = runTrapReport(true);
	const start = lines.findIndex((line) => line.includes('使用[三连斩·一式]'));
	const trigger = lines.findIndex((line) => line.includes('[陷阱]触发'));
	const damage = lines.findIndex((line) => line.includes('造成 50 点伤害'));
	const root = lines.findIndex((line) => line.includes('缠绕'));
	assert.ok(start >= 0 && start < trigger && trigger < damage && damage < root);
	assert.equal(lines.some((line) => line.startsWith('剑客（#0） 对 卫士（#1） 造成')), false);
	assert.equal(lines.filter((line) => line.includes('使用[三连斩·一式]')).length, 1);
});

// 实战战报中纯伤害陷阱仍先显示出手与踩中，然后接着显示原攻击伤害。
test('report trap: resumes original damage after a non-root trap', () => {
	console.log('伤害陷阱：踩中后继续原攻击');
	const lines = runTrapReport(false);
	const start = lines.findIndex((line) => line.includes('使用[三连斩·一式]'));
	const trigger = lines.findIndex((line) => line.includes('[陷阱]触发'));
	const damage = lines.findIndex((line) => line.includes('造成 50 点伤害'));
	const original = lines.findIndex((line) => line.startsWith('剑客（#0） 对 卫士（#1） 造成'));
	assert.ok(start >= 0 && start < trigger && trigger < damage && damage < original);
	assert.equal(lines.filter((line) => line.includes('使用[三连斩·一式]')).length, 1);
});
