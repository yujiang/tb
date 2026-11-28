import '../../fixtures/default_skills';
import { setFightGlobalData } from '../../../src/fight/Datas/FightGlobalData';
import { FightSkill, getDefaultAttackSkill } from '../../../src/fight/Skills/FightSkill';
import { BuffTurnEnum } from '../../../src/fight/Datas/BuffDatas';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
	Fight,
	FightAttr,
	BaseAttack,
	FightSide,
	FightUnitUser,
	FightUnitMonster,
	FightLoopWest,
	FightClient,
	initFightContex,
	BuffData,
	initBuffs,
	OverlapEnum,
	initSkills,
	FightCmdEnum,
	TargetSelectEnum,
} from '../../../src';

const tauntId = 97801,
	secondTauntId = 97802;
const attackId = 97810,
	healId = 97811,
	selfId = 97812,
	positionId = 97813,
	areaId = 97814,
	spreadId = 97815;

function attr(hp = 1000): FightAttr {
	const base = (rand = 0): BaseAttack => ({
		rand,
		hitP: 0, dodgeP: 0, parryAnit: 0, attackP: 0, defendP: 0,

		hit: 100,
		dodge: 0,
		parry: 0,
		attack: 10,
		defend: 0,
		hurt: 0,
		hurtP: 0,		critP: 0,
		critPAnit: 0,
		critDeep: 0,
		critDeepAnit: 0,
	});
	const a = new FightAttr();
	a.point = { hp, hpMax: 1000, mp: 100, mpMax: 100 };
	a.speed = 100;
	const group = () => ({
		base: base(1),
		next: base(),
		kill: base(),
		spread: base(),
		fback: base(),
		final: { bloodPAnit: 0, bloodP: 0, dbackP: 0, immunity: 0, immunityP: 0 },
	});
	a.physic = group();
	a.magic = group();
	a.heal = base();
	a.poison = base();
	return a;
}

function setup(extra: Partial<BuffData> = {}) {
	const buff: BuffData = {
		id: tauntId,
		name: '嘲讽',
		desc: '强制选择施加者',
		class: 'taunt',
		overlap: OverlapEnum.REPLACE,
		status: [],
		tags: [],
		magic: false,
		attackType: 'base',
		attack: {},
		final: {},
		lastTurn: 2,
		times: 0,
		event: 'hurt',
		turnType: BuffTurnEnum.thisTurn,
		skill: 0,
		skillLevel: 1,
		...extra,
	};
	initBuffs([buff, { ...buff, id: secondTauntId }]);
	const common = { name: '测试技能', magic: true, rand: 1, attack: {}, final: {} };
	initSkills([
		{ ...common, id: attackId, sel: { target: TargetSelectEnum.enemy, sortAttr: 'hp' } },
		{
			...common,
			id: healId,
			func: 'heal',
			sel: { target: TargetSelectEnum.friend, sortAttr: 'hp' },
		},
		{ ...common, id: selfId, func: 'heal', sel: { target: TargetSelectEnum.self } },
		{ ...common, id: positionId, sel: { target: TargetSelectEnum.duiwei } },
		{
			...common,
			id: areaId,
			spread: spreadId,
			sel: { target: TargetSelectEnum.enemy, sortAttr: 'hp' },
		},
		{
			...common,
			id: spreadId,
			sel: { target: TargetSelectEnum.enemy, num: 2, sortAttr: 'hp' },
		},
	]);
	setFightGlobalData({
		protectBuff: undefined,
		allShieldBreak: false,
		maxTurn: 10,
		waitInputSec: 1,
		duiwei: false,
	});
	const fight = new Fight(
		97800,
		{ id: 1, runaway: false, runawayGrade: 0, deathPenalty: 0, winRecover: 0, winReward: 0 },
		0,
	);
	fight.createMap(3, 2);
	const actor = new FightUnitUser(10, attr(), { name: '被嘲讽者' });
	actor.setPos(0);
	const friend = new FightUnitMonster(11, attr(), { name: '友方' });
	friend.setPos(1);
	const source = new FightUnitMonster(0, attr(), { name: '嘲讽来源零号' });
	source.setPos(0);
	const other = new FightUnitMonster(1, attr(50), { name: '低血敌人' });
	other.setPos(2);
	const second = new FightUnitMonster(2, attr(), { name: '另一嘲讽来源' });
	second.setPos(1);
	const a = new FightSide(),
		b = new FightSide();
	a.units.push(actor, friend);
	b.units.push(source, other, second);
	fight.createSide(a, b);
	for (const id of [attackId, healId, selfId, positionId, areaId]) actor.addSkill(id, 1);
	const ctx = initFightContex(fight);
	const add = (from = source, id = tauntId) => actor.addBuff(from, 'test', id, 1, ctx);
	return { fight, actor, friend, source, other, second, ctx, add };
}

