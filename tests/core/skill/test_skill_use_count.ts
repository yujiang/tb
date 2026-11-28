import { setCounterChance } from '../../fixtures/default_skills';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
	FightAttr, FightCmdEnum, FightSkill, FightUnitMonster, initFightContex, initSkills,
	SkillData, TargetSelectEnum,
} from '../../../src';
import { setupChain, chainIds as ids } from '../../fixtures/skill_chain';
import { setupTrap, hitId } from '../../fixtures/trap';
import { tryFBack } from '../../../src/fight/Skills/FightBack';
import { trySupport } from '../../../src/fight/Skills/FightSupport';
import { magicAttackFunc } from '../../../src/fight/Skills/Funcs/NomalSkill';

function setup(change: Partial<SkillData> = {}) {
	return setupChain({
		rootSelfBuff: false,
		finalReactions: false,
		change: (skills) => Object.assign(skills[0], {
			combo: undefined, nosupport: true, ...change,
		}),
	});
}

// 技能和类型次数初始为0，同一技能多次发动分别累计，其他单位的计数独立。
test('skill use: counts actual casts by skill ID and use type on each unit', () => {
	const s = setup();
	assert.equal(s.actor.getSkillUseCount(ids.first), 0);
	assert.equal(s.actor.getSkillTypeUseCount('normal'), 0);
	s.cast();
	s.cast();
	assert.equal(s.actor.getSkillUseCount(ids.first), 2);
	assert.equal(s.actor.getSkillTypeUseCount('normal'), 2);
	assert.equal(s.target.getSkillUseCount(ids.first), 0);
});

// 三段连招各自按技能ID计数，首段是普通行动，后两段属于combo。
test('skill use: combo children have independent skill counts and a shared combo total', () => {
	const s = setupChain({ rootSelfBuff: false, finalReactions: false });
	s.cast();
	for (const id of [ids.first, ids.second, ids.third]) {
		assert.equal(s.actor.getSkillUseCount(id), 1);
	}
	assert.equal(s.actor.getSkillTypeUseCount('normal'), 1);
	assert.equal(s.actor.getSkillTypeUseCount('combo'), 2);
});

// 发动概率失败不记次数，物理技能发动后未命中仍记一次。
test('skill use: probability failures are excluded while misses still count', () => {
	const failed = setup({ rand: 0 });
	failed.cast();
	assert.equal(failed.actor.getSkillUseCount(ids.first), 0);
	const missed = setup({ magic: false, attack: { hit: -1000 } });
	missed.cast();
	assert.equal(missed.target.getHp(), 1000);
	assert.equal(missed.actor.getSkillUseCount(ids.first), 1);
});

// 费用不足、行动禁止和非法目标在发动前被拒绝，均不增加次数或发出使用事件。
test('skill use: rejected commands do not record a skill use', () => {
	for (const invalid of ['cost', 'action', 'target']) {
		const s = setup(invalid === 'cost' ? { cost: { mp: 999 } } : {});
		if (invalid === 'action') s.actor.isForbid = (action) => action === 'action';
		let events = 0;
		s.actor.onContex('useSkill', () => { events++; });
		s.fight.processUnit(s.actor, {
			cmd: FightCmdEnum.skill, skill: ids.first,
			target: invalid === 'target' ? 999999 : s.target.uid,
		});
		assert.equal(s.actor.getSkillUseCount(ids.first), 0, invalid);
		assert.equal(events, 0, invalid);
	}
});

// 多目标攻击仅记一次并发一次事件，事件中的计数已更新，技能数值修正作用于所有目标。
test('skill use: a group attack records once before all of its target effects', () => {
	const s = setup({ sel: { target: TargetSelectEnum.enemy, num: 99 } });
	let events = 0;
	s.actor.onContex('useSkill', (unit, ctx, skill: FightSkill, type, count, typeCount) => {
		events++;
		assert.equal(unit.getSkillUseCount(skill.getId()), 1);
		assert.equal(type, 'normal');
		assert.equal(count, 1);
		assert.equal(typeCount, 1);
		assert.equal(ctx.attack, unit);
		skill.getAttack().attack *= 2;
	});
	s.cast();
	assert.equal(events, 1);
	assert.equal(s.actor.getSkillUseCount(ids.first), 1);
	assert.equal(s.target.getHp(), 920);
	assert.equal(s.other.getHp(), 920);
});

// 群体技能发动失败时整组不计数。
test('skill use: failed group attacks do not record any use', () => {
	const s = setup({ rand: 0, sel: { target: TargetSelectEnum.enemy, num: 99 } });
	s.cast();
	assert.equal(s.actor.getSkillUseCount(ids.first), 0);
});

