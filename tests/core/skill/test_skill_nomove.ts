import { setCounterChance } from '../../fixtures/default_skills';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
	FightCmdEnum,
	TargetSelectEnum,
	getBuffData,
	initBuffs,
	initFightContex,
} from '../../../src';
import { setupChain, chainIds as ids } from '../../fixtures/skill_chain';
import { tryFBack } from '../../../src/fight/Skills/FightBack';
import { trySupport } from '../../../src/fight/Skills/FightSupport';

function setup(nomove?: number, func = 'normal', combo = false) {
	const s = setupChain({
		rootSelfBuff: false,
		finalReactions: false,
		change: (skills) => {
			Object.assign(skills[0], { nomove, func, cd: 2 });
			if (!combo) skills[0].combo = undefined;
			if (func === 'heal') skills[0].sel = { target: TargetSelectEnum.friend };
		},
	});
	const buff = 10013101;
	initBuffs([
		{ ...getBuffData(ids.rest), id: buff, class: undefined, status: ['缠绕'], lastTurn: 0 },
	]);
	const root = () => s.actor.addBuff(s.target, 'test', buff, 1, initFightContex(s.fight));
	const input = {
		cmd: FightCmdEnum.skill,
		skill: ids.first,
		target: func === 'heal' ? s.actor.uid : s.target.uid,
	};
	return { ...s, root, input };
}

for (const nomove of [undefined, 0, 1]) {
	// 测试：nomove省略或0需要移动，1表示原地施法；提交后被缠绕也会执行复验，拒绝时不扣费、不开始CD。
	test(`nomove: entanglement rechecks movement requirements at execution (${nomove})`, () => {
		const { fight, actor, target, root, input } = setup(nomove);
		assert.equal(fight.checkPC(actor, input), true);
		root();
		assert.equal(fight.checkPC(actor, input), nomove === 1);
		const ctx = fight.processUnit(actor, input);
		assert.equal(!!ctx, nomove === 1);
		assert.equal(actor.attr.point.mp, nomove === 1 ? 90 : 100);
		assert.equal(actor.getSkillCd(ids.first), nomove === 1 ? 2 : 0);
		assert.equal(target.getHp(), nomove === 1 ? 960 : 1000);
	});
}

for (const func of ['heal', 'poison', 'nohurt']) {
	for (const nomove of [0, 1]) {
		// 测试：治疗、毒和纯效果技能同样遵循nomove，缠绕下只有原地技能能进入扣费及结算。
		test(`nomove: ${func} honors movement restrictions (${nomove})`, () => {
			const { fight, actor, root, input } = setup(nomove, func);
			root();
			assert.equal(fight.checkPC(actor, input), nomove === 1);
			const ctx = fight.processUnit(actor, input);
			assert.equal(!!ctx, nomove === 1);
			assert.equal(actor.attr.point.mp, nomove === 1 ? 90 : 100);
		});
	}
}

// 测试：原地根技能的连招子技能独立读取nomove，需要移动的后续段被缠绕阻止。
test('nomove: combo children honor their own movement configuration', () => {
	const { fight, actor, target, root, input } = setup(1, 'normal', true);
	root();
	const ctx = fight.processUnit(actor, input);
	assert.ok(ctx);
	assert.deepEqual(
		ctx.msgs.filter((msg) => msg[0] === 'skill').map((msg) => msg[1]),
		[ids.first],
	);
	assert.equal(target.getHp(), 960);
	assert.equal(actor.attr.point.mp, 90);
});

// 测试：普攻装配原地技能后缠绕下仍可使用，普通未装配普攻仍按需要移动处理。
test('nomove: equipped basic attacks use the equipped skill movement flag', () => {
	const { fight, actor, target, root } = setup(1);
	root();
	const input = { cmd: FightCmdEnum.attack, target: target.uid };
	assert.equal(fight.checkPC(actor, input), false);
	actor.setAttackSkill(ids.first);
	assert.equal(fight.checkPC(actor, input), true);
	assert.ok(fight.processUnit(actor, input));
	assert.equal(target.getHp(), 960);
});

for (const nomove of [0, 1]) {
	// 测试：缠绕下反击读取装配技能自己的nomove，需要移动时不占反击计数，原地反击正常执行。
	test(`nomove: equipped counterattacks honor movement restrictions (${nomove})`, () => {
		const { fight, actor, target, root } = setup(nomove);
		root();
		actor.setFBackSkill(ids.first);
		setCounterChance(actor, 1, true);
		const ctx = initFightContex(fight);
		assert.equal(tryFBack(actor, target, ctx), nomove === 1);
		assert.equal(ctx.fbackNum, nomove === 1 ? 1 : undefined);
		assert.equal(
			ctx.msgs.some((msg) => msg[0] === 'skill' && msg[4] === 'fback'),
			nomove === 1,
		);
	});

	// 测试：缠绕下只有原地协战技能能进入候选，无法移动时不占本回合协战次数。
	test(`nomove: support candidates honor movement restrictions (${nomove})`, () => {
		const { fight, actor, target, other, root } = setup(nomove);
		root();
		actor.supportSkill = ids.first;
		fight.getSide(target.side).units.splice(fight.getSide(target.side).units.indexOf(other), 1);
		fight.getSide(actor.side).units.push(other);
		other.setFight(fight, actor.side);
		const ctx = initFightContex(fight);
		assert.equal(trySupport(other, target, ctx), nomove === 1);
		assert.equal(actor.lastSupportTurn, nomove === 1 ? fight.turn : -1);
		assert.equal(target.getHp(), nomove === 1 ? 960 : 1000);
	});
}
