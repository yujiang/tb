import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
	FightUnitUser,
	getBuffData,
	initBuffs,
	initPassives,
	initFightContex,
	setFightDebug,
} from '../../src';
import { setupChain, chainIds } from '../fixtures/skill_chain';

for (const limit of [undefined, 0, 20]) {
	// 测试：伤害上限读取实际来源单位的当前属性，省略和0不限制，受击者自己的上限不影响本次受伤。
	test(`damageLimit: source limit=${limit} caps damage and preserves actual statistics`, () => {
		const s = setupChain({ rootSelfBuff: false });
		if (limit !== undefined) s.actor.attrOri.damageLimit = limit;

		s.actor.calcAttr();
		s.target.attrOri.damageLimit = 1;
		s.target.calcAttr();
		const expected = limit || 100;
		const ctx = initFightContex(s.fight);
		const actual = s.fight.resolveAction(() => s.target.onHurt(s.actor, 'test', 100, ctx));
		assert.equal(actual, expected);
		assert.equal(s.target.getHp(), 1000 - expected);
		assert.equal(ctx.msgs.find((msg) => msg[0] === 'hurt')?.[4], expected);
		assert.equal(s.target.enemyHurt.get(s.actor.uid), expected);
		assert.equal(s.fight.getSide(s.actor.side).hurt.get(s.actor.uid), expected);
		s.flush(ctx);
	});
}

for (const combo of [false, true]) {
	// 测试：普攻类技能及连招每段应用自身上限，吸血按实际扣血，反伤按反伤者的上限而非ctx根攻击者。
	test(`damageLimit: combo=${combo} applies per hit and uses the actual reflection source`, () => {
		const s = setupChain({
			actorHp: 500,
			rootSelfBuff: false,
			finalReactions: false,
			change: (skills) => {
				if (!combo) skills[0].combo = undefined;

				for (const skill of skills) {
					skill.final = { bloodP: 0.5 };
					skill.nodback = false;
				}
			},
		});
		s.actor.attrOri.damageLimit = 20;
		s.target.attrOri.damageLimit = 2;
		s.actor.calcAttr();
		s.target.calcAttr();
		const ctx = s.cast();
		assert.equal(s.target.getHp(), combo ? 940 : 980);
		assert.equal(s.actor.getHp(), combo ? 528 : 508);
		assert.deepEqual(
			ctx.msgs.filter((msg) => msg[0] === 'hurt').map((msg) => msg[4]),
			combo ? [20, 20, 20, 2] : [20, 2],
		);
		assert.equal(s.fight.getSide(s.target.side).hurt.get(s.target.uid), 2);
	});
}

for (const debugLimit of [10, 50]) {
	// 测试：单位上限与调试受伤上限同时启用时取较小值，不改写当前属性或调试配置。
	test(`damageLimit: source cap and debug cap=${debugLimit} combine using the smaller value`, (t) => {
		t.after(() => setFightDebug());
		setFightDebug({ hurtHpLimit: debugLimit });
		const s = setupChain({ rootSelfBuff: false });
		s.actor.attrOri.damageLimit = 20;
		s.actor.calcAttr();
		const ctx = initFightContex(s.fight);
		assert.equal(s.target.onHurt(s.actor, 'test', 100, ctx), Math.min(20, debugLimit));
		assert.equal(s.actor.attr.damageLimit, 20);
		s.flush(ctx);
	});
}

// 测试：属性Buff和被动可配置伤害上限固定加成及成长，立即生效、重算不累计、移除恢复且不改attrOri。
test('damageLimit: buffs and passives modify the current cap through common attributes', () => {
	const s = setupChain({ rootSelfBuff: false });
	const buffId = 10014005;
	const passiveId = 10014006;
	const fixed = { speed: 0, damageLimit: 10 };
	const growth = { speed: 0, damageLimit: 5 };
	initBuffs([
		{
			...getBuffData(chainIds.rest),
			id: buffId,
			class: undefined,
			status: [],
			lastTurn: 0,
			attr: fixed,
			attrLevel: growth,
		},
	]);
	initPassives([
		{
			...getBuffData(chainIds.rest),
			id: passiveId,
			status: [],
			attr: fixed,
			attrLevel: growth,
		},
	]);
	const passive = new FightUnitUser(10014007, s.actor.attrOri, { name: '伤害上限被动' }, [
		[passiveId, 2],
	]);
	assert.equal(passive.attr.damageLimit, 20);
	const ctx = initFightContex(s.fight);
	const buff = s.actor.addBuff(s.actor, 'test', buffId, 2, ctx);
	assert.equal(s.actor.attr.damageLimit, 20);
	s.actor.calcAttr();
	assert.equal(s.actor.attr.damageLimit, 20);
	assert.equal(s.target.onHurt(s.actor, 'test', 100, ctx), 20);
	s.actor.expireBuff(buff, 'test', ctx);
	assert.equal(s.actor.attr.damageLimit ?? 0, 0);
	assert.equal(s.actor.attrOri.damageLimit ?? 0, 0);
	assert.equal(s.target.onHurt(s.actor, 'test', 100, ctx), 100);
	s.flush(ctx);
});

// 测试：来源限伤先于不屈和保护分担，限伤后非致命时不消耗不屈，保护双方的伤害统计不超过分配值。
test('damageLimit: beforeHurt effects receive the capped damage', () => {
	const s = setupChain({ targetHp: 50, rootSelfBuff: false });
	s.actor.attrOri.damageLimit = 20;
	s.actor.calcAttr();
	const buqu = 10014008;
	const protect = 10014009;
	initBuffs([
		{ ...getBuffData(chainIds.rest), id: buqu, class: 'buqu', status: [], lastTurn: 0 },
		{ ...getBuffData(chainIds.rest), id: protect, class: 'protect', status: [], lastTurn: 0 },
	]);
	const ctx = initFightContex(s.fight);
	const buff = s.target.addBuff(s.target, 'test', buqu, 1, ctx);
	s.target.addBuff(s.other, 'test', protect, 1, ctx);
	assert.equal(s.target.onHurt(s.actor, 'test', 100, ctx), 10);
	assert.equal(s.target.getHp(), 40);
	assert.equal(s.other.getHp(), 990);
	assert.equal(buff.times, 1);
	assert.equal(s.fight.getSide(s.actor.side).hurt.get(s.actor.uid), 20);
	s.flush(ctx);
});
