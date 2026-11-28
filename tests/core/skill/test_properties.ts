import { setCounterChance } from '../../fixtures/default_skills';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
	PropEnum as P,
	getAttackMul,
	getHealMul,
	initSkills,
	initFightContex,
	FightCmdEnum,
	TargetSelectEnum,
	initBuffs,
	getBuffData,
	WeaponEnum as W,
} from '../../../src';
import { buffFunc } from '../../../src/fight/Buffs/BuffFuncType';
import { AttrSkill } from '../../../src/fight/Skills/AttrSkill';
import { heal } from '../../../src/fight/Skills/Funcs/Heal';
import { poison } from '../../../src/fight/Skills/Funcs/Poison';
import { setupChain, chainIds as ids } from '../../fixtures/skill_chain';

const props = [P.none, P.金, P.木, P.水, P.火, P.土];
const attacks = [
	[P.金, P.木],
	[P.木, P.土],
	[P.土, P.水],
	[P.水, P.火],
	[P.火, P.金],
];
const heals = [
	[P.金, P.水],
	[P.水, P.木],
	[P.木, P.火],
	[P.火, P.土],
	[P.土, P.金],
];

// 测试：相克严格按传统五行的五项有向关系加成，其他组合与无属性均为一倍。
test('properties: attack multiplier follows the traditional five-element cycle only', () => {
	for (const a of props)
		for (const d of props) {
			assert.equal(
				getAttackMul(a, d),
				attacks.some((pair) => pair[0] === a && pair[1] === d) ? 0.5 : 0,
				`${a}->${d}`,
			);
		}
	assert.equal(getAttackMul(undefined, undefined), 0);
	assert.equal(getAttackMul(999 as P, P.金), 0);
});

// 测试：相生严格按金水木火土环生加成，不把相同属性、反方向或未填属性当成相生。
test('properties: healing multiplier follows the generating cycle only', () => {
	for (const a of props)
		for (const d of props) {
			assert.equal(
				getHealMul(a, d),
				heals.some((pair) => pair[0] === a && pair[1] === d) ? 0.5 : 0,
				`${a}->${d}`,
			);
		}
	assert.equal(getHealMul(undefined, undefined), 0);
	assert.equal(getHealMul(999 as P, P.金), 0);
});

function setup() {
	return setupChain({
		rootSelfBuff: false,
		finalReactions: false,
		change: (skills) => {
			skills[0].combo = undefined;
			skills[0].attack = { ...skills[0].attack, hurtP: 0 };
			skills[0].nofback = true;
			skills[0].nodback = true;
		},
	});
}

for (const [weakProp, weakWeapon, prop, weapon, amount] of [
	[[P.金], undefined, P.金, W.刀, 150],
	[undefined, [W.刀], P.none, W.刀, 150],
	[[P.金], undefined, P.none, W.拳, 100],
	[undefined, [W.拳], P.金, W.刀, 100],
	[[P.金], [W.刀], P.金, W.刀, 150],
	[[], [], P.金, W.刀, 100],
	[[P.none], [W.none], P.none, W.none, 100],
] as const) {
	// 测试：NPC 的五行与兵器弱点直接匹配、相互独立，双重命中不叠加，空列表和无属性不产生加成。
	test(`properties: NPC weaknesses ${JSON.stringify([weakProp, weakWeapon, prop, weapon])} deal ${amount}`, () => {
		const { actor, target, cast } = setup();
		actor.attr.weaponProp = prop;
		actor.attr.weapon = weapon;
		target.attr.charProp = P.木;
		Object.assign(target.attr, { weakProp, weakWeapon });
		const ctx = cast();
		assert.equal(target.getHp(), 1000 - amount);
		assert.deepEqual(
			ctx.msgs.find((msg) => msg[0] === 'hurt')[6],
			amount === 150 ? ['克'] : [],
		);
	});
}

