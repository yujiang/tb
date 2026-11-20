import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
	FightAttr,
	FightClient,
	FightCmdEnum,
	FightLoopPC,
	FightLoopWest,
	FightLoopYanYu,
	FightReport,
	FightUnitUser,
	FightUnitMonster,
	PropEnum,
	initFightContex,
	initSkills,
	initPassives,
	fightMsg,
} from '../../../src';
import { setupChain, chainIds } from '../../fixtures/skill_chain';
import { equipSkill } from '../../../src/fight/Skills/Funcs/Buff';

const ultimateId = 1001070;
class ProbeLoop extends FightLoopPC {
	runUltimate(turn: number) {
		return this.processUltimate(turn);
	}
}
function setup(enabled = true) {
	const s = setupChain({
		rootSelfBuff: false,
		finalReactions: false,
		change: (skills) => {
			skills[0].combo = undefined;
			skills[0].damageRate = 1;
			skills[0].nosupport = true;
		},
	});
	initSkills([
		{
			id: ultimateId,
			name: '天外飞仙',
			magic: true,
			rand: 1,
			attack: { attack: 100 },
			final: {},
			cost: { mp: 3 },
			nofback: true,
			nodback: true,
			nosupport: true,
			sel: s.skills[0].sel,
		},
	]);
	const ally = new FightUnitUser(
		3,
		Object.assign(new FightAttr(), structuredClone(s.actor.attrOri)),
		{ name: '侠客' },
	);
	ally.addSkill(chainIds.first, 1);
	ally.addSkill(ultimateId, 1);
	ally.setUltimateSkill(ultimateId);
	s.actor.addSkill(ultimateId, 2);
	s.actor.setUltimateSkill(ultimateId);
	s.actor.setAttackSkill(chainIds.first);
	ally.setAttackSkill(chainIds.first);
	s.fight.getSide(0).units.push(ally);
	s.fight.createSide(s.fight.getSide(0), s.fight.getSide(1));
	s.fight.xls.allShieldBreak = enabled;
	s.fight.xls.duiwei = true;
	s.fight.createMap(5, 1);
	s.actor.setPos(0);
	ally.setPos(1);
	s.target.setPos(4);
	s.other.setPos(3);
	for (const unit of [s.actor, ally]) {
		unit.attrOri.weaponProp = PropEnum.金;
	}
	for (const unit of [s.target, s.other]) {
		unit.attrOri.shield = 1;
		unit.attrOri.weakProp = [PropEnum.金];
		unit.attrOri.speed = 50;
	}
	s.actor.attrOri.speed = 300;
	ally.attrOri.speed = 200;
	for (const unit of s.fight.getAllUnits()) unit.calcAttr();
	s.fight.turn = 0;
	s.loop.start();
	s.loop.nextTurn();
	const hit = (target = s.target) => {
		const ctx = s.fight.processUnit(s.actor, {
			cmd: FightCmdEnum.skill,
			skill: chainIds.first,
			target: target.uid,
		});
		assert.ok(ctx);
		s.flush(ctx);
		return ctx;
	};
	const breakAll = () => {
		hit(s.target);
		return hit(s.other);
	};
	return { ...s, ally, hit, breakAll };
}

// 测试：所有存活敌人均破盾后只给己方一次大招机会，重复伤害不重复发放，客户端逐批一致。
test('ultimate: all living enemies must be broken before granting the shared chance', () => {
	const s = setup();
	s.hit();
	assert.equal(s.fight.hasUltimateChance(0), false);
	const ctx = s.hit(s.other);
	assert.equal(s.fight.hasUltimateChance(0), true);
	assert.equal(s.fight.hasUltimateChance(1), false);
	assert.deepEqual(
		ctx.msgs.filter((msg) => msg[0] === 'ultimateReady'),
		[['ultimateReady', 0, true]],
	);
	assert.ok(!s.hit().msgs.some((msg) => msg[0] === 'ultimateReady'));
	assert.ok(s.client.checkSame(s.fight));
});

