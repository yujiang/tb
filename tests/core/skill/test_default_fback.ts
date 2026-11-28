import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
	FightUnit,
	initSkills,
	initFightContex,
	setFightGlobalData,
	getFightGlobalData,
} from '../../../src';
import { tryFBack, skillFBack } from '../../../src/fight/Skills/FightBack';
import { setupChain } from '../../fixtures/skill_chain';

for (const sample of [0.05, 0.5]) {
	// 默认反击读取全局表ID和10%概率，使用反击属性、记录fback类型并返回实际发动结果。
	test(`default counter: sample ${sample} resolves one reaction with fback attributes`, (t) => {
		const s = setupChain({ rootSelfBuff: false, finalReactions: false });
		const original = { ...getFightGlobalData() };
		t.after(() => setFightGlobalData(original));
		const id = 991850;
		initSkills([
			{
				...s.skills[3],
				id,
				name: '默认反击回归',
				magic: false,
				rand: 0.1,
				attack: {},
				final: {},
				nofback: true,
			},
		]);
		setFightGlobalData({ defaultFBackSkill: id });
		s.target.setFBackSkill(0);
		s.target.getFBackSkill = FightUnit.prototype.getFBackSkill;
		s.target.attr.physic.base.attack = 100;
		s.target.attr.physic.fback.attack = 17;
		s.fight.random = () => sample;
		const ctx = initFightContex(s.fight);
		assert.equal(tryFBack(s.target, s.actor, ctx), sample < 0.1);
		assert.equal(s.actor.getHp(), sample < 0.1 ? 983 : 1000);
		assert.equal(s.target.getSkillTypeUseCount('fback'), sample < 0.1 ? 1 : 0);
		assert.equal(ctx.fbackNum ?? 0, sample < 0.1 ? 1 : 0);
		assert.equal(
			ctx.msgs.filter((msg) => msg[0] === 'skill' && msg[4] === 'fback').length,
			sample < 0.1 ? 1 : 0,
		);
		assert.equal(s.target.attr.point.mp, 100);
	});
}

// 格挡必反击仍跳过技能零概率，执行后保留原技能配置与反击属性，且不能互相反击。
test('default counter: equipped block counter preserves config and prevents recursion', () => {
	const s = setupChain({ rootSelfBuff: false, finalReactions: false });
	const id = 991851;
	const data = {
		...s.skills[3],
		id,
		name: '格挡反击回归',
		magic: false,
		rand: 0,
		nofback: true,
		fbackOnBlock: true,
		attack: {},
		final: {},
	};
	initSkills([data]);
	s.target.addSkill(id, 1);
	s.target.setFBackSkill(id);
	s.actor.addSkill(id, 1);
	s.actor.setFBackSkill(id);
	s.target.attr.physic.fback.attack = 17;
	const ctx = initFightContex(s.fight);
	ctx.blocked = true;
	s.fight.random = () => {
		throw new Error('必定反击不应抽样');
	};
	assert.equal(skillFBack(s.target, s.actor, s.target.getFBackSkill(), ctx), true);
	assert.equal(s.actor.getHp(), 983);
	assert.equal(ctx.msgs.filter((msg) => msg[0] === 'skill').length, 1);
	assert.equal(data.nofback, true);
	assert.equal(data.rand, 0);
});

// 当前被禁止攻击的单位直接跳过反击，不执行技能配置断言，也不抽样或记次。
test('default counter: an unavailable unit skips counter validation and randomness', () => {
	const s = setupChain({ rootSelfBuff: false, finalReactions: false });
	const data = { ...s.skills[3], id: 991852, nofback: false };
	initSkills([data]);
	s.target.addSkill(data.id, 1);
	s.target.isForbid = (action) => action === 'attack';
	s.fight.random = () => {
		throw new Error('无法行动时不应抽样');
	};
	assert.equal(
		skillFBack(s.target, s.actor, s.target.findSkill(data.id), initFightContex(s.fight)),
		false,
	);
});