// 测试：弱点加成替代人物相克并与 hurtP 相加，技能属性优先且不修改弱点配置。
test('properties: NPC weakness replaces character countering and adds to the damage rate', () => {
	const { actor, target, cast, skills } = setup();
	actor.attr.weaponProp = P.水;
	const targetAttr = Object.assign(target.attr, { weakProp: [P.金] });
	target.attr.charProp = P.水;
	target.attr.magic.final.immunity = 20;
	skills[0].skillProp = P.金;
	skills[0].attack = { ...skills[0].attack, hurtP: -0.6 };
	const before = structuredClone(targetAttr.weakProp);
	cast();
	assert.equal(target.getHp(), 928); // (100 - 20) × (0.4 + 0.5)
	assert.deepEqual(targetAttr.weakProp, before);
});

// 测试：玩家受伤仍用人物相克，忽略只供 NPC 使用的弱点配置。
test('properties: player defenders keep character countering despite weakness fields', () => {
	const { fight, actor, target, flush } = setup();
	actor.attr.charProp = P.木;
	Object.assign(actor.attr, { weakProp: [P.火] });
	target.attr.weaponProp = P.金;
	const ctx = fight.processUnit(target, { cmd: FightCmdEnum.attack, target: actor.uid });
	flush(ctx);
	assert.equal(actor.getHp(), 850);
});

// 测试：普攻复用兵器弱点规则，基础配置经属性重算后仍有效，重算不修改原来的弱点列表。
test('properties: normal attacks use weapon weaknesses after attribute recalculation', () => {
	const { fight, actor, target, flush } = setup();
	actor.attrOri.weapon = W.刀;
	target.attrOri.weakWeapon = [W.刀];
	actor.calcAttr();
	target.calcAttr();
	setCounterChance(target, 0, false);
	const ctx = fight.processUnit(actor, { cmd: FightCmdEnum.attack, target: target.uid });
	flush(ctx);
	assert.equal(target.getHp(), 850);
	assert.deepEqual(target.attrOri.weakWeapon, [W.刀]);
	assert.deepEqual(ctx.msgs.find((msg) => msg[0] === 'hurt')[6], ['克']);
});

for (const func of ['heal', 'poison'] as const) {
	// 测试：毒伤也使用真实施放者匹配 NPC 弱点，治疗仍按人物属性相生，不读取弱点。
	test(`properties: NPC weaknesses ${func === 'heal' ? 'do not replace healing properties' : 'apply to poison'}`, () => {
		const { fight, actor, target, flush } = setup();
		actor.attr.charProp = P.水;
		actor.attr.weaponProp = P.金;
		target.attr.charProp = func === 'heal' ? P.木 : P.水;
		Object.assign(target.attr, { weakProp: func === 'heal' ? [P.火] : [P.金] });
		const initial = initFightContex(fight);
		target.onHurt(actor, 'test', 500, initial);
		flush(initial);
		initSkills([
			{
				id: 1001010,
				name: '弱点效果',
				magic: true,
				rand: 1,
				attack: {},
				final: {},
				func,
				sel: { target: TargetSelectEnum.enemy },
			},
		]);
		actor.addSkill(1001010, 1);
		const ctx = fight.processUnit(actor, {
			cmd: FightCmdEnum.skill,
			skill: 1001010,
			target: target.uid,
		});
		flush(ctx);
		assert.equal(target.getHp(), func === 'heal' ? 650 : 350);
		assert.deepEqual(
			ctx.msgs.find((msg) => msg[0] === (func === 'heal' ? 'heal' : 'hurt'))[6],
			[func === 'heal' ? '生' : '克'],
		);
	});
}

