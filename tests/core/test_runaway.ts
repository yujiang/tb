import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
	FightClient,
	FightCmdEnum,
	FightLoopPC,
	FightLoopWest,
	FightLoopYanYu,
	FightResultEnum,
	FightSideEnum,
	getBuffData,
	getRunwayRate,
	initBuffs,
	initFightContex,
	setFightGlobalData,
	fightMsg,
} from '../../src';
import { setupChain, chainIds as ids } from '../fixtures/skill_chain';

function setup() {
	const s = setupChain({ rootSelfBuff: false, finalReactions: false });
	Object.assign(s.fight.xls, {
		runaway: true,
		runawayGrade: 0,
		deathPenalty: 7,
		winRecover: 0.5,
		winReward: 9,
	});
	s.actor.attrOri.grade = 50;
	s.actor.calcAttr();
	const rewards: number[][] = [],
		penalties: number[][] = [];
	for (const side of [0, 1]) {
		s.fight.getSide(side).onWin = (reward, recover) => rewards.push([side, reward, recover]);
		s.fight.getSide(side).deathPenalty = (penalty) => penalties.push([side, penalty]);
	}
	return { ...s, rewards, penalties };
}

// 测试：逃跑概率沿用等级差公式，并限制在0～1；等级差50为50%，差100为0。
test('runaway: grade-based rates are bounded probabilities', () => {
	assert.equal(getRunwayRate(50, 0), 0.5);
	assert.equal(getRunwayRate(100, 0), 0);
	assert.equal(getRunwayRate(0, 50), 1);
});

for (const side of [FightSideEnum.attack, FightSideEnum.defend]) {
	// 测试：任意阵营逃跑成功均结束整场、对方胜，不死亡、不扣费，结果处理不发奖也不惩罚。
	test(`runaway: successful side ${side} retreat ends the battle without rewards or penalties`, () => {
		const s = setup(),
			unit = side === 0 ? s.actor : s.target;
		unit.attr.grade = 50;
		let samples = 0;
		s.fight.random = () => {
			samples++;
			return 0.25;
		};
		const input = { cmd: FightCmdEnum.runaway };
		assert.equal(s.fight.checkPC(unit, input), true);
		assert.equal(s.fight.checkOnline(unit, input), true);
		assert.deepEqual(s.fight.preparePCInput(unit, input), input);
		assert.equal(samples, 0);
		const ctx = s.fight.processUnit(unit, input);
		assert.ok(ctx);
		assert.deepEqual(ctx.msgs, [['runaway', unit.uid, true]]);
		assert.equal(samples, 1);
		assert.equal(s.fight.canRunaway(), true);
		assert.equal(s.fight.result, side === 0 ? FightResultEnum.defend : FightResultEnum.attack);
		assert.equal(s.fight.getWinSide(), 1 - side);
		assert.equal(s.fight.getLostSide(), side);
		assert.equal(unit.getHp(), 1000);
		assert.equal(unit.isDied(), false);
		assert.equal(unit.attr.point.mp, 100);
		s.flush(ctx);
		s.loop.end();
		s.loop.end();
		assert.deepEqual(s.rewards, []);
		assert.deepEqual(s.penalties, []);
		assert.equal(
			s.fight.processUnit(s.actor, { cmd: FightCmdEnum.attack, target: s.target.uid }),
			undefined,
		);
	});
}

// 测试：逃跑失败只消耗本次行动，广播失败，不造成伤害、不收费，也不把整场标记为逃跑。
test('runaway: a failed attempt reports failure and leaves the battle running', () => {
	const s = setup();
	s.fight.random = () => 0.75;
	const ctx = s.fight.processUnit(s.actor, { cmd: FightCmdEnum.runaway });
	assert.ok(ctx);
	assert.deepEqual(ctx.msgs, [['runaway', s.actor.uid, false]]);
	assert.equal(ctx.actionStarted, true);
	assert.equal(s.fight.isEnd(), false);
	assert.equal(s.fight.canRunaway(), false);
	assert.equal(s.actor.getHp(), 1000);
	assert.equal(s.actor.attr.point.mp, 100);
	s.flush(ctx);
});

for (const [grade, success] of [
	[100, false],
	[0, true],
] as const) {
	// 测试：必定失败或必定成功时不抽取战斗随机数，零概率在随机源返回0时仍然失败。
	test(`runaway: deterministic grade ${grade} consumes no random sample`, () => {
		const s = setup();
		s.actor.attr.grade = grade;
		let samples = 0;
		s.fight.random = () => {
			samples++;
			return 0;
		};
		const ctx = s.fight.processUnit(s.actor, { cmd: FightCmdEnum.runaway });
		assert.ok(ctx);
		assert.equal(ctx.msgs[0][2], success);
		assert.equal(samples, 0);
	});
}