// 测试：默认关闭功能，无盾的存活敌人不算破盾，不能因只破了带盾者就获得机会。
test('ultimate: disabled mode and an unshielded living enemy prevent a grant', () => {
	const disabled = setup(false);
	disabled.breakAll();
	assert.equal(disabled.fight.hasUltimateChance(0), false);
	const s = setup();
	s.other.attrOri.shield = undefined;
	s.other.calcAttr();
	s.loop.start();
	s.hit();
	assert.equal(s.fight.hasUltimateChance(0), false);
	const ctx = initFightContex(s.fight);
	s.fight.resolveAction(() => s.other.onHurt(s.actor, 'test', 1000, ctx));
	s.flush(ctx);
	assert.equal(s.fight.hasUltimateChance(0), false);
	s.target.attr.shield = 1;
	s.client.onMsg(['shield', s.target.uid, 1]);
	s.hit();
	assert.equal(s.fight.hasUltimateChance(0), true);
});

// 测试：大招按装配技能执行并收费，机会全队共享且一回合只消费一次，不推进普通输入次数。
test('ultimate: one equipped hero spends the team chance without consuming a normal turn', () => {
	const s = setup();
	s.breakAll();
	const inputTurn = s.ally.myInputTurn;
	const ctx = s.fight.processUltimate(s.ally, { cmd: FightCmdEnum.skill, target: s.target.uid });
	assert.ok(ctx);
	s.flush(ctx);
	assert.equal(s.ally.attr.point.mp, 97);
	assert.equal(s.ally.myInputTurn, inputTurn);
	assert.equal(s.target.getHp(), 550);
	assert.equal(s.fight.hasUltimateChance(0), false);
	assert.equal(
		s.fight.processUltimate(s.actor, { cmd: FightCmdEnum.skill, target: s.target.uid }),
		undefined,
	);
	assert.ok(s.client.checkSame(s.fight));
});

// 测试：无机会、非法目标、费用不足、冷却或禁止技能均拒绝大招，失败不消费整队机会。
test('ultimate: strict checks preserve the opportunity on rejected choices', () => {
	const s = setup();
	assert.equal(s.fight.processUltimate(s.actor, { cmd: FightCmdEnum.skill }), undefined);
	s.breakAll();
	assert.equal(
		s.fight.processUltimate(s.actor, { cmd: FightCmdEnum.skill, target: s.ally.uid }),
		undefined,
	);
	s.actor.isForbid = (action) => action === 'skill';
	assert.equal(s.fight.processUltimate(s.actor, { cmd: FightCmdEnum.skill }), undefined);
	s.actor.isForbid = () => false;
	const data = s.actor.getUltimateSkill().getXls();
	data.cost = { mp: 1000 };
	assert.equal(s.fight.processUltimate(s.actor, { cmd: FightCmdEnum.skill }), undefined);
	data.cost = { mp: 3 };
	data.cd = 2;
	const cd = initFightContex(s.fight);
	s.actor.startSkillCd(s.actor.getUltimateSkill(), cd);
	s.flush(cd);
	assert.equal(s.fight.processUltimate(s.actor, { cmd: FightCmdEnum.skill }), undefined);
	assert.equal(s.fight.hasUltimateChance(0), true);
	assert.equal(s.actor.attr.point.mp, 80);
});

// 测试：已触发的事件不因回盾取消，正常用过一次后下一回合再次破盾才能再触发。
test('ultimate: a triggered opportunity is latched and a new round can grant another', () => {
	const pending = setup();
	pending.breakAll();
	pending.target.attr.shield = 1;
	pending.client.onMsg(['shield', pending.target.uid, 1]);
	const changed = initFightContex(pending.fight);
	pending.fight.updateUltimate(changed);
	pending.flush(changed);
	assert.equal(pending.fight.hasUltimateChance(0), true);
	const s = setup();
	s.breakAll();
	s.flush(s.fight.processUltimate(s.ally, { cmd: FightCmdEnum.skill, target: s.target.uid }));
	s.loop.nextTurn();
	const before = initFightContex(s.fight);
	s.loop.processBeforeTurn(2, before);
	s.flush(before);
	assert.equal(s.fight.hasUltimateChance(0), false);
	s.breakAll();
	assert.equal(s.fight.hasUltimateChance(0), true);
});