for (const [skillProp, weapon, targetProp, damage] of [
	[undefined, P.金, P.木, 150],
	[P.none, P.金, P.木, 100],
	[P.火, P.金, P.木, 100],
	[P.金, P.none, P.木, 150],
	[undefined, P.木, P.金, 100],
	[undefined, P.木, P.土, 150],
	[undefined, P.土, P.水, 150],
	[undefined, P.火, P.金, 150],
	[undefined, P.木, P.水, 100],
	[undefined, P.火, P.土, 100],
	[undefined, P.土, P.金, 100],
] as const) {
	// 测试：技能属性优先，未填才回退武器属性，显式无属性与非克制保持原伤害。
	test(`properties: skill=${skillProp} weapon=${weapon} target=${targetProp} deals ${damage}`, () => {
		const { actor, target, cast, skills } = setup();
		actor.attr.weaponProp = weapon;
		target.attr.charProp = targetProp;
		skills[0].skillProp = skillProp;
		const ctx = cast();
		assert.equal(target.getHp(), 1000 - damage);
		assert.deepEqual(
			ctx.msgs.filter((msg) => msg[0] === 'hurt').map((msg) => msg[4]),
			[damage],
		);
		assert.deepEqual(
			ctx.msgs.find((msg) => msg[0] === 'hurt')[6],
			damage === 150 ? ['克'] : [],
		);
	});
}

// 测试：普通攻击也用武器对人物属性相克，不额外消耗随机数，未配置属性时伤害不变。
test('properties: normal attacks use weapon against character without extra random draws', () => {
	const { fight, actor, target, flush } = setup();
	actor.attr.weaponProp = P.金;
	target.attr.charProp = P.木;
	setCounterChance(target, 0, false);
	let draws = 0;
	fight.random = () => {
		draws++;
		return 0.5;
	};
	const ctx = fight.processUnit(actor, { cmd: FightCmdEnum.attack, target: target.uid });
	assert.ok(ctx);
	flush(ctx);
	assert.equal(target.getHp(), 850);
	assert.equal(draws, 0);
});

// 测试：相克加成与 hurtP 加法合并，在目标免伤后应用，原始技能配置不被修改。
test('properties: element bonus adds to hurtP after damage calculation', () => {
	const { actor, target, cast, skills } = setup();
	actor.attr.weaponProp = P.金;
	target.attr.charProp = P.木;
	target.attr.magic.final.immunity = 20;
	skills[0].attack = { ...skills[0].attack, hurtP: -0.6 };
	const before = structuredClone(skills);
	cast();
	assert.equal(target.getHp(), 928); // (100 - 20) × (0.4 + 0.5) = 72
	assert.deepEqual(skills, before);
});

for (const [rate, expected] of [
	[0, 50],
	[0.4, 90],
	[1, 150],
	[2, 250],
] as const) {
	// 测试：相克固定增加五十个百分点，低倍率、高倍率和零倍率均按同一加法规则计算。
	test(`properties: hurtP=${rate} plus counter bonus deals ${expected}`, () => {
		const { actor, target, cast, skills } = setup();
		actor.attr.weaponProp = P.金;
		target.attr.charProp = P.木;
		skills[0].attack = { ...skills[0].attack, hurtP: (rate) - 1 };
		cast();
		assert.equal(target.getHp(), 1000 - expected);
	});
}

for (const [skillProp, amount] of [
	[undefined, 150],
	[P.none, 100],
	[P.金, 100],
	[P.水, 150],
] as const) {
	// 测试：治疗相生默认取施放者人物属性，不取武器，技能属性可覆盖，显式 none 不回退。
	test(`properties: healing skill=${skillProp} restores ${amount}`, () => {
		const { fight, actor, target, flush } = setup();
		actor.attr.charProp = P.水;
		actor.attr.weaponProp = P.金;
		target.attr.charProp = P.木;
		const ctx = initFightContex(fight);
		target.onHurt(actor, 'test', 500, ctx);
		flush(ctx);
		initSkills([
			{
				id: 99910,
				name: '相生治疗',
				magic: true,
				rand: 1,
				attack: {},
				final: {},
				func: 'heal',
				skillProp,
				sel: { target: TargetSelectEnum.enemy },
			},
		]);
		actor.addSkill(99910, 1);
		const result = fight.processUnit(actor, {
			cmd: FightCmdEnum.skill,
			skill: 99910,
			target: target.uid,
		});
		assert.ok(result);
		flush(result);
		assert.equal(target.getHp(), 500 + amount);
		assert.deepEqual(
			result.msgs.find((msg) => msg[0] === 'heal')[6],
			amount === 150 ? ['生'] : [],
		);
	});
}

