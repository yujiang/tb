import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
	FightCmdEnum,
	initFightContex,
	initSkills,
	initBuffs,
	getBuffData,
	fightMsg,
} from '../../../src';
import { buffFunc } from '../../../src/fight/Buffs/BuffFuncType';
import { tryDBack } from '../../../src/fight/Skills/FightBack';
import { setupChain, chainIds as ids } from '../../fixtures/skill_chain';

const protectCmd = FightCmdEnum.protect;
const buffId = 98710;

function setup() {
	const state = setupChain({
		actorHp: 500,
		rootSelfBuff: false,
		finalReactions: false,
		change: (skills) => {
			skills[0].combo = undefined;
			skills[0].damageRate = 1;
			skills[0].noblood = false;
			skills[0].nodback = false;
		},
	});
	initBuffs([
		{
			...getBuffData(ids.rest),
			id: buffId,
			name: '保护',
			class: 'protect',
			prior: 500,
			lastTurn: 1,
			notRemove: false,
		},
	]);
	state.fight.xls.protectBuff = buffId;
	const { fight, target: protector, other: victim, actor: enemy, flush } = state;
	const protect = () => {
		const ctx = fight.processUnit(protector, { cmd: protectCmd, target: victim.uid });
		assert.ok(ctx, '保护指令应能执行');
		flush(ctx);
		assert.equal(victim.findBuff(buffId)?.constructor.name, 'BuffProtect');
		return ctx;
	};
	return { ...state, protector, victim, enemy, protect };
}

for (const prohibited of [undefined, false, true]) {
	for (const func of ['normal', 'poison']) {
		// 测试：配置技能默认可分担，仅 noprotect=true 时由目标独自承受全部伤害。
		test(`protect: ${func} skill noprotect=${prohibited} controls sharing`, () => {
			const { fight, protector, victim, enemy, protect, flush, skills } = setup();
			Object.assign(skills[0], { noprotect: prohibited, func });
			const enabled = prohibited !== true;
			protect();
			const ctx = fight.processUnit(enemy, {
				cmd: FightCmdEnum.skill,
				skill: ids.first,
				target: victim.uid,
			});
			assert.ok(ctx);
			flush(ctx);
			assert.equal(protector.getHp(), enabled ? 950 : 1000);
			assert.equal(victim.getHp(), enabled ? 950 : 900);
			assert.equal(
				ctx.msgs.some((msg) => msg[0] === 'hurt' && msg[1] === 'share'),
				enabled === true,
			);
			assert.ok(victim.findBuff(buffId));
		});
	}
}

// 测试：宿主直接调用底层伤害时同样可用 noprotect=true 禁止分担。
test('protect: direct hurt respects noprotect without a skill instance', () => {
	const { fight, protector, victim, enemy, protect, flush } = setup();
	protect();
	const ctx = initFightContex(fight);
	assert.equal(victim.onHurt(enemy, 'skill', 100, ctx, { noprotect: true }), 100);
	flush(ctx);
	assert.equal(victim.getHp(), 900);
	assert.equal(protector.getHp(), 1000);
});

// 测试：普通攻击继续允许保护分担。
test('protect: normal attack remains protectable', () => {
	const { fight, protector, victim, enemy, protect, flush } = setup();
	protect();
	const ctx = fight.processUnit(enemy, { cmd: FightCmdEnum.attack, target: victim.uid });
	assert.ok(ctx);
	flush(ctx);
	assert.equal(protector.getHp(), 950);
	assert.equal(victim.getHp(), 950);
});

// 测试：同一连招各段独立读取 protect，只有允许保护的段分担伤害。
test('protect: combo segments use their own protection flags', () => {
	const { fight, protector, victim, enemy, protect, flush, skills } = setup();
	Object.assign(skills[0], { noprotect: false, damageRate: 0.4, combo: ids.second });
	Object.assign(skills[1], { noprotect: true });
	Object.assign(skills[2], { noprotect: false });
	protect();
	const ctx = fight.processUnit(enemy, {
		cmd: FightCmdEnum.skill,
		skill: ids.first,
		target: victim.uid,
	});
	assert.ok(ctx);
	flush(ctx);
	assert.equal(protector.getHp(), 930);
	assert.equal(victim.getHp(), 860);
	assert.deepEqual(
		ctx.msgs.filter((msg) => msg[0] === 'hurt' && msg[2] === victim.uid).map((msg) => msg[4]),
		[20, 70, 50],
	);
});

