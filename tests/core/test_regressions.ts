import { setFightGlobalData } from '../../src/fight/Fight';
import { BuffTurnEnum } from '../../src/fight/Buffs/BuffDatas';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { Fight } from '../../src/fight/Fight';
import { BaseAttack, FightAttr } from '../../src/fight/FightAttr';
import { FightSide } from '../../src/fight/FightSide';
import { FightLoopWest } from '../../src/fight/Loop/FightLoopWest';
import { FightUnitMonster } from '../../src/fight/Unit/FightUnitMonster';
import { FightUnitSummon, FightUnitUser } from '../../src/fight/Unit/FightUnitUser';
import { BuffData, initBuffs, OverlapEnum } from '../../src/fight/Buffs/BuffDatas';
import { FightSkill, getDefaultSkill } from '../../src/fight/Skills/FightSkill';
import { FightContex, initFightContex } from '../../src/fight/Fight';
import { attackFunc } from '../../src/fight/Skills/Funcs/NormalAttack';
import { tryBlood, tryDBack } from '../../src/fight/Skills/FightBack';
import { initSkills, SkillData } from '../../src/fight/Skills/SkillDatas';
import { relifeFunc } from '../../src/fight/Skills/Funcs/Relife';
import {
	FightCmdEnum,
	FightSideEnum,
	FightResultEnum,
	TargetSelectEnum,
} from '../../src/fight/struct';
import { FightReport } from '../../src/fight/Client/FightReport';