// 测试：周期治疗相生取 Buff 施加者而非当前动作发起者，普通复活仍按最大生命固定比例。
test('properties: periodic healing uses its caster while revival keeps its fixed ratio', () => {
	const { fight, actor, target, other, flush } = setup();
	actor.attrOri.charProp = P.水;
	target.attrOri.charProp = P.木;
	other.attrOri.charProp = P.金;
	actor.calcAttr();
	target.calcAttr();
	other.calcAttr();
	initSkills([
		{
			id: 99911,
			name: '周期治疗',
			magic: true,
			rand: 1,
			attack: { attack: 100 , hurtP: -0.5},
			final: {},

			sel: { target: TargetSelectEnum.friend },
		},
	]);
	initBuffs([
		{
			...getBuffData(ids.rest),
			id: 99912,
			name: '回春',
			class: undefined,
			func: 'heal',
			skill: 99911,
			skillLevel: 1,
		},
	]);
	const ctx = initFightContex(fight);
	ctx.attack = other;
	target.onHurt(actor, 'test', 500, ctx);
	const buff = target.addBuff(actor, 'test', 99912, 1, ctx);
	buffFunc(target, buff, ctx);
	flush(ctx);
	assert.equal(target.getHp(), 600); // 100 × (0.5 + 0.5)，周期治疗同样采用加法
	const dead = initFightContex(fight);
	fight.resolveAction(() => target.onHurt(actor, 'test', 1000, dead));
	flush(dead);
	initSkills([
		{
			id: 99913,
			name: '复活',
			magic: true,
			rand: 1,
			attack: {hurtP: -0.7},
			final: {},
			func: 'relife', relifeP: 0.3,
			skillProp: P.水,

			sel: { target: TargetSelectEnum.enemy },
		},
	]);
	actor.addSkill(99913, 1);
	const revived = fight.processUnit(actor, {
		cmd: FightCmdEnum.skill,
		skill: 99913,
		target: target.uid,
	});
	assert.ok(revived);
	flush(revived);
	assert.equal(target.getHp(), 300);
});

for (const func of ['heal', 'poison'] as const) {
	for (const [rate, expected] of [
		[0, 50],
		[0.4, 90],
		[1, 150],
		[2, 250],
	] as const) {
		// 测试：治疗相生、毒伤相克与各自 rate 加法合并，零和高低倍率都固定增加五十个百分点。
		test(`properties: ${func}Rate=${rate} adds its elemental bonus to produce ${expected}`, () => {
			const { fight, actor, target, flush } = setup();
			actor.attr.charProp = P.水;
			actor.attr.weaponProp = P.金;
			target.attr.charProp = P.木;
			const initial = initFightContex(fight);
			target.onHurt(actor, 'test', 500, initial);
			flush(initial);
			initSkills([
				{
					id: 99916,
					name: '效果加法',
					magic: true,
					rand: 1,
					attack: {hurtP: (rate ?? 1) - 1},
					final: {},
					func,


					sel: { target: TargetSelectEnum.enemy },
				},
			]);
			actor.addSkill(99916, 1);
			const ctx = fight.processUnit(actor, {
				cmd: FightCmdEnum.skill,
				skill: 99916,
				target: target.uid,
			});
			assert.ok(ctx);
			flush(ctx);
			assert.equal(target.getHp(), func === 'heal' ? 500 + expected : 500 - expected);
		});
	}
}

