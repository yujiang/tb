import '../../fixtures/default_skills';
import { setFightGlobalData } from '../../../src/fight/Datas/FightGlobalData';
import { BuffTurnEnum } from '../../../src/fight/Datas/BuffDatas';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { Fight } from '../../../src/fight/Fight';
import { BaseAttack, FightAttr } from '../../../src/fight/FightAttr';
import { FightSide } from '../../../src/fight/FightSide';
import { BuffData, initBuffs, OverlapEnum } from '../../../src/fight/Datas/BuffDatas';
import { MAX_POWER } from '../../../src/fight/Buffs/FightBuff';
import { initFightContex } from '../../../src/fight/Fight';
import { initSkills, SkillData } from '../../../src/fight/Datas/SkillDatas';
import { FightSkill } from '../../../src/fight/Skills/FightSkill';
import { mergeTableLevel } from '../../../src/fight/Skills/Calc';
import { initPassives, PassiveData } from '../../../src/fight/Datas/PassiveDatas';
import { FightUnitMonster } from '../../../src/fight/Unit/FightUnitMonster';
import { FightCmdEnum, TargetSelectEnum } from '../../../src/fight/struct';

function attackData(attack = 0): BaseAttack {
	return {
		rand: 0,
		hitP: 0, dodgeP: 0, parryAnit: 0, attackP: 0, defendP: 0,
		hit: 100,
		dodge: 0,
		parry: 0,
		attack,
		defend: 0,
		hurt: 0,
		hurtP: 0,		critP: 0,
		critPAnit: 0,
		critDeep: 0,
		critDeepAnit: 0,
	};
}

function attributes(): FightAttr {
	const attr = new FightAttr();
	attr.point = { hp: 100, hpMax: 100, mp: 100, mpMax: 100 };
	attr.speed = 100;
	const group = () => ({
		base: { ...attackData(20), rand: 1 },
		next: attackData(),
		kill: attackData(),
		spread: attackData(),
		fback: attackData(),
		final: { bloodPAnit: 0, bloodP: 0, dbackP: 0, immunity: 0, immunityP: 0 },
	});
	attr.physic = group();
	attr.magic = group();
	attr.heal = attackData();
	attr.poison = attackData();
	return attr;
}

function setup() {
	setFightGlobalData({
		protectBuff: undefined,
		allShieldBreak: false,
		maxTurn: 10,
		waitInputSec: 1,
		duiwei: false,
	});
	const fight = new Fight(
		1,
		{ id: 1, runaway: false, runawayGrade: 0, deathPenalty: 0, winRecover: 0, winReward: 0 },
		123,
	);
	const attacker = new FightUnitMonster(1, attributes(), { name: '攻击方' });
	const defender = new FightUnitMonster(2, attributes(), { name: '防守方' });
	attacker.setPos(0);
	defender.setPos(0);
	const attackSide = new FightSide(),
		defendSide = new FightSide();
	attackSide.units.push(attacker);
	defendSide.units.push(defender);
	fight.createSide(attackSide, defendSide);
	const ctx = initFightContex(fight);
	const attack = () =>
		fight.processUnit(attacker, { cmd: FightCmdEnum.attack, target: defender.uid });
	return { fight, attacker, defender, ctx, attack };
}

function buff(id: number, extra: Partial<BuffData>): BuffData {
	return {
		id,
		name: `Buff-${id}`,
		desc: '',
		overlap: OverlapEnum.NOT,
		status: [],
		tags: [],
		magic: false,
		attackType: 'base',
		attack: {},
		final: {},
		turnType: BuffTurnEnum.thisTurn,
		lastTurn: 0,
		times: 0,
		event: 'hurt',
		skill: 0,
		skillLevel: 1,
		...extra,
	};
}

