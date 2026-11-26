const assert = require('node:assert/strict');
const { test } = require('node:test');
const { spawnSync } = require('node:child_process');
const { Readable, Writable, PassThrough } = require('node:stream');
const fs = require('node:fs');
const path = require('node:path');
const tb = require('../bin-debug');
const { runFmud, parseFmudArgs, parseFmudCommand } = require('../bin-debug/tools/fmud');
const root = path.resolve(__dirname, '..');
const cli = path.join(root, 'bin-debug/tools/fmud.js');
// 自动化用例关闭真实延迟；默认200ms节奏由独立回归场景验证。
process.env.FMUD_LINE_MS = '0';
process.env.FMUD_GLOBAL_ID = '13001';
process.env.FMUD_CONST_ID = '14001';
process.env.FMUD_DATA_DIR = path.join(root, 'resource/assets/json');
const childEnv = { ...process.env };

// fmud加载character表，初始角色有专属出场，野狼受伤读自己的编号且保留实际伤害。
test('fmud: character table supplies entry and wolf injury prose', async () => {
	const input = new PassThrough();
	let text = '';
	const output = new Writable({ write(chunk, _encoding, done) {
		const line = chunk.toString(); text += line;
		if (line.endsWith('指令 > ')) input.write('quit\n');
		done();
	} });
	try {
		await runFmud(['12001', '11004', '11002', '--no-color'], input, output);
		assert.match(text, /刀客（#0）反手抽出雁翎刀.*来吧/);
		assert.match(text, /灵狼（#1）受了伤，呜呜.*受到48点伤害/);
		assert.doesNotMatch(text, /\$N|\$w/);
	} finally { input.destroy(); }
});

for (const [globalId, mode] of [['13001', 'pc'], ['13002', 'west']]) {
	// 主人可查看备用列表并召唤，初始宠物不重复列出，新宠次回合能够接收玩家指令。
	test(`fmud: ${mode} summons a reserve pet and accepts its next turn input`, async () => {
		process.env.FMUD_GLOBAL_ID = globalId;
		const input = new PassThrough();
		let text = '', ownerPrompts = 0, prompts = 0;
		const output = new Writable({ write(chunk, _encoding, done) {
			const line = chunk.toString(); text += line;
			if (line.endsWith('指令 > ')) {
				let command = 'd';
				if (line.startsWith('刀客 #0')) command = ['summons', 'summon 9002'][ownerPrompts++] ?? 'd';
				if (line.startsWith('灵狐 #5') || ++prompts > 10) command = 'quit';
				input.write(`${command}\n`);
			}
			done();
		} });
		try {
			await runFmud(['12001', '11004', '11002', '--no-color'], input, output);
			assert.match(text, /备用宠物：9002 灵狐\n/);
			assert.match(text, /刀客（#0）[^\n]*召唤 灵狐（#5）/);
			assert.match(text, /灵狐 #5 指令 >/);
			assert.doesNotMatch(text, /指令未通过|未识别消息/);
		} finally { process.env.FMUD_GLOBAL_ID = '13001'; input.destroy(); }
	});

	// 重复指令按单位保存；首次无记录时继续输入，之后分别重复玩家防御和宠物指定目标普攻。
	test(`fmud: ${mode} repeats each unit's last accepted command with q`, async () => {
		process.env.FMUD_GLOBAL_ID = globalId;
		const input = new PassThrough();
		const commands = ['q', 'd', 'a 2', 'q', 'q', 'quit'];
		let text = '', prompts = 0;
		const output = new Writable({ write(chunk, _encoding, done) {
			const line = chunk.toString(); text += line;
			if (line.endsWith('指令 > ')) input.write(`${commands[prompts++] ?? 'quit'}\n`);
			done();
		} });
		try {
			await runFmud(['12001', '11004', '11002', '--no-color'], input, output);
			assert.equal(prompts, 6);
			assert.match(text, /没有可重复的指令/);
			assert.equal((text.match(/刀客（#0）[^\n]*采取防御姿态/g) ?? []).length, 2);
			assert.equal((text.match(/灵狼（#1）[^\n]*朝山贼刀手（#2）扑去/g) ?? []).length, 2);
		} finally { process.env.FMUD_GLOBAL_ID = '13001'; input.destroy(); }
	});
}

// 玩家和玩家召唤物的提示应带名称及UID，怪物的hintClient保持空实现。
test('fmud: only user and user summon hints render with a speaker', async () => {
	const prototype = tb.FightUnit.prototype;
	const descriptor = Object.getOwnPropertyDescriptor(prototype, 'inputStart');
	const original = prototype.inputStart;
	prototype.inputStart = function(...args) {
		this.hintClient('已死亡，行动跳过');
		return original.apply(this, args);
	};
	const input = new PassThrough();
	let text = '', prompts = 0;
	const output = new Writable({ write(chunk, _encoding, done) {
		const line = chunk.toString();
		text += line;
		if (line.endsWith('指令 > ')) input.write(++prompts <= 2 ? 'd\n' : 'quit\n');
		done();
	} });
	try {
		await runFmud(['12001', '11004', '11002', '--no-color'], input, output);
		assert.match(text, /刀客（#0）已死亡，行动跳过/);
		assert.match(text, /灵狼（#1）已死亡，行动跳过/);
		assert.doesNotMatch(text, /山贼[^\n]*已死亡，行动跳过/);
		assert.doesNotMatch(text, /\n已死亡，行动跳过/);
	} finally {
		if (descriptor) Object.defineProperty(prototype, 'inputStart', descriptor);
		else delete prototype.inputStart;
		input.destroy();
	}
});

// 玩家选择防御后应先显示自己的防御动作，再显示后续单位出手，不能直接跳过文字。
test('fmud: defend renders before the next actor', async () => {
	const input = new PassThrough();
	let text = '', prompts = 0;
	const output = new Writable({ write(chunk, _encoding, done) {
		const line = chunk.toString();
		text += line;
		if (line.endsWith('指令 > ')) input.write(++prompts === 1 ? 'd\n' : 'quit\n');
		done();
	} });
	assert.equal(await runFmud(['12001', '11004', '11002', '--no-color'], input, output), 0);
	const command = text.indexOf('刀客 #0 指令 > ');
	const defend = text.indexOf('刀客（#0）', command);
	const nextActor = text.indexOf('凝神应战，准备出手。', command);
	assert.match(text.slice(command, nextActor), /刀客（#0）[^\n]*防御/);
	assert.ok(defend > command && defend < nextActor);
	input.destroy();
});

// 简报和MUD都识别防御协议，含0号单位，不能输出未识别消息或重复描写。
test('fmud: report and mud describe defense messages', () => {
	for (const Report of [tb.FightReport, tb.FightMud]) {
		const lines = [];
		const report = new Report(line => lines.push(line), false);
		report.onMsg(['side', 0, [{ uid: 0, pos: 0, dead: false, display: { name: '刀客' }, point: { hp: 100, hpMax: 100, mp: 20, mpMax: 20 }, buffs: [] }]]);
		lines.length = 0;
		report.onMsg(['defend', 0]);
		assert.equal(lines.length, 1);
		assert.match(lines[0], /刀客（#0）.*防御/);
	}
});

// 仅FightMud叙述经过200ms队列，启动信息即时输出，战况在一块中完整显示。
test('fmud: delays only mud narration and displays status as a complete block', async () => {
	process.env.FMUD_LINE_MS = '200';
	const chunks = [];
	const started = performance.now();
	const output = new Writable({ write(chunk, _encoding, done) {
		chunks.push({ text: chunk.toString(), ms: performance.now() - started });
		done();
	} });
	const running = runFmud(['12001', '11001', '11002', '--no-color'], Readable.from([]), output);
	try {
		assert.match(chunks[0]?.text ?? '', /^fmud 战斗/, '启动信息应立即显示');
		assert.equal(await running, 0);
		const narration = chunks.find(chunk => chunk.text.startsWith('战斗 #12001 开始'));
		assert.ok(narration.ms >= 180, `MUD叙述仅等待${narration.ms}ms`);
		const state = chunks.find(chunk => chunk.text.includes('战况 第1回合'));
		assert.match(state.text, /攻击方[\s\S]*#0[\s\S]*防守方[\s\S]*行动条：/);
	} finally {
		await running;
		process.env.FMUD_LINE_MS = '0';
	}
});

// 参数和指令保留0号ID/种子；未知指令和客户端试图设置内部字段的输入不能通过文本解析。
test('fmud: parses arguments and commands without allowing internal flags', () => {
	assert.equal(parseFmudArgs(['0', '0', '0', '0']).seed, 0);
	assert.equal(parseFmudArgs(['1', '2', '3', '-2']).seed, -2);
	assert.equal(parseFmudArgs(['--help']), undefined);
	assert.throws(() => parseFmudArgs(['1', '2', '3', '--bad']), /未知选项/);
	assert.throws(() => parseFmudArgs(['1.5', '2', '3']), /安全整数/);
	assert.deepEqual(parseFmudCommand('a 0'), { cmd: tb.FightCmdEnum.attack, target: 0 });
	assert.deepEqual(parseFmudCommand('s 1001 0'), { cmd: tb.FightCmdEnum.skill, skill: 1001, target: 0 });
	assert.deepEqual(parseFmudCommand('p 0'), { cmd: tb.FightCmdEnum.protect, target: 0 });
	assert.deepEqual(parseFmudCommand('dismiss 0'), { cmd: tb.FightCmdEnum.dismiss, target: 0 });
	assert.throws(() => parseFmudCommand('s 1001 0 ignoreCostCD'), /用法/);
	assert.throws(() => parseFmudCommand('{"ignoreCostCD":true}'), /未知指令/);
});

// 两边怪物不读标准输入、不等待绘制，同种子输出一致并正常完成战斗。
test('fmud: monster versus monster completes automatically and deterministically', () => {
	const run = () => spawnSync(process.execPath, [cli, '12001', '11002', '11002', '0', '--no-color'], { cwd: path.dirname(root), env: childEnv, input: '', encoding: 'utf8', timeout: 5000 });
	const first = run(), second = run();
	assert.equal(first.status, 0, first.stderr);
	assert.equal(second.status, 0, second.stderr);
	assert.equal(first.stdout, second.stdout);
	assert.match(first.stdout, /seed=0.*\[自动\]/);
	assert.match(first.stdout, /战斗结束/);
	assert.equal((first.stdout.match(/战况 第\d+回合/g) ?? []).length, (first.stdout.match(/第 \d+ 回合/g) ?? []).length);
	assert.doesNotMatch(first.stdout, /指令 >|绘制完成？|\x1b\[/);
});

// 任一边为玩家时只等待指令，输出动作后直接继续；状态查询和非法指令不消耗行动。
test('fmud: either player side waits only for commands and never confirms drawing', async () => {
	for (const [left, right, target] of [[11001, 11002, 6], [11002, 11001, 0]]) {
		const input = new PassThrough();
		let text = '', prompts = 0;
		const stateCounts = [];
		const output = new Writable({ write(chunk, _encoding, done) {
			const line = chunk.toString();
			text += line;
			if (line.endsWith('指令 > ')) {
				prompts++;
				stateCounts.push((text.match(/战况 第1回合/g) ?? []).length);
				if (prompts === 1) input.write('show\n');
				else if (prompts === 2) input.write('s 999999\n');
				else if (prompts === 3) input.write(`a ${target}\n`);
				else input.write('quit\n');
			} else if (line.startsWith('绘制完成？')) input.write('quit\n');
			done();
		} });
		assert.equal(await runFmud(['12001', String(left), String(right), '0', '--no-color'], input, output), 0);
		assert.equal(prompts, 4);
		assert.deepEqual(stateCounts, [1, 2, 2, 2], '只在回合初及show时显示，重试或换人不重复显示');
		assert.match(text, /战况.*地图5×5/);
		assert.match(text, /HP .*MP .*Buff:/);
		assert.match(text, /行动条：/);
		assert.match(text, /指令未通过/);
		assert.doesNotMatch(text, /绘制完成？|next表示绘制完成|输入回车或next/);
		assert.match(text, /已退出本场战斗/);
		assert.doesNotMatch(text, /结果 -1/);
		input.destroy();
	}
});

// 只允许最多一支玩家队；标准输入关闭也应退出，未知配置和表ID返回非零退出码。
test('fmud: rejects two user sides and handles EOF and bad configuration', async () => {
	let text = '';
	const output = new Writable({ write(chunk, _encoding, done) { text += chunk; done(); } });
	assert.equal(await runFmud(['12001', '11001', '11002', '--no-color'], Readable.from([]), output), 0);
	assert.match(text, /已退出本场战斗/);
	for (const [args, pattern] of [
		[['12001', '11001', '11003'], /最多允许一边/],
		[['999999', '11001', '11002'], /未知fight/],
		[['12001', '999999', '11002'], /未知side/],
		[['12001', '11001', '11002', '--env', 'missing-fmud.env'], /配置不存在/],
	]) {
		const result = spawnSync(process.execPath, [cli, ...args], { env: childEnv, encoding: 'utf8', input: '', timeout: 5000 });
		assert.equal(result.status, 1);
		assert.match(result.stderr, pattern);
	}
});

// .env选择fight_global和常量，JSON目录相对.env解析，配置的回合上限在整轮后生效。
test('fmud: env selects global and constant presets from a custom table directory', (t) => {
	const parent = path.join(root, '.test-build');
	fs.mkdirSync(parent, { recursive: true });
	const folder = fs.mkdtempSync(path.join(parent, 'fmud-config-'));
	t.after(() => { assert.ok(folder.startsWith(parent + path.sep)); fs.rmSync(folder, { recursive: true, force: true }); });
	const data = path.join(folder, 'data');
	fs.cpSync(path.join(root, 'resource/assets/json'), data, { recursive: true });
	const global = JSON.parse(fs.readFileSync(path.join(data, 'fight_global_xls.json'), 'utf8'));
	global[13002].maxTurn = 1;
	fs.writeFileSync(path.join(data, 'fight_global_xls.json'), JSON.stringify(global));
	const env = path.join(folder, '.env');
	fs.writeFileSync(env, 'FMUD_GLOBAL_ID=13002\nFMUD_CONST_ID=14002\nFMUD_DATA_DIR=data\n');
	const envFromFile = { ...childEnv };
	for (const key of ['FMUD_GLOBAL_ID', 'FMUD_CONST_ID', 'FMUD_DATA_DIR']) delete envFromFile[key];
	const result = spawnSync(process.execPath, [cli, '12001', '11002', '11002', '--env', env, '--no-color'], { env: envFromFile, encoding: 'utf8', input: '', timeout: 5000 });
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /global=13002 const=14002/);
	assert.match(result.stdout, /loopType=west/);
	assert.match(result.stdout, /第 1 回合/);
	assert.doesNotMatch(result.stdout, /第 2 回合/);
});

// 西游模式先收齐玩家和宠物的指令，之后才统一出手；下一轮可正常退出。
test('fmud: west collects the whole user side before resolving defense actions', async () => {
	process.env.FMUD_GLOBAL_ID = '13002';
	const input = new PassThrough();
	let text = '', prompts = 0;
	const defensesBeforeInput = [];
	const output = new Writable({ write(chunk, _encoding, done) {
		const line = chunk.toString(); text += line;
		if (line.endsWith('指令 > ')) {
			defensesBeforeInput.push((text.match(/采取防御姿态/g) ?? []).length);
			input.write(++prompts <= 2 ? 'd\n' : 'quit\n');
		}
		done();
	} });
	try {
		await runFmud(['12001', '11004', '11002', '--no-color'], input, output);
		assert.match(text, /loopType=west/);
		assert.deepEqual(defensesBeforeInput, [0, 0, 2]);
	} finally { process.env.FMUD_GLOBAL_ID = '13001'; input.destroy(); }
});

// 烟雨模式不等逐单位输入，自动普攻过程中可提交带单位UID的即时技能，退出不会遗留等待。
test('fmud: yanyu accepts realtime skills without a PC input turn', async () => {
	process.env.FMUD_GLOBAL_ID = '13003';
	const input = new PassThrough();
	let text = '', prompts = 0;
	const output = new Writable({ write(chunk, _encoding, done) {
		const line = chunk.toString(); text += line;
		if (line.startsWith('烟雨即时指令')) {
			input.write(['0 s 1001 2\n', '0 q\n', 'quit\n'][prompts++]);
		}
		done();
	} });
	try {
		await runFmud(['12001', '11004', '11002', '--no-color'], input, output);
		assert.match(text, /loopType=yanyu/);
		assert.equal(prompts, 3);
		assert.equal((text.match(/刀客（#0）[^\n]*使出\[斩击\][^\n]*山贼刀手（#2）/g) ?? []).length, 2);
		assert.doesNotMatch(text, /即时技能未被接受|刀客 #0 指令 >/);
		assert.match(text, /已退出本场战斗/);
	} finally { process.env.FMUD_GLOBAL_ID = '13001'; input.destroy(); }
});
