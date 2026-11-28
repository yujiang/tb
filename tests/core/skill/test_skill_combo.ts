import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
	initSkills,
	initBuffs,
	getBuffData,
	initFightContex,
	FightCmdEnum,
	TargetSelectEnum,
} from '../../../src';
import { setupChain, chainIds as ids } from '../../fixtures/skill_chain';

// 测试：三连击按四成、七成和全额造成伤害，只收主技能费用并在末段统一反伤和反击。
test('skill chain: three inherited hits deal 0.4/0.7/1.0 and charge only the root cost', () => {
	const { actor, target, other, cast, report } = setupChain({
		output: (line) => console.log(line),
	});
	const ctx = cast();
	assert.deepEqual(
		ctx.msgs.filter((msg) => msg[0] === 'skill' && msg[2] === actor.uid).map((msg) => msg[1]),
		[ids.first, ids.second, ids.third],
	);
	assert.deepEqual(
		ctx.msgs.filter((msg) => msg[0] === 'hurt' && msg[2] === target.uid).map((msg) => msg[4]),
		[40, 70, 100],
	);
	assert.equal(target.getHp(), 790);
	assert.equal(other.getHp(), 1000);
	assert.equal(actor.getHp(), 948); // 终式结算整招 210 × 20% = 42 反伤，再受到 10 反击。
	assert.equal(actor.attr.point.mp, 90);
	assert.equal(ctx.msgs.filter((msg) => msg[0] === 'costMp').length, 1);
	assert.equal(ctx.nextNum, 2);
	assert.equal(ctx.reactionSteps, 4);
	assert.ok(actor.findBuff(ids.rest));
	assert.match(
		report.toString(),
		/三连斩·一式[\s\S]*三连斩·二式[\s\S]*三连斩·终式[\s\S]*\[休息\]/,
	);
	assert.match(report.toString(), /【连招】.*\[三连斩·二式\]/);
	assert.match(report.toString(), /【连招】.*\[三连斩·终式\]/);
	assert.doesNotMatch(report.toString(), /【连击】/);
});

// 测试：继承的主目标中途死亡时停止剩余段，仍应用根技能的施放后自身 Buff。
test('skill chain: inherited target death stops the chain without hitting another enemy', () => {
	const { target, other, actor, cast } = setupChain({ targetHp: 80 });
	const ctx = cast();
	assert.deepEqual(
		ctx.msgs.filter((msg) => msg[0] === 'hurt').map((msg) => msg[4]),
		[40, 40],
	);
	assert.equal(target.isDied(), true);
	assert.equal(other.getHp(), 1000);
	assert.ok(!ctx.msgs.some((msg) => msg[1] === ids.third));
	assert.ok(actor.findBuff(ids.rest));
});

// 测试：连招末段击杀目标后可按自身配置追击，死亡目标不再结算连招反伤。
test('skill chain: final step may pursue a kill using its own configuration', () => {
	const { other, cast } = setupChain({ targetHp: 180, finalKill: true });
	const ctx = cast();
	assert.deepEqual(
		ctx.msgs.filter((msg) => msg[0] === 'hurt').map((msg) => msg[4]),
		[40, 70, 70, 100],
	);
	assert.equal(other.getHp(), 900);
	assert.equal(ctx.killNum, 1);
});

// 测试：后续段未发动时中止技能链，发动概率只判定一次。
test('skill chain: an untriggered child stops and its probability is sampled once', () => {
	const { fight, target, cast } = setupChain({
		finalReactions: false,
		change: (skills) => {
			skills[1].rand = 0.5;
		},
	});
	let samples = 0;
	fight.random = () => {
		samples++;
		return 0.99;
	};
	const ctx = cast();
	assert.equal(target.getHp(), 960);
	assert.equal(samples, 1);
	assert.ok(!ctx.msgs.some((msg) => msg[1] === ids.third));
});

// 测试：普通 next 子技能按自身配置重新选择目标，不强制继承原主目标。
test('skill chain: next reselects the child target according to its configuration', () => {
	const { target, other, cast } = setupChain({
		otherHp: 50,
		change: (skills) => {
			skills[0].next = ids.second;
			skills[0].combo = undefined;
			skills[1].sel = { ...skills[1].sel, sortAttr: 'hp' };
		},
	});
	const ctx = cast();
	assert.equal(target.getHp(), 960);
	assert.equal(other.isDied(), true);
	assert.deepEqual(
		ctx.msgs.filter((msg) => msg[0] === 'hurt').map((msg) => msg[2]),
		[target.uid, other.uid],
	);
});

