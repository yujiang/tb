import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
	FightClient,
	FightCmdEnum,
	FightLoopPC,
	FightLoopWest,
	FightReport,
	FightResultEnum,
	FightSideEnum,
	setFightGlobalData,
	fightMsg,
} from '../../src';
import { setupChain } from '../fixtures/skill_chain';

for (const Loop of [FightLoopPC, FightLoopWest]) {
	// 测试：PC/西游真实输入逃跑指令后立即结束战斗，简报展示成功，后续单位不再行动且双方不结算奖惩。
	test(
		`report demo: ${Loop.name} runaway ends the battle immediately`,
		{ timeout: 3000 },
		async (t) => {
			const s = setupChain({ rootSelfBuff: false, finalReactions: false });
			s.loop.end();
			s.fight.turn = 0;
			setFightGlobalData({ maxTurn: 3 });
			Object.assign(s.fight.xls, {
				runaway: true,
				runawayGrade: 0,
				deathPenalty: 7,
				winReward: 9,
				winRecover: 0.5,
			});
			// 等级等于逃跑基准，成功率100%；速度确保玩家先行动，后面仍有两名敌人等待。
			s.actor.attrOri.grade = 0;
			s.actor.attrOri.speed = 500;
			s.actor.calcAttr();
			let settlements = 0;
			for (const side of s.fight.Sides) {
				side.onWin = () => settlements++;
				side.deathPenalty = () => settlements++;
			}

			const loop = new Loop(s.fight),
				client = new FightClient(),
				report = new FightReport(console.log, false),
				messages: fightMsg[] = [];
			t.after(() => loop.end());
			loop.onMsg((msgs) => {
				const wire = JSON.parse(JSON.stringify(msgs)) as fightMsg | fightMsg[];
				const batch =
					typeof wire[0] === 'string' ? [wire as fightMsg] : (wire as fightMsg[]);
				messages.push(...batch);
				client.onMsg(batch);
				report.onMsg(batch);
				if (client.sides[0].length && client.sides[1].length) {
					assert.equal(client.checkSame(s.fight), true);
				}
			});
			if (loop instanceof FightLoopPC) {
				loop.on('input', (unit) => {
					console.log(`${unit.getName()}选择逃跑。`);
					assert.equal(loop.onInput(unit.uid, { cmd: FightCmdEnum.runaway }), true);
				});
			} else {
				const wait = loop.waitInput.bind(loop);
				loop.waitInput = async (turn, ctx) => {
					const waiting = wait(turn, ctx);
					console.log(`${s.actor.getName()}提交第${turn}回合逃跑指令。`);
					loop.onInput(s.actor.uid, { turn, cmd: FightCmdEnum.runaway });
					return waiting;
				};
			}

			console.log(`\n${Loop.name}：演示逃跑成功结束战斗，后续敌人行动取消。`);
			const result = await loop.run();
			const end = messages.find((msg) => msg[0] === 'end');
			console.log(`客户端结束消息：${JSON.stringify(end)}`);
			console.log(
				`剩余行动：${loop.actions.length}；奖惩调用：${settlements}；客户端与服务端一致。`,
			);
			assert.equal(result, FightResultEnum.defend);
			assert.equal(s.fight.turn, 1);
			assert.equal(s.fight.canRunaway(), true);
			assert.equal(s.fight.getWinSide(), FightSideEnum.defend);
			assert.deepEqual(
				messages.filter((msg) => msg[0] === 'runaway'),
				[['runaway', s.actor.uid, true]],
			);
			assert.equal(messages.filter((msg) => msg[0] === 'actor').length, 1);
			assert.equal(
				messages.some((msg) => msg[0] === 'skill' || msg[0] === 'hurt'),
				false,
			);
			assert.equal(messages.filter((msg) => msg[0] === 'end').length, 1);
			assert.deepEqual(end, ['end', FightResultEnum.defend, FightSideEnum.defend, true]);
			assert.equal(loop.actions.length, 0);
			assert.equal(settlements, 0);
			assert.equal(client.result, result);
			assert.equal(client.winSide, FightSideEnum.defend);
			assert.equal(client.runaway, true);
			assert.match(report.toString(), /逃跑成功/);
			assert.match(report.toString(), /战斗结束：逃跑，防守方获胜/);
			assert.doesNotMatch(report.toString(), /未识别消息/);
		},
	);
}