// 测试：同回合用过大招后即使人为再次恢复并打破护盾，也不能重复获得机会。
test('ultimate: breaking twice in the same round never grants a second use', () => {
	const s = setup();
	s.breakAll();
	const used = s.fight.processUltimate(s.ally, { cmd: FightCmdEnum.skill, target: s.target.uid });
	s.flush(used);
	for (const unit of [s.target, s.other]) {
		unit.attr.shield = 1;
		s.client.onMsg(['shield', unit.uid, 1]);
	}
	s.breakAll();
	assert.equal(s.fight.hasUltimateChance(0), false);
});

// 测试：战斗已经结束时不发放无对象的大招机会，也不会在反应链结束前提前打开机会。
test('ultimate: the complete action must finish with living broken enemies', () => {
	const s = setup();
	s.hit();
	let duringHit = true;
	s.other.onContex('hurt', () => {
		duringHit = s.fight.hasUltimateChance(0);
	});
	s.hit(s.other);
	assert.equal(duringHit, false);
	assert.equal(s.fight.hasUltimateChance(0), true);
	const ctx = initFightContex(s.fight);
	s.fight.resolveAction(() => {
		s.target.onHurt(s.actor, 'test', 1000, ctx);
		s.other.onHurt(s.actor, 'test', 1000, ctx);
	});
	s.flush(ctx);
	assert.equal(s.fight.hasUltimateChance(0), false);
});

// 测试：被动和主动装配不重新学习大招或改变等级，0 可以卸下。
test('ultimate: passive and active equipment preserve learned skill levels', () => {
	const s = setup();
	initPassives([
		{
			id: 1001071,
			name: '大招被动',
			desc: '',
			magic: false,
			attackType: 'base',
			attack: {},
			final: {},
			status: [],
			tags: [],
			ultimateSkill: ultimateId,
		},
	]);
	s.actor.setUltimateSkill(0);
	s.actor.setPassiveSkills([[1001071, 1]]);
	assert.equal(s.actor.getUltimateSkill().level, 2);
	s.skills[0].ultimateSkill = 0;
	equipSkill(s.actor, s.actor.findSkill(chainIds.first), initFightContex(s.fight));
	assert.equal(s.actor.getUltimateSkill(), undefined);
	assert.equal(s.actor.findSkill(ultimateId).level, 2);
});

for (const Loop of [FightLoopPC, FightLoopWest, FightLoopYanYu]) {
	// 测试：三种循环都在当前行动动画结束后等大招输入并立即执行，原行动条与普通输入次数不受影响。
	test(`ultimate: ${Loop.name} waits for one choice then resumes its normal action queue`, async () => {
		const s = setup(),
			loop = new Loop(s.fight),
			client = new FightClient(),
			report = new FightReport(() => {}, false);
		const messages: fightMsg[] = [];
		let draws = 0,
			requested = 0;
		loop.onMsg((msgs) => {
			const wire = JSON.parse(JSON.stringify(msgs));
			const batch = typeof wire[0] === 'string' ? [wire] : wire;
			messages.push(...batch);
			client.onMsg(wire);
			report.onMsg(wire);
			if (client.sides[0].length && client.sides[1].length)
				assert.ok(client.checkSame(s.fight));
		});
		loop.waitDrawOver = async () => {
			draws++;
		};
		loop.on('input', (unit) => loop.onInput(unit.uid, { cmd: FightCmdEnum.attack }));
		loop.on('ultimate', (side, turn, units) => {
			requested++;
			assert.equal(side, 0);
			assert.ok(draws > 0);
			assert.equal(units.length, 2);
			const bar = [...client.sort];
			assert.equal(
				loop.onInputUltimate(s.target.uid, { cmd: FightCmdEnum.skill, turn }),
				false,
			);
			assert.equal(
				loop.onInputUltimate(s.actor.uid, {
					cmd: FightCmdEnum.skill,
					skill: chainIds.first,
					turn,
				}),
				false,
			);
			if (!(loop instanceof FightLoopPC))
				assert.equal(loop.onInputUltimate(s.actor.uid, { cmd: FightCmdEnum.skill }), false);
			assert.equal(
				loop.onInputUltimate(s.actor.uid, {
					cmd: FightCmdEnum.skill,
					target: s.target.uid,
					turn,
				}),
				true,
			);
			assert.equal(
				loop.onInputUltimate(s.ally.uid, {
					cmd: FightCmdEnum.skill,
					target: s.target.uid,
					turn,
				}),
				false,
			);
			assert.deepEqual(client.sort, bar);
		});
		loop.start();
		s.fight.turn = 0;
		loop.nextTurn();
		if (loop instanceof FightLoopYanYu) {
			const ctx = initFightContex(s.fight);
			await loop.waitInput(1, ctx);
			loop.bcMsg(ctx.msgs);
		}
		for (const unit of s.fight.getAllUnits()) unit.input = { cmd: FightCmdEnum.attack };
		await loop.processOneTurn(1);
		assert.equal(requested, 1);
		assert.equal(s.actor.attr.point.mp, 97);
		assert.equal(
			messages.filter((msg) => msg[0] === 'actor' && msg[3] === 'ultimate').length,
			1,
		);
		assert.equal(s.actor.myInputTurn, loop instanceof FightLoopWest ? 0 : 1);
		assert.match(report.toString(), /施放大招/);
		assert.doesNotMatch(report.toString(), /未识别消息/);
		assert.ok(client.checkSame(s.fight));
		loop.end();
	});
}

