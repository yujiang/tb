import { hpBuff } from '../../fixtures/hp_buff';
import { EmptyAI } from '../../fixtures/empty_ai';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
	FightRuleTurn,
	setFightGlobalData,
	FightLoopPC,
	FightLoopWest,
	FightLoopYanYu,
	FightCmdEnum,
	FightRuleHp,
	InsertActionPos,
	FightInput,
	initFightContex,
	initSkills,
	fightMsg,
} from '../../../src';
import { setupChain, chainIds } from '../../fixtures/skill_chain';

// 两条周期规则同时满足时都应追加技能，且保留怪物原来的普通行动。
test('rules: two turn axes both insert actions without replacing normal input', async () => {
	const s = setupChain({
		rootSelfBuff: false,
		finalReactions: false,
		change: (data) => {
			data[0].combo = undefined;
			data[0].damageRate = 1;
		},
	});
	const ids = [1001401, 1001402];
	initSkills(ids.map((id) => ({ ...s.skills[0], id, name: `周期${id}`, cost: { mp: 0 } })));
	ids.forEach((id) => {
		s.target.addSkill(id, 1);
		s.target.addRule(new FightRuleTurn({ type: 'turn', everyTurn: 1, skill: id }));
	});
	s.target.setAttackSkill(chainIds.first);
	s.target.addSkill(chainIds.first, 1);
	const loop = new FightLoopPC(s.fight),
		messages: fightMsg[] = [];
	loop.onMsg((msgs) => {
		messages.push(...(typeof msgs[0] === 'string' ? [msgs as fightMsg] : (msgs as fightMsg[])));
	});
	loop.on('input', (unit) => loop.onInput(unit.uid, { cmd: FightCmdEnum.defend }));
	loop.start();
	s.fight.turn = 0;
	loop.nextTurn();
	loop.processBeforeTurn(1, initFightContex(s.fight));
	await loop.processOneTurn(1);
	assert.deepEqual(
		messages.filter((msg) => msg[0] === 'skill' && ids.includes(msg[1])).map((msg) => msg[1]),
		ids,
	);
	assert.equal(
		messages.filter(
			(msg) => msg[0] === 'skill' && msg[1] === chainIds.first && msg[2] === s.target.uid,
		).length,
		1,
	);
	assert.equal(s.target.myInputTurn, 1);
	loop.end();
});

function setup() {
	const s = setupChain({
		rootSelfBuff: false,
		finalReactions: false,
		change: (data) => {
			data[0].combo = undefined;
			data[0].damageRate = 1;
		},
	});
	s.target.addSkill(chainIds.first, 1);
	for (const unit of [s.actor, s.target, s.other]) unit.speedRand = 0;
	s.loop.processUnits = [s.actor, s.target, s.other];
	return s;
}

for (const pos of [InsertActionPos.first, InsertActionPos.last, InsertActionPos.afterSelf]) {
	// 三种固定插入点均进入客户端行动条，同位置多条保持提交顺序且指令互不覆盖。
	test(`actions: fixed position ${InsertActionPos[pos]} preserves insertion order and input copies`, () => {
		const s = setup(),
			input: FightInput = {
				cmd: FightCmdEnum.skill,
				skill: chainIds.first,
				target: s.actor.uid,
			};
		s.loop.insertAction(s.target, input, pos);
		s.loop.insertAction(s.target, input, pos);
		input.cmd = FightCmdEnum.defend;
		const entries = s.loop.actions;
		const extra = entries.filter((action) => action.inserted);
		assert.equal(extra.length, 2);
		assert.ok(extra[0].id < extra[1].id);
		assert.ok(extra.every((action) => action.input.cmd === FightCmdEnum.skill));
		const expected =
			pos === InsertActionPos.first
				? [1, 1, 0, 1, 2]
				: pos === InsertActionPos.last
					? [0, 1, 2, 1, 1]
					: [0, 1, 1, 1, 2];
		assert.deepEqual(
			entries.map((action) => action.unit.uid),
			expected,
		);
		assert.deepEqual(s.client.sort, expected);
		assert.deepEqual(
			s.client.actions.map((action) => action.id),
			entries.map((action) => action.id),
		);
		assert.ok(
			s.client.actions
				.filter((action) => action.inserted)
				.every((action) => action.skill === chainIds.first),
		);
	});
}

