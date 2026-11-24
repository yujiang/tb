import { EmptyAI } from '../fixtures/empty_ai';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
	FightCmdEnum,
	FightUnitSummon,
	FightLoopPC,
	FightLoopWest,
	FightLoopYanYu,
	FightClient,
	FightMud,
	FightRuleHurt,
	FightAttr,
	Fight,
	FightSide,
	FightUnitMonster,
	FightInput,
	fightMsg,
	InsertActionPos,
	initFightContex,
	initBuffs,
	getBuffData,
} from '../../src';
import { setupChain, chainIds } from '../fixtures/skill_chain';

function setup(
	Loop: typeof FightLoopWest | typeof FightLoopPC | typeof FightLoopYanYu = FightLoopWest,
) {
	const s = setupChain({ rootSelfBuff: false, finalReactions: false });
	s.loop.end();
	const summon = new FightUnitSummon(
		3,
		Object.assign(new FightAttr(), structuredClone(s.actor.attrOri)),
		{ name: '灵兽' },
	);
	summon.user = s.actor.uid;
	summon.setPos(1);
	summon.setFight(s.fight, s.actor.side);
	s.fight.getSideUnits(s.actor.side).push(summon);
	const loop = new Loop(s.fight),
		client = new FightClient(),
		mud = new FightMud(() => {}, false);
	loop.onMsg((msgs) => {
		const wire = structuredClone(msgs);
		client.onMsg(wire);
		mud.onMsg(wire);
	});
	loop.start();
	loop.nextTurn();
	const input = { cmd: FightCmdEnum.dismiss, target: summon.uid };
	return { ...s, loop, client, mud, summon, input };
}

// 主人通过普通指令移除自己的召唤物，清除其剩余行动并同步客户端，不触发死亡或扣血。
test('dismiss: owner removes summon and synchronizes units and actions', () => {
	const s = setup();
	assert.equal(s.fight.checkPC(s.actor, s.input), true);
	assert.equal(s.fight.checkOnline(s.actor, s.input), true);
	assert.deepEqual(s.fight.preparePCInput(s.actor, s.input), s.input);
	s.loop.insertAction(s.summon, { cmd: FightCmdEnum.attack }, InsertActionPos.last);
	s.target.enemyHurt.set(s.summon.uid, 100);
	const hp = s.summon.getHp();
	const ctx = s.fight.processUnit(s.actor, s.input);
	assert.ok(ctx?.actionStarted);
	assert.ok(
		ctx.msgs.some(
			(msg) => msg[0] === 'dismiss' && msg[1] === s.actor.uid && msg[2] === s.summon.uid,
		),
	);
	assert.equal(s.fight.getUnitById(s.summon.uid), undefined);
	assert.equal(s.summon.isDied(), false);
	assert.equal(s.summon.getHp(), hp);
	assert.equal(
		s.loop.actions.some((action) => action.unit === s.summon),
		false,
	);
	assert.equal(s.target.enemyHurt.get(s.summon.uid), 100);
	s.loop.bcMsg(ctx.msgs);
	assert.equal(s.client.getUnitById(s.summon.uid), undefined);
	assert.equal(s.client.sort.includes(s.summon.uid), false);
	assert.equal(
		s.client.actions.some((action) => action.uid === s.summon.uid),
		false,
	);
	assert.ok(s.client.checkSame(s.fight));
	assert.match(s.mud.toString(), /剑客.*灵兽.*离场/);
	assert.doesNotMatch(s.mud.toString(), /未识别消息/);
	s.loop.end();
});

