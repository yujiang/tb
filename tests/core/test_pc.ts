import { setFightGlobalData } from '../../src/fight/Fight';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
	BaseAttack,
	Fight,
	FightAttr,
	FightClient,
	FightCmdEnum,
	FightLoopPC,
	FightResultEnum,
	FightSide,
	FightUnitUser,
	FightUnitMonster,
	FightUnitSummon,
	FightInput,
	TargetSelectEnum,
	initSkills,
	initFightContex,
	fightMsg,
	FightLoop,
	BuffTurnEnum,
	OverlapEnum,
	initBuffs,
} from '../../src';

const skillId = 1001050;
function attributes(speed: number): FightAttr {
	const base = (attack = 10, rand = 0): BaseAttack => ({
		attack,
		rand,
		hit: 100,
		dodge: 0,
		defend: 0,
		hurt: 0,
		hurtP: 0,
		hurtAnti: 0,
		hurtPAnti: 0,
		critP: 0,
		critPAnit: 0,
		critDeep: 0,
		critDeepAnit: 0,
	});
	const attr = new FightAttr();
	attr.speed = speed;
	attr.point = { hp: 1000, hpMax: 1000, mp: 100, mpMax: 100 };
	const group = () => ({
		base: base(10, 1),
		next: base(),
		kill: base(),
		spread: base(),
		fback: base(),
		final: { bloodP: 0, dbackP: 0, immunity: 0, immunityP: 0 },
	});
	attr.physic = group();
	attr.magic = group();
	attr.heal = base();
	attr.poison = base();
	return attr;
}
function setup(summon = false) {
	initSkills([
		{
			id: skillId,
			name: '单机技能',
			magic: true,
			rand: 1,
			attack: { attack: 40 },
			final: {},
			cost: { mp: 10 },
			cd: 2,
			nofback: true,
			nodback: true,
			nosupport: true,
			sel: { target: TargetSelectEnum.enemy },
		},
	]);
	const a = new FightUnitUser(0, attributes(200), { name: '甲' });
	const b = summon
		? new FightUnitSummon(1, attributes(100), { name: '乙' })
		: new FightUnitUser(1, attributes(100), { name: '乙' });
	const c = new FightUnitMonster(2, attributes(150), { name: '丙' });
	const d = new FightUnitMonster(3, attributes(50), { name: '丁' });
	setFightGlobalData({
		protectBuff: undefined,
		allShieldBreak: false,
		maxTurn: 1,
		waitInputSec: 0.001,
		duiwei: false,
		attackDie: false,
	});
	const fight = new Fight(
		1001050,
		{ runaway: false, runawayGrade: 0, deathPenalty: 0, winRecover: 0, winReward: 0 },
		0,
	);
	const left = new FightSide(),
		right = new FightSide();
	left.units.push(a, b);
	right.units.push(c, d);
	fight.createSide(left, right);
	[a, b, c, d].forEach((unit) => unit.setPos(unit.uid));
	a.addSkill(skillId, 1);
	b.addSkill(skillId, 1);
	c.addSkill(skillId, 1);
	c.inputSkill = skillId;
	const loop = new FightLoopPC(fight),
		client = new FightClient(),
		messages: fightMsg[] = [];
	loop.onMsg((msgs) => {
		const wire = JSON.parse(JSON.stringify(msgs)) as fightMsg | fightMsg[];
		const batch = typeof wire[0] === 'string' ? [wire as fightMsg] : (wire as fightMsg[]);
		messages.push(...batch);
		client.onMsg(wire);
		if (client.sides[0].length && client.sides[1].length) assert.ok(client.checkSame(fight));
	});
	const prepare = () => {
		loop.start();
		[a, b, c, d].forEach((unit) => (unit.speedRand = 0));
		loop.nextTurn();
	};
	return { fight, loop, client, messages, a, b, c, d, prepare };
}