// 测试：被嘲讽者攻击编号为零的施加者，不再按随机或最低生命选敌人。
test('taunt: bearer attacks source ID zero instead of random or lowest-HP enemy', () => {
	const { fight, actor, source, ctx, add } = setup();
	add();
	assert.ok(actor.findBuff(tauntId));
	assert.equal(source.findBuff(tauntId), undefined);
	assert.equal(
		fight.selectMainTarget(
			actor,
			new FightSkill(
				{
					...getDefaultAttackSkill().getXls(),
					sel: { target: TargetSelectEnum.enemy, sortAttr: 'hp' },
				},
				1,
			),
		),
		source,
	);
	let samples = 0;
	fight.random = () => {
		samples++;
		return 0.99;
	};
	assert.equal(fight.getDefaultEnemy(actor), source);
	assert.equal(samples, 0);
	setFightGlobalData({ duiwei: true });
	assert.equal(fight.getDefaultEnemy(actor), source);
	assert.equal(fight.processUnit(actor, { cmd: FightCmdEnum.attack })?.defend, source);
	assert.equal(
		fight.processUnit(actor, { cmd: FightCmdEnum.skill, skill: attackId })?.defend,
		source,
	);
	assert.ok(ctx.msgs.every((msg) => msg[0] !== 'sync'));
});

// 测试：合法的显式敌方目标照常接受，执行时重定向且不修改已提交指令。
test('taunt: explicit legal enemy targets are accepted and redirected without mutating input', () => {
	const { fight, actor, source, other, add } = setup();
	add();
	let samples = 0;
	fight.random = () => {
		samples++;
		return 0.99;
	};
	for (const input of [
		{ cmd: FightCmdEnum.attack, target: other.uid },
		{ cmd: FightCmdEnum.none, target: other.uid },
		{ cmd: FightCmdEnum.skill, skill: attackId, target: other.uid },
	]) {
		Object.freeze(input);
		assert.equal(actor.onInput(input), true);
		const submitted = { ...actor.input };
		assert.equal(fight.processUnit(actor, actor.input)?.defend.uid, source.uid);
		assert.deepEqual(actor.input, submitted);
		assert.equal(input.target, other.uid);
	}
	assert.equal(samples, 0);
	assert.equal(other.getHp(), 50);
	assert.equal(source.getHp(), 970);
	assert.equal(actor.onInput({ cmd: FightCmdEnum.attack, target: source.uid }), true);
	assert.equal(actor.onInput({ cmd: FightCmdEnum.defend }), true);
	assert.equal(actor.onInput({ cmd: FightCmdEnum.cancel }), true);
});

// 测试：提交后新增嘲讽会改变执行目标，驱散后恢复原始目标意图。
test('taunt: execution redirects after a new taunt and restores original intent after dispel', () => {
	const { fight, actor, source, other, ctx, add } = setup();
	assert.equal(actor.onInput({ cmd: FightCmdEnum.attack, target: other.uid }), true);
	const intent = actor.input;
	add();
	assert.equal(fight.processUnit(actor, intent)?.defend.uid, source.uid);
	assert.equal(intent.target, other.uid);
	assert.equal(other.getHp(), 50);
	actor.removeBuff(source, 'dispel', tauntId, 99, ctx);
	assert.equal(fight.processUnit(actor, intent)?.defend, other);
	assert.equal(other.getHp(), 40);
});