// 测试：三个敌人只有最后一个破盾才触发，当前三段连招全部结束后才发布大招机会。
test("ultimate: the third enemy's break triggers only after all combo segments finish", () => {
	const s = setup();
	const third = new FightUnitMonster(
		4,
		Object.assign(new FightAttr(), structuredClone(s.other.attrOri)),
		{ name: '第三敌人' },
	);
	third.setPos(2);
	s.fight.getSide(1).units.push(third);
	s.fight.createSide(s.fight.getSide(0), s.fight.getSide(1));
	s.loop.start();
	s.skills[0].combo = chainIds.second;
	for (const skill of s.skills) skill.damageRate = 1;
	s.hit();
	s.hit(s.other);
	assert.equal(s.fight.hasUltimateChance(0), false);
	const during: boolean[] = [];
	third.onContex('hurt', () => during.push(s.fight.hasUltimateChance(0)));
	const ctx = s.hit(third);
	assert.deepEqual(during, [false, false, false]);
	assert.equal(s.fight.hasUltimateChance(0), true);
	assert.equal(ctx.msgs[ctx.msgs.length - 1][0], 'ultimateReady');
});

// 测试：前两人已破盾，第三人盾未破却被非弱点伤害直接击杀时，不发 break，也不补发全体破盾机会。
test('ultimate: killing the third enemy without breaking its shield is not a break event', () => {
	const s = setup();
	const attr = Object.assign(new FightAttr(), structuredClone(s.other.attrOri));
	attr.point.hp = 50;
	const third = new FightUnitMonster(4, attr, { name: '未破盾的第三敌人' });
	third.setPos(2);
	s.fight.getSide(1).units.push(third);
	s.fight.createSide(s.fight.getSide(0), s.fight.getSide(1));
	s.loop.start();
	let breaks = 0;
	third.onContex('break', () => {
		breaks++;
	});
	s.hit();
	s.hit(s.other);
	assert.equal(s.fight.hasUltimateChance(0), false);
	s.actor.attr.weaponProp = PropEnum.none;
	const killed = s.hit(third);
	assert.equal(third.isDied(), true);
	assert.equal(third.attr.shield, 1);
	assert.equal(breaks, 0);
	assert.ok(!killed.msgs.some((msg) => msg[0] === 'ultimateReady' && msg[2] === true));
	assert.equal(s.fight.hasUltimateChance(0), false);
	// 继续攻击已经破盾的存活敌人也不能从“剩余者全破”反推一个新事件。
	s.hit();
	assert.equal(s.fight.hasUltimateChance(0), false);
	assert.ok(s.client.checkSame(s.fight));
});

// 测试：放弃独立大招输入后本回合不再询问，正常队列可以继续且没有技能费用。
test("ultimate: cancelling the choice declines this round's opportunity", async () => {
	const s = setup(),
		loop = new ProbeLoop(s.fight);
	loop.onMsg((msgs) => s.loop.bcMsg(msgs));
	loop.start();
	s.breakAll();
	let requests = 0;
	loop.on('ultimate', () => {
		requests++;
		assert.equal(loop.onInputUltimate(s.actor.uid, { cmd: FightCmdEnum.cancel }), true);
	});
	await loop.runUltimate(1);
	await loop.runUltimate(1);
	assert.equal(requests, 1);
	assert.equal(s.fight.hasUltimateChance(0), false);
	assert.equal(s.actor.attr.point.mp, 80);
	loop.end();
});