// 测试：单机循环初始化客户端并按速度逐个请求玩家输入，NPC 自动使用原 AI，整轮行动与动画各一次。
test("pc: request each player's input at its speed slot and run NPC AI automatically", async () => {
	const s = setup(),
		requests: number[] = [];
	let animations = 0;
	s.loop.on('input', (unit) => {
		requests.push(unit.uid);
		s.loop.onInput(unit.uid, { cmd: FightCmdEnum.attack, target: s.c.uid });
	});
	s.loop.waitDrawOver = async () => {
		animations++;
	};
	const result = await s.loop.run();
	assert.equal(result, FightResultEnum.outoftime);
	assert.equal(s.fight.turn, 1);
	assert.deepEqual(requests, [0, 1]);
	assert.deepEqual(
		s.messages.filter((msg) => msg[0] === 'actor').map((msg) => msg[1]),
		[0, 2, 1, 3],
	);
	assert.ok(s.messages.some((msg) => msg[0] === 'skill' && msg[1] === skillId && msg[2] === 2));
	assert.equal(animations, 4);
	assert.equal(s.a.myInputTurn, 1);
	assert.equal(s.b.myInputTurn, 1);
	assert.equal(s.c.myInputTurn, 1);
	assert.ok(s.client.checkSame(s.fight));
});

// 测试：只接受当前玩家合法指令，无效目标、错误单位和回合不关闭输入，取消仍等待，提交保存副本。
test('pc: invalid and cancelled inputs preserve the current input window', async () => {
	const s = setup();
	s.prepare();
	let requests = 0;
	s.loop.on('input', (unit) => {
		requests++;
		assert.equal(s.loop.onInput(s.c.uid, { cmd: FightCmdEnum.attack }), false);
		assert.equal(s.loop.onInput(unit.uid, { cmd: FightCmdEnum.attack, turn: 99 }), false);
		assert.equal(
			s.loop.onInput(unit.uid, { cmd: FightCmdEnum.skill, skill: skillId, target: unit.uid }),
			false,
		);
		assert.equal(s.loop.onInput(unit.uid, { cmd: FightCmdEnum.cancel }), true);
		const input: FightInput = { cmd: FightCmdEnum.skill, skill: skillId, target: s.c.uid };
		assert.equal(s.loop.onInput(unit.uid, input), true);
		input.target = unit.uid;
		input.skill = 123456;
		assert.equal(s.loop.onInput(unit.uid, { cmd: FightCmdEnum.attack }), false);
	});
	await s.loop.processOneTurn(1);
	assert.equal(requests, 2);
	assert.equal(s.a.attr.point.mp, 90);
	assert.equal(s.b.attr.point.mp, 90);
	assert.equal(s.loop.onInput(s.a.uid, { cmd: FightCmdEnum.attack }), false);
	assert.ok(s.client.checkSame(s.fight));
	s.loop.end();
});

// 测试：输入不计真实时间超时，动画等待期间拒绝抢先输入下一单位，结束可释放尚在等待的玩家。
test('pc: input waits indefinitely and ending releases the waiting actor', async () => {
	const s = setup();
	s.prepare();
	let requested = false;
	s.loop.on('input', () => {
		requested = true;
	});
	const running = s.loop.processOneTurn(1);
	await new Promise((resolve) => setTimeout(resolve, 10));
	assert.equal(requested, true);
	assert.equal(s.messages.filter((msg) => msg[0] === 'hurt').length, 0);
	s.loop.end();
	await running;
	assert.equal(s.loop.onInput(s.a.uid, { cmd: FightCmdEnum.attack }), false);
});

// 测试：宿主在完整 run 的输入等待期间结束循环时，不继续空跑后续全局回合，也不重复发送结束消息。
test('pc: ending a full run while waiting stops later global rounds', async () => {
	const s = setup();
	setFightGlobalData({ maxTurn: 100 });
	s.loop.on('input', () => s.loop.end());
	assert.equal(await s.loop.run(), FightResultEnum.ongoing);
	assert.equal(s.fight.turn, 1);
	assert.equal(s.messages.filter((msg) => msg[0] === 'end').length, 1);
	assert.equal(s.messages.filter((msg) => msg[0] === 'turn').length, 1);
});

