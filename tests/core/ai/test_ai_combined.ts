import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
	createAI,
	FightAI,
	FightAITarget,
	FightCmdEnum,
	FightUnit,
	FightSkill,
	initFightContex,
	initSkills,
	TargetSelectEnum,
} from '../../../src';
import { setupChain } from '../../fixtures/skill_chain';

// 合并后的条件可与贡献选人组合，条件不满足时不执行该策略；无条件则不限制贡献选人。
test('combined AI: conditions gate contribution selection using condData', () => {
	const s = setupChain({ rootSelfBuff: false, finalReactions: false, targetHp: 400 });
	s.target.enemyHurt.set(s.actor.uid, 50);
	const xls = { type: 'target', cond: 'hpLow', condData: 0.5, contributions: 'unitHurt' };
	const ai = createAI(xls),
		ctx = initFightContex(s.fight);
	assert.ok(ai instanceof FightAITarget);
	assert.deepEqual(ai.waitInput(s.target, 1, ctx), {
		cmd: FightCmdEnum.attack,
		target: s.actor.uid,
	});
	s.target.onHeal(s.target, 'test', 200, ctx);
	assert.equal(ai.waitInput(s.target, 1, ctx), undefined);
	assert.deepEqual(
		createAI({ type: 'target', contributions: 'unitHurt' }).waitInput(s.target, 1, ctx),
		{ cmd: FightCmdEnum.attack, target: s.actor.uid },
	);
	assert.equal(createAI({ ...xls, condData: 0 }).waitInput(s.target, 1, ctx), undefined);
	assert.equal(createAI({ ...xls, cond: 'unknown' }).waitInput(s.target, 1, ctx), undefined);
	assert.equal(createAI({ ...xls, condData: undefined }).waitInput(s.target, 1, ctx), undefined);
	s.loop.end();
});

// self优先于贡献和职业/站位，仍先经过条件判断，技能结算继续走公共指令预检。
test('combined AI: self targeting takes precedence after condition evaluation', () => {
	const s = setupChain({ rootSelfBuff: false, finalReactions: false, targetHp: 400 }),
		skill = 10015010;
	initSkills([
		{
			id: skill,
			name: '合并策略自疗',
			func: 'heal',
			magic: true,
			rand: 1,
			attack: {},
			final: {},
			sel: { target: TargetSelectEnum.self },
		},
	]);
	s.target.addSkill(skill, 1);
	s.target.enemyHurt.set(s.actor.uid, 50);
	const ai = createAI({
		type: 'target',
		self: true,
		cond: 'hpLow',
		condData: 0.5,
		skill,
		contributions: 'unitHurt',
		career: '不存在的职业',
		pos: 'back',
	});
	const ctx = initFightContex(s.fight);
	assert.deepEqual(ai.waitInput(s.target, 1, ctx), {
		cmd: FightCmdEnum.skill,
		skill,
		target: s.target.uid,
	});
	s.target.onHeal(s.target, 'test', 100, ctx);
	assert.equal(ai.waitInput(s.target, 1, ctx), undefined);
	s.loop.end();
});

// 代码扩展只实现findTarget即可复用技能选择和指令预检，封印时不会提交技能。
test('combined AI: findTarget extensions reuse the base command pipeline', () => {
	const s = setupChain({ rootSelfBuff: false, finalReactions: false });
	const skill = s.actor.skills.values().next().value as FightSkill;
	class TargetAI extends FightAI {
		override findTarget(unit: FightUnit, turn: number, selected: FightSkill) {
			assert.equal(unit, s.actor);
			assert.equal(turn, 2);
			assert.equal(selected, skill);
			return s.target;
		}
	}
	const ai = new TargetAI({ type: 'custom', skill: skill.getId() }),
		ctx = initFightContex(s.fight);
	assert.deepEqual(ai.waitInput(s.actor, 2, ctx), {
		cmd: FightCmdEnum.skill,
		skill: skill.getId(),
		target: s.target.uid,
	});
	s.actor.isForbid = (action) => action === 'skill';
	assert.equal(ai.waitInput(s.actor, 2, ctx), undefined);
	s.loop.end();
});
