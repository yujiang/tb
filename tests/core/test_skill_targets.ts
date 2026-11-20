import '../../src/fight/Buffs/BuffDatas';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
	FightSkill,
	TargetSelectEnum,
	MapShapeEnum,
	FightCmdEnum,
	getDefaultSkill,
	FightUnitMonster,
	FightAttr,
} from '../../src';
import { setupChain, chainIds as ids } from '../fixtures/skill_chain';

// 测试：数量副目标先按技能资格排除主目标和尸体，且不重排战斗的阵营数组。
test('targets: numeric secondary selection filters before sorting without mutating side order', () => {
	const { fight, target, other, skills } = setupChain();
	const skill = new FightSkill(
		{ ...skills[0], sel: { target: TargetSelectEnum.enmey, num: 2, sortAttr: 'hp' } },
		1,
	);
	const order = [...fight.getSideUnits(target.side)];
	other.die();
	assert.deepEqual(
		fight.selectSpreadTargetsNum(target, skill, 2).map((unit) => unit.uid),
		[],
	);
	assert.deepEqual(fight.getSideUnits(target.side), order);
});

// 测试：自身选目标也必须遵守技能资格，存活的施法者不能成为复活目标。
test('targets: self selection respects revival qualification', () => {
	const { fight, actor, skills } = setupChain();
	const skill = new FightSkill(
		{ ...skills[0], func: 'relife', sel: { target: TargetSelectEnum.self } },
		1,
	);
	assert.equal(fight.selectMainTarget(actor, skill) == null, true);
});

// 测试：攻击溅射的副目标人数和排序读取子技能，不把主技能变成群攻。
test('targets: attack splash reads child num and sort configuration', () => {
	const { fight, actor, target, other } = setupChain({
		finalReactions: false,
		rootSelfBuff: false,
		change: (skills) => {
			skills[0].combo = undefined;
			skills[0].spread = ids.second;
			skills[1].combo = undefined;
			skills[1].sel = { target: TargetSelectEnum.enmey, num: 0, sortAttr: 'hp' };
		},
	});
	const ctx = fight.processUnit(actor, {
		cmd: FightCmdEnum.skill,
		skill: ids.first,
		target: target.uid,
	});
	assert.ok(ctx);
	assert.equal(target.getHp(), 960);
	assert.equal(other.getHp(), 1000);
	assert.equal(
		ctx.msgs.some((msg) => msg[0] === 'spread'),
		false,
	);
});

// 测试：形状副目标通过技能 canTarget 过滤额外限制，同时排除主目标。
test('targets: shape selection uses the supplied skill qualification', () => {
	const { fight, target, other, skills } = setupChain();
	fight.createMap(3, 2);
	const skill = new FightSkill(
		{ ...skills[0], sel: { target: TargetSelectEnum.enmey, shape: MapShapeEnum.y_line } },
		1,
	);
	skill.canTarget = (unit) => unit !== other;
	assert.deepEqual(fight.selectSpreadTargets(target, skill), []);
});

// 测试：单体攻击的溅射子技能可独立选择两名副目标，使用子技能排序而非主技能形状。
test('targets: splash child selects two sorted secondary targets independently', () => {
	const { fight, actor, target, other } = setupChain({
		finalReactions: false,
		rootSelfBuff: false,
		change: (skills) => {
			skills[0].combo = undefined;
			skills[0].spread = ids.second;
			skills[0].sel.shape = MapShapeEnum.x_line;
			skills[1].combo = undefined;
			skills[1].sel = { target: TargetSelectEnum.enmey, num: 2, sortAttr: 'hp' };
		},
	});
	for (const [uid, hp] of [
		[3, 500],
		[4, 600],
	]) {
		const attr = Object.assign(new FightAttr(), structuredClone(other.attrOri));
		attr.point.hp = hp;
		const unit = new FightUnitMonster(uid, attr, { name: `副目标${uid}` });
		unit.setPos(uid);
		unit.setFight(fight, other.side);
		fight.getSideUnits(other.side).push(unit);
	}
	const before = fight.getSideUnits(other.side).map((unit) => unit.uid);
	const ctx = fight.processUnit(actor, {
		cmd: FightCmdEnum.skill,
		skill: ids.first,
		target: target.uid,
	});
	assert.ok(ctx);
	assert.equal(target.getHp(), 960);
	assert.equal(other.getHp(), 1000);
	assert.deepEqual(
		ctx.msgs.find((msg) => msg[0] === 'spread'),
		['spread', [3, 4]],
	);
	assert.deepEqual(
		fight.getSideUnits(other.side).map((unit) => unit.uid),
		before,
	);
	assert.deepEqual([fight.getUnitById(3).getHp(), fight.getUnitById(4).getHp()], [430, 530]);
});

// 测试：群体选择先遵守阵营和 canTarget，再应用人数上限，保持原阵营次序。
test('targets: group selection honors custom qualification before taking num', () => {
	const { fight, actor, target, other, skills } = setupChain();
	const skill = new FightSkill(
		{ ...skills[0], sel: { target: TargetSelectEnum.enmey, num: 99 } },
		1,
	);
	skill.canTarget = (unit) => unit !== target;
	assert.deepEqual(
		fight.selectGroupTargets(actor, skill).map((unit) => unit.uid),
		[other.uid],
	);
});

// 测试：复活技能无需 die 配置，自动选尸体；显式选择存活者被拒绝且不扣费。
test('targets: revival qualification controls automatic and explicit input targets', () => {
	const { fight, actor, target, other } = setupChain({
		finalReactions: false,
		rootSelfBuff: false,
		change: (skills) => {
			skills[0].func = 'relife';
			skills[0].healRate = 0.3;
		},
	});
	target.attr.point.hp = 0;
	target.die();
	const input = { cmd: FightCmdEnum.skill, skill: ids.first };
	assert.equal(fight.checkPC(actor, { ...input, target: other.uid }), false);
	assert.equal(actor.attr.point.mp, 100);
	assert.equal(fight.preparePCInput(actor, input)?.target, target.uid);
	const ctx = fight.processUnit(actor, input);
	assert.ok(ctx);
	assert.equal(target.isDied(), false);
	assert.equal(target.getHp(), 300);
	assert.equal(actor.attr.point.mp, 90);
});

// 测试：默认技能不依赖注册表，重复获取的配置与合并属性互不影响。
test('targets: default skills are independent and require no registry entry', () => {
	const first = getDefaultSkill();
	first.getSel().target = TargetSelectEnum.friend;
	first.getAttack().attack = 999;
	const second = getDefaultSkill();
	assert.equal(second.getSel().target, TargetSelectEnum.enmey);
	assert.equal(second.getAttack().attack, 0);
});