// 测试：大招输入回调异常会记录错误并判攻击方失败，不留下仍能提交的失效输入。
test('ultimate: input callback errors close the ultimate window', async (t) => {
	const logged = t.mock.method(console, 'error', () => {});
	const s = setup(),
		loop = new ProbeLoop(s.fight);
	loop.onMsg((msgs) => s.loop.bcMsg(msgs));
	loop.start();
	s.breakAll();
	loop.on('ultimate', () => {
		throw new Error('ultimate input failure');
	});
	await loop.runUltimate(1);
	assert.equal(s.fight.win, 1);
	assert.equal(logged.mock.callCount(), 1);
	assert.equal(loop.ultimateSide, undefined);
	loop.end();
});

// 测试：即使已有待处理机会，也不能从受伤回调中直接插入大招，必须等当前 action 完成。
test('ultimate: direct execution cannot interrupt an unfinished action', () => {
	const s = setup();
	s.breakAll();
	const attempts: unknown[] = [];
	s.target.onContex('hurt', () =>
		attempts.push(
			s.fight.processUltimate(s.ally, { cmd: FightCmdEnum.skill, target: s.other.uid }),
		),
	);
	const ctx = s.fight.processUnit(s.actor, {
		cmd: FightCmdEnum.skill,
		skill: chainIds.first,
		target: s.target.uid,
	});
	assert.deepEqual(attempts, [undefined]);
	assert.equal(s.ally.attr.point.mp, 100);
	assert.equal(s.fight.hasUltimateChance(0), true);
	s.flush(ctx);
});

// 测试：西游在大招输入窗口被宿主结束后停止剩余行动，不再调用后续 NPC。
test('ultimate: ending the online ultimate prompt stops the remaining action queue', async () => {
	const s = setup();
	let attempts = 0;
	for (const unit of [s.target, s.other])
		unit.processOneTurn = () => {
			attempts++;
			return undefined;
		};
	for (const unit of s.fight.getAllUnits()) unit.input = { cmd: FightCmdEnum.attack };
	s.loop.on('ultimate', () => s.loop.end());
	await s.loop.processOneTurn(1);
	assert.equal(attempts, 0);
});

// 测试：没有人装配大招时不弹输入窗口，回合上限结束也清理客户端的待用机会。
test('ultimate: ending at the round limit clears an unused client opportunity', async () => {
	const s = setup();
	s.actor.setUltimateSkill(0);
	s.ally.setUltimateSkill(0);
	s.fight.xls.maxTurn = 1;
	const loop = new FightLoopPC(s.fight),
		client = new FightClient();
	let requests = 0;
	loop.onMsg((msgs) => {
		client.onMsg(JSON.parse(JSON.stringify(msgs)));
		if (client.sides[0].length && client.sides[1].length) assert.ok(client.checkSame(s.fight));
	});
	loop.on('input', (unit) => loop.onInput(unit.uid, { cmd: FightCmdEnum.attack }));
	loop.on('ultimate', () => {
		requests++;
	});
	await loop.run();
	assert.equal(requests, 0);
	assert.deepEqual(client.ultimateReady, [false, false]);
});

// 测试：普通技能指令不能绕过大招独立输入窗口，即使已获得机会也必须通过大招入口执行。
test('ultimate: ordinary skill inputs cannot bypass the ultimate opportunity flow', () => {
	const s = setup(),
		input = { cmd: FightCmdEnum.skill, skill: ultimateId, target: s.target.uid };
	assert.equal(s.fight.checkOnline(s.actor, input), false);
	assert.equal(s.fight.checkPC(s.actor, input), false);
	assert.equal(s.fight.processUnit(s.actor, input), undefined);
	s.breakAll();
	assert.equal(s.fight.processUnit(s.actor, input), undefined);
	assert.equal(s.fight.hasUltimateChance(0), true);
	assert.equal(s.actor.attr.point.mp, 80);
	const ctx = s.fight.processUltimate(s.actor, input);
	assert.ok(ctx);
	s.flush(ctx);
});