// 玩家目标不能被移除，召唤物必须核对主人，怪物只允许由怪物直接移除。
test('dismiss: target types and summon ownership determine permission', () => {
	const s = setup();
	assert.equal(
		s.fight.checkPC(s.target, { cmd: FightCmdEnum.dismiss, target: s.actor.uid }),
		false,
	);
	assert.equal(
		s.fight.checkPC(s.actor, { cmd: FightCmdEnum.dismiss, target: s.target.uid }),
		false,
	);
	assert.equal(s.fight.checkPC(s.target, s.input), false);
	s.summon.user = s.target.uid;
	assert.equal(s.fight.checkPC(s.actor, s.input), false);
	assert.equal(s.fight.checkPC(s.target, s.input), true);
	s.loop.end();
});

// 怪物目标没有主人限制，目标UID为零仍然有效。
test('dismiss: monsters remove monsters with target ID zero', () => {
	const s = setup();
	const fight = new Fight(10014001, s.fight.xls);
	const target = new FightUnitMonster(
		0,
		Object.assign(new FightAttr(), structuredClone(s.target.attrOri)),
		{ name: '被移除怪物' },
	);
	const operator = new FightUnitMonster(
		1,
		Object.assign(new FightAttr(), structuredClone(s.other.attrOri)),
		{ name: '操作者' },
	);
	const left = new FightSide(),
		right = new FightSide();
	left.units.push(operator);
	right.units.push(target);
	fight.createSide(left, right);
	const input = { cmd: FightCmdEnum.dismiss, target: 0 };
	assert.equal(fight.checkPC(operator, input), true);
	const ctx = fight.processUnit(operator, input);
	assert.ok(ctx);
	assert.equal(fight.getUnitById(0), undefined);
	assert.equal(fight.getUnitById(operator.uid), operator);
	assert.equal(fight.isEnd(), true);
	s.loop.end();
});

for (const target of [undefined, -1, 0.5, NaN, 999]) {
	// 缺少或非法目标直接拒绝，不自动选择其他单位。
	test(`dismiss: invalid target ${target} is rejected`, () => {
		const s = setup(),
			input = { cmd: FightCmdEnum.dismiss, target };
		assert.equal(s.fight.checkPC(s.actor, input), false);
		assert.equal(s.fight.processUnit(s.actor, input), undefined);
		assert.equal(s.fight.getUnitById(s.summon.uid), s.summon);
		s.loop.end();
	});
}

// 提交成功后主人变化或目标已离场，执行时必须重新拒绝。
test('dismiss: execution rechecks owner and departed targets', () => {
	const s = setup();
	assert.equal(s.fight.checkOnline(s.actor, s.input), true);
	s.summon.user = 99;
	assert.equal(s.fight.processUnit(s.actor, s.input), undefined);
	s.summon.user = s.actor.uid;
	assert.ok(s.fight.processUnit(s.actor, s.input));
	assert.equal(s.fight.processUnit(s.actor, s.input), undefined);
	s.loop.end();
});

// 已死亡的召唤物仍能被主人移除，不走复活或死亡事件。
test('dismiss: dead summons can leave without another death event', () => {
	const s = setup();
	s.summon.die();
	const ctx = s.fight.processUnit(s.actor, s.input);
	assert.ok(ctx);
	assert.equal(
		ctx.msgs.some((msg) => msg[0] === 'die' || msg[0] === 'hurt'),
		false,
	);
	assert.equal(s.fight.getUnitById(s.summon.uid), undefined);
	s.loop.end();
});

// 怪物离场必须解绑规则监听，不能由保留引用继续登记反应行动。
test('dismiss: leaving monsters unbind behavior listeners', () => {
	const s = setup();
	s.target.addRule(new FightRuleHurt({ type: 'hurt', everyHurt: 1 }));
	assert.equal(s.target.contextEmitter.listenerCount('hurt'), 1);
	assert.ok(s.fight.processUnit(s.other, { cmd: FightCmdEnum.dismiss, target: s.target.uid }));
	assert.equal(s.target.contextEmitter.listenerCount('hurt'), 0);
	s.loop.end();
});

