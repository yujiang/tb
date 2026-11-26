import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { BuffData, FightCmdEnum, initBuffs, initFightContex, OverlapEnum } from '../../../src';
import { setupChain, chainIds } from '../../fixtures/skill_chain';
import { trySupport } from '../../../src/fight/Skills/FightSupport';
import { tryFBack } from '../../../src/fight/Skills/FightBack';
import { magicAttackFunc } from '../../../src/fight/Skills/Funcs/NomalSkill';

const buffId = 10018501;

function setup(extra: Partial<BuffData> = {}) {
	const s = setupChain({
		rootSelfBuff: false, finalReactions: false,
		change: (skills) => Object.assign(skills[0], { combo: undefined, nosupport: true }),
	});
	initBuffs([{
		id: buffId, name: '越战越勇', desc: '协战每次增加0.05伤害比，最多0.5', class: 'damageByUse',
		status: [], tags: [], magic: false, attackType: 'base', attack: {}, final: {},
		overlap: OverlapEnum.REPLACE, lastTurn: 0, times: 0, event: undefined, ...extra,
	}]);
	const right = s.fight.getSide(s.other.side).units;
	right.splice(right.indexOf(s.other), 1);
	s.fight.getSide(s.actor.side).units.push(s.other);
	s.other.setFight(s.fight, s.actor.side);
	s.actor.setSupportSkill(chainIds.first);
	s.actor.setFBackSkill(chainIds.first);
	const add = () => s.actor.addBuff(s.actor, 'test', buffId, 1, initFightContex(s.fight));
	add();
	const support = () => {
		const before = s.target.getHp();
		assert.equal(trySupport(s.other, s.target, initFightContex(s.fight)), true);
		s.fight.nextTurn();
		return before - s.target.getHp();
	};
	return { ...s, add, support };
}

// 首次协战即增加0.05，第二次增加0.1，与原技能0.4相加，不按百分比再次乘算。
test('damage by use: support gains 0.05 per use including the current one', () => {
	const s = setup();
	assert.equal(s.support(), 45);
	assert.equal(s.support(), 50);
	assert.equal(s.skills[0].damageRate, 0.4);
});

// 连续三次实际协战，额外倍率应为0.05、0.10、0.15，第三次伤害55，不能累计成0.30导致伤害70。
test('damage by use: three actual support attacks reach a total bonus of 0.15', () => {
	const s = setup();
	const damages: number[] = [];
	for (const expectedBonus of [0.05, 0.10, 0.15]) {
		const damage = s.support();
		damages.push(damage);
		const actualBonus = damage / 100 - s.skills[0].damageRate;
		assert.ok(Math.abs(actualBonus - expectedBonus) < 1e-12);
		console.log(`第${damages.length}次协战：额外倍率 +${actualBonus.toFixed(2)}，实际伤害 ${damage}`);
	}
	assert.deepEqual(damages, [45, 50, 55]);
	assert.equal(s.actor.getSkillTypeUseCount('support'), 3);
});

// Buff按当前计数返回贡献，重复查询不改变计数或加成；单位只负责汇总，移除后自然归零。
test('damage by use: contributes a value without mutating the skill on repeated reads', () => {
	const s = setup();
	s.support();
	const skill = s.actor.findSkill(chainIds.first);
	const buff = s.actor.findBuff(buffId);
	assert.equal(buff.getDamageRate(s.actor, skill, 'support'), 0.05);
	assert.equal(s.actor.getDamageRate(skill, 'support'), 0.05);
	assert.equal(s.actor.getDamageRate(skill, 'support'), 0.05);
	assert.equal(s.actor.getDamageRate(skill, 'normal'), 0);
	assert.equal(s.actor.getSkillTypeUseCount('support'), 1);
	s.actor.expireBuff(buff, 'test', initFightContex(s.fight));
	assert.equal(s.actor.getDamageRate(skill, 'support'), 0);
});

// 普通属性Buff和动态增伤同时存在时各自汇总，移除越战越勇不会清掉属性Buff的攻击加成。
test('damage by use: ordinary attribute buffs remain effective alongside collected damage bonuses', () => {
	const s = setup();
	const attrBuff = 10018503;
	initBuffs([{
		...s.actor.findBuff(buffId).getXls(), id: attrBuff, name: '攻击提升',
		class: undefined, magic: true, attack: { attack: 20 },
	}]);
	s.actor.addBuff(s.actor, 'test', attrBuff, 1, initFightContex(s.fight));
	assert.equal(s.support(), 54); // 120 × (0.4 + 0.05)
	assert.equal(s.support(), 60); // 120 × (0.4 + 0.10)
	assert.equal(s.support(), 66); // 120 × (0.4 + 0.15)
	s.actor.expireBuff(s.actor.findBuff(buffId), 'test', initFightContex(s.fight));
	assert.equal(s.support(), 48); // 120 × 0.4，攻击提升仍在
	assert.equal(s.actor.attr.magic.base.attack, 120);
	assert.equal(s.actor.attrOri.magic.base.attack, 100);
});

// 协战第十次达到0.5上限，第十一次仍只加0.5，不继续增长。
test('damage by use: bonus reaches 0.5 at ten uses and stops growing', () => {
	const s = setup();
	for (let i = 1; i <= 11; i++) {
		assert.equal(s.support(), 40 + Math.min(i, 10) * 5, `第${i}次协战`);
	}
});

