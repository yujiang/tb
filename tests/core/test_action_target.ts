import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
	FightCmdEnum,
	FightInput,
	FightLoopPC,
	FightClient,
	initFightContex,
	setFightGlobalData,
} from '../../src';
import { setupChain, chainIds } from '../fixtures/skill_chain';

for (const cmd of [FightCmdEnum.none, FightCmdEnum.attack, FightCmdEnum.skill]) {
	for (const state of ['unset', 'dead', 'dismissed'] as const) {
		// 主行动的目标未指定、已死亡且不符合技能条件、已离场时，结算结果与未指定目标完全一致，不修改原指令。
		test(`action target: command ${cmd} with ${state} target behaves like an unset target`, () => {
			const first = setupChain({ rootSelfBuff: false, finalReactions: false });
			const second = setupChain({ rootSelfBuff: false, finalReactions: false });
			for (const s of [first, second]) {
				if (state === 'dead') {
					const ctx = initFightContex(s.fight);
					s.fight.resolveAction(() => s.target.onHurt(s.other, 'test', 1000, ctx));
					s.flush(ctx);
				} else if (state === 'dismissed') {
					const ctx = s.fight.processUnit(s.other, {
						cmd: FightCmdEnum.dismiss,
						target: s.target.uid,
					});
					assert.ok(ctx);
					s.flush(ctx);
				}
			}
			const input: FightInput = {
				cmd,
				...(cmd === FightCmdEnum.skill ? { skill: chainIds.first } : {}),
			};
			const targeted = {
				...input,
				...(state === 'unset' ? {} : { target: first.target.uid }),
			};
			const original = { ...targeted };
			const actual = first.fight.processUnit(first.actor, targeted);
			const expected = second.fight.processUnit(second.actor, input);
			assert.ok(actual?.actionStarted);
			assert.ok(expected?.actionStarted);
			assert.equal(actual.defend.uid, expected.defend.uid);
			assert.deepEqual(actual.msgs, expected.msgs);
			assert.deepEqual(targeted, original);
			if (state !== 'unset') assert.equal(actual.defend.uid, first.other.uid);

			first.flush(actual);
			second.flush(expected);
			first.loop.end();
			second.loop.end();
		});
	}
}

// 非法类型的显式ID不能因恰好对应死亡目标而被当成未指定目标，提交与执行均拒绝。
test('action target: malformed IDs remain invalid when their coerced target is dead', () => {
	const s = setupChain({ rootSelfBuff: false, finalReactions: false });
	s.target.die();
	const input = { cmd: FightCmdEnum.attack, target: String(s.target.uid) as never };
	assert.equal(s.fight.checkOnline(s.actor, input), false);
	assert.equal(s.fight.processUnit(s.actor, input), undefined);
	assert.equal(s.other.getHp(), 1000);
	s.loop.end();
});

for (const state of ['dead', 'dismissed'] as const) {
	// PC已接受的技能在返回执行队列前目标死亡或离场，严格复验也按未指定目标处理，正常施法且客户端一致。
	test(
		`action target: PC executes an accepted skill after its target becomes ${state}`,
		{ timeout: 1000 },
		async (t) => {
			const s = setupChain({ rootSelfBuff: false, finalReactions: false });
			s.loop.end();
			setFightGlobalData({ attackDie: false });
			const loop = new FightLoopPC(s.fight),
				client = new FightClient();
			t.after(() => loop.end());
			loop.onMsg((msgs) => client.onMsg(structuredClone(msgs)));
			loop.start();
			loop.processUnits = [s.actor];
			loop.on('input', (unit) => {
				assert.equal(
					loop.onInput(unit.uid, {
						cmd: FightCmdEnum.skill,
						skill: chainIds.first,
						target: s.target.uid,
					}),
					true,
				);
				if (state === 'dismissed') {
					const ctx = s.fight.processUnit(s.other, {
						cmd: FightCmdEnum.dismiss,
						target: s.target.uid,
					});
					assert.ok(ctx);
					loop.bcMsg(ctx.msgs);
				} else {
					const ctx = initFightContex(s.fight);
					s.fight.resolveAction(() => s.target.onHurt(s.other, 'test', 1000, ctx));
					loop.bcMsg(ctx.msgs);
				}
			});
			await loop.processOneTurn(s.fight.turn);
			assert.equal(s.other.getHp(), 790);
			assert.equal(s.actor.attr.point.mp, 90);
			assert.equal(s.actor.input.target, s.target.uid);
			assert.ok(client.checkSame(s.fight));
		},
	);
}