// 永久离场解绑不可驱散、死亡保留的次数Buff，不发送死亡或单独驱散消息。
test('dismiss: departure unbinds persistent buff listeners', () => {
	const s = setup(),
		id = 10014002;
	initBuffs([
		{
			...getBuffData(chainIds.rest),
			id,
			class: undefined,
			status: [],
			event: 'hurt',
			times: 2,
			notRemove: true,
			dieNotRemove: true,
		},
	]);
	s.summon.addBuff(s.actor, 'test', id, 1, initFightContex(s.fight));
	assert.equal(s.summon.contextEmitter.listenerCount('hurt'), 1);
	const ctx = s.fight.processUnit(s.actor, s.input);
	assert.ok(ctx);
	assert.equal(s.summon.contextEmitter.listenerCount('hurt'), 0);
	assert.equal(
		ctx.msgs.some((msg) => msg[0] === 'die' || msg[0] === 'removeBuff'),
		false,
	);
	s.loop.end();
});

// PC等待中的召唤物被本地逻辑移除时关闭其输入窗口，不阻塞剩余队列。
test('dismiss: PC closes a departed summon input window', async () => {
	const s = setup(FightLoopPC),
		loop = s.loop as FightLoopPC;
	loop.on('input', (unit) => {
		if (unit === s.summon) {
			const ctx = s.fight.processUnit(s.actor, s.input);
			assert.ok(ctx);
			loop.bcMsg(ctx.msgs);
		} else loop.onInput(unit.uid, { cmd: FightCmdEnum.defend });
	});
	await loop.processOneTurn(s.fight.turn);
	assert.equal(loop.inputUnit, undefined);
	assert.equal(s.fight.getUnitById(s.summon.uid), undefined);
	assert.ok(s.client.checkSame(s.fight));
	loop.end();
});

for (const Loop of [FightLoopPC, FightLoopWest]) {
	// 两种输入循环均占用主人一次普通行动，召唤物离场后不再请求输入或出手。
	test(`dismiss: ${Loop.name} executes one owner action and removes the summon slot`, async () => {
		const s = setup(Loop),
			requests: number[] = [];
		s.actor.attr.speed = 300;
		s.summon.attr.speed = 200;
		for (const unit of s.fight.getAllUnits()) unit.speedRand = 0;
		s.loop.sortUnitsByProcess();
		s.loop.on('input', (unit) => {
			requests.push(unit.uid);
			s.loop.onInput(unit.uid, unit === s.actor ? s.input : { cmd: FightCmdEnum.defend });
		});
		const ctx = initFightContex(s.fight);
		if (s.loop instanceof FightLoopWest) {
			const waiting = s.loop.waitInput(s.fight.turn, ctx);
			s.loop.onInput(s.actor.uid, { ...s.input, turn: s.fight.turn });
			s.loop.onInput(s.summon.uid, { cmd: FightCmdEnum.defend, turn: s.fight.turn });
			await waiting;
		}
		s.loop.bcMsg(ctx.msgs);
		await s.loop.processOneTurn(s.fight.turn);
		assert.equal(s.fight.getUnitById(s.summon.uid), undefined);
		assert.equal(s.actor.myInputTurn, 1);
		assert.equal(requests.includes(s.summon.uid), false);
		assert.ok(s.client.checkSame(s.fight));
		s.loop.end();
	});
}

// 烟雨的网络入口仍只接受技能，不把移除指令当作额外即时行动。
test('dismiss: YanYu network input rejects dismiss', async () => {
	const s = setup(FightLoopYanYu);
	await s.loop.waitInput(s.fight.turn, initFightContex(s.fight));
	assert.equal(await s.loop.onInput(s.actor.uid, { ...s.input, turn: s.fight.turn }), false);
	assert.equal(s.fight.getUnitById(s.summon.uid), s.summon);
	s.loop.end();
});

