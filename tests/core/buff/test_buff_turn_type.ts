import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import * as api from '../../../src';
import {
	BuffData,
	FightResultEnum,
	initBuffs,
	initSkills,
	getBuffData,
	initFightContex,
} from '../../../src';
import { setupChain, chainIds } from '../../fixtures/skill_chain';

const timing = api.BuffTurnEnum;

function setup() {
	const state = setupChain({ actorHp: 100, rootSelfBuff: false });
	initSkills([
		{ ...state.skills[3], id: 98800, name: '回合后治疗', attack: { attack: 10 }, final: {} },
	]);
	const data = (id: number, extra: Partial<BuffData> = {}): BuffData => ({
		...getBuffData(chainIds.rest),
		id,
		name: `计时${id}`,
		class: undefined,
		turnType: timing.afterTurn,
		lastTurn: 1,
		func: 'heal',
		skill: 98800,
		skillLevel: 1,
		notRemove: false,
		...extra,
	});
	return { ...state, data };
}

// 测试：公开导出的 Buff 计时枚举包含回合前、单位输入和回合后三个固定值。
test('buff timing: exports thisTurn, inputTurn and afterTurn enum values', () => {
	const value = Reflect.get(api, 'BuffTurnEnum');
	assert.deepEqual([value?.thisTurn, value?.inputTurn, value?.afterTurn], [0, 1, 2]);
});

// 测试：普通回合后 Buff 在本回合结束生效一次并到期，不需要特殊子类。
test('buff timing: generic afterTurn Buff ticks and expires at the current round end', () => {
	const { fight, actor, data, flush } = setup();
	initBuffs([data(98801)]);
	const ctx = initFightContex(fight);
	actor.addBuff(actor, 'test', 98801, 1, ctx);
	actor.processBeforeTurn(1, ctx);
	actor.inputStart(1, ctx);
	assert.equal(actor.getHp(), 100);
	assert.ok(actor.findBuff(98801));
	actor.processAfterTurn(1, ctx);
	assert.equal(actor.getHp(), 110);
	assert.equal(actor.findBuff(98801), undefined);
	flush(ctx);
});

// 测试：持续两次回合后边界的 Buff 恰好生效两次，同一边界不重复触发。
test('buff timing: afterTurn lasts exactly two end boundaries without duplicate ticks', () => {
	const { fight, actor, loop, data, flush } = setup();
	initBuffs([data(98802, { lastTurn: 2 })]);
	const ctx = initFightContex(fight);
	actor.addBuff(actor, 'test', 98802, 1, ctx);
	actor.processAfterTurn(1, ctx);
	actor.processAfterTurn(1, ctx);
	assert.equal(actor.getHp(), 110);
	assert.ok(actor.findBuff(98802));
	flush(ctx);
	ctx.msgs.length = 0;
	loop.nextTurn();
	actor.processBeforeTurn(2, ctx);
	assert.equal(actor.getHp(), 110);
	actor.processAfterTurn(2, ctx);
	assert.equal(actor.getHp(), 120);
	assert.equal(actor.findBuff(98802), undefined);
	flush(ctx);
});

// 测试：回合后周期效果中新添加的 Buff 留到下一次边界才生效。
test('buff timing: a Buff added during an afterTurn tick waits for the next boundary', () => {
	const { fight, actor, loop, data, flush } = setup();
	initBuffs([data(98803), data(98804)]);
	const ctx = initFightContex(fight);
	actor.addBuff(actor, 'test', 98803, 1, ctx);
	let added = false;
	actor.onContex('heal', (_unit, eventCtx) => {
		if (!added) {
			added = true;
			actor.addBuff(actor, 'tick', 98804, 1, eventCtx);
		}
	});
	actor.processAfterTurn(1, ctx);
	actor.processAfterTurn(1, ctx);
	assert.equal(actor.getHp(), 110);
	assert.equal(actor.findBuff(98803), undefined);
	assert.ok(actor.findBuff(98804));
	flush(ctx);
	ctx.msgs.length = 0;
	loop.nextTurn();
	actor.processAfterTurn(2, ctx);
	assert.equal(actor.getHp(), 120);
	assert.equal(actor.findBuff(98804), undefined);
	flush(ctx);
});

// 测试：回合后边界处理完成才添加的 Buff 从下一回合结束开始计时。
test('buff timing: a Buff added after the end boundary starts at the following round end', () => {
	const { fight, actor, loop, data, flush } = setup();
	initBuffs([data(98805)]);
	const ctx = initFightContex(fight);
	actor.processAfterTurn(1, ctx);
	actor.addBuff(actor, 'test', 98805, 1, ctx);
	actor.processAfterTurn(1, ctx);
	assert.equal(actor.getHp(), 100);
	assert.ok(actor.findBuff(98805));
	flush(ctx);
	ctx.msgs.length = 0;
	loop.nextTurn();
	actor.processAfterTurn(2, ctx);
	assert.equal(actor.getHp(), 110);
	assert.equal(actor.findBuff(98805), undefined);
	flush(ctx);
});