// 测试：保护者分担伤害不触发魔法反射、受伤回调、反伤或反击，两人的伤害仍由同次攻击产生。
test('protect: shared damage cannot reflect or trigger ordinary hurt reactions', () => {
	const { fight, protector, victim, enemy, protect, flush } = setup();
	initBuffs([
		{
			...getBuffData(buffId),
			id: 98730,
			name: '反射',
			class: 'reflect',
			classParam: { magicOnly: true },
			lastTurn: 0,
			times: 0,
		},
	]);
	const init = initFightContex(fight);
	protector.addBuff(protector, 'test', 98730, 1, init);
	flush(init);
	let hurtCalls = 0;
	protector.onContex('hurt', () => {
		hurtCalls++;
	});
	protector.attrOri.magic.final.dbackP = 1;
	protector.attrOri.physic.fback.rand = 1;
	protector.calcAttr();
	protect();
	const ctx = fight.processUnit(enemy, {
		cmd: FightCmdEnum.skill,
		skill: ids.first,
		target: victim.uid,
	});
	assert.ok(ctx);
	flush(ctx);
	assert.equal(protector.getHp(), 950);
	assert.equal(victim.getHp(), 950);
	assert.equal(enemy.getHp(), 500);
	assert.equal(hurtCalls, 0);
	assert.ok(!ctx.msgs.some((msg) => msg[0] === 'buffTrigger' && msg[3] === 'reflectHurt'));
	assert.ok(
		!ctx.msgs.some((msg) => msg[0] === 'hurt' && (msg[1] === 'dback' || msg[1] === 'reflect')),
	);
	assert.ok(!ctx.msgs.some((msg) => msg[0] === 'skill' && msg[4] === 'fback'));
});

// 测试：保护者分担致死时也先连续发出双方伤害，再处理死亡，死亡回调已能观察双方扣血。
test("protect: both damage messages and health changes precede the protector's death", () => {
	const { fight, protector, victim, enemy, protect, flush } = setup();
	const initial = initFightContex(fight);
	protector.onHurt(enemy, 'buff', 999, initial, { source: 'buff' });
	flush(initial);
	let victimHpOnDeath: number;
	protector.onContex('die', () => {
		victimHpOnDeath = victim.getHp();
	});
	protect();
	const ctx = fight.processUnit(enemy, {
		cmd: FightCmdEnum.skill,
		skill: ids.first,
		target: victim.uid,
	});
	assert.ok(ctx);
	flush(ctx);
	const damageIndexes = ctx.msgs
		.map((msg, index) => (msg[0] === 'hurt' ? index : -1))
		.filter((index) => index >= 0);
	assert.equal(damageIndexes.length, 2);
	assert.equal(damageIndexes[1], damageIndexes[0] + 1);
	assert.ok(
		damageIndexes[1] <
			ctx.msgs.findIndex((msg) => msg[0] === 'die' && msg[1] === protector.uid),
	);
	assert.equal(victimHpOnDeath, 950);
	assert.equal(protector.getHp(), 0);
	assert.ok(protector.isDied());
});

