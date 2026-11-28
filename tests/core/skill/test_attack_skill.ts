import { setCounterChance } from '../../fixtures/default_skills';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
	FightCmdEnum,
	SkillData,
	TargetSelectEnum,
	initSkills,
	initPassives,
	initFightContex,
	initBuffs,
	getBuffData,
	FightUnitUser,
} from '../../../src';
import { setupChain } from '../../fixtures/skill_chain';
import { equipSkill } from '../../../src/fight/Skills/Funcs/NoHurt';

const attackId = 99940,
	nextId = 99941,
	passiveId = 99942,
	equipId = 99943;
function setup(change?: (data: SkillData) => void) {
	const state = setupChain({ rootSelfBuff: false, finalReactions: false });
	setCounterChance(state.target, 0, false);
	const data: SkillData = {
		id: attackId,
		name: '替代普攻',
		magic: true,
		rand: 1,
		attack: { attack: 10 , hurtP: -0.5},
		attackLevel: { attack: 5 },
		final: {},

		nofback: true,
		nodback: true,
		cost: { mp: 999 },
		sel: { target: TargetSelectEnum.enemy },
	};
	change?.(data);
	initSkills([data]);
	state.actor.addSkill(attackId, 2);
	const attack = (cmd = FightCmdEnum.attack) => {
		const ctx = state.fight.processUnit(state.actor, { cmd, target: state.target.uid });
		if (ctx) state.flush(ctx);
		return ctx;
	};
	return { ...state, data, attack };
}

for (const cmd of [FightCmdEnum.attack, FightCmdEnum.none]) {
	// 测试：装备技能替代显式普攻和默认普攻，使用已学等级及基础攻击属性，不额外支付技能费用。
	test(`attack skill: command ${cmd} uses equipped skill without charging its active cost`, () => {
		const s = setup();
		s.actor.setAttackSkill(attackId);
		const ctx = s.attack(cmd);
		assert.ok(ctx);
		assert.equal(ctx.msgs.find((msg) => msg[0] === 'skill')[1], attackId);
		assert.equal(s.target.getHp(), 940); // (100 + 10 + 5×2) × 0.5
		assert.equal(s.actor.attr.point.mp, 100);
		assert.ok(!ctx.msgs.some((msg) => msg[0] === 'costMp'));
	});
}

// 测试：未装配、卸下或装配未学会的 ID 时仍使用原有普通攻击，不自动学习。
test('attack skill: missing or unavailable equipment falls back to the ordinary attack', () => {
	for (const id of [undefined, 0, 99999]) {
		const s = setup();
		if (id !== undefined) s.actor.setAttackSkill(id);
		const ctx = s.attack();
		assert.ok(ctx);
		assert.equal(ctx.msgs.find((msg) => msg[0] === 'skill')[1], 990001);
		assert.equal(s.target.getHp(), 900);
		assert.equal(s.actor.findSkill(99999), undefined);
	}
});

// 测试：替代普攻发动概率失败就结束，不会再追加原始普攻；禁止 attack 时不出手。
test('attack skill: activation failure never retries an ordinary attack and attack prohibition still applies', () => {
	const s = setup((data) => {
		data.rand = 0;
	});
	s.actor.setAttackSkill(attackId);
	const ctx = s.attack();
	assert.ok(ctx);
	assert.equal(s.target.getHp(), 1000);
	assert.ok(!ctx.msgs.some((msg) => msg[0] === 'skill' || msg[0] === 'hurt'));
	s.actor.isForbid = (action) => action === 'attack';
	assert.equal(s.attack(), undefined);
});

// 测试：禁止技能但允许攻击时，替代普攻仍按 attack 执行，不被错误当成主动技能。
test('attack skill: silence alone does not block an attack command', () => {
	const s = setup();
	s.actor.setAttackSkill(attackId);
	s.actor.isForbid = (action) => action === 'skill';
	assert.ok(s.attack());
	assert.equal(s.target.getHp(), 940);
});

// 测试：替代普攻同样守尸，目标仍死则按未指定目标选人，执行前复活则攻击原目标。
test('attack skill: corpse guarding keeps its target through revival', () => {
	const s = setup();
	s.actor.setAttackSkill(attackId);
	const dead = initFightContex(s.fight);
	s.fight.resolveAction(() => s.target.onHurt(s.actor, 'test', 1000, dead));
	s.flush(dead);
	assert.equal(s.attack()?.defend.uid, s.other.uid);
	assert.equal(s.other.getHp(), 940);
	const revive = initFightContex(s.fight);
	s.target.onRelife(s.actor, 'test', revive);
	s.target.onHeal(s.actor, 'test', 100, revive, { revive: true });
	s.flush(revive);
	assert.ok(s.attack());
	assert.equal(s.target.getHp(), 40);
	assert.equal(s.other.getHp(), 940);
});

