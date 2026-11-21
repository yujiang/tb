import { setFightGlobalData } from '../../src/fight/Fight';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
	FightLoopPC,
	FightLoopWest,
	FightLoopYanYu,
	FightCmdEnum,
	FightResultEnum,
	FightRuleHp,
	initFightContex,
	fightMsg,
	FightErrorContext,
} from '../../src';
import { setupChain, chainIds } from '../fixtures/skill_chain';

for (const Loop of [FightLoopPC, FightLoopWest, FightLoopYanYu]) {
	// 战斗执行抛出异常后统一记录错误并判攻击方失败，停止后续行动、清空队列并解绑规则监听。
	test(`fight errors: ${Loop.name} logs and ends with an attacker loss`, async (t) => {
		const logged = t.mock.method(console, 'error', () => {});
		const s = setupChain({
			rootSelfBuff: false,
			finalReactions: false,
			change: (data) => {
				data[0].combo = undefined;
				data[0].damageRate = 1;
			},
		});
		s.loop.end();
		s.fight.turn = 0;
		setFightGlobalData({ maxTurn: 1 });
		s.actor.attrOri.speed = 500;
		s.target.attrOri.speed = 100;
		s.other.attrOri.speed = 50;
		s.actor.setAttackSkill(chainIds.first);
		s.fight.getDefaultEnemy = () => s.target;
		s.target.addRule(new FightRuleHp({ type: 'hp', lines: [{ hp: 0.7, attackRate: 0.2 }] }));
		for (const unit of s.fight.getAllUnits()) unit.calcAttr();
		const failure = new Error('skill execution failed');
		s.target.onContex('beforeHurt', () => {
			throw failure;
		});
		let later = 0;
		s.other.processOneTurn = () => {
			later++;
			return undefined;
		};
		const loop = new Loop(s.fight),
			messages: fightMsg[] = [];
		loop.onMsg((msgs) => {
			messages.push(
				...(typeof msgs[0] === 'string' ? [msgs as fightMsg] : (msgs as fightMsg[])),
			);
			s.loop.bcMsg(msgs);
		});
		loop.on('input', (unit) =>
			loop.onInput(unit.uid, {
				cmd: FightCmdEnum.skill,
				skill: chainIds.first,
				target: s.target.uid,
			}),
		);
		if (loop instanceof FightLoopWest)
			loop.waitInput = async (_turn, ctx) => {
				for (const unit of s.fight.getAllUnits()) unit.inputStart(s.fight.turn, ctx);
				s.actor.input = {
					cmd: FightCmdEnum.skill,
					skill: chainIds.first,
					target: s.target.uid,
				};
				return 1;
			};
		assert.equal(await loop.run(), FightResultEnum.defend);
		assert.equal(s.fight.result, FightResultEnum.defend);
		assert.equal(s.client.result, FightResultEnum.defend);
		assert.equal(later, 0);
		assert.deepEqual(loop.actions, []);
		assert.deepEqual(s.client.sort, []);
		assert.equal(s.target.contextEmitter.listenerCount('hp'), 0);
		assert.equal(messages.filter((msg) => msg[0] === 'end').length, 1);
		assert.equal(logged.mock.callCount(), 1);
		assert.ok((logged.mock.calls[0].arguments as unknown[]).includes(failure));
	});
}

// 西游等待输入期间校验代码抛错时，立即关闭窗口并结束等待，不能留住输入定时器。
test(
	'fight errors: online input exceptions release the waiting round',
	{ timeout: 2000 },
	async (t) => {
		const logged = t.mock.method(console, 'error', () => {});
		const s = setupChain();
		setFightGlobalData({ waitInputSec: 60 });
		const ctx = initFightContex(s.fight),
			waiting = s.loop.waitInput(1, ctx);
		s.actor.onInput = () => {
			throw new Error('online input failed');
		};
		s.loop.onInput(s.actor.uid, { cmd: FightCmdEnum.attack, turn: 1 });
		assert.equal(await waiting, 0);
		assert.equal(s.fight.result, FightResultEnum.defend);
		assert.equal(s.loop.input, 0);
		assert.equal(s.loop.inputResolve, null);
		assert.equal(logged.mock.callCount(), 1);
		assert.deepEqual(s.loop.actions, []);
	},
);

// 烟雨即时技能失败时日志能定位这次施法者及指令，而不是误用上一个自动行动的信息。
test('fight errors: instant skill failures retain their actor and input in logs', async () => {
	const s = setupChain({ rootSelfBuff: false, finalReactions: false });
	s.loop.end();
	const loop = new FightLoopYanYu(s.fight),
		errors: { error: unknown; context: FightErrorContext }[] = [];
	loop.onMsg((msgs) => s.loop.bcMsg(msgs));
	loop.onError = (error, context) => errors.push({ error, context });
	loop.start();
	s.fight.turn = 0;
	loop.nextTurn();
	const before = initFightContex(s.fight);
	await loop.waitInput(1, before);
	loop.bcMsg(before.msgs);
	const failure = new Error('instant skill failed');
	s.target.onContex('beforeHurt', () => {
		throw failure;
	});
	const input = { cmd: FightCmdEnum.skill, skill: chainIds.first, target: s.target.uid, turn: 1 };
	assert.equal(await loop.onInput(s.actor.uid, input), false);
	assert.equal(errors.length, 1);
	assert.equal(errors[0].error, failure);
	assert.equal(errors[0].context.actor, s.actor.uid);
	assert.deepEqual(errors[0].context.input, input);
	assert.equal(s.fight.result, FightResultEnum.defend);
});