// 测试：每轮全局边界通过公共方法处理盾恢复，回盾发生在任何单位输入和行动之前。
test('pc: global before-turn processing restores broken shields before unit inputs', () => {
	const s = setup();
	s.c.attrOri.shield = 2;
	s.c.calcAttr();
	s.prepare();
	s.c.attr.shield = 0;
	s.client.onMsg(['shield', s.c.uid, 0]);
	const ctx = initFightContex(s.fight),
		commonLoop: FightLoop = s.loop;
	commonLoop.processBeforeTurn(1, ctx);
	s.loop.bcMsg(ctx.msgs);
	assert.equal(s.c.attr.shield, 2);
	assert.deepEqual(ctx.msgs, [['shield', 2, 2, 'recover']]);
	assert.ok(s.client.checkSame(s.fight));
	s.loop.end();
});

// 测试：费用或 CD 不满足时留在当前玩家输入窗口，提示原因后可改为普攻，不占用下一人的机会。
test('pc: resource and cooldown rejection keep the same actor waiting', async () => {
	const s = setup();
	s.prepare();
	const hints: string[] = [];
	s.a.hintClient = (msg) => hints.push(msg);
	s.loop.on('input', (unit) => {
		assert.equal(s.loop.inputUnit, unit);
		if (unit === s.a) {
			const data = unit.findSkill(skillId).getXls();
			data.cost = { mp: 101 };
			assert.equal(
				s.loop.onInput(unit.uid, { cmd: FightCmdEnum.skill, skill: skillId }),
				false,
			);
			assert.equal(s.loop.inputUnit, unit);
			assert.equal(unit.attr.point.mp, 100);
			data.cost = { mp: 10 };
			const ctx = initFightContex(s.fight);
			unit.startSkillCd(unit.findSkill(skillId), ctx);
			s.loop.bcMsg(ctx.msgs);
			assert.equal(
				s.loop.onInput(unit.uid, { cmd: FightCmdEnum.skill, skill: skillId }),
				false,
			);
			assert.equal(s.loop.inputUnit, unit);
		}
		assert.equal(s.loop.onInput(unit.uid, { cmd: FightCmdEnum.attack, target: s.c.uid }), true);
	});
	await s.loop.processOneTurn(1);
	assert.deepEqual(hints, ['法力不足，无法支付技能消耗', '[单机技能]冷却中，还需 2 回合']);
	assert.equal(s.loop.inputUnit, undefined);
	s.loop.end();
});

// 测试：动作完成后的动画期间不接受下一单位输入，动画结束才依次开放，回合末不额外等待动画。
test("pc: animation completion gates the next player's input", async () => {
	const s = setup();
	s.prepare();
	const requests: number[] = [];
	let release: () => void, entered: () => void;
	const gate = new Promise<void>((resolve) => (release = resolve));
	const firstDraw = new Promise<void>((resolve) => (entered = resolve));
	let drawings = 0;
	s.loop.on('input', (unit) => {
		requests.push(unit.uid);
		s.loop.onInput(unit.uid, { cmd: FightCmdEnum.attack });
	});
	s.loop.waitDrawOver = async () => {
		if (++drawings === 1) {
			entered();
			await gate;
		}
	};
	const running = s.loop.processOneTurn(1);
	await firstDraw;
	assert.deepEqual(requests, [0]);
	assert.equal(s.loop.inputUnit, undefined);
	assert.equal(s.loop.onInput(s.b.uid, { cmd: FightCmdEnum.attack }), false);
	release();
	await running;
	assert.deepEqual(requests, [0, 1]);
	assert.equal(drawings, 4);
	s.loop.end();
});

// 测试：当前单位已从待行动队列取出，速度变化只重排剩余单位，输入期间的当前行动者不会再次入队。
test('pc: speed changes reorder remaining slots without duplicating the waiting actor', async () => {
	const s = setup();
	s.prepare();
	s.loop.on('input', (unit) => {
		if (unit === s.a) {
			s.a.attr.speed = 1;
			s.a.emit('speed', 1);
			s.b.attr.speed = 300;
			s.b.emit('speed', 300);
			// 输入期间保持原行动条，本次完整动作结束后才统一重排。
			assert.deepEqual(s.client.sort, [2, 1, 3]);
		}
		s.loop.onInput(unit.uid, { cmd: FightCmdEnum.attack });
	});
	await s.loop.processOneTurn(1);
	assert.deepEqual(
		s.messages.filter((msg) => msg[0] === 'actor').map((msg) => msg[1]),
		[0, 1, 2, 3],
	);
	assert.equal(s.a.myInputTurn, 1);
	s.loop.end();
});