// 相同单位重复出现在行动条时，开演一条行动只移除该行动而不是删掉这个单位的所有记录。
test('actions: the client removes only the selected occurrence of a repeated unit', () => {
	const s = setup();
	s.loop.insertAction(
		s.target,
		{ cmd: FightCmdEnum.skill, skill: chainIds.first },
		InsertActionPos.first,
	);
	const extra = s.loop.actions[0];
	s.client.onMsg(['actor', s.target.uid, s.target.getSpeed(), 'insert', extra.id]);
	assert.deepEqual(s.client.sort, [0, 1, 2]);
	assert.equal(
		s.client.actions.some((action) => action.id === extra.id),
		false,
	);
	s.client.onMsg(['actor', s.target.uid, s.target.getSpeed()]);
	assert.deepEqual(s.client.sort, [0, 2]);
});

// 随机插入用战斗随机源选择剩余队列间隙，相同随机序列产生相同位置。
test('actions: random insertion uses the fight random source', () => {
	const s = setup();
	let samples = 0;
	s.fight.random = () => {
		samples++;
		return 0.5;
	};
	s.loop.insertAction(
		s.target,
		{ cmd: FightCmdEnum.skill, skill: chainIds.first },
		InsertActionPos.random,
	);
	assert.equal(samples, 1);
	assert.deepEqual(s.client.sort, [0, 1, 1, 2]);
	assert.equal(s.loop.actions[2].inserted, true);
});

// 速度改变后普通行动重新排序，自己的行动后追加项仍跟着自己的普通行动移动。
test('actions: speed changes retain after-self anchors', () => {
	const s = setup();
	s.loop.insertAction(
		s.target,
		{ cmd: FightCmdEnum.skill, skill: chainIds.first },
		InsertActionPos.afterSelf,
	);
	s.target.attr.speed = 999;
	s.loop.onChangeSpeed(s.target);
	assert.deepEqual(s.client.sort, [1, 1, 0, 2]);
	assert.equal(s.loop.actions[0].inserted, false);
	assert.equal(s.loop.actions[1].inserted, true);
});

// 取消独立追加行动同步行动条，不能误取消普通行动，下回合也不会残留旧追加项。
test('actions: cancellation and round boundaries remove only inserted records', () => {
	const s = setup();
	s.loop.insertAction(s.target, { cmd: FightCmdEnum.skill, skill: chainIds.first });
	const extra = s.loop.actions[0];
	assert.equal(s.loop.cancelAction(s.loop.actions[1].id), false);
	assert.equal(s.loop.cancelAction(extra.id), true);
	assert.deepEqual(s.client.sort, [0, 1, 2]);
	s.loop.insertAction(s.target, { cmd: FightCmdEnum.skill, skill: chainIds.first });
	s.loop.nextTurn();
	assert.equal(
		s.loop.actions.some((action) => action.inserted),
		false,
	);
	assert.equal(
		s.client.actions.some((action) => action.inserted),
		false,
	);
});

// 队首连续插入后取消最后一条，再插入时仍排在之前尚未执行的队首追加项之后。
test('actions: cancelling the insertion tail preserves FIFO for later requests', () => {
	const s = setup(),
		input = { cmd: FightCmdEnum.skill, skill: chainIds.first };
	s.loop.insertAction(s.target, input);
	s.loop.insertAction(s.target, input);
	const [first, last] = s.loop.actions;
	s.loop.cancelAction(last.id);
	s.loop.insertAction(s.target, input);
	const extra = s.loop.actions.filter((action) => action.inserted);
	assert.equal(extra[0].id, first.id);
	assert.ok(extra[1].id > first.id);
});

// 只有一个 AI 决定普通输入，多条规则不会争抢 waitInput，切换 AI 也不会移除规则。
test('rules: a single AI coexists with independent rules', () => {
	const s = setup();
	class DefendAI extends EmptyAI {
		override waitInput() {
			return { cmd: FightCmdEnum.defend };
		}
	}
	s.target.ai = new DefendAI();
	s.target.addRule(new FightRuleHp({ type: 'hp', lines: [{ hp: 0.5, buff: hpBuff(0.2) }] }));
	s.target.addRule(new FightRuleTurn({ type: 'turn', everyTurn: 1, skill: chainIds.first }));
	const before = initFightContex(s.fight);
	s.loop.processBeforeTurn(1, before);
	s.flush(before);
	s.target.inputStart(1, initFightContex(s.fight));
	assert.equal(s.target.input.cmd, FightCmdEnum.defend);
	assert.equal(s.loop.actions.filter((action) => action.inserted).length, 1);
	s.target.ai = undefined;
	assert.equal(s.target.rules.length, 2);
	assert.throws(() => s.target.addRule(new EmptyAI() as never), /ai|AI/);
});

