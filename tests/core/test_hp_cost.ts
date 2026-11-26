import { hpBuff } from '../fixtures/hp_buff';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
	FightAttr,
	FightRuleHp,
	FightUnitUser,
	FightUnitSummon,
	getBuffData,
	getFightGlobalData,
	initBuffs,
	initFightContex,
	setFightGlobalData,
} from '../../src';
import { setupChain, chainIds } from '../fixtures/skill_chain';

for (const Unit of [FightUnitUser, FightUnitSummon]) {
	// 测试：玩家及召唤物支付混合费用后通知单位和战斗hp事件，监听中重算属性不会漏扣其他资源，也不触发受伤或怒气。
	test(`HP cost: ${Unit.name} notifies hp after all resource costs and survives attribute recalculation`, (t) => {
		const original = { ...getFightGlobalData() };
		t.after(() => setFightGlobalData(original));
		const s = setupChain({ rootSelfBuff: false });
		setFightGlobalData({ jiqi: true });
		const unit = new Unit(s.actor.uid, s.actor.attrOri, { name: '生命费用' });
		unit.setFight(s.fight, s.actor.side);
		unit.setPos(s.actor.pos);
		s.fight.getSide(s.actor.side).units[0] = unit;
		Object.assign(unit.attrOri.point, { spMax: 100, jpMax: 100 });
		unit.attrOri.spHurtRate = 1;
		unit.attrOri.spOutputRate = 1;
		unit.calcAttr();
		Object.assign(unit.attr.point, { sp: 50, jp: 50 });
		s.loop.start();
		const ctx = initFightContex(s.fight);
		const contextEvents: unknown[][] = [];
		const unitEvents: unknown[][] = [];
		const fightEvents: unknown[][] = [];
		const snapshots: number[][] = [];
		let hurtEvents = 0;
		unit.onContex('hp', (...args) => {
			contextEvents.push(args);
			const point = unit.attr.point;
			snapshots.push([point.hp, point.mp, point.sp, point.jp]);
			unit.calcAttr();
		});
		unit.on('hp', (...args) => unitEvents.push(args));
		s.fight.onUnitEvent('hp', (...args) => fightEvents.push(args));
		unit.onContex('beforeHurt', () => hurtEvents++);
		unit.onContex('hurt', () => hurtEvents++);
		assert.equal(unit.costSkill({ hp: 100, mp: 10, sp: 20, jp: 15 }, ctx), true);
		for (const events of [contextEvents, unitEvents, fightEvents]) {
			assert.equal(events.length, 1);
			assert.equal(events[0][0], unit);
			assert.equal(events[0][1], ctx);
			assert.equal(events[0][2], unit);
			assert.deepEqual(events[0].slice(3), [1000, 900]);
		}
		assert.deepEqual(snapshots, [[900, 90, 30, 35]]);
		assert.deepEqual(
			[unit.getHp(), unit.attr.point.mp, unit.attr.point.sp, unit.attr.point.jp],
			[900, 90, 30, 35],
		);
		assert.equal(hurtEvents, 0);
		assert.equal(unit.enemyHurt.size, 0);
		assert.equal(s.fight.getSide(unit.side).hurt.size, 0);
		assert.deepEqual(ctx.msgs, [
			['costHp', unit.uid, 100, 900],
			['costMp', unit.uid, 10, 90],
			['costSp', unit.uid, 20, 30],
			['costJp', unit.uid, 15, 35],
		]);
		s.flush(ctx);
	});
}

// 测试：费用预检、零生命费用及任一资源不足时均不发送hp事件，也不产生部分扣费消息。
test('HP cost: rejected or zero HP costs do not emit changes', () => {
	const s = setupChain({ rootSelfBuff: false });
	const ctx = initFightContex(s.fight);
	let events = 0;
	s.actor.onContex('hp', () => events++);
	assert.equal(s.actor.canCost({ hp: 100 }), true);
	assert.equal(s.actor.costSkill({ hp: 0 }, ctx), true);
	assert.equal(s.actor.costSkill({ hp: 1000 }, ctx), false);
	assert.equal(s.actor.costSkill({ hp: 100, mp: 101 }, ctx), false);
	assert.equal(events, 0);
	assert.equal(s.actor.getHp(), 1000);
	assert.equal(s.actor.attr.point.mp, 100);
	assert.deepEqual(ctx.msgs, []);
});

// 测试：技能费用跨过血线后立即触发监听添加的属性Buff，本次技能读取新攻击力，资源与客户端保持一致。
test('HP cost: threshold effects take effect before the skill formula runs', () => {
	const s = setupChain({
		rootSelfBuff: false,
		finalReactions: false,
		change: (skills) => {
			Object.assign(skills[0], {
				cost: { hp: 600, mp: 10 },
				combo: undefined,
				damageRate: 1,
			});
		},
	});
	const buffId = 10014010;
	initBuffs([
		{
			...getBuffData(chainIds.rest),
			id: buffId,
			class: undefined,
			status: [],
			magic: true,
			attack: { attack: 100 },
			lastTurn: 0,
		},
	]);
	s.actor.onContex('hp', (unit, ctx) => {
		if (unit.getHp() <= unit.getHpMax() * 0.5) unit.addBuff(unit, 'hp', buffId, 1, ctx);
	});
	const ctx = s.cast();
	assert.equal(s.actor.getHp(), 400);
	assert.equal(s.actor.attr.point.mp, 90);
	assert.equal(s.target.getHp(), 800);
	assert.equal(s.actor.attrOri.magic.base.attack, 100);
	assert.deepEqual(
		ctx.msgs.slice(0, 4).map((msg) => msg[0]),
		['actor', 'costHp', 'costMp', 'addBuff'],
	);
});

class HpRuleUser extends FightUnitUser {
	rule?: FightRuleHp;
	protected override modifyAttr(attr: FightAttr) {
		this.rule?.modifyAttr(this, attr);
	}
}

// 测试：宿主给消耗资源的单位绑定血轴规则后，生命费用能推进阶段，重复扣费不重复触发同一血线。
test('HP cost: the shared HP rule observes costs without hurt events', (t) => {
	const s = setupChain({ rootSelfBuff: false });
	const unit = new HpRuleUser(s.actor.uid, s.actor.attrOri, { name: '费用血轴' });
	unit.setFight(s.fight, s.actor.side);
	unit.setPos(s.actor.pos);
	s.fight.getSide(s.actor.side).units[0] = unit;
	unit.rule = new FightRuleHp({ type: 'hp', lines: [{ hp: 0.5, buff: hpBuff(0.5) }] });
	unit.rule.bind(unit);
	t.after(() => unit.rule.unbind(unit));
	unit.calcAttr();
	s.loop.start();
	const ctx = initFightContex(s.fight);
	assert.equal(unit.costSkill({ hp: 600, mp: 10 }, ctx), true);
	assert.equal(unit.attr.magic.base.attack, 150);
	assert.equal(unit.attr.point.mp, 90);
	unit.calcAttr();
	assert.equal(unit.attr.magic.base.attack, 150);
	assert.equal(unit.costSkill({ hp: 50 }, ctx), true);
	assert.equal(ctx.msgs.filter((msg) => msg[0] === 'aiHp').length, 1);
	assert.equal(unit.attrOri.magic.base.attack, 100);
	s.flush(ctx);
});