// 测试：死亡单位轮到前若已复活仍获得一次输入机会，复活技能沿用公共技能流程。
test('pc: a dead ally revived before its slot receives its normal input opportunity', async () => {
	const s = setup(),
		initial = initFightContex(s.fight);
	s.b.onHurt(s.c, 'test', 1000, initial);
	initSkills([
		{
			id: 1001051,
			name: '单机复活',
			magic: true,
			rand: 1,
			attack: {},
			final: {},
			func: 'relife',
			healRate: 0.5,
			sel: { target: TargetSelectEnum.friend },
		},
	]);
	s.a.addSkill(1001051, 1);
	s.prepare();
	const requested: number[] = [];
	s.loop.on('input', (unit) => {
		requested.push(unit.uid);
		s.loop.onInput(
			unit.uid,
			unit === s.a
				? { cmd: FightCmdEnum.skill, skill: 1001051, target: s.b.uid }
				: { cmd: FightCmdEnum.attack, target: s.c.uid },
		);
	});
	await s.loop.processOneTurn(1);
	assert.deepEqual(requested, [0, 1]);
	assert.equal(s.b.myInputTurn, 1);
	assert.equal(s.b.isDied(), false);
	assert.ok(s.messages.some((msg) => msg[0] === 'relife' && msg[1] === 1));
	s.loop.end();
});

// 测试：死亡和休息中的单位直接跳过输入，不把未到达输入阶段的死亡单位计作一次输入。
test('pc: dead and resting units do not open player input', async () => {
	const s = setup();
	initBuffs([
		{
			id: 1001052,
			name: '休息',
			desc: '',
			class: 'rest',
			magic: false,
			attackType: 'base',
			attack: {},
			final: {},
			status: [],
			tags: [],
			overlap: OverlapEnum.REPLACE,
			turnType: BuffTurnEnum.afterTurn,
			lastTurn: 1,
			times: 0,
			event: 'hurt',
		},
	]);
	const initial = initFightContex(s.fight);
	s.a.addBuff(s.a, 'test', 1001052, 1, initial);
	s.b.onHurt(s.c, 'test', 1000, initial);
	s.prepare();
	let requests = 0;
	s.loop.on('input', () => {
		requests++;
	});
	await s.loop.processOneTurn(1);
	assert.equal(requests, 0);
	assert.equal(s.b.myInputTurn, 0);
	assert.equal(s.a.myInputTurn, 1);
	assert.ok(s.messages.some((msg) => msg[0] === 'skipAction' && msg[1] === s.a.uid));
	s.loop.end();
});

// 测试：完整动作结束判胜后不再请求后续玩家输入，后续单位也不会继续攻击。
test('pc: victory stops remaining input requests and automatic actions', async () => {
	const s = setup();
	s.a.attrOri.physic.base.attack = 2000;
	s.a.calcAttr();
	s.d.onHurt(s.a, 'test', 1000, initFightContex(s.fight));
	const requests: number[] = [];
	s.loop.on('input', (unit) => {
		requests.push(unit.uid);
		s.loop.onInput(unit.uid, { cmd: FightCmdEnum.attack, target: s.c.uid });
	});
	assert.equal(await s.loop.run(), FightResultEnum.attack);
	assert.deepEqual(requests, [0]);
	assert.deepEqual(
		s.messages.filter((msg) => msg[0] === 'actor').map((msg) => msg[1]),
		[0],
	);
	assert.equal(s.b.myInputTurn, 0);
	assert.ok(s.client.checkSame(s.fight));
});