for (const cmd of [FightCmdEnum.attack, FightCmdEnum.skill]) {
	// 西游收齐指令后C先移除A：A已提交的行动取消，B原本指向A的普攻/技能按未指定目标处理并正常出手，客户端一致。
	test(
		`dismiss: C removes queued A before B executes command ${cmd} targeting A`,
		{ timeout: 1000 },
		async (t) => {
			const s = setup(),
				loop = s.loop as FightLoopWest;
			t.after(() => loop.end());
			const a = s.target,
				b = s.actor,
				c = s.other;
			class CommandAI extends EmptyAI {
				constructor(private readonly input: FightInput) {
					super();
				}
				override waitInput() {
					return { ...this.input };
				}
			}
			a.ai = new CommandAI({ cmd: FightCmdEnum.attack, target: b.uid });
			c.ai = new CommandAI({ cmd: FightCmdEnum.dismiss, target: a.uid });
			c.attr.speed = 300;
			b.attr.speed = 200;
			a.attr.speed = 100;
			s.summon.attr.speed = 50;
			for (const unit of s.fight.getAllUnits()) unit.speedRand = 0;
			loop.sortUnitsByProcess();
			b.findSkill(chainIds.first).getXls().cd = 2;
			const before = initFightContex(s.fight);
			const waiting = loop.waitInput(s.fight.turn, before);
			const bInput: FightInput = {
				turn: s.fight.turn,
				cmd,
				target: a.uid,
				...(cmd === FightCmdEnum.skill ? { skill: chainIds.first } : {}),
			};
			loop.onInput(b.uid, bInput);
			loop.onInput(s.summon.uid, { turn: s.fight.turn, cmd: FightCmdEnum.defend });
			await waiting;
			loop.bcMsg(before.msgs);
			assert.deepEqual(a.input, { cmd: FightCmdEnum.attack, target: b.uid });
			assert.deepEqual(b.input, bInput);
			assert.ok(loop.actions.some((action) => action.unit === a));
			assert.ok(loop.actions.some((action) => action.unit === b));
			const messages: fightMsg[] = [];
			let checkedDeparture = false;
			loop.onMsg((msgs) => {
				const batch =
					typeof msgs[0] === 'string' ? [msgs as fightMsg] : (msgs as fightMsg[]);
				messages.push(...batch);
				if (batch.some((msg) => msg[0] === 'dismiss')) {
					checkedDeparture = true;
					assert.equal(s.fight.getUnitById(a.uid), undefined);
					assert.equal(
						loop.actions.some((action) => action.unit === a),
						false,
					);
					assert.equal(s.client.getUnitById(a.uid), undefined);
					assert.equal(s.client.sort.includes(a.uid), false);
					assert.ok(s.client.checkSame(s.fight));
				}
			});
			await loop.processOneTurn(s.fight.turn);
			assert.equal(checkedDeparture, true);
			assert.deepEqual(
				messages.filter((msg) => msg[0] === 'dismiss'),
				[['dismiss', c.uid, a.uid]],
			);
			assert.equal(messages.find((msg) => msg[0] === 'actor')?.[1], c.uid);
			assert.equal(
				messages.some((msg) => msg[0] === 'actor' && msg[1] === a.uid),
				false,
			);
			assert.equal(
				messages.some((msg) => msg[0] === 'hurt' && msg[2] === c.uid && msg[3] === b.uid),
				true,
			);
			assert.equal(a.getHp(), 1000);
			assert.equal(b.getHp(), 1000);
			assert.equal(c.getHp(), cmd === FightCmdEnum.skill ? 790 : 900);
			assert.equal(b.attr.point.mp, cmd === FightCmdEnum.skill ? 90 : 100);
			assert.equal(b.getSkillCd(chainIds.first), cmd === FightCmdEnum.skill ? 2 : 0);
			assert.equal(b.input.target, a.uid);
			assert.equal(loop.actions.length, 0);
			assert.deepEqual(s.client.sort, []);
			assert.deepEqual(s.client.actions, []);
			assert.ok(s.client.checkSame(s.fight));
			assert.equal(s.fight.isEnd(), false);
		},
	);
}
