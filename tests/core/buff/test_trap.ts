import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { FightCmdEnum, FightSkill, initFightContex, initSkills, SkillData } from '../../../src';
import { chainIds } from '../../fixtures/skill_chain';
import { setupTrap as setup, trapId, hitId, placeId } from '../../fixtures/trap';
import { magicAttackFunc } from '../../../src/fight/Skills/Funcs/NomalSkill';

// 主目标物理攻击先受到陷阱技能伤害，无缠绕则继续；陷阱等级、次数和客户端同步均生效。
test('trap: damages melee attacker before the original attack and consumes one use', () => {
	const s = setup();
	s.place();
	const ctx = s.cast();
	assert.equal(s.actor.attr.point.hp, 950);
	assert.ok(s.target.attr.point.hp < 1000);
	assert.equal(s.target.findBuff(trapId), undefined);
	const hits = ctx.msgs.filter((msg) => msg[0] === 'skill');
	assert.deepEqual(hits.map((msg) => msg[1]), [chainIds.first, hitId]);
	const start = ctx.msgs.findIndex((msg) => msg[0] === 'skill' && msg[1] === chainIds.first);
	const trigger = ctx.msgs.findIndex((msg) => msg[0] === 'buffTrigger' && msg[3] === 'trap');
	assert.ok(start < trigger);
	assert.equal(s.target.attr.point.mp, 100);
	assert.equal(s.target.getSkillCd(hitId), 0);
	assert.equal(s.target.findSkill(hitId), undefined);
});

// 陷阱附加缠绕后立即中断原物理攻击，但原主动技能已经支付费用。
test('trap: root interrupts the incoming melee attack', () => {
	const s = setup(true);
	s.place();
	const ctx = s.cast();
	assert.equal(s.actor.attr.point.hp, 950);
	assert.equal(s.actor.isForbid('move'), true);
	assert.equal(s.target.attr.point.hp, 1000);
	assert.equal(s.actor.attr.point.mp, 90);
	assert.equal(ctx.msgs.filter((msg) => msg[0] === 'skill' && msg[1] === chainIds.first).length, 1);
	assert.equal(ctx.msgs.some((msg) => msg[0] === 'hurt' && msg[2] === s.target.uid), false);
	const start = ctx.msgs.findIndex((msg) => msg[0] === 'skill' && msg[1] === chainIds.first);
	const trigger = ctx.msgs.findIndex((msg) => msg[0] === 'buffTrigger' && msg[3] === 'trap');
	assert.ok(start >= 0 && start < trigger);
});

// 魔法与原地物理技能不接近陷阱，不造成陷阱伤害，也不消耗陷阱次数。
for (const attack of [{ magic: true }, { nomove: 1 as const }]) {
	// 远程或原地施放绕过前方陷阱，原技能仍正常生效。
	test(`trap: skips ${attack.magic ? 'magic' : 'stationary physical'} attacks`, () => {
		const s = setup(false, {}, attack);
		s.place();
		s.cast();
		assert.equal(s.actor.attr.point.hp, 1000);
		assert.equal(s.target.findBuff(trapId)?.times, 1);
		assert.ok(s.target.attr.point.hp < 1000);
	});
}

// 普通攻击也走陷阱检测，陷阱缠绕可阻止未装配技能的普攻。
test('trap: interrupts the default normal attack', () => {
	const s = setup(true);
	s.place();
	const ctx = s.fight.processUnit(s.actor, { cmd: FightCmdEnum.attack, target: s.target.uid });
	s.flush(ctx);
	assert.equal(s.actor.attr.point.hp, 950);
	assert.equal(s.target.attr.point.hp, 1000);
});

// 追击即使选择了带陷阱的新主目标，也不触发或消耗陷阱。
test('trap: skips kill follow-up attacks', () => {
	const s = setup(true);
	s.place();
	const skill = new FightSkill(s.skills[0], 1);
	skill.mergeAttack(s.actor.attr.physic.base, s.actor.attr.physic.final);
	const ctx = initFightContex(s.fight);
	magicAttackFunc(s.actor, s.target, skill, ctx, 'kill');
	s.flush(ctx);
	assert.equal(s.actor.attr.point.hp, 1000);
	assert.equal(s.target.findBuff(trapId)?.times, 1);
	assert.ok(s.target.attr.point.hp < 1000);
});