// 测试：表格禁止逃跑时提交和执行均拒绝，不抽样、不收费；执行时会重新检查开关。
test('runaway: disabled table rules are rechecked without consuming randomness', () => {
	const s = setup();
	assert.equal(s.fight.checkPC(s.actor, { cmd: FightCmdEnum.runaway }), true);
	s.fight.xls.runaway = false;
	let samples = 0;
	s.fight.random = () => {
		samples++;
		return 0;
	};
	assert.equal(s.fight.checkPC(s.actor, { cmd: FightCmdEnum.runaway }), false);
	assert.equal(s.fight.checkOnline(s.actor, { cmd: FightCmdEnum.runaway }), false);
	assert.equal(s.fight.processUnit(s.actor, { cmd: FightCmdEnum.runaway }), undefined);
	assert.equal(samples, 0);
});

for (const status of ['缠绕', '眩晕', '休息']) {
	// 测试：提交后被缠绕、眩晕或休息限制时不能逃跑，动作禁止与move/escapse状态在执行时复验。
	test(`runaway: ${status} prevents retreat at execution`, () => {
		const s = setup(),
			buff = 10013401;
		assert.equal(s.fight.checkPC(s.actor, { cmd: FightCmdEnum.runaway }), true);
		initBuffs([
			{ ...getBuffData(ids.rest), id: buff, class: undefined, status: [status], lastTurn: 0 },
		]);
		s.actor.addBuff(s.target, 'test', buff, 1, initFightContex(s.fight));
		s.fight.random = () => {
			throw new Error('blocked escape must not sample randomness');
		};
		assert.equal(s.fight.checkPC(s.actor, { cmd: FightCmdEnum.runaway }), false);
		const ctx = s.fight.processUnit(s.actor, { cmd: FightCmdEnum.runaway });
		assert.equal(ctx?.msgs.some((msg) => msg[0] === 'runaway') ?? false, false);
		assert.equal(s.fight.canRunaway(), false);
		assert.equal(s.fight.isEnd(), false);
	});
}

for (const Loop of [FightLoopPC, FightLoopWest]) {
	for (const success of [false, true]) {
		// 测试：PC和西游在普通行动位逃跑，成功后取消后续行动；失败继续完整回合并按超时结果正常奖惩。
		test(
			`runaway: ${Loop.name} resolves scheduled retreat with success=${success}`,
			{ timeout: 3000 },
			async (t) => {
				const s = setup();
				s.loop.end();
				s.fight.turn = 0;
				setFightGlobalData({ maxTurn: 1, jiqi: true });
				s.actor.attrOri.grade = success ? 0 : 100;
				s.actor.attrOri.speed = 500;
				s.actor.calcAttr();
				for (const unit of s.fight.getAllUnits()) unit.attr.point.jpMax = 100;
				const loop = new Loop(s.fight),
					client = new FightClient(),
					messages: fightMsg[] = [];
				t.after(() => loop.end());
				loop.onMsg((msgs) => {
					const batch = structuredClone(
						typeof msgs[0] === 'string' ? [msgs as fightMsg] : (msgs as fightMsg[]),
					);
					messages.push(...batch);
					client.onMsg(batch);
				});
				if (loop instanceof FightLoopPC) {
					loop.on('input', (unit) =>
						loop.onInput(unit.uid, { cmd: FightCmdEnum.runaway }),
					);
				} else {
					const wait = loop.waitInput.bind(loop);
					loop.waitInput = async (turn, ctx) => {
						const waiting = wait(turn, ctx);
						loop.onInput(s.actor.uid, { turn, cmd: FightCmdEnum.runaway });
						return waiting;
					};
				}
				const result = await loop.run();
				assert.equal(result, success ? FightResultEnum.defend : FightResultEnum.outoftime);
				assert.equal(messages.filter((msg) => msg[0] === 'actor').length, success ? 1 : 3);
				assert.equal(s.fight.canRunaway(), success);
				assert.equal(s.actor.attr.point.jp, success ? 1 : 3);
				assert.deepEqual(s.rewards, success ? [] : [[1, 9, 0.5]]);
				assert.deepEqual(s.penalties, success ? [] : [[0, 7]]);
				assert.deepEqual(
					messages.find((msg) => msg[0] === 'end'),
					['end', result, 1, success],
				);
				assert.equal(client.checkSame(s.fight), true);
				assert.equal(client.result, result);
				assert.equal(client.winSide, 1);
				assert.equal(client.runaway, success);
			},
		);
	}
}