// 测试：类型1状态 Buff 封印时禁止普攻和技能，移除后普攻恢复正常伤害。
test('type 1: status buff forbids actions until removed', () => {
	const { attacker, defender, ctx, attack } = setup();
	initBuffs([buff(9301, { status: ['封印'] })]);
	attacker.addBuff(defender, '封印', 9301, 1, ctx);

	assert.equal(attacker.inStatus('封印'), true);
	assert.equal(attacker.isForbid('skill'), true);
	assert.equal(attack(), undefined);
	assert.equal(defender.getHp(), 100);

	attacker.removeBuff(defender, '解除封印', 9301, MAX_POWER, ctx);
	assert.equal(attacker.inStatus('封印'), false);
	assert.equal(attacker.isForbid('skill'), false);
	attack();
	assert.equal(defender.getHp(), 80);
});

// 测试：类型2属性 Buff 增加攻击并提高实际伤害，移除后恢复基础攻击和伤害。
test('type 2: attribute buff increases damage and removal restores it', () => {
	const { attacker, defender, ctx, attack } = setup();
	initBuffs([buff(9302, { attack: { attack: 10 } })]);
	attacker.addBuff(attacker, '攻击提升', 9302, 1, ctx);

	assert.equal(attacker.attr.physic.base.attack, 30);
	assert.equal(attacker.attrOri.physic.base.attack, 20);
	attack();
	assert.equal(defender.getHp(), 70);

	attacker.removeBuff(attacker, '移除增益', 9302, MAX_POWER, ctx);
	assert.equal(attacker.attr.physic.base.attack, 20);
	attack();
	assert.equal(defender.getHp(), 50);
});

// 测试：类型3周期 Buff 分别每回合回血和扣血，持续两回合后移除且不再生效。
test('type 3: periodic healing and poison tick each turn until expiration', () => {
	for (const [index, func] of (['heal', 'poison'] as const).entries()) {
		const { fight, attacker, defender, ctx } = setup();
		const skillId = 9310 + index,
			buffId = 9320 + index;
		const skill: SkillData = {
			id: skillId,
			name: func,
			magic: true,
			func,
			rand: 1,
			sel: { target: func === 'heal' ? TargetSelectEnum.friend : TargetSelectEnum.enemy },
			attack: attackData(10),
			final: { bloodPAnit: 0, bloodP: 0, dbackP: 0, immunity: 0, immunityP: 0 },
		};
		initSkills([skill]);
		initBuffs([buff(buffId, { func, skill: skillId, lastTurn: 2 })]);
		defender.attr.point.hp = 50;
		defender.addBuff(attacker, func, buffId, 1, ctx);

		for (let turn = 1; turn <= 3; turn++) {
			fight.turn = turn;
			defender.processBeforeTurn(turn, ctx);
			const delta = Math.min(turn, 2) * 10;
			assert.equal(
				defender.getHp(),
				func === 'heal' ? 50 + delta : 50 - delta,
				`${func}, turn ${turn}`,
			);
			assert.equal(!!defender.findBuff(buffId), turn < 2);
		}
		const effects = ctx.msgs.filter((msg) => msg[0] === (func === 'heal' ? 'heal' : 'hurt'));
		assert.equal(effects.length, 2);
	}
});

// 测试：类型4次数 Buff 在前三次受伤时减伤一半，第三次后消失，第四次恢复完整伤害。
test('type 4: damage reduction protects three hits then disappears', () => {
	const { attacker, defender, ctx, attack } = setup();
	initBuffs([buff(9304, { times: 3, event: 'hurt', final: { immunityP: 0.5 } })]);
	const protection = defender.addBuff(attacker, '三次减伤', 9304, 1, ctx);

	for (let hit = 1; hit <= 3; hit++) {
		attack();
		assert.equal(defender.getHp(), 100 - hit * 10);
		assert.equal(protection.times, 3 - hit);
		assert.equal(!!defender.findBuff(9304), hit < 3);
	}
	assert.equal(defender.attr.physic.final.immunityP, 0);
	assert.equal(defender.contextEmitter.listenerCount('hurt'), 0);
	attack();
	assert.equal(defender.getHp(), 50);
});