// 测试：嘲讽不影响友方、自身技能和范围技能副目标的正常选择规则。
test('taunt: friendly/self skills and secondary area targets keep their normal rules', () => {
	const { fight, actor, friend, source, other, second, add } = setup();
	add();
	assert.equal(
		actor.onInput({ cmd: FightCmdEnum.skill, skill: healId, target: friend.uid }),
		true,
	);
	assert.equal(
		actor.onInput({ cmd: FightCmdEnum.skill, skill: selfId, target: actor.uid }),
		true,
	);
	assert.equal(
		fight.processUnit(actor, { cmd: FightCmdEnum.skill, skill: healId, target: friend.uid })
			?.defend,
		friend,
	);
	const ctx = fight.processUnit(actor, {
		cmd: FightCmdEnum.skill,
		skill: areaId,
		target: other.uid,
	});
	assert.ok(ctx);
	assert.equal(ctx.defend, source);
	assert.deepEqual(
		ctx.msgs.filter((msg) => msg[0] === 'hurt').map((msg) => msg[2]),
		[source.uid, other.uid, second.uid],
	);
});

// 测试：多个嘲讽按优先级和注册顺序选择第一个有效来源。
test('taunt: priorities and registration order select the first valid source', () => {
	const { fight, actor, source, second, ctx, add } = setup();
	add();
	add(second, secondTauntId);
	const sel = { target: TargetSelectEnum.enemy, sortAttr: 'hp' };
	assert.equal(
		fight.selectMainTarget(
			actor,
			new FightSkill({ ...getDefaultAttackSkill().getXls(), sel: sel }, 1),
		),
		source,
	);
	actor.removeBuff(source, 'test', tauntId, 99, ctx);
	assert.equal(
		fight.selectMainTarget(
			actor,
			new FightSkill({ ...getDefaultAttackSkill().getXls(), sel: sel }, 1),
		),
		second,
	);
	// 同优先级替换后的实例按新的注册顺序排在后面。
	add();
	assert.equal(
		fight.selectMainTarget(
			actor,
			new FightSkill({ ...getDefaultAttackSkill().getXls(), sel: sel }, 1),
		),
		second,
	);
	initBuffs([{ ...actor.findBuff(tauntId).getXls(), prior: -10 }]);
	add();
	assert.equal(
		fight.selectMainTarget(
			actor,
			new FightSkill({ ...getDefaultAttackSkill().getXls(), sel: sel }, 1),
		),
		source,
	);
	source.die();
	assert.equal(
		fight.selectMainTarget(
			actor,
			new FightSkill({ ...getDefaultAttackSkill().getXls(), sel: sel }, 1),
		),
		second,
	);
});

// 测试：死亡、离场、变为友方或不符合死亡过滤条件的嘲讽来源被忽略。
test('taunt: dead, departed, friendly and death-filter-ineligible sources are ignored', () => {
	const { fight, actor, friend, source, other, second, add } = setup();
	add();
	source.die();
	assert.equal(fight.validateInput(actor, { cmd: FightCmdEnum.attack, target: other.uid }), true);
	source.relife();
	assert.equal(fight.getDefaultEnemy(actor)?.uid, source.uid);
	fight.getSide(source.side).units.splice(0, 1);
	assert.equal(fight.validateInput(actor, { cmd: FightCmdEnum.attack, target: other.uid }), true);
	add(friend);
	assert.equal(fight.validateInput(actor, { cmd: FightCmdEnum.attack, target: other.uid }), true);
	add(second);
	other.die();
	assert.equal(
		fight.selectMainTarget(
			actor,
			new FightSkill({ ...getDefaultAttackSkill().getXls(), func: 'relife' }, 1),
		),
		other,
	);
});

// 测试：非正方形地图上的对位技能仍保留自身目标资格限制。
test('taunt: position skills preserve their own target qualification on a rectangular map', () => {
	const { fight, actor, source, other, add } = setup();
	add();
	// 来源不在技能要求的对位，不能强迫技能选择不合法站位。
	assert.equal(
		fight.processUnit(actor, { cmd: FightCmdEnum.skill, skill: positionId })?.defend,
		other,
	);
	source.setPos(2);
	other.setPos(0);
	assert.equal(
		fight.processUnit(actor, { cmd: FightCmdEnum.skill, skill: positionId })?.defend,
		source,
	);
});

