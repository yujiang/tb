import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
	BuffTurnEnum,
	FightClient,
	FightCmdEnum,
	FightLoopPC,
	FightLoopWest,
	FightLoopYanYu,
	FightUnitUser,
	TargetSelectEnum,
	getBuffData,
	initBuffs,
	initSkills,
	initFightContex,
	FightAttr,
	fightMsg,
	setFightGlobalData,
	getSkillData,
} from '../../../src';
import { setupChain, chainIds } from '../../fixtures/skill_chain';

const entrust = 10015101,
	poison = 10015102,
	tick = 10015103;
function setup() {
	const s = setupChain({ rootSelfBuff: false, finalReactions: false });
	s.loop.end();
	s.fight.turn = 0;
	const b = new FightUnitUser(
		3,
		Object.assign(new FightAttr(), structuredClone(s.actor.attrOri)),
		{ name: 'B' },
	);
	s.fight.getSide(0).units.push(b);
	b.setFight(s.fight, 0);
	b.setPos(1);
	for (const [unit, speed] of [
		[s.actor, 300],
		[s.target, 200],
		[b, 100],
		[s.other, 50],
	] as const) {
		unit.attrOri.speed = speed;
		unit.calcAttr();
	}
	initSkills([
		{
			id: entrust,
			name: '托付',
			func: 'entrust',
			magic: true,
			nomove: 1,
			rand: 1,
			sel: { target: TargetSelectEnum.friend },
			attack: {},
			final: {},
			cost: { mp: 10 },
			cd: 2,
		},
		{
			id: poison,
			name: '输入毒',
			func: 'poison',
			magic: true,
			rand: 1,
			sel: { target: TargetSelectEnum.enemy },
			attack: { attack: 10 },
			final: {},
		},
	]);
	s.actor.addSkill(entrust, 1);
	b.addSkill(entrust, 1);
	s.target.getActionInput = () => ({ cmd: FightCmdEnum.defend });
	s.other.getActionInput = () => ({ cmd: FightCmdEnum.defend });
	const loop = new FightLoopPC(s.fight),
		client = new FightClient(),
		messages: fightMsg[] = [];
	loop.onMsg((msgs) => {
		const batch = (typeof msgs[0] === 'string' ? [msgs] : msgs) as fightMsg[];
		messages.push(...batch);
		client.onMsg(JSON.parse(JSON.stringify(batch)));
	});
	loop.start();
	for (const unit of s.fight.getAllUnits()) unit.speedRand = 0;
	loop.nextTurn();
	return { ...s, loop, b, client, messages };
}

// 测试：A把当前行动交给B后立即等B输入，C与B的原行动保留，B两次输入分别触发输入周期Buff。
test('entrust: replaces the current PC slot and waits for B twice', async () => {
	const s = setup();
	initBuffs([
		{
			...getBuffData(chainIds.rest),
			id: tick,
			class: undefined,
			notRemove: false,
			func: 'poison',
			skill: poison,
			skillLevel: 0,
			turnType: BuffTurnEnum.inputTurn,
			lastTurn: 2,
		},
	]);
	const ctx = initFightContex(s.fight);
	s.b.addBuff(s.target, 'test', tick, 1, ctx);
	s.loop.bcMsg(ctx.msgs);
	const inputs: number[] = [];
	s.loop.on('input', (unit) => {
		inputs.push(unit.uid);
		if (unit === s.actor) {
			assert.ok(
				s.loop.onInput(unit.uid, {
					cmd: FightCmdEnum.skill,
					skill: entrust,
					target: s.b.uid,
				}),
			);
		} else {
			if (inputs.length === 2) {
				assert.equal(unit, s.b);
				assert.deepEqual(
					s.loop.processUnits.map((u) => u.uid),
					[s.target.uid, s.b.uid, s.other.uid],
				);
			}
			assert.ok(s.loop.onInput(unit.uid, { cmd: FightCmdEnum.defend }));
		}
	});
	await s.loop.processOneTurn(1);
	assert.deepEqual(inputs, [s.actor.uid, s.b.uid, s.b.uid]);
	assert.equal(s.b.myInputTurn, 2);
	assert.equal(s.b.getHp(), 980);
	assert.equal(s.b.findBuff(tick), undefined);
	assert.equal(s.actor.attr.point.mp, 90);
	assert.equal(s.actor.getSkillCd(entrust), 2);
	assert.ok(s.messages.some((m) => m[0] === 'sort' && m[1].join(',') === '3,1,3,2'));
	assert.ok(s.client.checkSame(s.fight));
	s.loop.end();
});