// 测试：等级合并保留仅出现在固定加成或成长中的字段，且允许省略固定加成。
test('level merging includes all configured fields and optional additions', () => {
	assert.deepEqual(mergeTableLevel({ attack: 10 }, { hurt: 2 }, { hurtP: 0.1 }, 3), {
		attack: 10,
		hurt: 2,
		hurtP: 0.1 * 3,
	});
	assert.deepEqual(mergeTableLevel({ attack: 10 }, undefined, { attack: 2 }, 3), { attack: 16 });
	assert.throws(
		() => mergeTableLevel({ attack: 10 }, { attack: NaN }, { attack: 2 }, 1),
		/finite/,
	);
});

// 测试：技能直接读取数值时已应用等级，重复合并不累计成长也不修改配置。
test('skill values initialize with level and merging does not accumulate growth', () => {
	const data: SkillData = {
		id: 9400,
		name: '成长',
		magic: true,
		rand: 1,
		sel: { target: TargetSelectEnum.enemy },
		attack: { attack: 5 },
		final: {},
		attackLevel: { attack: 2 },
		finalLevel: { bloodP: 0.1 },
	};
	const skill = new FightSkill(data, 3);
	assert.equal(skill.getAttack().attack, 11);
	assert.equal(skill.getFinal().bloodP, 0.1 * 3);
	const group = attributes().magic;
	skill.mergeAttack(group.base, group.final);
	skill.mergeAttack(group.base, group.final);
	assert.equal(skill.getAttack().attack, 31);
	assert.equal(data.attack.attack, 5);
	assert.equal(new FightSkill(data, 0).getAttack().attack, 5);
});

// 测试：成长技能经过正常攻击流程产生对应伤害。
test('skill level changes actual damage through the shared flow', () => {
	const { fight, attacker, defender } = setup();
	initSkills([
		{
			id: 9401,
			name: '成长攻击',
			magic: true,
			rand: 1,
			sel: { target: TargetSelectEnum.enemy },
			attack: { attack: 5 },
			final: {},
			attackLevel: { attack: 2 },
		},
	]);
	attacker.addSkill(9401, 3);
	fight.processUnit(attacker, { cmd: FightCmdEnum.skill, skill: 9401, target: defender.uid });
	assert.equal(defender.getHp(), 69);
});

// 测试：仅配置成长字段的 Buff 也参与属性重算，移除后恢复原始数值。
test('growth-only buff modifies attributes and removal restores them', () => {
	const { attacker, defender, ctx } = setup();
	initBuffs([
		buff(9402, {
			attack: undefined,
			final: undefined,
			attackLevel: { attack: 2 },
			finalLevel: { immunityP: 0.1 },
		}),
	]);
	defender.addBuff(attacker, '成长', 9402, 2, ctx);
	assert.equal(defender.attr.physic.base.attack, 24);
	assert.equal(defender.attr.physic.final.immunityP, 0.2);
	defender.removeBuff(attacker, '驱散', 9402, 2, ctx);
	assert.equal(defender.attr.physic.base.attack, 20);
});

// 测试：周期回血和扣血按配置的 skillLevel 计算成长，不重复叠加 Buff 等级。
test('periodic buff skillLevel applies to healing and poison', () => {
	for (const [i, func] of (['heal', 'poison'] as const).entries()) {
		const { attacker, defender, ctx } = setup();
		initSkills([
			{
				id: 9410 + i,
				name: func,
				func,
				magic: true,
				rand: 1,
				sel: { target: TargetSelectEnum.enemy },
				attack: { attack: 10 },
				final: {},
				attackLevel: { attack: 2 },
			},
		]);
		initBuffs([buff(9420 + i, { func, skill: 9410 + i, skillLevel: 3, lastTurn: 1 })]);
		defender.attr.point.hp = 50;
		defender.addBuff(attacker, func, 9420 + i, 5, ctx);
		defender.processBeforeTurn(1, ctx);
		assert.equal(defender.getHp(), func === 'heal' ? 66 : 34);
	}
});