// 测试：输入回调抛错应记录错误、判攻击方失败并关闭窗口，不能继续提交指令。
test('pc: input callback errors end the fight and close the input window', async (t) => {
	const logged = t.mock.method(console, 'error', () => {});
	const s = setup();
	s.prepare();
	s.loop.on('input', () => {
		throw new Error('input failure');
	});
	await s.loop.processOneTurn(1);
	assert.equal(s.fight.result, FightResultEnum.defend);
	assert.equal(logged.mock.callCount(), 1);
	assert.equal(s.loop.inputUnit, undefined);
	assert.equal(s.loop.onInput(s.a.uid, { cmd: FightCmdEnum.attack }), false);
	s.loop.end();
});

// 测试：输入回调提交成功后再抛错也必须判负并记录，不能被已完成的输入 Promise 吞掉。
test('pc: errors after synchronous input submission end the fight', async (t) => {
	const logged = t.mock.method(console, 'error', () => {});
	const s = setup();
	s.prepare();
	s.loop.on('input', (unit) => {
		s.loop.onInput(unit.uid, { cmd: FightCmdEnum.attack });
		throw new Error('after input failure');
	});
	await s.loop.processOneTurn(1);
	assert.equal(s.fight.result, FightResultEnum.defend);
	assert.equal(logged.mock.callCount(), 1);
	assert.equal(s.loop.inputUnit, undefined);
	s.loop.end();
});

// 测试：单位输入次数 Buff 致死时，先等待死亡动画，再继续后续单位，不为死者请求输入。
test('pc: input-boundary death effects finish drawing before the next actor', async () => {
	const s = setup();
	initSkills([
		{
			id: 1001053,
			name: '致命毒',
			magic: true,
			rand: 1,
			attack: { attack: 2000 },
			final: {},
			sel: { target: TargetSelectEnum.enemy },
		},
	]);
	initBuffs([
		{
			id: 1001054,
			name: '输入毒',
			desc: '',
			func: 'poison',
			skill: 1001053,
			skillLevel: 1,
			magic: true,
			attackType: 'base',
			attack: {},
			final: {},
			status: [],
			tags: [],
			overlap: OverlapEnum.REPLACE,
			turnType: BuffTurnEnum.inputTurn,
			lastTurn: 1,
			times: 0,
			event: 'hurt',
		},
	]);
	s.a.addBuff(s.c, 'test', 1001054, 1, initFightContex(s.fight));
	s.prepare();
	const requested: number[] = [];
	let deathDrawBeforeNextActor = false;
	s.loop.on('input', (unit) => {
		requested.push(unit.uid);
		s.loop.onInput(unit.uid, { cmd: FightCmdEnum.attack });
	});
	s.loop.waitDrawOver = async () => {
		if (s.a.isDied() && !s.messages.some((msg) => msg[0] === 'actor' && msg[1] === s.c.uid))
			deathDrawBeforeNextActor = true;
	};
	await s.loop.processOneTurn(1);
	assert.deepEqual(requested, [1]);
	assert.equal(deathDrawBeforeNextActor, true);
	s.loop.end();
});

// 测试：玩家召唤物同样在自己的速度位置请求输入，不被当作 NPC 自动行动。
test('pc: controlled summons receive their own input slot', async () => {
	const s = setup(true);
	s.prepare();
	const requests: number[] = [];
	s.loop.on('input', (unit) => {
		requests.push(unit.uid);
		s.loop.onInput(unit.uid, { cmd: FightCmdEnum.attack });
	});
	await s.loop.processOneTurn(1);
	assert.deepEqual(requests, [0, 1]);
	s.loop.end();
});

// 测试：等待输入的玩家死亡时释放等待并继续后续单位，不会永远卡在已死亡者的输入窗口。
test("pc: death while awaiting input closes that actor's window", async () => {
	const s = setup();
	s.prepare();
	const requests: number[] = [];
	s.loop.on('input', (unit) => {
		requests.push(unit.uid);
		if (unit === s.a) {
			const ctx = initFightContex(s.fight);
			s.fight.resolveAction(() => unit.onHurt(s.c, 'test', 1000, ctx));
			s.loop.bcMsg(ctx.msgs);
			assert.equal(s.loop.inputUnit, undefined);
		} else s.loop.onInput(unit.uid, { cmd: FightCmdEnum.attack });
	});
	await s.loop.processOneTurn(1);
	assert.deepEqual(requests, [0, 1]);
	assert.equal(s.a.isDied(), true);
	assert.ok(!s.messages.some((msg) => msg[0] === 'skill' && msg[2] === s.a.uid));
	s.loop.end();
});