for (const phase of ['start', 'beforeTurn', 'afterTurn'] as const) {
	// 初始化和全局回合边界的异常也由运行入口收口，不能进入下一回合。
	test(`fight errors: ${phase} failures stop the full run`, async (t) => {
		const logged = t.mock.method(console, 'error', () => {});
		const s = setupChain({ rootSelfBuff: false });
		s.loop.end();
		s.fight.turn = 0;
		setFightGlobalData({ maxTurn: 3 });
		const loop = new FightLoopPC(s.fight),
			failure = new Error(`${phase} failed`);
		loop.onMsg((msgs) => s.loop.bcMsg(msgs));
		loop.on('input', (unit) => loop.onInput(unit.uid, { cmd: FightCmdEnum.defend }));
		if (phase === 'start')
			loop.on('start', () => {
				throw failure;
			});
		else if (phase === 'beforeTurn')
			s.actor.processBeforeTurn = () => {
				throw failure;
			};
		else
			s.actor.processAfterTurn = () => {
				throw failure;
			};
		assert.equal(await loop.run(), FightResultEnum.defend);
		assert.ok(s.fight.turn <= 1);
		assert.equal(loop.inputUnit, undefined);
		assert.deepEqual(loop.actions, []);
		assert.equal(logged.mock.callCount(), 1);
	});
}

// 一名单位的结束清理抛错也要继续清理其他单位，并保留已经确定的胜负。
test('fight errors: one cleanup failure does not skip other units', (t) => {
	const logged = t.mock.method(console, 'error', () => {});
	const s = setupChain();
	let cleaned = false;
	s.target.endFight = () => {
		throw new Error('cleanup failed');
	};
	s.other.endFight = () => {
		cleaned = true;
	};
	s.fight.setWin(FightResultEnum.attack);
	s.loop.end();
	assert.equal(cleaned, true);
	assert.equal(s.fight.result, FightResultEnum.attack);
	assert.equal(s.client.result, FightResultEnum.attack);
	assert.equal(logged.mock.callCount(), 1);
});

// 已向胜方发奖后结束回调抛错，最终协议仍须保留原胜方，且不得重复发奖。
test('fight errors: end callback failures preserve the awarded winner', (t) => {
	const logged = t.mock.method(console, 'error', () => {});
	const s = setupChain();
	const rewarded: number[] = [];
	s.fight.getSide(0).onWin = () => rewarded.push(0);
	s.fight.getSide(1).onWin = () => rewarded.push(1);
	s.fight.setWin(FightResultEnum.attack);
	s.loop.on('end', () => {
		throw new Error('end callback failed');
	});
	s.loop.end();
	s.loop.end();
	assert.deepEqual(rewarded, [0]);
	assert.equal(s.fight.result, FightResultEnum.attack);
	assert.equal(s.client.result, FightResultEnum.attack);
	assert.equal(s.client.winSide, 0);
	assert.equal(logged.mock.callCount(), 1);
});

for (const result of [
	FightResultEnum.attack,
	FightResultEnum.defend,
	FightResultEnum.draw,
	FightResultEnum.outoftime,
]) {
	// 战斗已有结果后等待动画抛错，运行入口仍返回原结果，并且仅执行一次奖惩和收尾。
	test(`fight errors: run preserves resolved result ${result} after an animation failure`, async () => {
		const s = setupChain();
		const failure = new Error('final animation failed');
		const errors: unknown[] = [];
		const messages: fightMsg[] = [];
		let rewards = 0;
		let ended = 0;
		s.loop.onError = (error) => errors.push(error);
		s.loop.onMsg((msgs) => {
			messages.push(
				...(typeof msgs[0] === 'string' ? [msgs as fightMsg] : (msgs as fightMsg[])),
			);
		});
		s.loop.on('end', () => ended++);
		for (const side of s.fight.Sides) side.onWin = () => rewards++;
		s.loop.waitInput = async () => 1;
		s.loop.processOneTurn = async () => {
			s.fight.setWin(result);
		};
		s.loop.waitDrawOver = async () => {
			throw failure;
		};
		assert.equal(await s.loop.run(), result);
		s.loop.end();
		assert.equal(s.fight.result, result);
		assert.equal(s.client.result, result);
		assert.equal(s.client.winSide, s.fight.getWinSide());
		assert.equal(rewards, 1);
		assert.equal(ended, 1);
		assert.equal(messages.filter((msg) => msg[0] === 'end').length, 1);
		assert.deepEqual(errors, [failure]);
		assert.deepEqual(s.loop.actions, []);
		assert.equal(s.loop.inputResolve, null);
	});
}

// 清理、发奖和结束通知接连失败时，每个异常都应记录，其他收尾仍继续且不改变已有结果。
test('fight errors: consecutive cleanup errors are all logged without changing the winner', () => {
	const s = setupChain();
	const failures = [
		new Error('cleanup failed'),
		new Error('reward failed'),
		new Error('end failed'),
	];
	const errors: unknown[] = [];
	let cleaned = false;
	s.loop.onError = (error) => errors.push(error);
	s.actor.endFight = () => {
		throw failures[0];
	};
	s.other.endFight = () => {
		cleaned = true;
	};
	s.fight.getSide(0).onWin = () => {
		throw failures[1];
	};
	s.loop.on('end', () => {
		throw failures[2];
	});
	s.fight.setWin(FightResultEnum.attack);
	s.loop.end();
	assert.equal(cleaned, true);
	assert.deepEqual(errors, failures);
	assert.equal(s.fight.result, FightResultEnum.attack);
	assert.equal(s.client.result, FightResultEnum.attack);
	assert.deepEqual(s.loop.actions, []);
});