// 测试：驱散只看 Buff 自身 power、不看等级，覆盖比较才在同 power 时比较等级。
test('buff removal ignores levels while overlap uses levels to break power ties', () => {
	const { attacker, defender, ctx } = setup();
	initBuffs([
		buff(9430, { power: 0 }),
		buff(9431, {}),
		buff(9433, { power: 1 }),
		buff(9434, { power: 2 }),
		buff(9435, { power: 2 }),
		buff(9436, { power: 0 }),
	]);
	const zero = defender.addBuff(attacker, 'test', 9430, 5, ctx);
	assert.equal(zero.getPower(), 0);
	const omitted = defender.addBuff(attacker, 'test', 9431, 99, ctx);
	assert.equal(omitted.getPower(), 0);
	assert.equal(defender.removeBuff(attacker, '驱散', 9430, 0, ctx), zero);
	assert.equal(defender.removeBuff(attacker, '驱散', 9431, 0, ctx), omitted);
	const lowerPower = defender.addBuff(attacker, 'test', 9433, 99, ctx);
	const higherPower = defender.addBuff(attacker, 'test', 9434, 1, ctx);
	const higherLevel = defender.addBuff(attacker, 'test', 9435, 2, ctx);
	assert.equal(lowerPower.getPower(), 1);
	assert.equal(higherPower.getPower(), 2);
	assert.equal(higherLevel.getPower(), 2);
	assert.equal(higherPower.canRemove(lowerPower.getPower()), false);
	assert.equal(lowerPower.canRemove(higherPower.getPower()), true);
	assert.equal(higherLevel.canRemove(higherPower.getPower()), true);
	assert.equal(higherLevel.canRemove(higherLevel.getPower()), true);
	assert.equal(higherPower.greatPower(1, 999), true);
	assert.equal(lowerPower.greatPower(2, 0), false);
	assert.equal(higherLevel.greatPower(2, 1), true);
	assert.equal(higherLevel.greatPower(2, 2), true);
	const zeroLevel = defender.addBuff(attacker, 'test', 9436, 0, ctx);
	assert.equal(zeroLevel.getPower(), 0);
	assert.equal(defender.removeBuff(attacker, '驱散', 9436, 0, ctx), zeroLevel);
	const data: SkillData = {
		id: 9432,
		name: '驱散',
		magic: true,
		rand: 1,
		sel: { target: TargetSelectEnum.enemy },
		attack: {},
		final: {},
		power: 0,
	};
	assert.equal(new FightSkill(data, 5).getPower(), 0);
	assert.equal(new FightSkill({ ...data, power: undefined }, 5).getPower(), 5);
});

// 测试：高 power 只阻止弱驱散，不阻止 Buff 自身到期或次数耗尽。
test('high-power buffs still expire on turns and exhausted charges', () => {
	const { attacker, defender, ctx } = setup();
	initBuffs([buff(9440, { power: 100, lastTurn: 1 }), buff(9441, { power: 100, times: 1 })]);
	defender.addBuff(attacker, 'test', 9440, 1, ctx);
	defender.processBeforeTurn(1, ctx);
	assert.equal(defender.findBuff(9440), undefined);
	defender.addBuff(attacker, 'test', 9441, 1, ctx);
	defender.onHurt(attacker, 'test', 1, ctx);
	assert.equal(defender.findBuff(9441), undefined);
	assert.equal(defender.contextEmitter.listenerCount('hurt'), 0);
});