// 直接调用群攻时，如果每个目标都因攻击者行动禁止而未能发动，也不能仅因进入群体流程就记次数。
test('skill use: a group attack rejected by all single-target checks records no use', () => {
	const s = setup({ sel: { target: TargetSelectEnum.enemy, num: 99 } });
	s.actor.isForbid = (action) => action === 'action';
	magicAttackFunc(s.actor, s.target, s.actor.findSkill(ids.first), initFightContex(s.fight));
	assert.equal(s.actor.getSkillUseCount(ids.first), 0);
});

// 协战和反击都计入自身技能及对应类型，同一ID的不同出手类型不会互相覆盖。
test('skill use: support and counters contribute to both the skill and source totals', () => {
	const s = setup();
	const right = s.fight.getSide(s.other.side).units;
	right.splice(right.indexOf(s.other), 1);
	s.fight.getSide(s.actor.side).units.push(s.other);
	s.other.setFight(s.fight, s.actor.side);
	s.actor.setSupportSkill(ids.first);
	s.actor.setFBackSkill(ids.first);
	assert.equal(trySupport(s.other, s.target, initFightContex(s.fight)), true);
	assert.equal(trySupport(s.other, s.target, initFightContex(s.fight)), false);
	assert.equal(tryFBack(s.actor, s.target, initFightContex(s.fight)), true);
	assert.equal(s.actor.getSkillUseCount(ids.first), 2);
	assert.equal(s.actor.getSkillTypeUseCount('support'), 1);
	assert.equal(s.actor.getSkillTypeUseCount('fback'), 1);
});

for (const source of ['support', 'fback'] as const) {
	// 协战或反击累计次数可在使用事件中提高本次伤害，跨回合继续增长。
	test(`skill use: increasing ${source} damage uses its own cumulative source count`, () => {
		const s = setup();
		const right = s.fight.getSide(s.other.side).units;
		right.splice(right.indexOf(s.other), 1);
		s.fight.getSide(s.actor.side).units.push(s.other);
		s.other.setFight(s.fight, s.actor.side);
		s.actor.setSupportSkill(ids.first);
		s.actor.setFBackSkill(ids.first);
		s.actor.onContex('useSkill', (_unit, _ctx, skill: FightSkill, type, _count, typeCount) => {
			if (type === source) skill.getAttack().attack *= typeCount;
		});
		const use = () => source === 'support'
			? trySupport(s.other, s.target, initFightContex(s.fight))
			: tryFBack(s.actor, s.target, initFightContex(s.fight));
		assert.equal(use(), true);
		s.fight.nextTurn();
		assert.equal(use(), true);
		assert.equal(s.actor.getSkillTypeUseCount(source), 2);
		assert.equal(s.target.getHp(), source === 'support' ? 880 : 988);
	});
}

// 连击和击杀追击归入各自出手类型，不与普通行动或连招混淆。
test('skill use: next and kill follow-ups have separate source totals', () => {
	const next = setup({ next: ids.second });
	next.skills[1].combo = undefined;
	next.cast();
	assert.equal(next.actor.getSkillUseCount(ids.second), 1);
	assert.equal(next.actor.getSkillTypeUseCount('next'), 1);
	const kill = setup({  kill: ids.kill , attack: { hurtP: 19 }});
	kill.cast();
	assert.equal(kill.actor.getSkillUseCount(ids.kill), 1);
	assert.equal(kill.actor.getSkillTypeUseCount('kill'), 1);
});

// 默认普攻和反击均按各自技能表ID计数，出手类型仍能区分。
test('skill use: default attacks and counters use their configured table IDs', () => {
	const s = setup();
	s.fight.processUnit(s.actor, { cmd: FightCmdEnum.attack, target: s.target.uid });
	setCounterChance(s.actor, 1, false);
	assert.equal(tryFBack(s.actor, s.target, initFightContex(s.fight)), true);
	assert.equal(s.actor.getSkillUseCount(990001), 1);
	assert.equal(s.actor.getSkillUseCount(s.actor.getFBackSkill().getId()), 1);
	assert.equal(s.actor.getSkillTypeUseCount('normal'), 1);
	assert.equal(s.actor.getSkillTypeUseCount('fback'), 1);
});