// 测试：嘲讽到期或死亡清理后解除重定向，客户端通过增量消息保持一致。
test('taunt: duration and death cleanup release restriction, with incremental client consistency', () => {
	const { fight, actor, source, other, ctx, add } = setup({ lastTurn: 1 });
	const loop = new FightLoopWest(fight),
		client = new FightClient();
	loop.onMsg((msgs) => client.onMsg(JSON.parse(JSON.stringify(msgs))));
	loop.start();
	add();
	loop.bcMsg(ctx.msgs);
	ctx.msgs.length = 0;
	assert.equal(client.checkSame(fight), true);
	actor.processBeforeTurn(1, ctx);
	loop.bcMsg(ctx.msgs);
	ctx.msgs.length = 0;
	assert.equal(actor.findBuff(tauntId), undefined);
	assert.equal(fight.validateInput(actor, { cmd: FightCmdEnum.attack, target: other.uid }), true);
	add();
	fight.resolveAction(() => actor.onHurt(source, 'test', 10000, ctx));
	loop.bcMsg(ctx.msgs);
	assert.equal(actor.findBuff(tauntId), undefined);
	assert.equal(client.checkSame(fight), true);
});

// 测试：网络指令保存原选择，执行时才将攻击重定向到嘲讽者。
test('taunt: network input preserves selected enemy and execution redirects to the taunter', async () => {
	const { fight, actor, source, other, add } = setup();
	add();
	const loop = new FightLoopWest(fight);
	loop.onMsg(() => {});
	loop.start();
	fight.nextTurn();
	const wait = loop.waitInput(fight.turn, initFightContex(fight));
	loop.onInput(actor.uid, { turn: fight.turn, cmd: FightCmdEnum.attack, target: other.uid });
	assert.equal(loop.inputed, 1);
	assert.equal(await wait, 1);
	assert.equal(actor.input.target, other.uid);
	assert.equal(fight.processUnit(actor, actor.input)?.defend.uid, source.uid);
	assert.equal(actor.input.target, other.uid);
});

// 测试：普通分类标签不会产生程序中的嘲讽选目标行为。
test('taunt: ordinary classification tags do not impose targeting behavior', () => {
	const { fight, actor, other, add } = setup({ class: undefined, tags: ['taunt'] });
	add();
	assert.equal(
		fight.selectMainTarget(
			actor,
			new FightSkill(
				{
					...getDefaultAttackSkill().getXls(),
					sel: { target: TargetSelectEnum.enemy, sortAttr: 'hp' },
				},
				1,
			),
		)?.uid,
		other.uid,
	);
	assert.equal(actor.onInput({ cmd: FightCmdEnum.attack, target: other.uid }), true);
});

// 测试：同编号的新单位实例不能冒充原来的嘲讽施加者。
test('taunt: a replacement unit with the same ID does not replace the original source reference', () => {
	const { fight, actor, source, other, add } = setup();
	add();
	const replacement = new FightUnitMonster(source.uid, attr(), { name: '同 ID 新单位' });
	replacement.setFight(fight, source.side);
	replacement.setPos(source.pos);
	fight.getSide(source.side).units[0] = replacement;
	assert.equal(fight.validateInput(actor, { cmd: FightCmdEnum.attack, target: other.uid }), true);
});

// 测试：守尸指令在嘲讽者有效时重定向，来源死亡且原目标仍死亡时按未指定目标选择存活敌人。
test('taunt: corpse guarding redirects while taunter is valid and selects a living enemy when taunter dies', () => {
	const { fight, actor, source, other, second, add } = setup();
	add();
	other.die();
	const guard = { cmd: FightCmdEnum.attack, target: other.uid };
	assert.equal(actor.onInput(guard), true);
	assert.equal(fight.processUnit(actor, actor.input)?.defend.uid, source.uid);
	source.die();
	assert.equal(actor.onInput(guard), true);
	assert.equal(fight.processUnit(actor, actor.input)?.defend.uid, second.uid);
	assert.equal(second.getHp(), 990);
	assert.equal(other.getHp(), 50); // 尸体不重复受伤。
});

// 测试：非法显式目标仍被拒绝，不能通过嘲讽重定向变为合法指令。
test('taunt: invalid explicit targets remain invalid rather than being rescued by redirection', () => {
	const { fight, actor, friend, add } = setup();
	add();
	let samples = 0;
	fight.random = () => {
		samples++;
		return 0.99;
	};
	for (const target of [friend.uid, actor.uid, 99999, NaN, 1.5]) {
		for (const input of [
			{ cmd: FightCmdEnum.attack, target },
			{ cmd: FightCmdEnum.skill, skill: attackId, target },
		]) {
			assert.equal(actor.onInput(input), false);
			assert.ok(fight.processUnit(actor, input) === undefined);
		}
	}
	assert.equal(samples, 0);
});