// 测试：非法驱散强度不能绕过 power 比较或产生移除事件。
test('NaN removal power cannot bypass buff protection', () => {
	const { attacker, defender, ctx } = setup();
	initBuffs([buff(9442, { power: 5 })]);
	const added = defender.addBuff(attacker, 'test', 9442, 1, ctx);
	assert.equal(defender.removeBuff(attacker, 'test', 9442, NaN, ctx), undefined);
	assert.equal(defender.findBuff(9442), added);
	assert.equal(ctx.msgs.filter((m) => m[0] === 'removeBuff').length, 0);
});

// 测试：技能 finalLevel 中的吸血成长影响实际回血，而不只影响读取到的属性。
test('skill lifesteal growth affects actual healing', () => {
	const { fight, attacker, defender } = setup();
	attacker.attr.point.hp = 50;
	initSkills([
		{
			id: 9450,
			name: '成长吸血',
			magic: true,
			rand: 1,
			noblood: false,
			sel: { target: TargetSelectEnum.enemy },
			attack: {},
			final: {},
			finalLevel: { bloodP: 0.1 },
		},
	]);
	attacker.addSkill(9450, 2);
	fight.processUnit(attacker, { cmd: FightCmdEnum.skill, skill: 9450, target: defender.uid });
	assert.equal(defender.getHp(), 80);
	assert.equal(attacker.getHp(), 54);
});

// 测试：不可驱散 Buff 拒绝按编号、批量及标签移除，但不占用可驱散数量。
test('notRemove blocks every dispel path without wasting tag removal slots', () => {
	const { attacker, defender, ctx } = setup();
	initBuffs([
		buff(9501, { notRemove: true, tags: ['增益'], attack: { attack: 10 } }),
		buff(9502, { tags: ['增益'], attack: { attack: 5 } }),
	]);
	const protectedBuff = defender.addBuff(attacker, 'test', 9501, 1, ctx);
	const removable = defender.addBuff(attacker, 'test', 9502, 1, ctx);
	assert.equal(defender.removeBuff(attacker, '驱散', 9501, MAX_POWER, ctx), undefined);
	assert.deepEqual(defender.removeBuffs(attacker, '驱散', [[9501, 1]], MAX_POWER, ctx), []);
	assert.deepEqual(defender.removeBuffByTag(attacker, '驱散', '增益', 1, MAX_POWER, ctx), [
		removable,
	]);
	assert.equal(defender.findBuff(9501), protectedBuff);
	assert.equal(defender.attr.physic.base.attack, 30);
});

// 测试：死亡只保留带 dieNotRemove 的 Buff；notRemove 本身不提供死亡保留能力。
test('death retains dieNotRemove buffs and removes ordinary and notRemove-only buffs', () => {
	const { attacker, defender, ctx } = setup();
	initBuffs([
		buff(9503, { times: 2, attack: { attack: 3 } }),
		buff(9504, { notRemove: true, times: 2, attack: { attack: 4 } }),
		buff(9505, { dieNotRemove: true, notRemove: true, times: 2, attack: { attack: 5 } }),
	]);
	for (const id of [9503, 9504, 9505]) defender.addBuff(attacker, 'test', id, 1, ctx);
	defender.die();
	assert.deepEqual([...defender.buffs.keys()], [9505]);
	assert.equal(defender.attr.physic.base.attack, 25);
	assert.equal(defender.contextEmitter.listenerCount('hurt'), 1);
	defender.relife();
	assert.equal(defender.attr.physic.base.attack, 25);
});

// 测试：不可驱散不妨碍持续时间结束或次数耗尽时自然移除。
test('notRemove buffs naturally expire by duration and charges', () => {
	const { attacker, defender, ctx } = setup();
	initBuffs([
		buff(9506, { notRemove: true, lastTurn: 1, attack: { attack: 3 } }),
		buff(9507, { notRemove: true, times: 1, attack: { attack: 4 } }),
	]);
	defender.addBuff(attacker, 'test', 9506, 1, ctx);
	defender.processBeforeTurn(1, ctx);
	assert.equal(defender.findBuff(9506), undefined);
	defender.addBuff(attacker, 'test', 9507, 1, ctx);
	defender.onHurt(attacker, 'test', 1, ctx);
	assert.equal(defender.findBuff(9507), undefined);
	assert.equal(defender.attr.physic.base.attack, 20);
	assert.equal(defender.contextEmitter.listenerCount('hurt'), 0);
});