// 测试：西游可收死亡单位的逃跑意图，执行时仍死则跳过，复活后可正常按原意图逃跑。
test('runaway: dead units may submit online intent but must be alive at execution', () => {
	const s = setup(),
		input = { cmd: FightCmdEnum.runaway };
	s.actor.die();
	assert.equal(s.fight.checkOnline(s.actor, input), true);
	assert.equal(s.fight.checkPC(s.actor, input), false);
	assert.equal(s.fight.processUnit(s.actor, input), undefined);
	s.actor.relife();
	s.actor.attr.grade = 0;
	const ctx = s.fight.processUnit(s.actor, input);
	assert.ok(ctx);
	assert.equal(s.fight.canRunaway(), true);
});

// 测试：相同种子及相同初始化过程下，逃跑结果及之后的随机状态可重复。
test('runaway: equal seeds reproduce retreat results and subsequent random samples', () => {
	const first = setup(),
		second = setup();
	const a = first.fight.processUnit(first.actor, { cmd: FightCmdEnum.runaway });
	const b = second.fight.processUnit(second.actor, { cmd: FightCmdEnum.runaway });
	assert.ok(a);
	assert.ok(b);
	assert.deepEqual(a.msgs, b.msgs);
	assert.equal(first.fight.random(), second.fight.random());
});

// 测试：烟雨江湖保留只接受即时技能的约定，逃跑指令不会入队或结束战斗。
test('runaway: yanyu rejects retreat commands', async () => {
	const s = setup();
	s.loop.end();
	const loop = new FightLoopYanYu(s.fight);
	loop.onMsg(() => {});
	loop.start();
	loop.nextTurn();
	await loop.waitInput(s.fight.turn, initFightContex(s.fight));
	assert.equal(
		await loop.onInput(s.actor.uid, { turn: s.fight.turn, cmd: FightCmdEnum.runaway }),
		false,
	);
	assert.equal(s.fight.isEnd(), false);
	loop.end();
});

// 测试：胜方结果回调重入end也只处理一次奖惩和结束广播，避免重复发奖。
test('runaway results: reentrant end callbacks do not duplicate settlement', () => {
	const s = setup();
	let calls = 0;
	s.fight.getSide(0).onWin = () => {
		calls++;
		if (calls === 1) s.loop.end();
	};
	s.fight.setWin(FightResultEnum.attack);
	s.loop.end();
	assert.equal(calls, 1);
});

// 测试：奖惩回调异常仍只结算一次，关闭输入与队列，记录错误并发送最终结果。
test('runaway results: settlement errors still close the battle and report once', (t) => {
	t.mock.method(console, 'error', () => {});
	const s = setup();
	const error = new Error('reward failed');
	let calls = 0;
	s.fight.getSide(0).onWin = () => {
		calls++;
		throw error;
	};
	const reported: unknown[] = [];
	s.loop.onError = (value) => reported.push(value);
	s.fight.setWin(FightResultEnum.attack);
	assert.doesNotThrow(() => s.loop.end());
	s.loop.end();
	assert.equal(calls, 1);
	assert.deepEqual(reported, [error]);
	assert.equal(s.fight.getResult(), FightResultEnum.attack);
	assert.equal(s.client.result, FightResultEnum.attack);
	assert.equal(s.client.winSide, FightSideEnum.attack);
	assert.equal(s.loop.actions.length, 0);
});

// 测试：客户端接收新版结束数据并在下一场清空逃跑标记，仍可读取旧版两项结果消息。
test('runaway results: client resets settlement state and reads legacy end messages', () => {
	const client = new FightClient();
	client.onMsg(['start', 1]);
	client.onMsg(['runaway', 0, true]);
	client.onMsg(['end', FightResultEnum.defend, FightSideEnum.defend, true]);
	assert.equal(client.runaway, true);
	assert.equal(client.winSide, FightSideEnum.defend);
	client.onMsg(['start', 2]);
	assert.equal(client.result, FightResultEnum.ongoing);
	assert.equal(client.runaway, false);
	assert.equal(client.winSide, -1);
	client.onMsg(['end', FightResultEnum.outoftime]);
	assert.equal(client.result, FightResultEnum.outoftime);
	assert.equal(client.winSide, FightSideEnum.defend);
	assert.equal(client.runaway, false);
});