// 测试：输入回调中重入执行请求复用同一个调度 Promise，不重复出手或重复推进输入次数。
test('pc: reentrant processing shares the running turn', async () => {
	const s = setup();
	s.prepare();
	const nested: Promise<void>[] = [];
	s.loop.on('input', (unit) => {
		nested.push(s.loop.processOneTurn(1));
		s.loop.onInput(unit.uid, { cmd: FightCmdEnum.attack });
	});
	const running = s.loop.processOneTurn(1);
	await running;
	assert.equal(nested.length, 2);
	assert.ok(nested.every((promise) => promise === running));
	assert.equal(s.messages.filter((msg) => msg[0] === 'actor').length, 4);
	assert.equal(s.a.myInputTurn, 1);
	s.loop.end();
});

// 测试：PC 普攻和默认普攻输入拒绝尸体并保持窗口，公共网游守尸校验仍允许该目标。
test('pc: reject dead attack targets immediately without changing online corpse guarding', async () => {
	const s = setup(),
		hints: string[] = [];
	s.a.hintClient = (msg) => hints.push(msg);
	s.c.onHurt(s.a, 'test', 1000, initFightContex(s.fight));
	s.prepare();
	s.loop.on('input', (unit) => {
		if (unit === s.a) {
			for (const cmd of [FightCmdEnum.attack, FightCmdEnum.none]) {
				const input = { cmd, target: s.c.uid };
				assert.equal(s.fight.validateInput(unit, input), true);
				assert.equal(s.loop.onInput(unit.uid, input), false);
				assert.equal(s.loop.inputUnit, unit);
			}
		}
		s.loop.onInput(unit.uid, { cmd: FightCmdEnum.attack, target: s.d.uid });
	});
	await s.loop.processOneTurn(1);
	assert.deepEqual(hints, ['目标已死亡', '目标已死亡']);
	s.loop.end();
});

// 测试：自动复活没有死亡队友可选时，输入被拒绝，不抽随机数、不扣费、不启动冷却。
test('pc: missing automatic skill targets keep the actor waiting without random draws', async () => {
	const s = setup();
	initSkills([
		{
			id: 1001060,
			name: '严格复活',
			magic: true,
			rand: 1,
			func: 'relife',
			attack: {},
			final: {},
			cost: { mp: 10 },
			cd: 2,
			sel: { target: TargetSelectEnum.friend },
		},
	]);
	s.a.addSkill(1001060, 1);
	s.prepare();
	let samples = 0;
	s.fight.random = () => {
		samples++;
		return 0.5;
	};
	s.loop.on('input', (unit) => {
		if (unit === s.a) {
			assert.equal(
				s.loop.onInput(unit.uid, { cmd: FightCmdEnum.skill, skill: 1001060 }),
				false,
			);
			assert.equal(samples, 0);
			assert.equal(s.loop.inputUnit, unit);
			assert.equal(unit.attr.point.mp, 100);
			assert.equal(unit.getSkillCd(1001060), 0);
		}
		s.loop.onInput(unit.uid, { cmd: FightCmdEnum.attack, target: s.c.uid });
	});
	await s.loop.processOneTurn(1);
	s.loop.end();
});

