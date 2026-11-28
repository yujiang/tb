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
	test(`${func}Rate: combine attackP and hurtP, including zero and negative corrections`, () => {
		for (const rate of [undefined, 0, 0.5, 2]) {
			const { fight, actor, target, flush } = setupChain({ actorHp: 100 });
			const config = data({
				func,

				sel: { target: func === 'heal' ? TargetSelectEnum.self : TargetSelectEnum.enemy },
				attack: { attack: 20, attackP: -0.5, hurtP: (rate ?? 1) - 1 },
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
			const amount =
				func === 'heal' ? Math.floor(65 * (rate ?? 1)) : Math.max(130 * (rate ?? 1), 1);
			assert.equal(
				func === 'heal' ? actor.getHp() : target.getHp(),
				func === 'heal' ? 100 + amount : 1000 - amount,
			);
		}
	});

	// 测试：周期 Buff 使用的原始技能数值同样应用治疗或毒伤倍率。
	test(`${func}Rate: raw skills used by periodic buffs also apply the multiplier`, () => {
		const { fight, actor, target } = setupChain();
		actor.attr[func].attack = 0;
		const skill = new AttrSkill(data({ attack: { attack: 20, hurtP: -0.5 } }), 2, actor, func);
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
test('relife: relifeP alone determines target HP, independently of attack and level bonuses', () => {
	for (const rate of [undefined, 0.3, 0.001]) {
		const { fight, actor, target } = setupChain();
		const ctx = initFightContex(fight);
		actor.attr.point.hp = actor.attr.point.hpMax = 100;
		target.onHurt(actor, 'test', 1000, ctx);
		const skill = new FightSkill(
			data({ relifeP: rate, attack: { attack: 999, attackP: 19 } }),
			2,
		);
		assert.equal(relifeFunc(actor, target, skill, ctx), true);
		assert.equal(target.isDied(), false);
		assert.equal(target.getHp(), 1000 * (rate ?? 0.2));
	}
});

// 测试：复活比例为零时不产生存活但零血的单位。
test('relife: zero relifeP does not create an alive unit with zero HP', () => {
	const { fight, actor, target } = setupChain();
	const ctx = initFightContex(fight);
	target.onHurt(actor, 'test', 1000, ctx);
	assert.equal(relifeFunc(actor, target, new FightSkill(data({ relifeP: 0 }), 1), ctx), false);
	assert.equal(target.isDied(), true);
	assert.equal(target.getHp(), 0);
	assert.equal(
		ctx.msgs.some((msg) => msg[0] === 'relife'),
		false,
	);
});

// 测试：百分比允许负修正，非有限数在属性合并阶段拒绝。
test('effect percentages: reject nonfinite attributes before execution', () => {
	for (const field of ['attackP', 'hurtP'] as const) {
		for (const rate of [NaN, Infinity, -Infinity]) {
			assert.throws(() => new FightSkill(data({ attack: { [field]: rate } }), 1), /finite/);
		}
	}
});