// 溅射副目标的陷阱不参与检测，副目标受伤且陷阱保留。
test('trap: skips splash targets', () => {
	const s = setup(true, {}, { spread: chainIds.second });
	s.place(s.other);
	s.cast();
	assert.equal(s.actor.attr.point.hp, 1000);
	assert.equal(s.other.findBuff(trapId)?.times, 1);
	assert.ok(s.other.attr.point.hp < 1000);
});

// 陷阱在命中检查前发动，即使原物理攻击必定未命中也会踩中。
test('trap: triggers before the incoming hit roll', () => {
	const s = setup(false, {}, { attack: { hit: -1000 } });
	s.place();
	s.cast();
	assert.equal(s.actor.attr.point.hp, 950);
	assert.equal(s.target.attr.point.hp, 1000);
});

// 攻击者被陷阱击杀后，原攻击和后续反应都不再执行。
test('trap: lethal damage cancels the incoming attack', () => {
	const s = setup();
	s.place();
	const hurt = initFightContex(s.fight);
	s.actor.onHurt(s.target, 'test', 970, hurt);
	s.flush(hurt);
	const ctx = s.fight.processUnit(s.actor, { cmd: FightCmdEnum.skill, skill: chainIds.first, target: s.target.uid });
	assert.equal(s.actor.isDied(), true);
	assert.equal(s.target.attr.point.hp, 1000);
	assert.equal(ctx.msgs.filter((msg) => msg[0] === 'skill' && msg[1] === chainIds.first).length, 1);
});

// 布置陷阱使用普通无伤技能配置，费用和冷却只在布置时结算。
test('trap: can be placed by a configured self-target skill', () => {
	const s = setup(true);
	s.actor.addSkill(placeId, 1);
	const ctx = s.fight.processUnit(s.actor, { cmd: FightCmdEnum.skill, skill: placeId, target: s.actor.uid });
	s.flush(ctx);
	assert.equal(s.actor.findBuff(trapId)?.times, 1);
	assert.equal(s.actor.attr.point.mp, 90);
	assert.equal(s.actor.getSkillCd(placeId), 2);
});

// 同ID陷阱替换时解绑旧监听，最终次数耗尽后也不留下监听。
test('trap: replacement and exhaustion clean up the fixed event listener', () => {
	const s = setup();
	s.place();
	s.place();
	assert.equal(s.target.contextEmitter.listenerCount('beforeAttack'), 1);
	s.cast();
	assert.equal(s.actor.attr.point.hp, 950);
	assert.equal(s.target.contextEmitter.listenerCount('beforeAttack'), 0);
});

// 到期移除陷阱后不再触发伤害，原物理攻击照常继续。
test('trap: expiry removes its attack listener', () => {
	const s = setup();
	s.place();
	const ctx = initFightContex(s.fight);
	s.target.expireBuff(s.target.findBuff(trapId), 'turn', ctx);
	s.flush(ctx);
	assert.equal(s.target.contextEmitter.listenerCount('beforeAttack'), 0);
	s.cast();
	assert.equal(s.actor.attr.point.hp, 1000);
});

// 双方都有物理陷阱时，陷阱自身伤害不踩中对方陷阱，也不会形成递归。
test('trap: a physical trap hit does not trigger the attackers trap', () => {
	const s = setup();
	const data: SkillData = { ...s.skills[0], id: hitId, name: '物理陷阱伤害', nomove: 0, cost: undefined };
	// 使用独立配置替换本场引用，不改变原技能定义。
	initSkills([data]);
	s.place();
	s.place(s.actor);
	s.cast();
	assert.equal(s.actor.findBuff(trapId)?.times, 1);
	assert.equal(s.target.findBuff(trapId), undefined);
});
