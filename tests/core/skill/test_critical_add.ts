import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
	PropEnum,
	initSkills,
	initFightContex,
	FightCmdEnum,
	TargetSelectEnum,
} from '../../../src';
import { setupChain } from '../../fixtures/skill_chain';

function setup() {
	return setupChain({
		rootSelfBuff: false,
		finalReactions: false,
		change: (skills) => {
			skills[0].combo = undefined;
			skills[0].damageRate = 1;
		},
	});
}

for (const rate of [0, 0.4, 1, 2]) {
	for (const elemental of [false, true]) {
		// 测试：普通暴击加五十个百分点，与 damageRate 及相克加成统一相加，零倍率也使用同一规则。
		test(`critical add: damageRate=${rate}, elemental=${elemental} uses one combined multiplier`, () => {
			const { actor, target, cast, skills } = setup();
			actor.attr.magic.base.critP = 1;
			actor.attr.weaponProp = elemental ? PropEnum.金 : PropEnum.none;
			target.attr.charProp = PropEnum.木;
			skills[0].damageRate = rate;
			const ctx = cast();
			assert.equal(
				target.getHp(),
				1000 - Math.floor(100 * (rate + 0.5 + (elemental ? 0.5 : 0))),
			);
			assert.deepEqual(
				ctx.msgs.find((msg) => msg[0] === 'hurt')[6],
				elemental ? ['crit', '克'] : ['crit'],
			);
		});
	}
}

// 测试：暴击增伤减去暴击减伤后仍限制为零到一，再作为额外加成加入倍率。
test('critical add: critical depth and resistance contribute a clamped additive bonus', () => {
	for (const [deep, anti, expected] of [
		[0.6, 0.1, 140],
		[0.1, 0.6, 90],
		[2, 0, 190],
	] as const) {
		const { actor, target, cast, skills } = setup();
		actor.attr.magic.base.critP = 1;
		actor.attr.magic.base.critDeep = deep;
		target.attr.magic.base.critDeepAnit = anti;
		skills[0].damageRate = 0.4;
		cast();
		assert.equal(target.getHp(), 1000 - expected);
	}
});

// 测试：固定和比例免伤先作用于基础公式，再统一乘技能、属性与暴击的合并倍率。
test('critical add: defender immunity precedes the combined final multiplier', () => {
	const { actor, target, cast, skills } = setup();
	actor.attr.magic.base.critP = 1;
	actor.attr.weaponProp = PropEnum.金;
	target.attr.charProp = PropEnum.木;
	target.attr.magic.final.immunity = 20;
	target.attr.magic.final.immunityP = 0.25;
	skills[0].damageRate = 2;
	cast();
	assert.equal(target.getHp(), 820); // (100 - 20) × 0.75 × (2 + 0.5 + 0.5)
});

for (const rate of [0, 0.4, 1, 2]) {
	// 测试：治疗暴击同样与 healRate 和相生加成相加，生和暴击标记同时保留。
	test(`critical add: healing rate=${rate} combines critical and generating bonuses`, () => {
		const { fight, actor, target, flush } = setup();
		actor.attr.charProp = PropEnum.水;
		actor.attr.heal.critP = 1;
		target.attr.charProp = PropEnum.木;
		const initial = initFightContex(fight);
		target.onHurt(actor, 'test', 500, initial);
		flush(initial);
		initSkills([
			{
				id: 99930,
				name: '暴击治疗',
				magic: true,
				rand: 1,
				attack: {},
				final: {},
				func: 'heal',
				healRate: rate,
				sel: { target: TargetSelectEnum.enemy },
			},
		]);
		actor.addSkill(99930, 1);
		const ctx = fight.processUnit(actor, {
			cmd: FightCmdEnum.skill,
			skill: 99930,
			target: target.uid,
		});
		assert.ok(ctx);
		flush(ctx);
		assert.equal(target.getHp(), 500 + Math.floor(100 * (rate + 0.5 + 0.5)));
		assert.deepEqual(ctx.msgs.find((msg) => msg[0] === 'heal')[6], ['crit', '生']);
	});
}

// 测试：合并暴击倍率不重复抽概率，毒伤仍无暴击，不因毒属性的暴击字段产生新行为。
test('critical add: roll once for attacks and never add a new poison critical roll', () => {
	const { fight, actor, target, cast, flush } = setup();
	actor.attr.magic.base.critP = 0.5;
	let draws = 0;
	fight.random = () => {
		draws++;
		return 0.1;
	};
	cast();
	assert.equal(draws, 1);
	actor.attr.poison.critP = 1;
	initSkills([
		{
			id: 99931,
			name: '毒伤',
			magic: true,
			rand: 1,
			attack: {},
			final: {},
			func: 'poison',
			sel: { target: TargetSelectEnum.enemy },
		},
	]);
	actor.addSkill(99931, 1);
	const ctx = fight.processUnit(actor, {
		cmd: FightCmdEnum.skill,
		skill: 99931,
		target: target.uid,
	});
	assert.ok(ctx);
	flush(ctx);
	assert.equal(draws, 1);
	assert.deepEqual(ctx.msgs.find((msg) => msg[0] === 'hurt')[6], []);
});