for (const survival of ['buqu', 'relife'] as const) {
	// 测试：分担不触发普通受伤回调，但不屈和真实死亡后的延迟复活仍正常生效。
	test(`protect: shared damage retains ${survival} survival rules`, () => {
		const { fight, protector, victim, enemy, protect, flush } = setup();
		const initial = initFightContex(fight);
		protector.onHurt(enemy, 'buff', 999, initial, { source: 'buff' });
		initBuffs([
			{
				...getBuffData(buffId),
				id: 98731,
				name: '保命',
				class: survival,
				classParam: 0.3,
				lastTurn: 0,
				times: 1,
				dieNotRemove: true,
			},
		]);
		protector.addBuff(protector, 'test', 98731, 1, initial);
		flush(initial);
		let hurtCalls = 0;
		protector.onContex('hurt', () => {
			hurtCalls++;
		});
		protect();
		const ctx = fight.processUnit(enemy, {
			cmd: FightCmdEnum.skill,
			skill: ids.first,
			target: victim.uid,
		});
		assert.ok(ctx);
		flush(ctx);
		assert.equal(hurtCalls, 0);
		assert.equal(victim.getHp(), 950);
		assert.equal(protector.getHp(), survival === 'buqu' ? 1 : 300);
		assert.equal(protector.isDied(), false);
		assert.equal(
			ctx.msgs.some((msg) => msg[0] === 'die' && msg[1] === protector.uid),
			survival === 'relife',
		);
		if (survival === 'relife') {
			const victimHurt = ctx.msgs.findIndex(
				(msg) => msg[0] === 'hurt' && msg[2] === victim.uid,
			);
			assert.ok(victimHurt < ctx.msgs.findIndex((msg) => msg[0] === 'relife'));
		}
	});
}

// 测试：保护指令给队友添加当回合 Buff，普通受伤由保护者承担一半。
test('protect: command attaches a current-round Buff and splits direct damage in half', () => {
	const { fight, protector, victim, enemy, protect, flush, report } = setup();
	protect();
	const ctx = initFightContex(fight);
	const actual = victim.onHurt(enemy, 'skill', 100, ctx, { magic: true });
	flush(ctx);
	assert.equal(actual, 50);
	assert.equal(protector.getHp(), 950);
	assert.equal(victim.getHp(), 950);
	assert.deepEqual(
		ctx.msgs.filter((msg) => msg[0] === 'hurt').map((msg) => [msg[1], msg[2], msg[4]]),
		[
			['share', protector.uid, 50],
			['skill', victim.uid, 50],
		],
	);
	assert.match(report.toString(), /保护/);
	assert.match(report.toString(), /分担伤害/);
});

// 测试：保护按行动优先级进入统一队列，先同步客户端行动条再执行行动。
test('protect: queue priority is sorted and sent to the client before actors execute', async () => {
	const { fight, loop, protector, victim, enemy, client } = setup();
	protector.attr.speed = 1;
	victim.attr.speed = 20;
	enemy.attr.speed = 500;
	for (const unit of [protector, victim, enemy]) unit.speedRand = 0;
	protector.input = { cmd: protectCmd, target: victim.uid };
	victim.input = { cmd: FightCmdEnum.defend };
	enemy.input = { cmd: FightCmdEnum.skill, skill: ids.first, target: victim.uid };
	loop.processUnits = [enemy, victim, protector];
	const wire: fightMsg[] = [];
	loop.onMsg((msgs) =>
		wire.push(...(typeof msgs[0] === 'string' ? [msgs as fightMsg] : (msgs as fightMsg[]))),
	);
	await loop.processOneTurn(fight.turn);
	assert.deepEqual(
		wire.find((msg) => msg[0] === 'sort'),
		['sort', [protector.uid, enemy.uid, victim.uid]],
	);
	assert.equal(wire.find((msg) => msg[0] === 'actor')[1], protector.uid);
	assert.equal(protector.getHp(), 950);
	assert.equal(victim.getHp(), 950);
	assert.equal(client.checkSame(fight), true);
});

// 测试：剩余队列因速度变化重排时仍保持保护优先，并同步客户端行动条。
test('protect: remaining-queue speed changes preserve protect priority and update the action bar', () => {
	const { loop, protector, victim, enemy, client } = setup();
	protector.input = { cmd: protectCmd, target: victim.uid };
	victim.input = { cmd: protectCmd, target: protector.uid };
	enemy.input = { cmd: FightCmdEnum.attack, target: victim.uid };
	protector.attr.speed = 10;
	victim.attr.speed = 20;
	enemy.attr.speed = 500;
	for (const unit of [protector, victim, enemy]) unit.speedRand = 0;
	assert.deepEqual(
		loop.sortUnitsByProcess().map((unit) => unit.uid),
		[victim.uid, protector.uid, enemy.uid],
	);
	enemy.attr.speed = 5000;
	loop.onChangeSpeed(enemy);
	assert.deepEqual(client.sort, [victim.uid, protector.uid, enemy.uid]);
});

