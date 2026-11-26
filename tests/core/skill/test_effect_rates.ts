import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
	FightSkill,
	SkillData,
	TargetSelectEnum,
	initSkills,
	initFightContex,
	FightCmdEnum,
} from '../../../src';
import { AttrSkill } from '../../../src/fight/Skills/AttrSkill';
import { relifeFunc } from '../../../src/fight/Skills/Funcs/Relife';
import { setupChain } from '../../fixtures/skill_chain';

function data(extra: Partial<SkillData> = {}): SkillData {
	return {
		id: 98120,
		name: '效果倍率',
		magic: true,
		rand: 1,
		sel: { target: TargetSelectEnum.self },
		attack: { attack: 20 },
		attackLevel: { attack: 5 },
		final: {},
		...extra,
	};
}

for (const func of ['heal', 'poison'] as const) {
	// 测试：治疗和毒伤在攻击力合并后应用各自倍率，默认一并支持显式零。
	test(`${func}Rate: scale formula result after attackRate, including default and explicit zero`, () => {
		for (const rate of [undefined, 0, 0.5, 2]) {
			const { fight, actor, target, flush } = setupChain({ actorHp: 100 });
			const config = data({
				func,
				attackRate: 0.5,
				healRate: func === 'heal' ? rate : 7,
				poisonRate: func === 'poison' ? rate : 7,
				sel: { target: func === 'heal' ? TargetSelectEnum.self : TargetSelectEnum.enemy },
			});
			initSkills([config]);
			actor.addSkill(config.id, 2);
			const ctx = fight.processUnit(actor, {
				cmd: FightCmdEnum.skill,
				skill: config.id,
				target: func === 'heal' ? actor.uid : target.uid,
			});
			assert.ok(ctx);
			flush(ctx);
			const amount = 80 * (rate ?? 1); // (100 × 0.5 + 20 + 5 × 2) × 对应效果倍率
			assert.equal(
				func === 'heal' ? actor.getHp() : target.getHp(),
				func === 'heal' ? 100 + amount : 1000 - amount,
			);
		}
	});

	// 测试：周期 Buff 使用的原始技能数值同样应用治疗或毒伤倍率。
	test(`${func}Rate: raw skills used by periodic buffs also apply the multiplier`, () => {
		const { fight, actor, target } = setupChain();
		const skill = new AttrSkill(data({ healRate: 0.5, poisonRate: 0.5 }), 2, func);
		const ctx = initFightContex(fight);
		assert.equal(
			func === 'heal'
				? skill.calcHeal(fight, target, ctx)
				: skill.calcPoison(fight, target, ctx),
			15,
		);
		assert.equal(skill.getAttack().attack, 30);
		assert.equal(actor.getHp(), 1000);
	});
}

// 测试：复活仅按治疗比例和目标最大生命恢复，不受攻击属性及等级加成影响。
test('relife: healRate alone determines target HP, independently of attack and level bonuses', () => {
	for (const rate of [undefined, 0.3, 0.001]) {
		const { fight, actor, target } = setupChain();
		const ctx = initFightContex(fight);
		actor.attr.point.hp = actor.attr.point.hpMax = 100;
		target.onHurt(actor, 'test', 1000, ctx);
		const skill = new FightSkill(
			data({ healRate: rate, attack: { attack: 999 }, attackRate: 20 }),
			2,
		);
		assert.equal(relifeFunc(actor, target, skill, ctx), true);
		assert.equal(target.isDied(), false);
		assert.equal(target.getHp(), 1000 * (rate ?? 1));
	}
});

// 测试：复活比例为零时不产生存活但零血的单位。
test('relife: zero healRate does not create an alive unit with zero HP', () => {
	const { fight, actor, target } = setupChain();
	const ctx = initFightContex(fight);
	target.onHurt(actor, 'test', 1000, ctx);
	assert.equal(relifeFunc(actor, target, new FightSkill(data({ healRate: 0 }), 1), ctx), false);
	assert.equal(target.isDied(), true);
	assert.equal(target.getHp(), 0);
	assert.equal(
		ctx.msgs.some((msg) => msg[0] === 'relife'),
		false,
	);
});

// 测试：负数和非有限效果倍率在产生任何效果前被拒绝。
test('effect rates: reject negative and nonfinite values before any effect is executed', () => {
	for (const field of ['healRate', 'poisonRate'] as const) {
		for (const rate of [-1, NaN, Infinity, -Infinity]) {
			assert.throws(
				() => new FightSkill(data({ [field]: rate }), 1),
				new RegExp(`${field} must be finite and nonnegative`),
			);
		}
	}
});
