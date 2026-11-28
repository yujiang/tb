import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { FightSkill, SkillData, TargetSelectEnum, initSkills } from '../../../src';
import { ZeroBaseAttack, ZeroFinalAttack } from '../../../src/fight/FightAttr';
import { setupChain, chainIds } from '../../fixtures/skill_chain';

function data(attackP = 0, extra: Partial<SkillData> = {}): SkillData {
	return {
		id: 98100,
		name: '攻击百分比',
		magic: true,
		rand: 1,
		sel: { target: TargetSelectEnum.enemy },
		attack: { attack: 20, attackP },
		attackLevel: { attack: 5 },
		final: {},
		...extra,
	};
}

// 固定数值、成长和百分比分别相加；重复合并从原配置重算，不提前乘进attack。
test('attackP: merge fixed additions, growth and percentages without mutation or accumulation', () => {
	const config = data(0.2);
	const base = { ...ZeroBaseAttack(), attack: 100, attackP: 0.1, hit: 90 };
	const snapshot = structuredClone(config);
	const skill = new FightSkill(config, 2);
	assert.equal(skill.getAttack().attack, 30);
	for (let i = 0; i < 2; i++) {
		skill.mergeAttack(base, ZeroFinalAttack());
		assert.equal(skill.getAttack().attack, 130);
		assert.ok(Math.abs(skill.getAttack().attackP - 0.3) < 1e-12);
		assert.equal(skill.getAttack().hit, 90);
	}
	assert.deepEqual(config, snapshot);
	assert.equal(base.attack, 100);
	assert.equal(base.attackP, 0.1);
});

// attackP省略和零表示不增减；-1表示结算时攻击项为零，固定数值仍按加法保存。
test('attackP: zero and negative corrections retain additive attribute values', () => {
	for (const attackP of [undefined, 0, -1, -0.5]) {
		const skill = new FightSkill(data(attackP), 0);
		skill.mergeAttack({ ...ZeroBaseAttack(), attack: 100 }, ZeroFinalAttack());
		assert.equal(skill.getAttack().attack, 120);
		assert.equal(skill.getAttack().attackP, attackP ?? 0);
	}
	const skill = new FightSkill(data(0, { attack: {}, attackLevel: { attack: 7 } }), 2);
	skill.mergeAttack({ ...ZeroBaseAttack(), attack: 100 }, ZeroFinalAttack());
	assert.equal(skill.getAttack().attack, 114);
});

// 攻击和防御的百分比分别在相减前应用，最终hurtP在相减后应用一次。
test('attackP: attack and defense percentages precede the final hurt percentage', () => {
	const s = setupChain({
		rootSelfBuff: false,
		finalReactions: false,
		change: (skills) =>
			Object.assign(skills[0], {
				combo: undefined,
				attack: { attack: 20, attackP: 0.5, hurtP: 0.25 },
				attackLevel: { attack: 5 },
			}),
	});
	s.actor.attr.magic.base.attackP = 0.25;
	s.target.attr.magic.base.defend = 30;
	s.target.attr.magic.base.defendP = 0.5;
	const ctx = s.cast();
	const expected = Math.floor(((100 + 20 + 5) * (1 + 0.25 + 0.5) - 30 * 1.5) * 1.25);
	assert.equal(s.target.getHp(), 1000 - expected);
	assert.equal(ctx.msgs.find((msg) => msg[0] === 'hurt')?.[4], expected);
	assert.equal(s.actor.attr.magic.base.attack, 100);
});

// 配置的三段子技能各自使用attackP，费用只在主技能收取。
test('attackP: configured next skills apply their own percentages', () => {
	const s = setupChain({
		rootSelfBuff: false,
		finalReactions: false,
		change: (skills) => {
			for (const [index, attackP] of [-0.5, 0, 0.5].entries()) {
				skills[index].attack = { attackP };
			}
		},
	});
	assert.deepEqual(
		s
			.cast()
			.msgs.filter((msg) => msg[0] === 'hurt')
			.map((msg) => msg[4]),
		[50, 100, 150],
	);
	assert.equal(s.actor.attr.point.mp, 90);
});

// 反击读取反击阶段基础攻击，并统一应用技能百分比和固定加成。
test('attackP: counters use their own stage attributes', () => {
	const s = setupChain({
		rootSelfBuff: false,
		change: (skills) => {
			Object.assign(skills[0], { combo: undefined, nofback: false, attack: {} });
		},
	});
	const counter = data(0.5, { id: 98103, nofback: true, attack: { attack: 5, attackP: 0.5 }, attackLevel: {} });
	initSkills([counter]);
	s.target.addSkill(counter.id, 1);
	s.target.fbackSkill = counter.id;
	s.target.attr.magic.fback.attack = 40;
	s.cast();
	assert.equal(s.actor.getHp(), 933); // floor((40 + 5) * 1.5)
});

// 百分比可为负数修正，非有限值在合并阶段拒绝。
test('attackP: rejects nonfinite percentages', () => {
	for (const attackP of [NaN, Infinity, -Infinity]) {
		assert.throws(() => new FightSkill(data(attackP), 1), /finite/);
	}
});