for (const source of ['buff', 'dback', 'share', 'reflect'] as const) {
	// 测试：Buff、反伤、分担及反射来源的伤害不会再次触发保护分摊。
	test(`protect: ${source} damage is not split`, () => {
		const { fight, protector, victim, enemy, protect, flush } = setup();
		protect();
		const ctx = initFightContex(fight);
		const options = { magic: true, source };
		assert.equal(victim.onHurt(enemy, source, 100, ctx, options), 100);
		flush(ctx);
		assert.equal(victim.getHp(), 900);
		assert.equal(protector.getHp(), 1000);
		assert.equal(
			ctx.msgs.some((msg) => msg[0] === 'buffTrigger'),
			false,
		);
	});
}

// 测试：两个单位互相保护时只分担一次，不产生递归循环。
test('protect: mutual protection does not recurse', () => {
	const { fight, protector, victim, enemy, protect, flush } = setup();
	protect();
	const reverse = fight.processUnit(victim, { cmd: protectCmd, target: protector.uid });
	assert.ok(reverse);
	flush(reverse);
	const ctx = initFightContex(fight);
	protector.onHurt(enemy, 'skill', 100, ctx, { magic: true });
	flush(ctx);
	assert.equal(protector.getHp(), 950);
	assert.equal(victim.getHp(), 950);
	assert.equal(ctx.msgs.filter((msg) => msg[0] === 'buffTrigger').length, 1);
	assert.equal(ctx.msgs.filter((msg) => msg[0] === 'hurt').length, 2);
});

// 测试：吸血和反伤只根据被保护者分担后的实际扣血计算。
test("protect: lifesteal and reflection use only the protected target's actual damage", () => {
	const { fight, protector, victim, enemy, protect, flush } = setup();
	enemy.attrOri.magic.final.bloodP = 0.5;
	enemy.calcAttr();
	victim.attrOri.magic.final.dbackP = 0.2;
	victim.calcAttr();
	protect();
	const ctx = fight.processUnit(enemy, {
		cmd: FightCmdEnum.skill,
		skill: ids.first,
		target: victim.uid,
	});
	assert.ok(ctx);
	flush(ctx);
	assert.equal(protector.getHp(), 950);
	assert.equal(victim.getHp(), 950);
	assert.equal(enemy.getHp(), 515); // 500 + 50 × 50% - 50 × 20%
	assert.deepEqual(
		ctx.msgs.filter((msg) => msg[0] === 'heal').map((msg) => msg[4]),
		[25],
	);
	assert.deepEqual(
		ctx.msgs.filter((msg) => msg[0] === 'hurt' && msg[1] === 'dback').map((msg) => msg[4]),
		[10],
	);
});

// 测试：保护在当回合结束到期并清理监听，之后受伤不再分担。
test('protect: Buff expires at the end of the current round and unregisters its listeners', () => {
	const { fight, loop, protector, victim, enemy, protect, flush } = setup();
	const before = victim.contextEmitter.listenerCount('beforeHurt');
	const after = victim.contextEmitter.listenerCount('afterTurn');
	protect();
	assert.equal(victim.contextEmitter.listenerCount('beforeHurt'), before + 1);
	const end = initFightContex(fight);
	loop.processAfterTurn(fight.turn, end);
	flush(end);
	assert.equal(victim.findBuff(buffId), undefined);
	assert.equal(victim.contextEmitter.listenerCount('beforeHurt'), before);
	assert.equal(victim.contextEmitter.listenerCount('afterTurn'), after);
	const ctx = initFightContex(fight);
	victim.onHurt(enemy, 'skill', 100, ctx, { magic: true });
	flush(ctx);
	assert.equal(victim.getHp(), 900);
	assert.equal(protector.getHp(), 1000);
});

