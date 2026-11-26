import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
	FightClient,
	FightCmdEnum,
	FightLoopPC,
	FightLoopWest,
	FightLoopYanYu,
	getFightGlobalData,
	setFightGlobalData,
	initFightContex,
	fightMsg,
} from '../../src';
import { setupChain, chainIds } from '../fixtures/skill_chain';

for (const Loop of [FightLoopPC, FightLoopWest, FightLoopYanYu]) {
	for (const enabled of [false, true]) {
		// 测试：集气开关控制普通及额外行动后的增长调用、初始化字段和增量消息，客户端仅消费协议即可一致。
		test(`jiqi: ${Loop.name} enabled=${enabled} controls calculation and client data`, async (t) => {
			const original = { ...getFightGlobalData() };
			t.after(() => setFightGlobalData(original));
			const s = setupChain({ rootSelfBuff: false, finalReactions: false });
			s.loop.end();
			setFightGlobalData({ jiqi: enabled });
			s.fight.turn = 0;
			s.target.addSkill(chainIds.first, 1);
			s.target.setExtraActions([[0.5, chainIds.first]]);
			const calls = s.fight.getAllUnits().map((unit) => {
				unit.attr.point.jp = 5;
				unit.attr.point.jpMax = 100;
				return t.mock.method(unit, 'addJp');
			});
			const loop = new Loop(s.fight);
			t.after(() => loop.end());
			const client = new FightClient();
			const messages: fightMsg[] = [];
			loop.onMsg((msgs) => {
				const batch: fightMsg[] = structuredClone(
					typeof msgs[0] === 'string' ? [msgs as fightMsg] : (msgs as fightMsg[]),
				);
				messages.push(...batch);
				client.onMsg(batch);
			});
			loop.on('input', (unit) => loop.onInput(unit.uid, { cmd: FightCmdEnum.defend }));
			loop.start();
			for (const unit of s.fight.getAllUnits()) {
				const point = client.getUnitById(unit.uid)!.point;
				assert.equal(Object.prototype.hasOwnProperty.call(point, 'jp'), enabled);
				assert.equal(Object.prototype.hasOwnProperty.call(point, 'jpMax'), enabled);
			}
			loop.nextTurn();
			const before = initFightContex(s.fight);
			const waiting = loop.waitInput(s.fight.turn, before);
			if (loop instanceof FightLoopWest) {
				loop.onInput(s.actor.uid, { cmd: FightCmdEnum.defend, turn: s.fight.turn });
			}
			await waiting;
			loop.bcMsg(before.msgs);
			await loop.processOneTurn(s.fight.turn);
			for (const [index, unit] of s.fight.getAllUnits().entries()) {
				assert.equal(unit.attr.point.jp, enabled ? 9 : 5);
				assert.equal(calls[index].mock.callCount(), enabled ? 4 : 0);
			}
			assert.equal(
				messages.filter((msg) => msg[0] === 'addPoint' && msg[2] === 'jp').length,
				enabled ? 12 : 0,
			);
			assert.equal(client.checkSame(s.fight), true);
		});
	}
}

// 测试：关闭集气时显式恢复和技能JP费用都跳过，不改内部集气、不发消息，HP/MP/SP费用继续校验。
test('jiqi: disabled qi skips recovery and cost without bypassing other resource checks', (t) => {
	const original = { ...getFightGlobalData() };
	t.after(() => setFightGlobalData(original));
	const s = setupChain({ rootSelfBuff: false });
	setFightGlobalData({ jiqi: false });
	s.actor.attr.point.jp = 2;
	s.actor.attr.point.jpMax = 100;
	const ctx = initFightContex(s.fight);
	assert.equal(s.actor.addJp(20, ctx), 0);
	assert.equal(s.actor.canCost({ jp: 100 }), true);
	assert.equal(s.actor.costSkill({ jp: 100, mp: 10 }, ctx), true);
	assert.equal(s.actor.attr.point.jp, 2);
	assert.equal(s.actor.attr.point.mp, 90);
	assert.equal(s.actor.canCost({ jp: 100, mp: 91 }), false);
	assert.equal(s.actor.canCost({ jp: 100, hp: 1000 }), false);
	assert.equal(s.actor.canCost({ jp: 100, sp: 1 }), false);
	assert.deepEqual(ctx.msgs, [['costMp', s.actor.uid, 10, 90]]);
	s.flush(ctx);
	assert.equal(Object.prototype.hasOwnProperty.call(s.actor.getUnitMsg().point, 'jp'), false);
	assert.equal(Object.prototype.hasOwnProperty.call(s.actor.getUnitMsg().point, 'jpMax'), false);
	assert.equal(s.actor.attr.point.jpMax, 100);
});