for (const Loop of [FightLoopPC, FightLoopWest, FightLoopYanYu]) {
	// 三种循环都显示并执行插入行动，追加行动不推进输入次数，也不占普通行动。
	test(`rules: ${Loop.name} executes an inserted action and one ordinary action`, async () => {
		const s = setup(),
			loop = new Loop(s.fight),
			messages: fightMsg[] = [];
		s.target.setAttackSkill(chainIds.first);
		s.target.addRule(
			new FightRuleTurn({
				type: 'turn',
				everyTurn: 1,
				skill: chainIds.first,
				pos: InsertActionPos.afterSelf,
			}),
		);
		loop.onMsg((msgs) => {
			messages.push(
				...(typeof msgs[0] === 'string' ? [msgs as fightMsg] : (msgs as fightMsg[])),
			);
			s.loop.bcMsg(msgs);
		});
		loop.on('input', (unit) => loop.onInput(unit.uid, { cmd: FightCmdEnum.defend }));
		loop.start();
		s.fight.turn = 0;
		loop.nextTurn();
		const ctx = initFightContex(s.fight);
		loop.processBeforeTurn(1, ctx);
		if (loop instanceof FightLoopWest) {
			const waiting = loop.waitInput(1, ctx);
			loop.onInput(s.actor.uid, { cmd: FightCmdEnum.defend, turn: 1 });
			await waiting;
		} else await loop.waitInput(1, ctx);
		loop.bcMsg(ctx.msgs);
		assert.equal(s.client.sort.filter((uid) => uid === s.target.uid).length, 2);
		await loop.processOneTurn(1);
		const actor = messages.filter((msg) => msg[0] === 'actor' && msg[1] === s.target.uid);
		assert.equal(actor.length, 2);
		assert.equal(actor[1][3], 'insert');
		assert.equal(s.target.myInputTurn, 1);
		assert.ok(s.client.checkSame(s.fight));
		assert.deepEqual(s.client.sort, []);
		loop.end();
	});
}

// 动作开始时才再次校验冷却，重复插入同一个有 CD 的技能只施放第一条。
test('actions: execution rechecks cooldown without advancing input turns', async () => {
	const s = setup();
	s.target.findSkill(chainIds.first).getXls().cd = 2;
	s.loop.insertAction(s.target, { cmd: FightCmdEnum.skill, skill: chainIds.first });
	s.loop.insertAction(s.target, { cmd: FightCmdEnum.skill, skill: chainIds.first });
	const messages: fightMsg[] = [];
	s.loop.onMsg((msgs) =>
		messages.push(...(typeof msgs[0] === 'string' ? [msgs as fightMsg] : (msgs as fightMsg[]))),
	);
	for (const unit of s.fight.getAllUnits()) unit.input = { cmd: FightCmdEnum.defend };
	await s.loop.processOneTurn(1);
	assert.equal(messages.filter((msg) => msg[0] === 'actor' && msg[3] === 'insert').length, 1);
	assert.equal(s.target.myInputTurn, 0);
	assert.deepEqual(s.client.sort, []);
});

// 插入数量受本回合上限约束，不能通过持续插入绕过回合结束。
test('actions: repeated insertion is bounded', () => {
	const s = setup();
	for (let index = 0; index < 64; index++)
		s.loop.insertAction(s.target, { cmd: FightCmdEnum.skill, skill: chainIds.first });
	assert.throws(
		() => s.loop.insertAction(s.target, { cmd: FightCmdEnum.skill, skill: chainIds.first }),
		/insertion limit/,
	);
});