// 测试：末段已经发动但未命中时，仍应用该段的施放后自身 Buff。
test("skill chain: terminal miss still applies that step's afterSelfBuff", () => {
	const { actor, target, cast } = setupChain({
		rootSelfBuff: false,
		change: (skills) => {
			skills[2].magic = false;
			skills[2].attack = { hit: -100 };
			skills[2].afterSelfBuff = [[ids.rest, 1, 1]];
		},
	});
	const ctx = cast();
	assert.equal(target.getHp(), 890);
	assert.ok(ctx.msgs.some((msg) => msg[0] === 'miss'));
	assert.equal(ctx.msgs.find((msg) => msg[0] === 'miss')[4], 'combo');
	assert.ok(actor.findBuff(ids.rest));
});

// 测试：循环配置的技能链受共享反应上限约束，异常退出也不残留临时死亡监听。
test('skill chain: configured cycles share the existing reaction limit', () => {
	const { fight, actor, target, skills } = setupChain({
		rootSelfBuff: false,
		finalReactions: false,
		change: (data) => {
			data[0].attack = { ...data[0].attack, hurtP: (0) - 1 };
			data[0].combo = ids.first;
		},
	});
	initSkills(skills);
	const attackerListeners = actor.contextEmitter.listenerCount('die');
	const targetListeners = target.contextEmitter.listenerCount('die');
	assert.throws(
		() =>
			fight.processUnit(actor, {
				cmd: FightCmdEnum.skill,
				skill: ids.first,
				target: target.uid,
			}),
		/Reaction limit/,
	);
	assert.equal(actor.contextEmitter.listenerCount('die'), attackerListeners);
	assert.equal(target.contextEmitter.listenerCount('die'), targetListeners);
});

// 测试：通过配置可将连招扩展为四段，仍只收一次费用并添加一次根技能自身 Buff。
test('skill chain: configuration can add a fourth step without a fixed combo count', () => {
	const { target, cast } = setupChain({
		finalReactions: false,
		change: (skills) => {
			skills[2].combo = ids.kill;
			skills[3].attack = { ...skills[3].attack, hurtP: -0.5 };
		},
	});
	const ctx = cast();
	assert.equal(target.getHp(), 740);
	assert.equal(ctx.nextNum, 3);
	assert.equal(ctx.msgs.filter((msg) => msg[0] === 'costMp').length, 1);
	assert.equal(ctx.msgs.filter((msg) => msg[0] === 'addBuff' && msg[4] === ids.rest).length, 1);
});

// 测试：连招继承主技能被嘲讽重定向后的实际目标，而非原输入目标。
test('skill chain: inheritance follows the actual taunt-redirected target', () => {
	const { fight, actor, target, other, flush, cast } = setupChain({ finalReactions: false });
	initBuffs([
		{ ...getBuffData(ids.rest), id: 98006, name: '嘲讽', class: 'taunt', notRemove: false },
	]);
	const ctx = initFightContex(fight);
	actor.addBuff(other, 'test', 98006, 1, ctx);
	flush(ctx);
	const result = cast();
	assert.equal(target.getHp(), 1000);
	assert.equal(other.getHp(), 790);
	assert.deepEqual(
		result.msgs.filter((msg) => msg[0] === 'hurt').map((msg) => msg[2]),
		[other.uid, other.uid, other.uid],
	);
});

// 测试：施放者因受击回调中的反应死亡时停止后续段，并且不再添加自身 Buff。
test('skill chain: a source killed by reaction stops the remaining steps and does not gain self buffs', () => {
	const { fight, actor, target } = setupChain({ actorHp: 30 });
	target.onContex('hurt', (_u, ctx) => actor.onHurt(target, 'reaction', 1000, ctx));
	const ctx = fight.processUnit(actor, {
		cmd: FightCmdEnum.skill,
		skill: ids.first,
		target: target.uid,
	});
	assert.ok(ctx);
	assert.equal(actor.isDied(), true);
	assert.ok(!ctx.msgs.some((msg) => msg[1] === ids.second || msg[1] === ids.third));
	assert.equal(actor.findBuff(ids.rest), undefined);
});

// 测试：治疗技能也可配置施放后自身 Buff，正常收费并同步客户端状态。
test('skill chain: afterSelfBuff also works for a configured healing skill', () => {
	const { fight, actor, flush } = setupChain();
	initSkills([
		{
			id: 98007,
			name: '治疗后休息',
			magic: true,
			rand: 1,
			attack: {},
			final: {},
			func: 'heal',
			sel: { target: TargetSelectEnum.self },
			cost: { mp: 5 },
			afterSelfBuff: [[ids.rest, 1, 1]],
		},
	]);
	actor.addSkill(98007, 1);
	const ctx = fight.processUnit(actor, {
		cmd: FightCmdEnum.skill,
		skill: 98007,
		target: actor.uid,
	});
	assert.ok(ctx);
	flush(ctx);
	assert.ok(actor.findBuff(ids.rest));
	assert.equal(actor.attr.point.mp, 95);
	assert.equal(ctx.msgs.filter((msg) => msg[0] === 'addBuff').length, 1);
});