// 测试：嘲讽者死亡和复活改变实际攻击目标，客户端同步对应的真实伤害。
test('taunt: execution follows source death and revival while client mirrors actual damage targets', () => {
	const { fight, actor, source, other, ctx, add } = setup();
	const loop = new FightLoopWest(fight),
		client = new FightClient();
	loop.onMsg((msgs) => client.onMsg(JSON.parse(JSON.stringify(msgs))));
	loop.start();
	add();
	loop.bcMsg(ctx.msgs);
	ctx.msgs.length = 0;
	assert.equal(
		actor.onInput({ cmd: FightCmdEnum.skill, skill: attackId, target: other.uid }),
		true,
	);
	fight.resolveAction(() => source.onHurt(actor, 'test', 10000, ctx));
	loop.bcMsg(ctx.msgs);
	ctx.msgs.length = 0;
	const original = fight.processUnit(actor, actor.input);
	assert.ok(original);
	assert.equal(original.defend.uid, other.uid);
	loop.bcMsg(original.msgs);
	assert.equal(client.checkSame(fight), true);

	source.onRelife(actor, 'test', ctx);
	source.onHeal(actor, 'test', 500, ctx);
	loop.bcMsg(ctx.msgs);
	const redirected = fight.processUnit(actor, actor.input);
	assert.ok(redirected);
	assert.equal(redirected.defend.uid, source.uid);
	assert.equal(actor.input.target, other.uid);
	loop.bcMsg(redirected.msgs);
	assert.equal(client.checkSame(fight), true);
});

// 测试：死亡的受控单位仍能提交指令，复活后按照当前嘲讽规则执行。
test('taunt: a dead controlled unit can submit and execute after revival', () => {
	const { fight, actor, source, friend, ctx, add } = setup({ dieNotRemove: true });
	add();
	fight.resolveAction(() => actor.onHurt(source, 'test', 10000, ctx));
	assert.equal(actor.isDied(), true);
	assert.equal(actor.onInput({ cmd: FightCmdEnum.attack, target: source.uid }), true);
	actor.onRelife(friend, 'test', ctx);
	actor.onHeal(friend, 'test', 100, ctx);
	assert.equal(fight.processUnit(actor, actor.input)?.defend.uid, source.uid);
});

// 测试：次数嘲讽的查询和输入预检不计次，两次实际诱导后移除，最后一次仍攻击来源。
test('taunt count: previews are free and the final charge still redirects', () => {
	const { fight, actor, source, other, add } = setup({ lastTurn: 0, times: 2 });
	const buff = add();
	const input = { cmd: FightCmdEnum.attack, target: other.uid };
	for (let i = 0; i < 3; i++) {
		assert.equal(fight.getDefaultEnemy(actor)?.uid, source.uid);
		assert.equal(fight.checkPC(actor, input), true);
		assert.equal(fight.preparePCInput(actor, input)?.target, source.uid);
	}
	assert.equal(buff.times, 2);
	assert.equal(actor.contextEmitter.listenerCount('taunt'), 1);
	assert.equal(actor.contextEmitter.listenerCount('hurt'), 0);
	const first = fight.processUnit(actor, input);
	assert.equal(first?.defend.uid, source.uid);
	assert.equal(buff.times, 1);
	const last = fight.processUnit(actor, input);
	assert.equal(last?.defend.uid, source.uid);
	assert.equal(source.getHp(), 980);
	assert.equal(actor.contextEmitter.listenerCount('taunt'), 0);
	assert.equal(actor.findBuff(tauntId), undefined);
	assert.equal(
		last.msgs.filter((msg) => msg[0] === 'removeBuff' && msg[4] === tauntId).length,
		1,
	);
	assert.equal(fight.processUnit(actor, input)?.defend.uid, other.uid);
});

