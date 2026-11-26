import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { FightSkill, SkillData } from '../../../src';
import { setupChain, chainIds } from '../../fixtures/skill_chain';

function setup(magic = true, extra: Partial<SkillData> = {}, targetHp = 1000) {
	const s = setupChain({
		actorHp: 500, targetHp, rootSelfBuff: false, finalReactions: false,
		change: (skills) => Object.assign(skills[0], {
			magic, combo: undefined, nosupport: true,
			final: { bloodP: 0.1 }, finalLevel: { bloodP: 0.05 }, ...extra,
		}),
	});
	s.actor.attr[magic ? 'magic' : 'physic'].final.bloodP = 0.2;
	s.actor.attr[magic ? 'physic' : 'magic'].final.bloodP = 0.7;
	return s;
}

for (const magic of [false, true]) {
	for (const [bloodP, heal] of [[1, 40], [0, 0], [0.5, 20], [1.2, 48]]) {
		// 技能固定吸血覆盖人物及技能加成，显式0同样有效，物理和魔法共用此规则。
		test(`skill bloodP: ${magic ? 'magic' : 'physical'} fixed ratio ${bloodP} overrides additive attributes`, () => {
			const s = setup(magic, { bloodP });
			const ctx = s.cast();
			assert.equal(s.actor.getHp(), 500 + heal);
			assert.equal(s.target.getHp(), 960);
			assert.equal(s.actor.attr[magic ? 'magic' : 'physic'].final.bloodP, 0.2);
			const heals = ctx.msgs.filter((msg) => msg[0] === 'heal' && msg[1] === 'blood');
			assert.equal(heals.length, heal > 0 ? 1 : 0);
			if (heal > 0) assert.equal(heals[0][4], heal);
		});
	}
	// 省略固定比例时沿用原加法规则：人物0.2+技能0.1+等级成长0.05，40点伤害回复14。
	test(`skill bloodP: ${magic ? 'magic' : 'physical'} omission preserves attribute and skill growth additions`, () => {
		const s = setup(magic);
		s.cast();
		assert.equal(s.actor.getHp(), 514);
	});
}

// 全额吸收以实际扣血为基数，过量伤害不多吸血，回血仍产生正常同步消息。
test('skill bloodP: full drain uses actual damage rather than overkill', () => {
	const s = setup(true, { bloodP: 1 }, 15);
	const ctx = s.cast();
	assert.equal(s.actor.getHp(), 515);
	assert.equal(s.target.getHp(), 0);
	assert.equal(ctx.msgs.find((msg) => msg[0] === 'heal' && msg[1] === 'blood')?.[4], 15);
});

// 禁止吸血仍优先于技能固定比例，不能通过bloodP绕过noblood。
test('skill bloodP: noblood still disables a configured fixed ratio', () => {
	const s = setup(true, { bloodP: 1, noblood: true });
	s.cast();
	assert.equal(s.actor.getHp(), 500);
});

// 主技能与溅射分别读取自身固定比例，主技能100%不传给配置0的溅射子技能。
test('skill bloodP: splash uses its own override instead of the root skill ratio', () => {
	const s = setup(true, { bloodP: 1, spread: chainIds.second });
	s.skills[1].bloodP = 0;
	s.cast();
	assert.equal(s.actor.getHp(), 540);
	assert.ok(s.other.getHp() < 1000);
});

for (const bloodP of [-0.1, NaN, Infinity]) {
	// 固定吸血比例在构造阶段拒绝负数和非有限数，避免进入战斗后产生非法回血。
	test(`skill bloodP: rejects invalid ratio ${bloodP}`, () => {
		const s = setup();
		assert.throws(() => new FightSkill({ ...s.skills[0], bloodP }, 1), /bloodP/);
	});
}