// 测试：被动仅装配替代普攻 ID，不学习或覆盖已有技能等级，技能随后加载也可生效。
test('attack skill: passive initialization equips existing skills without changing their levels', () => {
	const s = setup();
	const passive = Object.assign(
		{
			id: passiveId,
			name: '改装普攻',
			desc: '',
			status: [],
			tags: [],
			magic: false,
			attackType: 'base',
			attack: {},
			final: {},
		},
		{ attackSkill: attackId },
	);
	initPassives([passive]);
	s.actor.setPassiveSkills([[passiveId, 8]]);
	assert.equal(s.actor.findSkill(attackId).level, 2);
	assert.ok(s.attack());
	assert.equal(s.target.getHp(), 940);
	const unit = new FightUnitUser(20, s.actor.attrOri, { name: '后加载技能' }, [[passiveId, 8]]);
	assert.equal(unit.attackSkill, attackId);
	assert.equal(unit.getAttackSkill(), undefined);
	unit.addSkill(attackId, 3);
	assert.equal(unit.getAttackSkill().level, 3);
});

// 测试：替代普攻继续使用普攻的执行时嘲讽重定向，不使用提交时的旧目标。
test('attack skill: taunt redirects the equipped normal attack at execution', () => {
	const s = setup();
	s.actor.setAttackSkill(attackId);
	initBuffs([{ ...getBuffData(98004), id: 99944, name: '嘲讽', class: 'taunt', lastTurn: 0 }]);
	const initial = initFightContex(s.fight);
	s.actor.addBuff(s.other, 'test', 99944, 1, initial);
	s.flush(initial);
	const ctx = s.attack();
	assert.ok(ctx);
	assert.equal(ctx.msgs.find((msg) => msg[0] === 'skill')[3], s.other.uid);
	assert.equal(s.target.getHp(), 1000);
	assert.equal(s.other.getHp(), 940);
});

// 测试：战斗中可通过技能效果装配替代普攻，随后普攻沿用装配技能的连招配置及主目标。
test('attack skill: runtime equipment and configured combo reuse the attack pipeline', () => {
	const s = setup((data) => {
		data.combo = nextId;
	});
	initSkills([
		{ ...s.data, id: nextId, name: '替代普攻后续', combo: undefined, attack: { hurtP: -0.75 }},
		Object.assign(
			{
				...s.data,
				id: equipId,
				name: '装配',
				combo: undefined,
				func: 'nohurt',
				cost: undefined,
				sel: { target: TargetSelectEnum.self },
			},
			{ attackSkill: attackId },
		),
	]);
	s.actor.addSkill(equipId, 1);
	const equipped = s.fight.processUnit(s.actor, {
		cmd: FightCmdEnum.skill,
		skill: equipId,
		target: s.actor.uid,
	});
	assert.ok(equipped);
	s.flush(equipped);
	const ctx = s.attack();
	assert.ok(ctx);
	assert.deepEqual(
		ctx.msgs.filter((msg) => msg[0] === 'skill').map((msg) => msg[1]),
		[attackId, nextId],
	);
	assert.equal(s.target.getHp(), 913); // 60 + 30
});

// 测试：装配公共入口可直接设置及清除 attackSkill，卸下恢复原始普攻。
test('attack skill: equipment helper and unit API support installation and removal', () => {
	const s = setup();
	initSkills([{ ...s.data, id: equipId, attackSkill: attackId }]);
	const equip = s.actor.addSkill(equipId, 1);
	equipSkill(s.actor, equip, initFightContex(s.fight));
	assert.equal(s.actor.getAttackSkill(), s.actor.findSkill(attackId));
	initSkills([{ ...s.data, id: equipId, attackSkill: 0 }]);
	equipSkill(s.actor, s.actor.addSkill(equipId, 1), initFightContex(s.fight));
	assert.equal(s.actor.attackSkill, 0);
	assert.equal(s.actor.getAttackSkill(), undefined);
	assert.equal(s.attack().msgs.find((msg) => msg[0] === 'skill')[1], 990001);
});