// 测试：不可驱散的回合后 Buff 仍正常到期，并清除属性加成和次数监听。
test('buff timing: afterTurn expiration removes attributes and counted listeners even when notRemove', () => {
	const { fight, actor, data, flush } = setup();
	initBuffs([
		data(98806, {
			func: undefined,
			times: 3,
			event: 'hurt',
			notRemove: true,
			magic: true,
			attack: { attack: 20 },
		}),
	]);
	const ctx = initFightContex(fight);
	actor.addBuff(actor, 'test', 98806, 1, ctx);
	assert.equal(actor.attr.magic.base.attack, 120);
	assert.equal(actor.contextEmitter.listenerCount('hurt'), 1);
	actor.processAfterTurn(1, ctx);
	assert.equal(actor.attr.magic.base.attack, 100);
	assert.equal(actor.contextEmitter.listenerCount('hurt'), 0);
	assert.equal(actor.findBuff(98806), undefined);
	flush(ctx);
});

// 测试：死亡保留的回合后 Buff 仍可到期，但不会给尸体恢复生命。
test('buff timing: a retained afterTurn Buff can expire while dead without healing the corpse', () => {
	const { fight, actor, target, data, flush } = setup();
	initBuffs([data(98807, { dieNotRemove: true })]);
	const ctx = initFightContex(fight);
	actor.addBuff(actor, 'test', 98807, 1, ctx);
	actor.onHurt(target, 'test', 1000, ctx);
	actor.processAfterTurn(1, ctx);
	assert.equal(actor.isDied(), true);
	assert.equal(actor.getHp(), 0);
	assert.equal(actor.findBuff(98807), undefined);
	assert.equal(
		ctx.msgs.some((msg) => msg[0] === 'heal'),
		false,
	);
	flush(ctx);
});

// 测试：回合后处理中给另一单位添加的 Buff，也必须等到下一次全局边界。
test('buff timing: Buffs added to another unit during afterTurn wait until the next global boundary', () => {
	const { fight, actor, target, loop, data, flush } = setup();
	initBuffs([data(98808), data(98809)]);
	const ctx = initFightContex(fight);
	target.onHurt(actor, 'test', 900, ctx);
	actor.addBuff(actor, 'test', 98808, 1, ctx);
	actor.onContex('heal', (_unit, eventCtx) => target.addBuff(actor, 'tick', 98809, 1, eventCtx));
	loop.processAfterTurn(1, ctx);
	assert.equal(actor.getHp(), 110);
	assert.equal(target.getHp(), 100);
	assert.ok(target.findBuff(98809));
	flush(ctx);
	ctx.msgs.length = 0;
	loop.nextTurn();
	loop.processAfterTurn(2, ctx);
	assert.equal(target.getHp(), 110);
	assert.equal(target.findBuff(98809), undefined);
	flush(ctx);
});

// 测试：省略计时类型时仍默认在全局回合前触发和到期。
test('buff timing: omitted turnType retains the global before-turn default', () => {
	const { fight, actor, loop, data, flush } = setup();
	initBuffs([data(98810, { turnType: undefined })]);
	const ctx = initFightContex(fight);
	actor.addBuff(actor, 'test', 98810, 1, ctx);
	actor.inputStart(1, ctx);
	actor.processAfterTurn(1, ctx);
	assert.equal(actor.getHp(), 100);
	assert.ok(actor.findBuff(98810));
	flush(ctx);
	ctx.msgs.length = 0;
	loop.nextTurn();
	actor.processBeforeTurn(2, ctx);
	assert.equal(actor.getHp(), 110);
	assert.equal(actor.findBuff(98810), undefined);
	flush(ctx);
});

// 测试：双方因同一回合后边界的周期毒伤全灭时，在完整结算后判定平局。
test('buff timing: simultaneous afterTurn poison deaths resolve as a draw after the full boundary', () => {
	const { fight, actor, loop, data, flush, skills } = setup();
	initSkills([
		{ ...skills[3], id: 98811, name: '回合后致命毒', attack: { attack: 2000 }, final: {} },
	]);
	initBuffs([data(98812, { func: 'poison', skill: 98811 })]);
	const ctx = initFightContex(fight);
	for (const unit of fight.getAllUnits()) unit.addBuff(actor, 'test', 98812, 1, ctx);
	loop.processAfterTurn(1, ctx);
	assert.equal(
		fight.getAllUnits().every((unit) => unit.isDied()),
		true,
	);
	assert.equal(fight.result, FightResultEnum.draw);
	flush(ctx);
});

// 测试：战斗结束后的回合清理仍移除到期 Buff，但不再执行周期回血或扣血。
test('buff timing: round-end cleanup expires Buffs but does not apply periodic effects after battle end', () => {
	const { fight, actor, loop, data } = setup();
	initBuffs([data(98813)]);
	const ctx = initFightContex(fight);
	actor.addBuff(actor, 'test', 98813, 1, ctx);
	fight.result = FightResultEnum.attack;
	loop.processAfterTurn(1, ctx);
	assert.equal(actor.getHp(), 100);
	assert.equal(actor.findBuff(98813), undefined);
	assert.equal(
		ctx.msgs.some((msg) => msg[0] === 'heal'),
		false,
	);
});