for (const duration of [true, false]) {
	// 测试：来源石化时两种嘲讽均不诱导；回合型照常到期，次数型保留次数并在解封后生效。
	test(`taunt count: petrification preserves charges while duration=${duration} expires normally`, () => {
		const s = setup({ lastTurn: duration ? 1 : 0, times: duration ? 0 : 2 });
		const buff = s.add();
		initBuffs([
			{
				...buff.getXls(),
				id: 97820,
				class: undefined,
				status: ['石化'],
				times: 0,
				lastTurn: 0,
			},
		]);
		s.source.addBuff(s.source, 'test', 97820, 1, s.ctx);
		const input = { cmd: FightCmdEnum.attack, target: s.other.uid };
		assert.equal(s.fight.processUnit(s.actor, input)?.defend.uid, s.other.uid);
		assert.equal(buff.times, duration ? 0 : 2);
		s.actor.processBeforeTurn(1, s.ctx);
		assert.equal(!!s.actor.findBuff(tauntId), !duration);
		s.source.removeBuff(s.source, 'test', 97820, 99, s.ctx);
		assert.equal(
			s.fight.processUnit(s.actor, input)?.defend.uid,
			duration ? s.other.uid : s.source.uid,
		);
		if (!duration) assert.equal(buff.times, 1);
	});
}

// 测试：次数嘲讽不因受伤、友方技能、防御或无法行动消耗，即使配置旧hurt事件也一样。
test('taunt count: unrelated effects and blocked actions do not consume charges', () => {
	const s = setup({ lastTurn: 0, times: 2, event: 'hurt' });
	const buff = s.add();
	s.actor.onHurt(s.other, 'test', 1, s.ctx);
	s.fight.processUnit(s.actor, { cmd: FightCmdEnum.skill, skill: healId, target: s.friend.uid });
	s.fight.processUnit(s.actor, { cmd: FightCmdEnum.defend });
	initBuffs([
		{ ...buff.getXls(), id: 97821, class: undefined, status: ['眩晕'], times: 0, lastTurn: 0 },
	]);
	s.actor.addBuff(s.source, 'test', 97821, 1, s.ctx);
	s.fight.processUnit(s.actor, { cmd: FightCmdEnum.attack, target: s.other.uid });
	assert.equal(buff.times, 2);
	assert.equal(s.source.getHp(), 1000);
});

// 测试：已经向来源发动的攻击即使未命中也消耗一次，并在次数耗尽后解除嘲讽。
test('taunt count: a redirected miss consumes the final charge', () => {
	const s = setup({ lastTurn: 0, times: 1 });
	s.add();
	s.source.attr.physic.base.dodge = 100;
	s.fight.random = () => 0.5;
	const ctx = s.fight.processUnit(s.actor, { cmd: FightCmdEnum.attack, target: s.other.uid });
	assert.equal(ctx?.defend.uid, s.source.uid);
	assert.equal(
		ctx.msgs.some((msg) => msg[0] === 'miss'),
		true,
	);
	assert.equal(s.source.getHp(), 1000);
	assert.equal(s.actor.findBuff(tauntId), undefined);
});

// 测试：施法费用不足不消耗次数，实际发动失败则仍算一次已诱导的行动。
test('taunt count: insufficient resources are free but a failed activation counts', () => {
	const s = setup({ lastTurn: 0, times: 2 });
	const buff = s.add();
	initSkills([
		{ ...s.actor.findSkill(attackId).getXls(), id: 97822, cost: { mp: 101 } },
		{ ...s.actor.findSkill(attackId).getXls(), id: 97823, rand: 0 },
	]);
	s.actor.addSkill(97822, 1);
	s.actor.addSkill(97823, 1);
	s.fight.processUnit(s.actor, { cmd: FightCmdEnum.skill, skill: 97822, target: s.other.uid });
	assert.equal(buff.times, 2);
	const ctx = s.fight.processUnit(s.actor, {
		cmd: FightCmdEnum.skill,
		skill: 97823,
		target: s.other.uid,
	});
	assert.equal(
		ctx.msgs.some((msg) => msg[0] === 'skillFailed'),
		true,
	);
	assert.equal(buff.times, 1);
});

// 测试：一条包含连击和溅射的完整技能只消耗所选嘲讽的一次，最后一次结束后再清除属性和监听。
test('taunt count: reaction chains consume only the selected buff once and retain its last effect', () => {
	const s = setup({
		lastTurn: 0,
		times: 1,
		notRemove: true,
		magic: true,
		attack: { attack: 20 },
	});
	s.add();
	const second = s.add(s.second, secondTauntId);
	initSkills([{ ...s.actor.findSkill(areaId).getXls(), id: 97824, next: attackId }]);
	s.actor.addSkill(97824, 1);
	const ctx = s.fight.processUnit(s.actor, {
		cmd: FightCmdEnum.skill,
		skill: 97824,
		target: s.other.uid,
	});
	assert.equal(ctx?.defend.uid, s.source.uid);
	assert.equal(s.actor.findBuff(tauntId), undefined);
	assert.equal(second.times, 1);
	assert.equal(s.actor.contextEmitter.listenerCount('taunt'), 1);
	assert.deepEqual(
		ctx.msgs.filter((msg) => msg[0] === 'skill').map((msg) => msg[3]),
		[s.source.uid, s.other.uid, s.second.uid, s.source.uid],
	);
	assert.equal(s.actor.attr.magic.base.attack, 30); // 第二个嘲讽仍保留自己的+20攻击。
	assert.equal(ctx.msgs.filter((msg) => msg[0] === 'removeBuff' && msg[4] === tauntId).length, 1);
});