function passive(id: number, extra: Partial<PassiveData>): PassiveData {
	return {
		id,
		name: '被动',
		desc: '',
		status: [],
		tags: [],
		magic: false,
		attackType: 'base',
		attack: {},
		final: {},
		addbuff: [],
		...extra,
	};
}

// 测试：单位尚未绑定战斗时也能由被动初始化 Buff，并同时计算被动及 Buff 的等级加成。
test('passive grants leveled buffs during construction before fight binding', () => {
	initBuffs([buff(9510, { attack: { attack: 5 }, attackLevel: { attack: 2 }, times: 2 })]);
	initPassives([
		passive(9511, { attack: { attack: 3 }, attackLevel: { attack: 1 }, addbuff: [[9510, 2]] }),
	]);
	const unit = new FightUnitMonster(10, attributes(), { name: '被动单位' }, [[9511, 3]]);
	assert.equal(unit.findBuff(9510)?.getLevel(), 2);
	assert.equal(unit.findBuff(9510)?.attacker, unit);
	assert.equal(unit.attr.physic.base.attack, 35);
	assert.equal(unit.attrOri.physic.base.attack, 20);
	assert.equal(unit.contextEmitter.listenerCount('hurt'), 1);
});

// 测试：已有单位通过被动添加 Buff 后立即更新属性，且遵守不叠加规则。
test('passive buff additions update current attributes without duplicate listeners', () => {
	const { defender } = setup();
	initBuffs([buff(9512, { attack: { attack: 5 }, times: 2 })]);
	defender.addBuffsByPassiveSkill([[9512, 1]]);
	defender.addBuffsByPassiveSkill([[9512, 1]]);
	assert.equal(defender.attr.physic.base.attack, 25);
	assert.equal(defender.contextEmitter.listenerCount('hurt'), 1);
});

// 测试：隐藏 Buff 不出现在单位展示数据中，但属性效果仍然生效。
test('notDisplay hides buff display data while preserving its effects', () => {
	const { attacker, defender, ctx } = setup();
	initBuffs([
		buff(9530, { notDisplay: true, attack: { attack: 10 } }),
		buff(9531, {}),
		buff(9532, { notDisplay: false }),
	]);
	for (const id of [9530, 9531, 9532]) defender.addBuff(attacker, 'test', id, 2, ctx);
	assert.equal(defender.findBuff(9530)?.getDisplayMsg(), undefined);
	assert.deepEqual(
		defender.getUnitMsg().buffs.map((b) => b[0]),
		[9531, 9532],
	);
	assert.equal(defender.attr.physic.base.attack, 30);
	assert.equal(defender.buffs.size, 3);
});

// 测试：显示、驱散和死亡保留字段相互独立，显式 false 不启用保护。
test('display and removal fields are independent and false keeps default behavior', () => {
	const { attacker, defender, ctx } = setup();
	initBuffs([
		buff(9533, { notDisplay: true, notRemove: false, dieNotRemove: false }),
		buff(9534, { notRemove: true, dieNotRemove: true, notDisplay: false }),
	]);
	defender.addBuff(attacker, 'test', 9533, 1, ctx);
	defender.addBuff(attacker, 'test', 9534, 1, ctx);
	assert.ok(defender.removeBuff(attacker, '驱散隐藏效果', 9533, 1, ctx));
	assert.equal(defender.removeBuff(attacker, '驱散保护效果', 9534, 99, ctx), undefined);
	defender.die();
	assert.deepEqual(
		defender.getUnitMsg().buffs.map((b) => b[0]),
		[9534],
	);
});