// 测试：主技能概率判定失败时发出未发动消息，简报说明行动者没有攻击的原因。
test('regression: failed primary skill activation reports why the actor did nothing', () => {
	const { f, u, v } = pair();
	initSkills([skill(97404, { name: '普通魔法', rand: 0.8 })]);
	u.addSkill(97404, 1);
	let samples = 0;
	f.random = () => {
		samples++;
		return 0.9;
	};
	const ctx = f.processUnit(u, { cmd: FightCmdEnum.skill, skill: 97404, target: v.uid });
	assert.ok(ctx);
	assert.equal(v.getHp(), 100);
	assert.equal(samples, 1);
	assert.deepEqual(ctx.msgs, [['skillFailed', u.uid, v.uid, 97404]]);
	const report = new FightReport(() => {});
	report.onMsg([
		['start', f.fid],
		['side', 0, [u.getUnitMsg()]],
		['side', 1, [v.getUnitMsg()]],
		['actor', u.uid, u.getSpeed()],
		...ctx.msgs,
	]);
	assert.match(report.toString(), /A（#1）.*\[普通魔法\]未发动/);
	assert.doesNotMatch(report.toString(), /造成|未识别消息|未命中/);
});

function base(extra: Partial<BaseAttack> = {}): BaseAttack {
	return {
		rand: 0,
		hit: 100,
		dodge: 0,
		attack: 20,
		defend: 0,
		hurt: 0,
		hurtP: 0,
		hurtAnti: 0,
		hurtPAnti: 0,
		critP: 0,
		critPAnit: 0,
		critDeep: 0,
		critDeepAnit: 0,
		...extra,
	};
}

function attr(): FightAttr {
	const a = new FightAttr();
	a.point = { hp: 100, hpMax: 100, mp: 100, mpMax: 100 };
	a.speed = 100;
	const group = () => ({
		base: base({ rand: 1 }),
		next: base(),
		kill: base(),
		spread: base(),
		fback: base(),
		final: { bloodP: 0, dbackP: 0, immunity: 0, immunityP: 0 },
	});
	a.physic = group();
	a.magic = group();
	a.heal = base();
	a.poison = base();
	return a;
}

function pair(user = false, extraEnemy = false) {
	setFightGlobalData({
		protectBuff: undefined,
		allShieldBreak: false,
		maxTurn: 10,
		waitInputSec: 0.01,
		duiwei: false,
	});
	const f = new Fight(
		1,
		{ runaway: false, runawayGrade: 0, deathPenalty: 0, winRecover: 0, winReward: 0 },
		123,
	);
	f.random = () => 0.5;
	const a = new FightSide(),
		b = new FightSide();
	const u = user
		? new FightUnitUser(1, attr(), { name: 'A' })
		: new FightUnitMonster(1, attr(), { name: 'A' });
	const v = new FightUnitMonster(2, attr(), { name: 'B' });
	u.setPos(0);
	v.setPos(0);
	a.units.push(u);
	b.units.push(v);
	if (extraEnemy) {
		const w = new FightUnitMonster(3, attr(), { name: 'C' });
		w.setPos(1);
		b.units.push(w);
	}
	f.createSide(a, b);
	const c: FightContex = { fight: f, attack: u, defend: v, msgs: [], effects: [] };
	const loop = new FightLoopWest(f);
	loop.bcMsg = () => {};
	return { f, u, v, c, loop };
}

function skill(id: number, extra: Partial<SkillData> = {}): SkillData {
	return {
		id,
		name: String(id),
		magic: true,
		rand: 1,
		sel: { target: TargetSelectEnum.enemy },
		attack: base({ attack: 0, hit: 0 }),
		final: { bloodP: 0, dbackP: 0, immunity: 0, immunityP: 0 },
		...extra,
	};
}

function buff(id: number): BuffData {
	return {
		id,
		name: 'attack',
		desc: '',
		overlap: OverlapEnum.NOT,
		turnType: BuffTurnEnum.thisTurn,
		lastTurn: 0,
		times: 0,
		event: 'hurt',
		skill: 0,
		skillLevel: 1,
		status: [],
		tags: [],
		magic: false,
		attackType: 'base',
		attack: { attack: 10 },
		final: {},
	};
}

// 测试：技能反击只触发一次，并使用反击属性计算伤害。
test('regression: skill counterattacks stop after one reaction and use fback attributes', () => {
	const { f, u, v } = pair();
	initSkills([skill(8001, { nofback: false })]);
	for (const unit of [u, v]) {
		unit.attr.point.hp = 1000000;
		unit.attr.point.hpMax = 1000000;
		unit.attr.magic.fback.attack = 7;
		unit.addSkill(8001, 1);
		unit.fbackSkill = 8001;
	}
	initSkills([skill(8002, { nofback: false })]);
	u.addSkill(8002, 1);
	const ctx = f.processUnit(u, { cmd: FightCmdEnum.skill, skill: 8002, target: v.uid });
	assert.equal(ctx.msgs.filter((m) => m[0] === 'hurt').length, 2);
	assert.equal(u.getHp(), 1000000 - 7);
	assert.equal(v.getHp(), 1000000 - 20);
});

// 测试：同一上下文中的递归反应链达到上限时给出明确异常。
test('regression: reentrant reaction chains fail with a bounded diagnostic', () => {
	const { f, u, v, c } = pair();
	v.attr.point.hp = v.attr.point.hpMax = 100000000;
	f.onUnitEvent('hurt', () => attackFunc(u, v, c));
	assert.throws(() => attackFunc(u, v, c), /reaction limit/i);
});

// 测试：吸血和反伤按配置比例计算，并记录正确的伤害来源。
test('regression: lifesteal and reflection respect fractional ratios and source', () => {
	const { u, v, c } = pair();
	u.attr.point.hp = 50;
	u.attr.physic.final.bloodP = 0.2;
	v.attr.physic.final.dbackP = 0.2;
	tryBlood(u, v, false, 10, undefined, c);
	assert.equal(u.getHp(), 52);
	tryDBack(u, v, false, 10, c);
	assert.equal(u.getHp(), 50);
	assert.equal(c.msgs.find((m) => m[0] === 'hurt')[3], v.uid);
});

// 测试：死亡清除属性 Buff，过量伤害后复活仍获得有效血量。
test('regression: death clears attribute buffs and revival restores valid HP', () => {
	const { u, v, c } = pair();
	initBuffs([buff(8010)]);
	v.addBuff(u, 'test', 8010, 1, c);
	assert.equal(v.attr.physic.base.attack, 30);
	v.onHurt(u, 'test', 250, c);
	assert.equal(v.attr.physic.base.attack, 20);
	assert.equal(v.getHp(), 0);
	relifeFunc(u, v, new FightSkill(skill(8011, { healRate: 0.5 }), 1), c);
	assert.equal(v.isDied(), false);
	assert.equal(v.getHp(), 50);
});

// 测试：复活比例以被复活者最大生命计算，与施法者血量及攻击配置无关。
test('regression: revival healing scales with target maximum HP rather than caster HP', () => {
	for (const casterHpMax of [100, 1000]) {
		const { u, v, c } = pair();
		u.attr.point.hp = u.attr.point.hpMax = casterHpMax;
		v.attr.point.hp = v.attr.point.hpMax = 400;
		v.onHurt(u, 'test', 400, c);
		assert.equal(v.isDied(), true);
		const revive = new FightSkill(
			skill(98110, {
				func: 'relife',
				healRate: 0.3,
				attack: { attack: 999 },
				attackLevel: { attack: 5 },
			}),
			2,
		);
		assert.equal(relifeFunc(u, v, revive, c), true);
		assert.equal(v.isDied(), false);
		assert.equal(v.getHp(), 120);
		assert.equal(c.msgs.find((m) => m[0] === 'heal')[4], 120);
		assert.equal(u.getHp(), casterHpMax);
	}
});

// 测试：伤害仇恨和治疗贡献从零开始正确累加。
test('regression: threat and healing contribution accumulate from zero', () => {
	const { u, v } = pair();
	v.addEnemy(u, 10);
	v.addEnemy(u, 5);
	v.addFriend(u, 20);
	v.addFriend(u, 7);
	assert.equal(v.enemyHurt.get(u.uid), 15);
	assert.equal(v.friendHeal.get(u.uid), 27);
});

// 测试：追击与溅射分别使用各自配置的子技能。
test('regression: kill and spread use their own skill IDs', () => {
	for (const kind of ['kill', 'spread'] as const) {
		const { f, u, v } = pair(false, true);
		initSkills([skill(8020, { [kind]: 8021 }), skill(8021)]);
		u.addSkill(8020, 1);
		if (kind === 'kill') v.attr.point.hp = 1;
		const ctx = f.processUnit(u, { cmd: FightCmdEnum.skill, skill: 8020, target: v.uid });
		assert.ok(
			ctx.msgs.some((m) => m[1] === 8021),
			`${kind} child must execute`,
		);
	}
});

// 测试：发动概率为零的技能不会造成伤害。
test('regression: a zero chance skill never executes', () => {
	const { f, u, v } = pair();
	initSkills([skill(8030, { rand: 0 })]);
	u.addSkill(8030, 1);
	f.processUnit(u, { cmd: FightCmdEnum.skill, skill: 8030, target: v.uid });
	assert.equal(v.getHp(), 100);
});

// 测试：普通攻击只选存活单位，复活技能自动选择尸体。
test('regression: skill qualification selects living attack targets and dead revival targets', () => {
	const { f, u, v } = pair(false, true);
	v.die();
	f.random = () => 0;
	assert.equal(f.selectMainTarget(u, getDefaultSkill()).uid, 3);
	assert.equal(f.selectMainTarget(u, new FightSkill(skill(8031, { func: 'relife' }), 1)), v);
});

// 测试：非正方形地图的对位查找覆盖完整宽度。
test('regression: rectangular maps find enemies across the full width', () => {
	const { f, u, v } = pair();
	f.createMap(5, 2);
	u.setPos(4);
	v.setPos(4);
	assert.equal(f.map.findDuiwei(u, getDefaultSkill()), v);
});

// 测试：网游驱动初始化乱敏，宿主显式重排时使用新速度且不依赖速度事件参数。
test('regression: West initializes units and speed changes reorder without payload errors', () => {
	const { u, v, loop } = pair();
	loop.fight.random = () => 0;
	loop.start();
	assert.equal(u.speedRand, -10);
	loop.sortUnitsByProcess();
	v.attrOri.speed = 200;
	assert.doesNotThrow(() => v.calcAttr());
	loop.onChangeSpeed(v);
	assert.equal(loop.processUnits[0], v);
	loop.end();
});

// 测试：最大回合数为一时仍完整执行一轮再判定结果。
test('regression: maxTurn=1 executes exactly one full round', async () => {
	const { f, u, v, loop } = pair();
	setFightGlobalData({ maxTurn: 1 });
	await loop.run();
	assert.equal(u.getHp(), 80);
	assert.equal(v.getHp(), 80);
	assert.equal(f.turn, 1);
	assert.equal(f.result, FightResultEnum.outoftime);
});

// 测试：攻击与反伤导致双方全灭时，在结算结束后判为平局。
test('regression: mutual elimination is resolved after reflection as a draw', () => {
	const { f, u, v } = pair();
	u.attr.point.hp = v.attr.point.hp = 5;
	v.attr.physic.final.dbackP = 1;
	f.processUnit(u, { cmd: FightCmdEnum.attack, target: v.uid });
	assert.equal(u.isDied(), true);
	assert.equal(v.isDied(), true);
	assert.equal(f.isEnd(), true);
	assert.equal(f.result, 2, '2 denotes a draw');
});

// 测试：战斗分出胜负后不再执行本轮剩余行动。
test('regression: winner stops remaining actions in the round', async () => {
	const { f, u, v, loop } = pair();
	loop.start();
	v.attr.point.hp = 1;
	loop.processUnits = [u, v];
	let visited = false;
	v.processOneTurn = () => {
		visited = true;
		return undefined;
	};
	await loop.processOneTurn(loop.fight.turn);
	assert.equal(f.result, FightSideEnum.attack);
	assert.equal(visited, false);
});

// 测试：非法指令和攻击友方不会改变状态或消耗随机数。
test('regression: explicit invalid commands and friendly attacks do not change state or RNG', () => {
	const { f, u, v } = pair(true);
	let draws = 0;
	f.random = () => {
		draws++;
		return 0.5;
	};
	for (const input of [
		{ cmd: FightCmdEnum.attack, target: u.uid },
		{ cmd: FightCmdEnum.attack, target: 99999 },
		{ cmd: FightCmdEnum.skill, skill: 99999, target: v.uid },
		{ cmd: 999 },
	]) {
		assert.equal(u.onInput(input), false);
		f.processUnit(u, input);
	}
	assert.equal(u.getHp(), 100);
	assert.equal(v.getHp(), 100);
	assert.equal(draws, 0);
	assert.equal(u.input, undefined);
});

// 测试：已接受的指令保存副本，执行时重新检查目标阵营。
test('regression: accepted commands are copied and execution rechecks target allegiance', () => {
	const { f, u, v } = pair(true);
	const input = { cmd: FightCmdEnum.attack, target: v.uid };
	assert.equal(u.onInput(input), true);
	input.target = u.uid;
	assert.equal(u.input.target, v.uid);
	v.side = u.side;
	assert.equal(u.processOneTurn(u.fight.turn), undefined);
	assert.equal(v.getHp(), 100);
});

// 测试：输入超时关闭窗口，迟到指令不能覆盖原指令。
test('regression: timeout closes input and late packets cannot overwrite commands', async () => {
	const { u, loop } = pair(true);
	assert.equal(await loop.waitInput(loop.fight.turn, initFightContex(loop.fight)), 0);
	loop.onInput(u.uid, { cmd: FightCmdEnum.defend, ...{ turn: loop.fight.turn } });
	assert.equal(loop.input, 0);
	assert.equal(u.input, null);
});

// 测试：怪物不能提交玩家指令，死亡玩家仍需要收取指令。
test('regression: monsters cannot submit commands but dead players still need input', async () => {
	const { u, v, loop } = pair(true);
	loop.start();
	const waiting = loop.waitInput(loop.fight.turn, initFightContex(loop.fight));
	const original = v.input;
	loop.onInput(v.uid, { cmd: FightCmdEnum.defend, ...{ turn: loop.fight.turn } });
	assert.deepEqual(v.input, original);
	loop.onInput(u.uid, { cmd: FightCmdEnum.defend, ...{ turn: loop.fight.turn } });
	assert.equal(await waiting, 1);
	u.die();
	assert.equal(u.needInput(), true);
});

// 测试：概率为零的物理反击和后续攻击不会触发。
test('regression: zero chance physical counterattacks and followups stay disabled', () => {
	const { f, u, v } = pair(false, true);
	const ctx = f.processUnit(u, { cmd: FightCmdEnum.attack, target: v.uid });
	assert.equal(ctx.msgs.filter((m) => m[0] === 'hurt').length, 1);
	assert.equal(u.getHp(), 100);
	assert.equal(v.getHp(), 80);
});

// 测试：旧回合及缺少回合号的网络指令不能填入新输入窗口。
test('regression: old-round and unversioned network packets cannot fill a new input window', async () => {
	const { f, u, loop } = pair(true);
	loop.start();
	f.turn = 2;
	const waiting = loop.waitInput(loop.fight.turn, initFightContex(loop.fight));
	loop.onInput(u.uid, { cmd: FightCmdEnum.defend, ...{ turn: 1 } });
	assert.equal(u.input, null);
	loop.onInput(u.uid, { cmd: FightCmdEnum.defend });
	assert.equal(u.input, null);
	loop.onInput(u.uid, { cmd: FightCmdEnum.defend, ...{ turn: 2 } });
	assert.equal(await waiting, 1);
});

// 测试：相同种子产生相同随机序列，零种子也可正常使用。
test('regression: seeded random sequences are reproducible and seed zero works', () => {
	const sequence = (seed: number) => {
		setFightGlobalData({
			protectBuff: undefined,
			allShieldBreak: false,
			maxTurn: 1,
			waitInputSec: 1,
			duiwei: false,
		});
		const f = new Fight(
			1,
			{ runaway: false, runawayGrade: 0, deathPenalty: 0, winRecover: 0, winReward: 0 },
			seed,
		);
		return Array.from({ length: 20 }, () => f.random());
	};
	assert.deepEqual(sequence(123), sequence(123));
	assert.deepEqual(sequence(0), sequence(0));
	assert.notDeepEqual(sequence(123), sequence(124));
	assert.ok(sequence(0).every((x) => x >= 0 && x < 1));
});

// 测试：创建新上下文不能绕过反应链的递归限制。
test('regression: fresh contexts cannot bypass the reaction recursion limit', () => {
	const { f, u, v } = pair();
	v.attr.point.hp = v.attr.point.hpMax = 100000000;
	f.onUnitEvent('hurt', () => f.processUnit(u, { cmd: FightCmdEnum.attack, target: v.uid }));
	assert.throws(
		() => f.processUnit(u, { cmd: FightCmdEnum.attack, target: v.uid }),
		/reaction limit/i,
	);
});

// 测试：显式目标编号为零时不回退到随机选择。
test('regression: explicit target ID zero does not fall back to random selection', () => {
	const { f, u, v } = pair();
	u.uid = 0;
	let draws = 0;
	f.random = () => {
		draws++;
		return 0.5;
	};
	f.processUnit(v, { cmd: FightCmdEnum.attack, target: 0 });
	assert.equal(u.getHp(), 80);
	assert.equal(draws, 0);
});

// 测试：后续攻击的发动概率只判定一次，避免概率被重复相乘。
test('regression: followup chance is rolled once rather than squared', () => {
	const { f, u, v } = pair();
	initSkills([skill(8040, { next: 8041 }), skill(8041, { rand: 0.5 })]);
	u.addSkill(8040, 1);
	const draws = [0.1, 0.1, 0.9];
	let count = 0;
	f.random = () => draws[count++];
	const ctx = f.processUnit(u, { cmd: FightCmdEnum.skill, skill: 8040, target: v.uid });
	assert.ok(ctx.msgs.some((m) => m[1] === 8041));
	assert.equal(count, 1, 'single candidate needs no selection roll; followup chance rolls once');
});

function addAlly(f: Fight) {
	const healer = new FightUnitMonster(5, attr(), { name: 'healer' });
	healer.setFight(f, FightSideEnum.attack);
	healer.setPos(1);
	f.getSide(FightSideEnum.attack).units.push(healer);
	return healer;
}

// 测试：吸血、反伤和反击由禁止字段决定，默认允许，旧标签不控制行为。
test('skill reaction switches use fields rather than tags', () => {
	for (const enabled of [false, true]) {
		const sk = new FightSkill(
			{
				...skill(9700),
				tags: ['blood', 'dback', 'fback'],
				...{ noblood: !enabled, nodback: !enabled, nofback: !enabled },
			},
			1,
		);
		assert.equal(sk.canBlood(), enabled);
		assert.equal(sk.canDBack(), enabled);
		assert.equal(sk.canFBack(), enabled);
	}
	const sk = new FightSkill(skill(9700), 1);
	assert.equal(sk.canBlood(), true);
	assert.equal(sk.canDBack(), true);
	assert.equal(sk.canFBack(), true);
});

// 测试：三个技能字段分别控制实际吸血、受反伤和触发对方反击，关闭后不受同名标签影响。
test('skill reaction fields control actual healing reflection and counterattacks', () => {
	for (const field of ['blood', 'dback', 'fback'] as const) {
		for (const enabled of [false, true]) {
			const { f, u, v } = pair();
			u.attr.point.hp = 50;
			u.attr.magic.final.bloodP = 0.2;
			v.attr.magic.final.dbackP = 0.2;
			v.attr.physic.fback = { ...v.attr.physic.fback, attack: 7, rand: 1 };
			initSkills([
				{
					...skill(9701),
					tags: ['blood', 'dback', 'fback'],
					...{ noblood: true, nodback: true, nofback: true, [`no${field}`]: !enabled },
				},
			]);
			u.addSkill(9701, 1);
			f.processUnit(u, { cmd: FightCmdEnum.skill, skill: 9701, target: v.uid });
			const hp = field === 'blood' ? 54 : field === 'dback' ? 46 : 43;
			assert.equal(u.getHp(), enabled ? hp : 50, `${field}=${enabled}`);
			assert.equal(v.getHp(), 80);
		}
	}
});

// 测试：死亡玩家和召唤物可提交、取消并重新提交网络指令。
test('regression: dead players and summons submit, cancel and resubmit network input', async () => {
	const { f, u, v, loop } = pair(true);
	loop.start();
	addAlly(f);
	const summon = new FightUnitSummon(4, attr(), { name: 'summon' });
	summon.setFight(f, FightSideEnum.attack);
	f.getSide(FightSideEnum.attack).units.push(summon);
	u.die();
	summon.die();
	const waiting = loop.waitInput(loop.fight.turn, initFightContex(loop.fight));
	assert.equal(loop.input, 2);
	loop.onInput(u.uid, { turn: f.turn, cmd: FightCmdEnum.attack, target: v.uid });
	assert.equal(loop.inputed, 1);
	loop.onInput(u.uid, { turn: f.turn, cmd: FightCmdEnum.cancel });
	assert.equal(loop.inputed, 0);
	loop.onInput(u.uid, { turn: f.turn, cmd: FightCmdEnum.attack, target: v.uid });
	loop.onInput(summon.uid, { turn: f.turn, cmd: FightCmdEnum.defend });
	assert.equal(await waiting, 1);
	assert.equal(u.input.target, v.uid);
	assert.equal(summon.input.cmd, FightCmdEnum.defend);
});

// 测试：死亡玩家在先手队友复活后执行已提交的原指令。
test('regression: a dead player acts on the submitted command after an earlier ally revives them', async () => {
	const { f, u, v, loop } = pair(true);
	loop.start();
	const healer = addAlly(f);
	initSkills([
		skill(8050, { func: 'relife', healRate: 0.5, sel: { target: TargetSelectEnum.friend } }),
	]);
	healer.addSkill(8050, 1);
	u.attr.point.hp = 0;
	u.die();
	const waiting = loop.waitInput(loop.fight.turn, initFightContex(loop.fight));
	loop.onInput(u.uid, { turn: f.turn, cmd: FightCmdEnum.attack, target: v.uid });
	await waiting;
	assert.equal(u.input?.target, v.uid);
	healer.input = { cmd: FightCmdEnum.skill, skill: 8050, target: u.uid };
	loop.processUnits = [healer, u];
	await loop.processOneTurn(loop.fight.turn);
	assert.equal(u.isDied(), false);
	assert.equal(u.getHp(), 50);
	assert.equal(v.getHp(), 80);
});

// 测试：已提交指令的行动者若仍死亡，则不能执行行动。
test('regression: a submitted command does not let a still-dead actor act', () => {
	const { f, u, v } = pair(true);
	addAlly(f);
	u.attr.point.hp = 0;
	u.die();
	assert.equal(u.onInput({ cmd: FightCmdEnum.attack, target: v.uid }), true);
	assert.equal(u.processOneTurn(u.fight.turn), undefined);
	assert.equal(f.processUnit(u, u.input), undefined);
	assert.equal(v.getHp(), 100);
});

// 测试：守尸指令锁定死亡敌人，在其出手前复活后攻击原目标。
test('regression: corpse guarding locks a dead enemy and attacks it if revived before the turn', async () => {
	const { f, u, v, loop } = pair(true, true);
	loop.start();
	v.attr.point.hp = 0;
	v.die();
	const waiting = loop.waitInput(loop.fight.turn, initFightContex(loop.fight));
	loop.onInput(u.uid, { turn: f.turn, cmd: FightCmdEnum.attack, target: v.uid });
	await waiting;
	assert.equal(u.input?.target, v.uid);
	const healer = f.getUnitById(3);
	initSkills([
		skill(8051, { func: 'relife', healRate: 0.5, sel: { target: TargetSelectEnum.friend } }),
	]);
	healer.addSkill(8051, 1);
	healer.input = { cmd: FightCmdEnum.skill, skill: 8051, target: v.uid };
	loop.processUnits = [healer, u];
	await loop.processOneTurn(loop.fight.turn);
	assert.equal(v.isDied(), false);
	assert.equal(v.getHp(), 30);
	assert.equal(healer.getHp(), 100);
});

// 测试：守尸目标仍死亡时按未指定目标选人，不伤害尸体，唯一合法候选不抽样。
test('regression: corpse guarding retargets a still-dead enemy as if no target was supplied', () => {
	const { f, u, v } = pair(true, true);
	v.attr.point.hp = 0;
	v.die();
	let draws = 0;
	f.random = () => {
		draws++;
		return 0.5;
	};
	assert.equal(u.onInput({ cmd: FightCmdEnum.attack, target: v.uid }), true);
	assert.equal(u.processOneTurn(u.fight.turn)?.defend.uid, 3);
	assert.equal(v.getHp(), 0);
	assert.equal(f.getUnitById(3).getHp(), 80);
	assert.equal(draws, 0);
});
