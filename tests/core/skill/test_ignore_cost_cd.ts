import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
	FightCmdEnum,
	FightInput,
	FightLoopPC,
	FightLoopYanYu,
	initFightContex,
	setFightGlobalData,
} from '../../../src';
import { setupChain, chainIds } from '../../fixtures/skill_chain';

function setup() {
	const s = setupChain({
		rootSelfBuff: false,
		finalReactions: false,
		change: (skills) => {
			skills[0].combo = undefined;
			skills[0].cd = 3;
			skills[0].cost = { hp: 10, mp: 20, sp: 30, jp: 40 };
		},
	});
	setFightGlobalData({ jiqi: true });
	Object.assign(s.actor.attr.point, { sp: 100, spMax: 100, jp: 100, jpMax: 100 });
	const input: FightInput = {
		cmd: FightCmdEnum.skill,
		skill: chainIds.first,
		target: s.target.uid,
		ignoreCostCD: true,
	};
	return { ...s, input };
}

// 测试：免消耗标记只作用于当前指令，后续普通技能仍正常扣费和启动CD。
test('ignoreCostCD: an internal free action does not affect the next ordinary action', () => {
	const s = setup();
	s.fight.processUnit(s.actor, s.input);
	const normal = { ...s.input, ignoreCostCD: false };
	const ctx = s.fight.processUnit(s.actor, normal);
	assert.ok(ctx?.actionStarted);
	assert.equal(s.actor.getHp(), 990);
	assert.equal(s.actor.attr.point.mp, 80);
	assert.equal(s.actor.attr.point.sp, 70);
	assert.equal(s.actor.attr.point.jp, 60);
	assert.equal(s.actor.getSkillCd(chainIds.first), 3);
	s.loop.end();
});

// 测试：临时提供已学查询能力不再隐式免CD，必须由内部指令明确设置免消耗标记。
test('ignoreCostCD: a temporary skill alone does not bypass cooldown', () => {
	const s = setup();
	const skill = s.actor.findSkill(chainIds.first);
	s.actor.startSkillCd(skill, initFightContex(s.fight));
	const normal = { ...s.input, ignoreCostCD: false };
	s.actor.withTemporarySkill(skill, () => {
		assert.equal(s.fight.checkPC(s.actor, normal), false);
		assert.equal(s.fight.checkPC(s.actor, s.input), true);
	});
	s.loop.end();
});

for (const cooling of [false, true]) {
	// 测试：宿主内部指令可免除全部费用与CD，已有CD保持不变，普通攻击结算仍执行。
	test(`ignoreCostCD: trusted execution skips costs and cooldown with existing CD=${cooling}`, () => {
		const s = setup();
		if (cooling) {
			s.actor.startSkillCd(s.actor.findSkill(chainIds.first), initFightContex(s.fight));
			s.fight.turn++;
		}
		const point = { ...s.actor.attr.point },
			cd = s.actor.getSkillCd(chainIds.first);
		assert.equal(s.fight.checkPC(s.actor, s.input), true);
		const ctx = s.fight.processUnit(s.actor, s.input);
		assert.ok(ctx?.msgs.some((m) => m[0] === 'hurt'));
		assert.deepEqual(s.actor.attr.point, point);
		assert.equal(s.actor.getSkillCd(chainIds.first), cd);
		assert.ok(
			!ctx.msgs.some((m) =>
				['costHp', 'costMp', 'costSp', 'costJp', 'skillCd'].includes(m[0]),
			),
		);
		s.loop.end();
	});
}

for (const flag of [false, undefined]) {
	// 测试：省略或false不免消耗，技能仍正常扣除四种资源并启动冷却。
	test(`ignoreCostCD: ${flag} retains ordinary costs and cooldown`, () => {
		const s = setup();
		const input = { ...s.input, ignoreCostCD: flag };
		const ctx = s.fight.processUnit(s.actor, input);
		assert.ok(ctx?.actionStarted);
		assert.equal(s.actor.getHp(), 990);
		assert.equal(s.actor.attr.point.mp, 80);
		assert.equal(s.actor.attr.point.sp, 70);
		assert.equal(s.actor.attr.point.jp, 60);
		assert.equal(s.actor.getSkillCd(chainIds.first), 3);
		s.loop.end();
	});
}

// 测试：公共客户端检查与单位提交拒绝true，false仍接受，不污染单位已提交指令。
test('ignoreCostCD: client validation rejects the internal flag', () => {
	const s = setup();
	assert.equal(s.fight.checkInput(s.actor, s.input), false);
	assert.equal(s.fight.checkOnline(s.actor, s.input), false);
	assert.equal(s.actor.onInput(s.input), false);
	assert.equal(s.actor.input, undefined);
	const normal = { ...s.input, ignoreCostCD: false };
	assert.equal(s.actor.onInput(normal), true);
	s.loop.end();
});

// 测试：PC输入窗口拒绝伪造true，当前输入机会保留，玩家仍可提交正常指令。
test('ignoreCostCD: PC rejects a forged flag without closing input', async () => {
	const s = setup();
	s.loop.end();
	s.target.getActionInput = () => ({ cmd: FightCmdEnum.defend });
	s.other.getActionInput = () => ({ cmd: FightCmdEnum.defend });
	const loop = new FightLoopPC(s.fight);
	loop.onMsg(() => {});
	let accepted: boolean | undefined;
	loop.on('input', (unit) => {
		accepted = loop.onInput(unit.uid, s.input);
		if (!accepted) {
			assert.equal(loop.inputUnit, unit);
			assert.ok(loop.onInput(unit.uid, { cmd: FightCmdEnum.defend }));
		}
	});
	loop.start();
	loop.nextTurn();
	await loop.processOneTurn(s.fight.turn);
	assert.equal(accepted, false);
	assert.equal(s.actor.attr.point.mp, 100);
	loop.end();
});

// 测试：西游网络入口拒绝true，提交数量不增加，也不会关闭当前收指令窗口。
test('ignoreCostCD: West rejects a forged flag without counting the input', async () => {
	const s = setup();
	const waiting = s.loop.waitInput(s.fight.turn, initFightContex(s.fight));
	try {
		s.loop.onInput(s.actor.uid, { ...s.input, turn: s.fight.turn });
		assert.equal(s.loop.inputed, 0);
		assert.equal(s.actor.input, null);
		s.loop.onInput(s.actor.uid, { cmd: FightCmdEnum.defend, turn: s.fight.turn });
		assert.equal(await waiting, 1);
	} finally {
		s.loop.end();
		await waiting;
	}
});

// 测试：烟雨即时技能拒绝true，不进入技能队列，不扣费也不产生攻击。
test('ignoreCostCD: YanYu rejects a forged instant skill', async () => {
	const s = setup();
	s.loop.end();
	const loop = new FightLoopYanYu(s.fight);
	loop.onMsg(() => {});
	loop.start();
	loop.nextTurn();
	await loop.waitInput(s.fight.turn, initFightContex(s.fight));
	try {
		assert.equal(await loop.onInput(s.actor.uid, { ...s.input, turn: s.fight.turn }), false);
		assert.equal(s.actor.attr.point.mp, 100);
		assert.equal(s.target.getHp(), 1000);
	} finally {
		loop.end();
	}
});