for (const hidden of [false, true]) {
	// 测试：客户端从初始化和增量消息获得剩余次数，归零后移除；隐藏嘲讽不泄露次数展示。
	test(`taunt count: client mirrors charges and expiration with hidden=${hidden}`, () => {
		const s = setup({ lastTurn: 0, times: 2, notDisplay: hidden });
		const client = new FightClient(),
			loop = new FightLoopWest(s.fight);
		loop.onMsg((msgs) => client.onMsg(JSON.parse(JSON.stringify(msgs))));
		loop.start();
		s.add();
		loop.bcMsg(s.ctx.msgs);
		assert.equal(client.checkSame(s.fight), true);
		assert.equal(
			client.getUnitById(s.actor.uid).buffs.find((buff) => buff[0] === tauntId)?.[4],
			hidden ? undefined : 2,
		);
		for (const left of [1, 0]) {
			const ctx = s.fight.processUnit(s.actor, {
				cmd: FightCmdEnum.attack,
				target: s.other.uid,
			});
			assert.deepEqual(
				ctx.msgs.filter((msg) => msg[0] === 'buffTimes'),
				hidden ? [] : [['buffTimes', s.actor.uid, tauntId, left]],
			);
			loop.bcMsg(ctx.msgs);
			assert.equal(client.checkSame(s.fight), true);
			if (left > 0 && !hidden)
				assert.equal(
					client.getUnitById(s.actor.uid).buffs.find((buff) => buff[0] === tauntId)[4],
					left,
				);
		}
		assert.equal(
			client.getUnitById(s.actor.uid).buffs.some((buff) => buff[0] === tauntId),
			false,
		);
		assert.equal(s.actor.findBuff(tauntId), undefined);
	});
}

// 测试：普通事件次数 Buff 也同步扣次，并在最后一次消息后移除，初始化快照携带当前剩余次数。
test('buff count: ordinary event consumption sends incremental client updates', () => {
	const s = setup({ class: undefined, lastTurn: 0, times: 2, event: 'hurt' });
	s.add();
	const client = new FightClient();
	client.onMsg([
		['start', s.fight.fid],
		...[0, 1].map(
			(side) =>
				['side', side, s.fight.getSide(side).units.map((unit) => unit.getUnitMsg())] as [
					string,
					...any[],
				],
		),
	]);
	assert.equal(client.getUnitById(s.actor.uid).buffs[0][4], 2);
	for (const left of [1, 0]) {
		const ctx = initFightContex(s.fight);
		s.actor.onHurt(s.other, 'test', 1, ctx);
		assert.deepEqual(
			ctx.msgs.filter((msg) => msg[0] === 'buffTimes'),
			[['buffTimes', s.actor.uid, tauntId, left]],
		);
		client.onMsg(JSON.parse(JSON.stringify(ctx.msgs)));
		assert.equal(client.checkSame(s.fight), true);
	}
});

// 测试：同时配置回合和次数时到期立即解绑，即使仍有次数且禁止驱散也不继续诱导。
test('taunt count: duration expiration removes remaining charges and its listener', () => {
	const s = setup({ lastTurn: 1, times: 3, notRemove: true });
	const buff = s.add();
	assert.equal(s.actor.contextEmitter.listenerCount('taunt'), 1);
	s.actor.processBeforeTurn(1, s.ctx);
	assert.equal(buff.times, 3);
	assert.equal(s.actor.findBuff(tauntId), undefined);
	assert.equal(s.actor.contextEmitter.listenerCount('taunt'), 0);
	assert.equal(
		s.fight.processUnit(s.actor, { cmd: FightCmdEnum.attack, target: s.other.uid })?.defend.uid,
		s.other.uid,
	);
});
