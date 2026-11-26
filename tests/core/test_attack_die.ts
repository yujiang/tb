import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
	FightClient,
	FightCmdEnum,
	FightLoopPC,
	getFightGlobalData,
	initFightContex,
	setFightGlobalData,
} from '../../src';
import { setupChain, chainIds } from '../fixtures/skill_chain';

for (const enabled of [false, true]) {
	// 测试：attackDie决定单位输入用严格或延后校验，已有checkPC/checkOnline自身语义不变，提交后仍保存副本。
	test(`attackDie: unit inputs select validation with enabled=${enabled}`, (t) => {
		const original = { ...getFightGlobalData() };
		t.after(() => setFightGlobalData(original));
		const s = setupChain({ rootSelfBuff: false });
		setFightGlobalData({ attackDie: enabled });
		assert.equal(getFightGlobalData().attackDie, enabled);
		setFightGlobalData({ maxTurn: 10 });
		assert.equal(getFightGlobalData().attackDie, enabled);
		const ctx = initFightContex(s.fight);
		s.target.die(ctx);
		const input = { cmd: FightCmdEnum.attack, target: s.target.uid };
		assert.equal(s.fight.checkOnline(s.actor, input), true);
		assert.equal(s.fight.checkPC(s.actor, input), false);
		assert.equal(s.actor.onInput(input), enabled);
		if (enabled) {
			input.target = s.other.uid;
			assert.equal(s.actor.input.target, s.target.uid);
		}
		assert.equal(s.actor.onInput({ cmd: FightCmdEnum.attack, target: s.actor.uid }), false);
		assert.equal(s.actor.onInput({ cmd: FightCmdEnum.attack, target: 9999999 }), false);
		s.actor.attr.point.mp = 0;
		assert.equal(
			s.actor.onInput({
				cmd: FightCmdEnum.skill,
				skill: chainIds.first,
				target: s.other.uid,
			}),
			enabled,
		);
		s.actor.die(ctx);
		assert.equal(s.actor.onInput({ cmd: FightCmdEnum.defend }), enabled);
	});
}

for (const [enabled, revive] of [
	[false, false],
	[true, false],
	[true, true],
]) {
	// 测试：PC按attackDie接受或拒绝守尸，执行前复活则攻击原目标，仍死亡则按未指定目标选人。
	test(`attackDie: PC corpse input enabled=${enabled}, revived=${revive}`, async (t) => {
		const original = { ...getFightGlobalData() };
		t.after(() => setFightGlobalData(original));
		const s = setupChain({ rootSelfBuff: false, targetHp: 0 });
		s.loop.end();
		setFightGlobalData({ attackDie: enabled });
		s.target.die();
		const loop = new FightLoopPC(s.fight);
		t.after(() => loop.end());
		const errors: unknown[] = [];
		loop.onError = (error) => errors.push(error);
		const client = new FightClient();
		loop.onMsg((msgs) => client.onMsg(structuredClone(msgs)));
		loop.start();
		loop.processUnits = [s.actor];
		let samples = 0;
		s.fight.random = () => {
			samples++;
			return 0;
		};
		let accepted: boolean;
		let keptWindow = false;
		loop.on('input', (unit) => {
			const input = { cmd: FightCmdEnum.attack, target: s.target.uid };
			accepted = loop.onInput(unit.uid, input);
			if (!accepted) {
				keptWindow = loop.inputUnit === unit;
				loop.onInput(unit.uid, { cmd: FightCmdEnum.defend });
				return;
			}

			input.target = s.other.uid;
			if (revive) {
				const ctx = initFightContex(s.fight);
				s.fight.resolveAction(() => {
					s.target.onRelife(s.target, 'test', ctx);
					s.target.onHeal(s.target, 'test', 150, ctx, { revive: true });
				});
				loop.bcMsg(ctx.msgs);
			}
		});
		await loop.processOneTurn(s.fight.turn);
		assert.deepEqual(errors, []);
		assert.equal(accepted, enabled);
		if (!enabled) assert.equal(keptWindow, true);

		assert.equal(s.target.getHp(), revive ? 50 : 0);
		assert.equal(s.other.getHp(), enabled && !revive ? 900 : 1000);
		if (!revive) assert.equal(samples, 0);

		assert.equal(loop.inputUnit, undefined);
		assert.equal(client.checkSame(s.fight), true);
	});
}
