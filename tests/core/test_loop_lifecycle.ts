import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { FightCmdEnum, FightLoopPC, FightLoopWest, FightLoopYanYu, fightMsg } from '../../src';
import { setupChain } from '../fixtures/skill_chain';

for (const Loop of [FightLoopPC, FightLoopWest, FightLoopYanYu]) {
	// 测试：三种循环统一由基类管理状态，启动前和停止后不执行行动，启动后正常执行且重复结束只通知一次。
	test(`loop lifecycle: ${Loop.name} only executes actions between start and end`, async () => {
		const s = setupChain({ rootSelfBuff: false, finalReactions: false });
		s.loop.end();
		const loop = new Loop(s.fight);
		const messages: fightMsg[] = [];
		loop.onMsg((msgs) => {
			messages.push(
				...(typeof msgs[0] === 'string' ? [msgs as fightMsg] : (msgs as fightMsg[])),
			);
		});
		loop.on('input', (unit) => loop.onInput(unit.uid, { cmd: FightCmdEnum.defend }));
		const actors = () => messages.filter((msg) => msg[0] === 'actor').length;
		loop.processUnits = [s.actor];
		await loop.processOneTurn(s.fight.turn);
		assert.equal(actors(), 0);
		loop.end();
		assert.equal(messages.filter((msg) => msg[0] === 'end').length, 0);
		loop.start();
		loop.processUnits = [s.actor];
		s.actor.input = { cmd: FightCmdEnum.defend };
		await loop.processOneTurn(s.fight.turn);
		assert.equal(actors(), 1);
		loop.end();
		loop.end();
		assert.equal(messages.filter((msg) => msg[0] === 'end').length, 1);
		loop.processUnits = [s.actor];
		await loop.processOneTurn(s.fight.turn);
		assert.equal(actors(), 1);
	});
}