// 默认越战越勇只增强协战，协战积累后普通主动攻击和反击仍用原伤害。
test('damage by use: normal attacks and counters do not receive the support bonus', () => {
	const s = setup();
	s.support();
	s.support();
	const before = s.target.getHp();
	s.fight.processUnit(s.actor, { cmd: FightCmdEnum.skill, skill: chainIds.first, target: s.target.uid });
	assert.equal(before - s.target.getHp(), 40);
	const counterBefore = s.target.getHp();
	assert.equal(tryFBack(s.actor, s.target, initFightContex(s.fight)), true);
	assert.equal(counterBefore - s.target.getHp(), 4);
});

// 事件次数为1时，最后一次协战仍获得加成，然后移除并解绑，下次协战恢复原倍率。
test('damage by use: the last configured use keeps its bonus before expiry', () => {
	const s = setup({ times: 1 });
	assert.equal(s.support(), 45);
	assert.equal(s.actor.findBuff(buffId), undefined);
	assert.equal(s.actor.contextEmitter.listenerCount('useSkill'), 0);
	assert.equal(s.support(), 40);
});

// 移除后加成消失，再次添加读取本场累计协战次数，不重置单位计数；常驻Buff不需要监听事件。
test('damage by use: removal and replacement preserve history without duplicate bonuses', () => {
	const s = setup();
	assert.equal(s.support(), 45);
	s.actor.expireBuff(s.actor.findBuff(buffId), 'test', initFightContex(s.fight));
	assert.equal(s.support(), 40);
	s.add();
	s.add();
	assert.equal(s.actor.contextEmitter.listenerCount('useSkill'), 0);
	assert.equal(s.support(), 55);
});

for (const prior of [-1, 1]) {
	// 多个增伤Buff在同次施放内相加，先后顺序不覆盖；移除其中一个后下次只保留另一个的加成。
	test(`damage by use: multiple buffs contribute independently once per cast (${prior})`, () => {
		const s = setup();
		const secondId = 10018502;
		initBuffs([{
			...s.actor.findBuff(buffId).getXls(), id: secondId, name: '额外协战增伤', prior,
			damageUse: { type: 'support', rate: 0.1, max: 0.2 },
		}]);
		s.actor.addBuff(s.actor, 'test', secondId, 1, initFightContex(s.fight));
		assert.equal(s.support(), 55); // 100 × (0.4 + 0.05 + 0.1)
		assert.equal(s.support(), 70); // 100 × (0.4 + 0.1 + 0.2)
		s.actor.expireBuff(s.actor.findBuff(secondId), 'test', initFightContex(s.fight));
		assert.equal(s.support(), 55); // 100 × (0.4 + 0.15)
	});
}

// 配置改为fback即可复用同一Buff，每次反击增加0.1，最多0.2，协战不受影响。
test('damage by use: source, step and cap are configurable for counters', () => {
	const s = setup({ damageUse: { type: 'fback', rate: 0.1, max: 0.2 } });
	for (const expected of [5, 6, 6]) {
		const before = s.target.getHp();
		assert.equal(tryFBack(s.actor, s.target, initFightContex(s.fight)), true);
		assert.equal(before - s.target.getHp(), expected);
	}
	assert.equal(s.support(), 40);
});

// 复用同一个临时技能对象重复结算时，每次只取当前次数的加成，不能累加上次施放留下的倍率。
test('damage by use: reused skill objects do not retain the previous cast bonus', () => {
	const s = setup();
	const skill = s.actor.findSkill(chainIds.first);
	skill.mergeAttack(s.actor.attr.magic.base, s.actor.attr.magic.final);
	for (const expected of [45, 50]) {
		const before = s.target.getHp();
		magicAttackFunc(s.actor, s.target, skill, initFightContex(s.fight), 'support');
		assert.equal(before - s.target.getHp(), expected);
	}
});

// 群体反击的同次伤害倍率由所有目标共用，计数及增伤都不能按目标重复累加。
test('damage by use: all group targets share the same once-per-cast bonus', () => {
	const s = setup({ damageUse: { type: 'fback' } });
	const skill = s.actor.findSkill(chainIds.first);
	skill.getXls().sel.num = 99;
	skill.mergeAttack(s.actor.attr.magic.base, s.actor.attr.magic.final);
	const side = s.fight.getSide(s.actor.side).units;
	side.splice(side.indexOf(s.other), 1);
	s.fight.getSide(s.target.side).units.push(s.other);
	s.other.setFight(s.fight, s.target.side);
	magicAttackFunc(s.actor, s.target, skill, initFightContex(s.fight), 'fback');
	assert.equal(s.target.getHp(), 955);
	assert.equal(s.other.getHp(), 955);
	assert.equal(s.actor.getSkillTypeUseCount('fback'), 1);
});

for (const damageUse of [{ rate: 0 }, { max: 0 }]) {
	// 每次加成或上限显式为0时保留0，不回退默认值。
	test(`damage by use: explicit zero ${damageUse.rate === 0 ? 'step' : 'cap'} disables the bonus`, () => {
		const s = setup({ damageUse });
		assert.equal(s.support(), 40);
	});
}