for (const [func, status, hint] of [
	['heal', '禁疗', '目标无法接受治疗'],
	['poison', '禁毒', '目标无法中毒'],
	['relife', '禁复活', '目标无法复活'],
] as const) {
	// 测试：目标禁疗、禁毒或禁复活时严格拒绝即时输入，留在原窗口且不消耗资源和冷却。
	test(`pc: target ${status} rejects ${func} before accepting input`, async () => {
		const s = setup(),
			target = func === 'poison' ? s.c : s.b;
		initSkills([
			{
				id: 1001061,
				name: '严格效果',
				magic: true,
				rand: 1,
				func,
				attack: {},
				final: {},
				cost: { mp: 10 },
				cd: 2,
				sel: {
					target: func === 'poison' ? TargetSelectEnum.enemy : TargetSelectEnum.friend,
				},
			},
		]);
		initBuffs([
			{
				id: 1001062,
				name: status,
				desc: '',
				magic: false,
				attackType: 'base',
				attack: {},
				final: {},
				status: [status],
				tags: [],
				overlap: OverlapEnum.REPLACE,
				lastTurn: 0,
				times: 0,
				event: 'hurt',
				turnType: BuffTurnEnum.thisTurn,
				dieNotRemove: true,
			},
		]);
		const initial = initFightContex(s.fight);
		target.addBuff(s.a, 'test', 1001062, 1, initial);
		if (func === 'relife') target.onHurt(s.c, 'test', 1000, initial);
		s.a.addSkill(1001061, 1);
		s.prepare();
		const hints: string[] = [];
		s.a.hintClient = (msg) => hints.push(msg);
		s.loop.on('input', (unit) => {
			if (unit === s.a) {
				assert.equal(
					s.loop.onInput(unit.uid, {
						cmd: FightCmdEnum.skill,
						skill: 1001061,
						target: target.uid,
					}),
					false,
				);
				assert.equal(s.loop.inputUnit, unit);
				assert.equal(unit.attr.point.mp, 100);
				assert.equal(unit.getSkillCd(1001061), 0);
				assert.deepEqual(hints, [hint]);
			}
			s.loop.onInput(unit.uid, { cmd: FightCmdEnum.attack, target: s.d.uid });
		});
		await s.loop.processOneTurn(1);
		s.loop.end();
	});
}

// 测试：等待输入后施放者被禁止攻击和技能时仍复验自身状态，失败继续等待而非接受空行动。
test('pc: actor availability is rechecked at the moment of input', async () => {
	const s = setup();
	s.prepare();
	s.loop.on('input', (unit) => {
		if (unit === s.a) {
			unit.isForbid = (action: string) => action === 'attack' || action === 'skill';
			assert.equal(
				s.loop.onInput(unit.uid, { cmd: FightCmdEnum.attack, target: s.c.uid }),
				false,
			);
			assert.equal(
				s.loop.onInput(unit.uid, {
					cmd: FightCmdEnum.skill,
					skill: skillId,
					target: s.c.uid,
				}),
				false,
			);
			assert.equal(s.loop.inputUnit, unit);
			unit.isForbid = () => false;
		}
		s.loop.onInput(unit.uid, { cmd: FightCmdEnum.attack, target: s.c.uid });
	});
	await s.loop.processOneTurn(1);
	s.loop.end();
});

// 测试：自动选目标排除不能中毒者，并只在接受输入时抽取一次、保存主目标。
test('pc: automatic targets exclude unavailable recipients and are selected only once', async () => {
	const s = setup();
	initSkills([
		{
			id: 1001063,
			name: '自动毒',
			magic: true,
			rand: 1,
			func: 'poison',
			attack: {},
			final: {},
			sel: { target: TargetSelectEnum.enemy },
		},
	]);
	initBuffs([
		{
			id: 1001064,
			name: '禁毒',
			desc: '',
			magic: false,
			attackType: 'base',
			attack: {},
			final: {},
			status: ['禁毒'],
			tags: [],
			overlap: OverlapEnum.REPLACE,
			lastTurn: 0,
			times: 0,
			event: 'hurt',
			turnType: BuffTurnEnum.thisTurn,
		},
	]);
	s.c.addBuff(s.a, 'test', 1001064, 1, initFightContex(s.fight));
	s.a.addSkill(1001063, 1);
	s.prepare();
	let samples = 0;
	s.fight.random = () => {
		samples++;
		return 0.5;
	};
	s.loop.on('input', (unit) => {
		if (unit === s.a) {
			assert.equal(
				s.loop.onInput(unit.uid, { cmd: FightCmdEnum.skill, skill: 1001063 }),
				true,
			);
			assert.equal(unit.input.target, s.d.uid);
			assert.equal(samples, 0); // 过滤后只有一个候选，无需抽样。
		} else s.loop.onInput(unit.uid, { cmd: FightCmdEnum.attack, target: s.c.uid });
	});
	await s.loop.processOneTurn(1);
	assert.ok(
		s.messages.some((msg) => msg[0] === 'hurt' && msg[2] === s.d.uid && msg[3] === s.a.uid),
	);
	s.loop.end();
});