// 测试：保护者死亡后失去分担能力，被保护者承受原伤害。
test('protect: a dead protector no longer shares damage', () => {
	const { fight, protector, victim, enemy, protect, flush } = setup();
	protect();
	const ctx = initFightContex(fight);
	const damage = { magic: true, source: 'buff' as const };
	protector.onHurt(enemy, 'buff', 1000, ctx, damage);
	victim.onHurt(enemy, 'skill', 100, ctx, { magic: true });
	flush(ctx);
	assert.equal(protector.isDied(), true);
	assert.equal(victim.getHp(), 900);
});

// 测试：保护不能指定自身、敌人或空目标，缺少保护 Buff 配置时也拒绝指令。
test('protect: self, enemies, missing targets and unconfigured protection are rejected', () => {
	const { fight, protector, victim, enemy } = setup();
	assert.equal(fight.validateInput(protector, { cmd: protectCmd, target: protector.uid }), false);
	assert.equal(fight.validateInput(protector, { cmd: protectCmd, target: enemy.uid }), false);
	assert.equal(fight.validateInput(protector, { cmd: protectCmd }), false);
	fight.xls.protectBuff = undefined;
	assert.equal(fight.validateInput(protector, { cmd: protectCmd, target: victim.uid }), false);
});

// 测试：真实周期毒伤和反伤入口携带正确来源，不能误触发保护。
test('protect: actual periodic Buff damage and reflected damage are marked at their source', () => {
	const { fight, protector, victim, enemy, protect, flush, skills } = setup();
	protect();
	initSkills([
		{ ...skills[3], id: 98712, name: '保护测试毒伤', attack: { attack: 40 }, final: {} },
	]);
	initBuffs([
		{
			...getBuffData(buffId),
			id: 98713,
			name: '保护测试毒',
			class: undefined,
			func: 'poison',
			skill: 98712,
			skillLevel: 1,
		},
	]);
	const ctx = initFightContex(fight);
	const poison = victim.addBuff(enemy, 'test', 98713, 1, ctx);
	buffFunc(victim, poison, ctx);
	enemy.attrOri.magic.final.dbackP = 0.2;
	enemy.calcAttr();
	tryDBack(victim, enemy, true, 100, ctx);
	flush(ctx);
	assert.equal(victim.getHp(), 940);
	assert.equal(protector.getHp(), 1000);
	assert.equal(
		ctx.msgs.some((msg) => msg[0] === 'buffTrigger' && msg[3] === 'protect'),
		false,
	);
});

// 测试：连招统一反伤只累计被保护者分担后的伤害，不计保护者扣血。
test("protect: combo reflection accumulates only the protected target's half", () => {
	const { fight, protector, victim, enemy, protect, flush, skills } = setup();
	skills[0].combo = ids.second;
	skills[0].damageRate = 0.4;
	skills[2].nodback = false;
	victim.attrOri.magic.final.dbackP = 0.2;
	victim.calcAttr();
	protect();
	const ctx = fight.processUnit(enemy, {
		cmd: FightCmdEnum.skill,
		skill: ids.first,
		target: victim.uid,
	});
	assert.ok(ctx);
	flush(ctx);
	assert.equal(protector.getHp(), 895);
	assert.equal(victim.getHp(), 895);
	assert.equal(enemy.getHp(), 479);
	assert.deepEqual(
		ctx.msgs.filter((msg) => msg[0] === 'hurt' && msg[1] === 'dback').map((msg) => msg[4]),
		[21],
	);
});

// 测试：重复施加保护不会重复绑定监听，奇数伤害的余数留给被保护者。
test('protect: replacement keeps one listener and odd damage leaves the remainder on the victim', () => {
	const { fight, protector, victim, enemy, protect, flush } = setup();
	protect();
	protect();
	assert.equal(victim.contextEmitter.listenerCount('beforeHurt'), 1);
	assert.equal(victim.contextEmitter.listenerCount('afterTurn'), 0);
	const ctx = initFightContex(fight);
	assert.equal(victim.onHurt(enemy, 'skill', 101, ctx), 51);
	flush(ctx);
	assert.equal(protector.getHp(), 950);
	assert.equal(victim.getHp(), 949);
});
