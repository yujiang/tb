import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { FightCmdEnum, FightLoopPC, FightResultEnum } from '../../src';
import { setupChain, chainIds } from '../fixtures/skill_chain';

// 故意在技能受伤事件里抛错，展示真实错误日志、源码堆栈和攻击方失败的结束收尾。
test('report demo: skill errors print their stack and end the fight', async () => {
	const s = setupChain({
		rootSelfBuff: false,
		finalReactions: false,
		change: (data) => {
			data[0].combo = undefined;
			data[0].damageRate = 1;
		},
	});
	s.loop.end();
	s.fight.turn = 0;
	s.fight.xls.maxTurn = 1;
	s.actor.attrOri.speed = 500;
	s.actor.calcAttr();

	s.target.onContex('beforeHurt', () => {
		// F5 调试时可在这里下断点，或在 FightLoop.onError 查看捕获后的上下文。
		throw new Error('示例：技能执行失败');
	});

	const loop = new FightLoopPC(s.fight);
	loop.onMsg((msgs) => {
		s.loop.bcMsg(msgs);
		const batch = typeof msgs[0] === 'string' ? [msgs] : msgs;
		for (const msg of batch) {
			if (msg[0] === 'end') console.log('客户端结束消息：', JSON.stringify(msg));
		}
	});
	loop.on('input', (unit) =>
		loop.onInput(unit.uid, {
			cmd: FightCmdEnum.skill,
			skill: chainIds.first,
			target: s.target.uid,
		}),
	);

	console.log('演示：故意抛出技能异常，记录日志后立即结束战斗。');
	const result = await loop.run();
	console.log('战斗返回结果：', result);
	console.log('剩余行动数：', loop.actions.length);
	console.log('等待输入单位：', loop.inputUnit);
	assert.equal(result, FightResultEnum.defend);
	assert.equal(s.client.win, FightResultEnum.defend);
	assert.equal(loop.actions.length, 0);
	assert.equal(loop.inputUnit, undefined);
});