// 在连招受伤事件中插入行动也要等整个连招结束，不能插到各段之间。
test('actions: insertion during a combo waits for the complete action', async () => {
	const s = setup();
	s.skills[0].combo = chainIds.second;
	let inserted = false;
	s.target.onContex('hurt', (_unit, ctx) => {
		if (inserted) return;
		inserted = s.fight.insertAction(
			s.target,
			{ cmd: FightCmdEnum.skill, skill: chainIds.first, target: s.actor.uid },
			InsertActionPos.first,
			ctx,
		);
	});
	s.actor.input = { cmd: FightCmdEnum.skill, skill: chainIds.first, target: s.target.uid };
	s.target.input = s.other.input = { cmd: FightCmdEnum.defend };
	const messages: fightMsg[] = [];
	s.loop.onMsg((msgs) =>
		messages.push(...(typeof msgs[0] === 'string' ? [msgs as fightMsg] : (msgs as fightMsg[]))),
	);
	await s.loop.processOneTurn(1);
	assert.equal(inserted, true);
	const attacks = messages.filter((msg) => msg[0] === 'skill');
	assert.deepEqual(
		attacks.slice(0, 3).map((msg) => msg[1]),
		[chainIds.first, chainIds.second, chainIds.third],
	);
	assert.ok(attacks.slice(0, 3).every((msg) => msg[2] === s.actor.uid));
	assert.equal(attacks[3][2], s.target.uid);
	assert.ok(s.client.checkSame(s.fight));
});

// 自己已经行动后再请求 afterSelf 时插在剩余队列最前，不会等待下一回合。
test("actions: after-self falls back to the front after the owner's ordinary action", async () => {
	const s = setup(),
		actors: number[] = [];
	let inserted = false;
	for (const unit of s.fight.getAllUnits()) unit.input = { cmd: FightCmdEnum.attack };
	s.loop.onMsg((msgs) => {
		const batch = typeof msgs[0] === 'string' ? [msgs as fightMsg] : (msgs as fightMsg[]);
		for (const msg of batch) {
			if (msg[0] !== 'actor') continue;
			actors.push(msg[1]);
			if (msg[1] === s.target.uid && !inserted) {
				inserted = s.fight.insertAction(
					s.target,
					{ cmd: FightCmdEnum.skill, skill: chainIds.first },
					InsertActionPos.afterSelf,
				);
			}
		}
	});
	await s.loop.processOneTurn(1);
	assert.deepEqual(actors, [s.actor.uid, s.target.uid, s.target.uid, s.other.uid]);
});

// 入队后显式目标死亡则取消施放而不换人，客户端移除这一条失效行动。
test('actions: an explicit target dying before execution cancels the queued skill', async () => {
	const s = setup();
	s.fight.insertAction(s.target, {
		cmd: FightCmdEnum.skill,
		skill: chainIds.first,
		target: s.other.uid,
	});
	const dead = initFightContex(s.fight);
	s.other.onHurt(s.actor, 'buff', 9999, dead, { source: 'buff' });
	s.flush(dead);
	for (const unit of s.fight.getAllUnits()) unit.input = { cmd: FightCmdEnum.defend };
	const messages: fightMsg[] = [];
	s.loop.onMsg((msgs) =>
		messages.push(...(typeof msgs[0] === 'string' ? [msgs as fightMsg] : (msgs as fightMsg[]))),
	);
	await s.loop.processOneTurn(1);
	assert.ok(!messages.some((msg) => msg[0] === 'actor' && msg[3] === 'insert'));
	assert.equal(s.actor.getHp(), 1000);
	assert.deepEqual(s.client.sort, []);
	assert.ok(s.client.checkSame(s.fight));
});

function speedRuleSetup(data: { pos?: InsertActionPos; speedRate?: number }) {
	const s = setup();
	s.target.attrOri.speed = 200;
	s.actor.attrOri.speed = 150;
	s.other.attrOri.speed = 50;
	for (const unit of s.fight.getAllUnits()) unit.calcAttr();
	s.loop.processUnits = [s.target, s.actor, s.other];
	s.target.addRule(
		new FightRuleTurn({ type: 'turn', everyTurn: 1, skill: chainIds.first, ...data }),
	);
	const ctx = initFightContex(s.fight);
	s.loop.processBeforeTurn(1, ctx);
	s.flush(ctx);
	return s;
}

// 未填pos时按单位当前速度乘倍率插入，速度变化后未执行行动随之重排并同步客户端。
test('rule turn speed: inserts by effective speed and follows speed changes', () => {
	const s = speedRuleSetup({ speedRate: 0.5 });
	const extra = s.loop.actions.find((action) => action.inserted);
	assert.equal(extra.speedRate, 0.5);
	assert.deepEqual(
		s.loop.actions.map((action) => [action.unit.uid, action.inserted]),
		[
			[1, false],
			[0, false],
			[1, true],
			[2, false],
		],
	);
	assert.equal(s.client.actions.find((action) => action.id === extra.id).speedRate, 0.5);
	s.target.attr.speed = 80;
	s.target.emit('speed');
	assert.deepEqual(
		s.loop.actions.map((action) => [action.unit.uid, action.inserted]),
		[
			[0, false],
			[1, false],
			[2, false],
			[1, true],
		],
	);
	assert.deepEqual(
		s.client.actions.map((action) => action.id),
		s.loop.actions.map((action) => action.id),
	);
});

