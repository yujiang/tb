const assert = require('node:assert/strict');
const { test } = require('node:test');
const { ConsoleLineRenderer } = require('../bin-debug/tools/ConsoleLineRenderer');
const microtasks = () => new Promise(resolve => setImmediate(resolve));

// 多行文字和空行按原顺序每200ms各输出一次，flush必须等到最后一行显示才完成。
test('console renderer: drains physical lines one at a time at 200ms intervals', async (t) => {
	t.mock.timers.enable({ apis: ['setTimeout'] });
	const lines = [];
	const renderer = new ConsoleLineRenderer(line => lines.push(line));
	renderer.write('一\r\n\n二');
	let drained = false;
	const flushing = renderer.flush().then(() => { drained = true; });
	await microtasks();
	t.mock.timers.tick(199);
	await microtasks();
	assert.deepEqual(lines, []);
	t.mock.timers.tick(1);
	await microtasks();
	assert.deepEqual(lines, ['一']);
	assert.equal(drained, false);
	t.mock.timers.tick(200);
	await microtasks();
	assert.deepEqual(lines, ['一', '']);
	assert.equal(drained, false);
	t.mock.timers.tick(200);
	await flushing;
	assert.deepEqual(lines, ['一', '', '二']);
	assert.equal(drained, true);
});

// 退出时清除正在等待的定时器和积压文字，flush释放，后续write不能继续输出。
test('console renderer: cancellation releases pending rendering and discards queued lines', async (t) => {
	t.mock.timers.enable({ apis: ['setTimeout'] });
	const lines = [];
	const renderer = new ConsoleLineRenderer(line => lines.push(line));
	renderer.write('未显示\n也不显示');
	await microtasks();
	renderer.cancel();
	await renderer.flush();
	renderer.write('退出后');
	t.mock.timers.tick(1000);
	assert.deepEqual(lines, []);
});

// 零间隔可用于自动化脚本；输出端异常必须从flush传播给宿主，不留下未处理拒绝。
test('console renderer: zero delay is immediate and output errors propagate', async () => {
	const lines = [];
	const immediate = new ConsoleLineRenderer(line => lines.push(line), 0);
	immediate.write('一\n二');
	assert.deepEqual(lines, ['一', '二']);
	await immediate.flush();
	const broken = new ConsoleLineRenderer(() => { throw new Error('输出失败'); }, 1);
	broken.write('失败');
	await assert.rejects(broken.flush(), /输出失败/);
	broken.cancel();
});