for (const periodic of [false, true]) {
	for (const skillProp of [undefined, P.none]) {
		// 测试：主动与周期毒伤使用施加者武器相克，技能显式 none 可取消回退，不依赖当前动作来源。
		test(`properties: poison periodic=${periodic} skill=${skillProp} uses the caster property`, () => {
			const { fight, actor, target, other, flush } = setup();
			actor.attrOri.weaponProp = P.金;
			target.attrOri.charProp = P.木;
			actor.calcAttr();
			target.calcAttr();
			initSkills([
				{
					id: 99914,
					name: '属性毒伤',
					magic: true,
					rand: 1,
					attack: { attack: periodic ? 100 : 0 },
					final: {},
					func: 'poison',
					skillProp,
					sel: { target: TargetSelectEnum.enemy },
				},
			]);
			let effects: string[];
			if (periodic) {
				initBuffs([
					{
						...getBuffData(ids.rest),
						id: 99915,
						name: '毒',
						class: undefined,
						func: 'poison',
						skill: 99914,
						skillLevel: 1,
					},
				]);
				const ctx = initFightContex(fight);
				ctx.attack = other;
				const buff = target.addBuff(actor, 'test', 99915, 1, ctx);
				buffFunc(target, buff, ctx);
				flush(ctx);
				effects = ctx.msgs.find((msg) => msg[0] === 'hurt')[6];
			} else {
				actor.addSkill(99914, 1);
				const ctx = fight.processUnit(actor, {
					cmd: FightCmdEnum.skill,
					skill: 99914,
					target: target.uid,
				});
				assert.ok(ctx);
				flush(ctx);
				effects = ctx.msgs.find((msg) => msg[0] === 'hurt')[6];
			}
			assert.equal(target.getHp(), skillProp === P.none ? 900 : 850);
			assert.deepEqual(effects, skillProp === P.none ? [] : ['克']);
		});
	}
}

// 测试：共用上下文的周期治疗和毒伤按目标独立记录效果，后续事件不能污染此前消息。
test('properties: elemental effects belong to each heal or hurt rather than the whole context', () => {
	const { fight, actor, target, other, flush } = setup();
	actor.attr.charProp = P.水;
	actor.attr.weaponProp = P.金;
	target.attr.charProp = P.木;
	other.attr.charProp = P.金;
	const data = {
		id: 99917,
		name: '周期效果',
		magic: true,
		rand: 1,
		attack: { attack: 100 },
		final: {},
		sel: { target: TargetSelectEnum.enemy },
	};
	const ctx = initFightContex(fight);
	ctx.effects = ['crit'];
	heal(actor, target, new AttrSkill(data, 1, actor, 'heal'), 'buff', ctx);
	heal(actor, other, new AttrSkill(data, 1, actor, 'heal'), 'buff', ctx);
	poison(actor, target, new AttrSkill(data, 1, actor, 'poison'), 'buff', ctx);
	poison(actor, other, new AttrSkill(data, 1, actor, 'poison'), 'buff', ctx);
	flush(ctx);
	assert.deepEqual(
		ctx.msgs.filter((msg) => msg[0] === 'heal' || msg[0] === 'hurt').map((msg) => msg[6]),
		[['生'], [], ['克'], []],
	);
});

// 测试：暴击和相克标记可同时存在，同一条伤害中各记录一次。
test('properties: critical and counter effects coexist in a single damage message', () => {
	const { actor, target, cast } = setup();
	actor.attr.weaponProp = P.金;
	target.attr.charProp = P.木;
	actor.attr.magic.base.critP = 1;
	const ctx = cast();
	assert.deepEqual(ctx.msgs.find((msg) => msg[0] === 'hurt')[6], ['crit', '克']);
});

// 测试：吸血和复活恢复没有独立生克计算，不能把上下文中的生克标记复制到自己的治疗消息。
test('properties: fixed healing does not inherit elemental markers from previous calculations', () => {
	const { fight, actor, target, flush } = setup();
	const ctx = initFightContex(fight);
	ctx.effects = ['生', '克'];
	actor.onHeal(actor, 'blood', 10, ctx);
	target.onHeal(actor, 'relife', 10, ctx, { revive: true });
	flush(ctx);
	assert.deepEqual(
		ctx.msgs.filter((msg) => msg[0] === 'heal').map((msg) => msg[6]),
		[[], []],
	);
	assert.deepEqual(ctx.effects, ['生', '克']);
});