// 测试：接受输入后到实际执行前目标变为禁疗时再次拒绝，不扣费、不启动冷却。
test('pc: target availability is rechecked before paying for the accepted action', async () => {
	const s = setup();
	initSkills([
		{
			id: 1001065,
			name: '复验治疗',
			magic: true,
			rand: 1,
			func: 'heal',
			attack: {},
			final: {},
			cost: { mp: 10 },
			cd: 2,
			sel: { target: TargetSelectEnum.friend },
		},
	]);
	initBuffs([
		{
			id: 1001066,
			name: '禁疗',
			desc: '',
			magic: false,
			attackType: 'base',
			attack: {},
			final: {},
			status: ['禁疗'],
			tags: [],
			overlap: OverlapEnum.REPLACE,
			lastTurn: 0,
			times: 0,
			event: 'hurt',
			turnType: BuffTurnEnum.thisTurn,
		},
	]);
	s.a.addSkill(1001065, 1);
	s.prepare();
	s.loop.on('input', (unit) => {
		if (unit === s.a) {
			assert.equal(
				s.loop.onInput(unit.uid, {
					cmd: FightCmdEnum.skill,
					skill: 1001065,
					target: s.b.uid,
				}),
				true,
			);
			const ctx = initFightContex(s.fight);
			s.b.addBuff(s.c, 'test', 1001066, 1, ctx);
			s.loop.bcMsg(ctx.msgs);
		} else s.loop.onInput(unit.uid, { cmd: FightCmdEnum.attack, target: s.c.uid });
	});
	await s.loop.processOneTurn(1);
	assert.equal(s.a.attr.point.mp, 100);
	assert.equal(s.a.getSkillCd(1001065), 0);
	assert.ok(!s.messages.some((msg) => msg[0] === 'heal' && msg[3] === s.a.uid));
	s.loop.end();
});

// 测试：具名入口清楚区分模式，网游可收死亡单位及守尸指令，PC 立即行动则拒绝。
test('input checks: checkPC and checkOnline explicitly preserve their different death rules', () => {
	const s = setup();
	s.prepare();
	const ctx = initFightContex(s.fight);
	s.a.onHurt(s.c, 'test', 1000, ctx);
	s.loop.bcMsg(ctx.msgs);
	const attack = { cmd: FightCmdEnum.attack, target: s.c.uid };
	assert.equal(s.fight.checkOnline(s.a, attack), true);
	assert.equal(s.fight.checkPC(s.a, attack), false);
	const corpse = { cmd: FightCmdEnum.attack, target: s.a.uid };
	assert.equal(s.fight.checkOnline(s.c, corpse), true);
	assert.equal(s.fight.checkPC(s.c, corpse), false);
	s.loop.end();
});

// 测试：checkPC 只校验而不选目标或修改指令，单独准备指令时才抽取一次自动主目标并返回副本。
test('input checks: checkPC is separate from preparing the automatic target', () => {
	const s = setup();
	s.prepare();
	let samples = 0;
	s.fight.random = () => {
		samples++;
		return 0.5;
	};
	const input: FightInput = { cmd: FightCmdEnum.attack };
	assert.equal(s.fight.checkPC(s.a, input), true);
	assert.equal(samples, 0);
	assert.equal(input.target, undefined);
	const prepared = s.fight.preparePCInput(s.a, input);
	assert.notEqual(prepared, input);
	assert.equal(prepared.target, s.d.uid);
	assert.equal(input.target, undefined);
	assert.equal(samples, 1);
	s.loop.end();
});