// 测试：B可再把同一行动位交还UID为0的A，行动ID不增加，托付本身不额外推进集气。
test('entrust: chained transfers preserve the slot and accept uid zero', async () => {
	const s = setup();
	initSkills([{ ...getSkillData(entrust), cd: 0, cost: undefined }]);
	s.actor.addSkill(entrust, 1);
	s.b.addSkill(entrust, 1);
	setFightGlobalData({ jiqi: true });
	for (const unit of s.fight.getAllUnits()) {
		unit.attrOri.point.jpMax = 100;
		unit.calcAttr();
	}
	const originalIds = s.loop.actions.map((a) => a.id);
	const inputs: number[] = [];
	s.loop.on('input', (unit) => {
		inputs.push(unit.uid);
		const target = inputs.length === 1 ? s.b : inputs.length === 2 ? s.actor : undefined;
		assert.ok(
			s.loop.onInput(
				unit.uid,
				target
					? { cmd: FightCmdEnum.skill, skill: entrust, target: target.uid }
					: { cmd: FightCmdEnum.defend },
			),
		);
	});
	s.loop.onMsg((msgs) => {
		const batch = (typeof msgs[0] === 'string' ? [msgs] : msgs) as fightMsg[];
		if (batch.some((m) => m[0] === 'skill' && m[1] === entrust)) {
			assert.deepEqual(
				s.loop.actions.map((a) => a.id),
				originalIds,
			);
		}
	});
	await s.loop.processOneTurn(1);
	assert.deepEqual(inputs, [0, 3, 0, 3]);
	assert.equal(s.actor.myInputTurn, 2);
	assert.equal(s.b.myInputTurn, 2);
	assert.equal(s.actor.attr.point.jp, 4);
	assert.equal(s.loop.actions.length, 0);
	assert.equal(s.fight.canEntrust(s.b), false);
	s.loop.end();
});

// 测试：连续互相托付受每回合64次限制，异常后结束战斗并清理输入与行动队列。
test('entrust: cyclic transfers stop at the action limit and clean up', async () => {
	const s = setup();
	initSkills([{ ...getSkillData(entrust), cd: 0, cost: undefined }]);
	s.actor.addSkill(entrust, 1);
	s.b.addSkill(entrust, 1);
	const errors: unknown[] = [];
	s.loop.onError = (error) => errors.push(error);
	s.loop.on('input', (unit) => {
		s.loop.onInput(unit.uid, {
			cmd: FightCmdEnum.skill,
			skill: entrust,
			target: unit === s.actor ? s.b.uid : s.actor.uid,
		});
	});
	await s.loop.processOneTurn(1);
	assert.equal(errors.length, 1);
	assert.match(String(errors[0]), /Action insertion limit exceeded/);
	assert.equal(s.loop.inputUnit, undefined);
	assert.equal(s.loop.actions.length, 0);
	assert.equal(s.fight.canEntrust(s.actor), false);
});

// 测试：B在受托位可自行选择技能并支付自己的费用，原行动位再次选择防御，不复用上次指令。
test('entrust: the recipient chooses and pays for its own skill', async () => {
	const s = setup();
	s.b.addSkill(chainIds.first, 1);
	let bInputs = 0;
	s.loop.on('input', (unit) => {
		const input =
			unit === s.actor
				? { cmd: FightCmdEnum.skill, skill: entrust, target: s.b.uid }
				: ++bInputs === 1
					? { cmd: FightCmdEnum.skill, skill: chainIds.first, target: s.target.uid }
					: { cmd: FightCmdEnum.defend };
		assert.ok(s.loop.onInput(unit.uid, input));
	});
	await s.loop.processOneTurn(1);
	assert.equal(bInputs, 2);
	assert.equal(s.b.attr.point.mp, 90);
	assert.equal(s.actor.attr.point.mp, 90);
	assert.equal(
		s.messages.filter((m) => m[0] === 'skill' && m[1] === chainIds.first && m[2] === s.b.uid)
			.length,
		1,
	);
	assert.equal(s.b.isDefend(), true);
	assert.ok(s.client.checkSame(s.fight));
	s.loop.end();
});

// 测试：托付只接受存活的其他队友，拒绝非法目标后保留当前输入机会且不扣费。
test('entrust: rejects self enemy dead and nonexistent targets without closing input', async () => {
	const s = setup();
	s.loop.on('input', (unit) => {
		if (unit === s.actor) {
			for (const target of [s.actor.uid, s.target.uid, 999999]) {
				assert.equal(
					s.loop.onInput(unit.uid, { cmd: FightCmdEnum.skill, skill: entrust, target }),
					false,
				);
				assert.equal(s.loop.inputUnit, unit);
			}
			s.b.die();
			assert.equal(
				s.loop.onInput(unit.uid, {
					cmd: FightCmdEnum.skill,
					skill: entrust,
					target: s.b.uid,
				}),
				false,
			);
			s.b.relife();
			assert.equal(unit.attr.point.mp, 100);
		}
		s.loop.onInput(unit.uid, { cmd: FightCmdEnum.defend });
	});
	await s.loop.processOneTurn(1);
	assert.equal(s.actor.attr.point.mp, 100);
	s.loop.end();
});

for (const Loop of [FightLoopWest, FightLoopYanYu]) {
	// 测试：两种网游循环即使学会托付，也在输入和直接执行时拒绝且不扣费。
	test(`entrust: ${Loop.name} rejects the PC-only skill`, () => {
		const s = setup();
		s.loop.end();
		const loop = new Loop(s.fight);
		loop.onMsg(() => {});
		loop.start();
		const input = { cmd: FightCmdEnum.skill, skill: entrust, target: s.b.uid, turn: 1 };
		assert.equal(s.fight.checkInput(s.actor, input), false);
		assert.equal(s.fight.processUnit(s.actor, input), undefined);
		assert.equal(s.actor.attr.point.mp, 100);
		loop.end();
	});
}