// 一次溅射命中多个副目标只记一次，而不是按副目标人数累加。
test('skill use: a splash invocation counts once across multiple secondary targets', () => {
	const s = setup({ spread: ids.second });
	s.skills[1].combo = undefined;
	s.skills[1].sel = { target: TargetSelectEnum.enemy, num: 2 };
	const third = new FightUnitMonster(3, Object.assign(new FightAttr(), structuredClone(s.other.attrOri)), { name: '第三目标' });
	third.setFight(s.fight, s.target.side);
	s.fight.getSide(s.target.side).units.push(third);
	s.fight.processUnit(s.actor, { cmd: FightCmdEnum.skill, skill: ids.first, target: s.target.uid });
	assert.ok(s.other.getHp() < 1000);
	assert.ok(third.getHp() < 1000);
	assert.equal(s.actor.getSkillUseCount(ids.second), 1);
	assert.equal(s.actor.getSkillTypeUseCount('spread'), 1);
});

// 陷阱中断已发动攻击仍保留原技能次数，陷阱伤害单独计入持有者。
test('skill use: traps and attacks interrupted by a trap both count once', () => {
	const s = setupTrap(true);
	s.place();
	s.cast();
	assert.equal(s.actor.getSkillUseCount(ids.first), 1);
	assert.equal(s.target.getSkillUseCount(hitId), 1);
	assert.equal(s.target.getSkillTypeUseCount('trap'), 1);
});

for (const func of ['heal', 'poison', 'nohurt', 'observe']) {
	// 非攻击主动技能同样在发动时计数，不能只统计伤害技能。
	test(`skill use: records a non-attack ${func} cast`, () => {
		const s = setup({ func });
		s.cast();
		assert.equal(s.actor.getSkillUseCount(ids.first), 1);
		assert.equal(s.actor.getSkillTypeUseCount('normal'), 1);
	});
}

// 非攻击群体施放也只计一次，不因多个目标重复调用效果函数而累加。
test('skill use: group healing records one use', () => {
	const s = setup({ func: 'heal', sel: { target: TargetSelectEnum.enemy, num: 99 } });
	s.cast();
	assert.equal(s.actor.getSkillUseCount(ids.first), 1);
});

// 治疗溅射也记录引用子技能一次，不遗漏非攻击副目标效果。
test('skill use: healing splash records the child skill separately', () => {
	const s = setup({ func: 'heal', spread: ids.second });
	s.cast();
	assert.equal(s.actor.getSkillUseCount(ids.first), 1);
	assert.equal(s.actor.getSkillUseCount(ids.second), 1);
	assert.equal(s.actor.getSkillTypeUseCount('spread'), 1);
});

// 冷却中的再次提交不算发动，原技能计数保持一次。
test('skill use: cooldown rejection does not increment the successful use count', () => {
	const s = setup({ cd: 2 });
	s.cast();
	s.fight.processUnit(s.actor, { cmd: FightCmdEnum.skill, skill: ids.first, target: s.target.uid });
	assert.equal(s.actor.getSkillUseCount(ids.first), 1);
});

// 使用事件可以按递增次数修正本次攻击，作为越战越勇Buff的接入点，且不污染技能配置。
test('skill use: the updated count is available for increasing the current skill damage', () => {
	const s = setup();
	s.actor.onContex('useSkill', (_unit, _ctx, skill: FightSkill, _type, count) => {
		skill.getAttack().attack *= count;
	});
	s.cast();
	s.cast();
	assert.equal(s.target.getHp(), 880);
	assert.deepEqual(s.skills[0].attack, { hurtP: -0.6 });
});

// 本场累计次数不因回合、死亡复活或同场重新绑定而清零，绑定新战斗才重置。
test('skill use: counts survive turn and life changes and reset for another fight', () => {
	const s = setup();
	s.cast();
	s.fight.nextTurn();
	s.actor.die();
	s.actor.relife();
	s.actor.setFight(s.fight, s.actor.side);
	assert.equal(s.actor.getSkillUseCount(ids.first), 1);
	const other = setup();
	s.actor.setFight(other.fight, s.actor.side);
	assert.equal(s.actor.getSkillUseCount(ids.first), 0);
	assert.equal(s.actor.getSkillTypeUseCount('normal'), 0);
});

// 模仿技能及实际回放技能分别记录，不能因复用上下文而互相吞掉次数。
test('skill use: mimic and the replayed skill each record their own invocation', () => {
	const s = setup();
	s.cast();
	const mimic = 10018401;
	initSkills([{
		...s.skills[0], id: mimic, func: 'mimic', sel: { target: TargetSelectEnum.self }, cost: { mp: 1 },
	}]);
	s.actor.addSkill(mimic, 1);
	s.fight.processUnit(s.actor, { cmd: FightCmdEnum.skill, skill: mimic, target: s.actor.uid });
	assert.equal(s.actor.getSkillUseCount(mimic), 1);
	assert.equal(s.actor.getSkillUseCount(ids.first), 2);
	assert.equal(s.actor.getSkillTypeUseCount('normal'), 3);
});