// 显式pos优先于倍率，仍按固定位置插入，后续速度变化不会移动固定插队行动。
test('rule turn speed: explicit position overrides speed rate', () => {
	const s = speedRuleSetup({ pos: InsertActionPos.first, speedRate: 0 });
	const extra = s.loop.actions[0];
	assert.equal(extra.inserted, true);
	assert.equal(extra.speedRate, undefined);
	s.target.attr.speed = 1;
	s.target.emit('speed');
	assert.equal(s.loop.actions[0].id, extra.id);
});

// 速度倍率0有效，省略时按1排序，不退回固定队首插入。
test('rule turn speed: zero and default rates are respected', () => {
	const zero = speedRuleSetup({ speedRate: 0 });
	assert.equal(zero.loop.actions[zero.loop.actions.length - 1].speedRate, 0);
	const normal = speedRuleSetup({});
	assert.equal(normal.loop.actions.find((action) => action.inserted).speedRate, 1);
});

// 未填pos时速度倍率必须为非负有限数，避免非法行动顺序。
test('rule turn speed: invalid effective rates are rejected', () => {
	for (const speedRate of [-1, NaN, Infinity]) {
		assert.throws(
			() =>
				new FightRuleTurn({ type: 'turn', everyTurn: 1, skill: chainIds.first, speedRate }),
			/speedRate/,
		);
	}
});

for (const Loop of [FightLoopPC, FightLoopWest, FightLoopYanYu]) {
	// 三种循环都按倍率执行规则技能，显示实际行动速度，不额外推进输入次数或集气。
	test('rule turn speed integration: ' + Loop.name, async () => {
		const s = setup();
		setFightGlobalData({ jiqi: true });
		for (const unit of s.fight.getAllUnits()) {
			unit.attrOri.point.jp = 0;
			unit.attrOri.point.jpMax = 20;
			unit.attrOri.jpAdd = 1;
		}
		s.target.attrOri.speed = 200;
		s.actor.attrOri.speed = 150;
		s.other.attrOri.speed = 50;
		for (const unit of s.fight.getAllUnits()) unit.calcAttr();
		s.target.addRule(
			new FightRuleTurn({
				type: 'turn',
				everyTurn: 1,
				skill: chainIds.first,
				speedRate: 0.5,
			}),
		);
		const loop = new Loop(s.fight);
		const messages: fightMsg[] = [];
		loop.onMsg((msgs) => {
			messages.push(
				...(typeof msgs[0] === 'string' ? [msgs as fightMsg] : (msgs as fightMsg[])),
			);
			s.loop.bcMsg(msgs);
		});
		loop.on('input', (unit) => loop.onInput(unit.uid, { cmd: FightCmdEnum.defend }));
		loop.start();
		s.fight.turn = 0;
		loop.nextTurn();
		for (const unit of s.fight.getAllUnits()) unit.speedRand = 0;
		const before = initFightContex(s.fight);
		loop.processBeforeTurn(1, before);
		loop.bcMsg(before.msgs);
		if (loop instanceof FightLoopYanYu) {
			const inputCtx = initFightContex(s.fight);
			await loop.waitInput(1, inputCtx);
			loop.bcMsg(inputCtx.msgs);
		}
		for (const unit of s.fight.getAllUnits()) unit.input = { cmd: FightCmdEnum.defend };
		await loop.processOneTurn(1);
		const actors = messages.filter((msg) => msg[0] === 'actor');
		assert.deepEqual(
			actors.map((msg) => msg[1]),
			[s.target.uid, s.actor.uid, s.target.uid, s.other.uid],
		);
		assert.equal(actors[2][2], 100);
		assert.equal(actors[2][3], 'insert');
		assert.equal(s.target.myInputTurn, Loop === FightLoopWest ? 0 : 1);
		assert.deepEqual(
			s.fight.getAllUnits().map((unit) => unit.attr.point.jp),
			[3, 3, 3],
		);
		assert.ok(s.client.checkSame(s.fight));
		loop.end();
	});
}
