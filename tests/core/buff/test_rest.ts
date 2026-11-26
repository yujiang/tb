import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
	initFightContex,
	initBuffs,
	getBuffData,
	FightCmdEnum,
	FightResultEnum,
	PassiveSkill,
} from '../../../src';
import { setupChain, chainIds as ids } from '../../fixtures/skill_chain';

// 测试：普通Buff的休息状态即可跳过攻击、技能和防御，仍允许West提交输入且不依赖rest专用类。
test('rest status: ordinary status buffs skip actions while online input remains accepted', () => {
	const s = setupChain({ rootSelfBuff: false });
	initBuffs([{ ...getBuffData(ids.rest), id: 10011601, class: undefined, status: ['休息'] }]);
	const initial = initFightContex(s.fight);
	s.actor.addBuff(s.actor, 'test', 10011601, 1, initial);
	s.flush(initial);
	const hp = s.target.getHp(),
		mp = s.actor.attr.point.mp;
	let samples = 0;
	s.fight.random = () => {
		samples++;
		return 0.5;
	};
	for (const input of [
		{ cmd: FightCmdEnum.attack, target: s.target.uid },
		{ cmd: FightCmdEnum.skill, skill: ids.first, target: s.target.uid },
		{ cmd: FightCmdEnum.defend },
	]) {
		assert.equal(s.fight.checkOnline(s.actor, input), true);
		assert.equal(s.fight.checkPC(s.actor, input), false);
		const ctx = s.fight.processUnit(s.actor, input);
		assert.deepEqual(ctx?.msgs, [['skipAction', s.actor.uid, 10011601]]);
		s.flush(ctx);
	}
	assert.equal(s.actor.isDefend(), false);
	assert.equal(s.target.getHp(), hp);
	assert.equal(s.actor.attr.point.mp, mp);
	assert.equal(samples, 0);
});

// 测试：被动携带休息状态也能阻止主动行动，缺少Buff来源时简报使用状态名说明跳过原因。
test('rest status: passive status blocks actions without requiring a Buff instance', () => {
	const s = setupChain({ rootSelfBuff: false });
	const data = { ...getBuffData(ids.rest), id: 10011602, name: '休眠被动', status: ['休息'] };
	s.actor.passiveSkills.push(new PassiveSkill(data, 1));
	assert.equal(s.actor.getActionBlockBuff(), undefined);
	assert.equal(s.fight.checkPC(s.actor, { cmd: FightCmdEnum.defend }), false);
	const ctx = s.fight.processUnit(s.actor, { cmd: FightCmdEnum.defend });
	assert.ok(ctx?.msgs.some((msg) => msg[0] === 'skipAction'));
	s.flush(ctx);
	assert.equal(s.actor.isDefend(), false);
	assert.match(s.report.toString(), /休息.*跳过行动/);
	assert.doesNotMatch(s.report.toString(), /undefined|Buff #/);
});

// 测试：休息 Buff 跳过下一回合的攻击、技能和防御，完整回合结束后恢复行动。
test('rest: next turn skips attacks, skills and defense, then expires after the full turn', () => {
	const { fight, actor, target, loop, cast, flush, report } = setupChain();
	cast();
	const firstEnd = initFightContex(fight);
	loop.processAfterTurn(1, firstEnd);
	flush(firstEnd);
	assert.ok(actor.findBuff(ids.rest));
	loop.nextTurn();
	const before = initFightContex(fight);
	loop.processBeforeTurn(2, before);
	actor.inputStart(2, before);
	flush(before);
	assert.ok(actor.findBuff(ids.rest));
	const hp = target.getHp(),
		mp = actor.attr.point.mp;
	let samples = 0;
	fight.random = () => {
		samples++;
		return 0.99;
	};
	for (const input of [
		{ cmd: FightCmdEnum.attack, target: target.uid },
		{ cmd: FightCmdEnum.skill, skill: ids.first, target: target.uid },
		{ cmd: FightCmdEnum.defend },
	]) {
		const ctx = fight.processUnit(actor, input);
		assert.ok(ctx);
		assert.ok(ctx.msgs.some((msg) => msg[0] === 'skipAction'));
		flush(ctx);
	}
	assert.equal(actor.isDefend(), false);
	assert.equal(target.getHp(), hp);
	assert.equal(actor.attr.point.mp, mp);
	assert.equal(samples, 0);
	const secondEnd = initFightContex(fight);
	loop.processAfterTurn(2, secondEnd);
	flush(secondEnd);
	assert.equal(actor.findBuff(ids.rest), undefined);
	loop.nextTurn();
	const resumed = fight.processUnit(actor, { cmd: FightCmdEnum.attack, target: target.uid });
	assert.ok(resumed);
	flush(resumed);
	assert.ok(target.getHp() < hp);
	assert.match(report.toString(), /\[休息\].*跳过行动/);
});

// 测试：休息中的受控单位仍可正常提交指令，但执行时跳过行动。
test('rest: controlled resting units still submit inputs normally', async () => {
	const { fight, actor, target, loop, cast } = setupChain();
	cast();
	loop.nextTurn();
	const wait = loop.waitInput(fight.turn, initFightContex(fight));
	loop.onInput(actor.uid, { turn: fight.turn, cmd: FightCmdEnum.attack, target: target.uid });
	assert.equal(await wait, 1);
	const ctx = fight.processUnit(actor, actor.input);
	assert.ok(ctx?.msgs.some((msg) => msg[0] === 'skipAction'));
});

// 测试：休息 Buff 的替换、驱散和死亡清理由公共流程处理，不依赖专用到期监听。
test('rest: replacement, dispel and death do not require dedicated expiry listeners', () => {
	const { fight, actor, target, flush } = setupChain({ rootSelfBuff: false });
	initBuffs([{ ...getBuffData(ids.rest), notRemove: false }]);
	const ctx = initFightContex(fight);
	const first = actor.addBuff(actor, 'test', ids.rest, 1, ctx);
	actor.addBuff(actor, 'replace', ids.rest, 2, ctx);
	assert.notEqual(actor.findBuff(ids.rest), first);
	assert.equal(actor.contextEmitter.listenerCount('afterTurn'), 0);
	actor.removeBuff(actor, 'dispel', ids.rest, 99, ctx);
	assert.equal(actor.contextEmitter.listenerCount('afterTurn'), 0);
	actor.addBuff(actor, 'test', ids.rest, 1, ctx);
	fight.resolveAction(() => actor.onHurt(target, 'test', 10000, ctx));
	assert.equal(actor.findBuff(ids.rest), undefined);
	assert.equal(actor.contextEmitter.listenerCount('afterTurn'), 0);
	flush(ctx);
});

// 测试：零持续次数的休息 Buff 不自然到期，战斗结束后不再产生跳过行动消息。
test('rest: duration zero does not expire and ended battles do not emit skip actions', () => {
	const { fight, actor, loop, flush } = setupChain({ rootSelfBuff: false });
	initBuffs([{ ...getBuffData(ids.rest), lastTurn: 0 }]);
	const ctx = initFightContex(fight);
	actor.addBuff(actor, 'test', ids.rest, 1, ctx);
	flush(ctx);
	ctx.msgs.length = 0;
	loop.processAfterTurn(1, ctx);
	loop.nextTurn();
	loop.processAfterTurn(2, ctx);
	assert.ok(actor.findBuff(ids.rest));
	flush(ctx);
	fight.result = FightResultEnum.attack;
	assert.equal(fight.processUnit(actor, { cmd: FightCmdEnum.attack }), undefined);
});
