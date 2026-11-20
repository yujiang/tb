import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
	FightAI,
	FightClient,
	FightCmdEnum,
	FightLoopPC,
	FightLoopWest,
	FightLoopYanYu,
	initFightContex,
	initSkills,
	fightMsg,
	InsertActionPos,
	TargetSelectEnum,
} from '../../../src';
import { setupChain, chainIds as ids } from '../../fixtures/skill_chain';

function setup(
	Loop: typeof FightLoopPC | typeof FightLoopWest | typeof FightLoopYanYu,
	actions: [number, number][] = [[0.5, 0]],
) {
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
	const boss = s.target;
	boss.addSkill(ids.first, 1);
	boss.addSkill(ids.kill, 1);
	boss.setExtraActions(actions);
	const decisions: number[] = [];
	class BossAI extends FightAI {
		override waitInput() {
			decisions.push(s.actor.getHp());
			return { cmd: FightCmdEnum.skill, skill: ids.first, target: s.actor.uid };
		}
	}
	boss.ai = new BossAI();
	const loop = new Loop(s.fight),
		client = new FightClient(),
		messages: fightMsg[] = [];
	loop.onMsg((msgs) => {
		const batch = JSON.parse(
			JSON.stringify(typeof msgs[0] === 'string' ? [msgs] : msgs),
		) as fightMsg[];
		messages.push(...batch);
		client.onMsg(batch);
	});
	loop.on('input', (unit) => loop.onInput(unit.uid, { cmd: FightCmdEnum.defend }));
	loop.start();
	boss.attr.speed = 200;
	s.actor.attr.speed = 150;
	s.other.attr.speed = 50;
	for (const unit of s.fight.getAllUnits()) unit.speedRand = 0;
	loop.nextTurn();
	const prepare = async () => {
		const ctx = initFightContex(s.fight),
			waiting = loop.waitInput(s.fight.turn, ctx);
		if (loop instanceof FightLoopWest)
			loop.onInput(s.actor.uid, { turn: s.fight.turn, cmd: FightCmdEnum.defend });
		await waiting;
		loop.bcMsg(ctx.msgs);
	};
	return { ...s, boss, loop, client, messages, decisions, prepare };
}

for (const Loop of [FightLoopPC, FightLoopWest, FightLoopYanYu]) {
	for (const extraSkill of [0, ids.kill]) {
		// 测试：Boss死亡后首段行动跳过，同伴在第二段前复活它，保留原第二段ID并正常攻击。
		test(`extraAction: ${Loop.name} resumes the remaining action after revival with skill=${extraSkill}`, async () => {
			const s = setup(Loop, [[0.5, extraSkill]]),
				revive = 10011901;
			s.boss.attrOri.speed = 200; // 死亡清理重算后仍保持模板原始速度。
			s.other.attr.speed = 120;
			s.other.emit('speed');
			initSkills([
				{
					...s.skills[3],
					id: revive,
					name: '复活同伴',
					func: 'relife',
					healRate: 0.5,
					sel: { target: TargetSelectEnum.friend },
				},
			]);
			s.other.addSkill(revive, 1);
			s.other.ai = new (class extends FightAI {
				override waitInput() {
					return { cmd: FightCmdEnum.skill, skill: revive, target: s.boss.uid };
				}
			})();
			const slots = s.loop.actions.filter((action) => action.unit === s.boss);
			const first = slots.find((action) => !action.inserted),
				second = slots.find((action) => action.inserted);
			const death = initFightContex(s.fight);
			s.fight.resolveAction(() => s.boss.onHurt(s.actor, 'test', 99999, death));
			s.loop.bcMsg(death.msgs);
			assert.equal(s.boss.isDied(), true);
			assert.deepEqual(
				s.client.actions
					.filter((action) => action.uid === s.boss.uid)
					.map((action) => action.id),
				slots.map((action) => action.id),
			);
			let observedRevival = false;
			s.loop.onMsg((msgs) => {
				const batch = (typeof msgs[0] === 'string' ? [msgs] : msgs) as fightMsg[];
				if (batch.some((msg) => msg[0] === 'relife' && msg[1] === s.boss.uid)) {
					observedRevival = true;
					assert.equal(
						s.loop.actions.some((action) => action.id === first.id),
						false,
					);
					assert.deepEqual(
						s.loop.actions
							.filter((action) => action.unit === s.boss)
							.map((action) => action.id),
						[second.id],
					);
					assert.deepEqual(
						s.client.actions
							.filter((action) => action.uid === s.boss.uid)
							.map((action) => action.id),
						[second.id],
					);
					assert.equal(s.client.getUnitById(s.boss.uid).dead, false);
				}
			});
			await s.prepare();
			await s.loop.processOneTurn(1);
			assert.equal(observedRevival, true);
			assert.equal(s.boss.isDied(), false);
			const attacks = s.messages.filter((msg) => msg[0] === 'skill' && msg[2] === s.boss.uid);
			assert.equal(attacks.length, 1);
			assert.equal(attacks[0][1], extraSkill || ids.first);
			assert.equal(s.decisions.length, extraSkill === 0 ? 1 : 0);
			assert.equal(
				s.messages.filter(
					(msg) => msg[0] === 'actor' && msg[1] === s.boss.uid && msg[4] === second.id,
				).length,
				1,
			);
			assert.equal(s.client.checkSame(s.fight), true);
			assert.equal(s.client.actions.length, 0);
			s.loop.end();
		});
	}

	// 测试：两段行动都在死亡时经过后才被复活，已跳过的行动不会补回，本回合不再攻击。
	test(`extraAction: ${Loop.name} does not restore action slots already skipped before revival`, async () => {
		const s = setup(Loop),
			revive = 10011902;
		s.boss.attrOri.speed = 200;
		s.other.attr.speed = 40;
		s.other.emit('speed');
		initSkills([
			{
				...s.skills[3],
				id: revive,
				name: '迟到的复活',
				func: 'relife',
				healRate: 0.5,
				sel: { target: TargetSelectEnum.friend },
			},
		]);
		s.other.addSkill(revive, 1);
		s.other.ai = new (class extends FightAI {
			override waitInput() {
				return { cmd: FightCmdEnum.skill, skill: revive, target: s.boss.uid };
			}
		})();
		const death = initFightContex(s.fight);
		s.fight.resolveAction(() => s.boss.onHurt(s.actor, 'test', 99999, death));
		s.loop.bcMsg(death.msgs);
		await s.prepare();
		await s.loop.processOneTurn(1);
		assert.equal(s.boss.isDied(), false);
		assert.equal(s.decisions.length, 0);
		assert.equal(
			s.messages.filter((msg) => msg[0] === 'skill' && msg[2] === s.boss.uid).length,
			0,
		);
		assert.equal(s.loop.actions.length, 0);
		assert.equal(s.client.actions.length, 0);
		assert.equal(s.client.checkSame(s.fight), true);
		s.loop.end();
	});

	for (const rate of [0.5, 2]) {
		// 测试：半速或双速的额外AI行动均进入队列，每次实际出手重新决策，额外行动不重复推进输入周期。
		test(`extraAction: ${Loop.name} makes fresh AI decisions at speed rate ${rate}`, async () => {
			const s = setup(Loop, [[rate, 0]]);
			const entries = s.loop.actions.filter((action) => action.unit === s.boss);
			assert.equal(entries.length, 2);
			assert.notEqual(entries[0].id, entries[1].id);
			assert.equal(s.client.actions.find((action) => action.inserted)?.speedRate, rate);
			await s.prepare();
			await s.loop.processOneTurn(1);
			const moves = s.messages.filter((msg) => msg[0] === 'skill' && msg[2] === s.boss.uid);
			assert.equal(moves.length, 2);
			assert.deepEqual(s.decisions, [1000, 900]);
			assert.equal(s.boss.myInputTurn, 1);
			assert.equal(s.loop.actions.length, 0);
			assert.equal(s.client.actions.length, 0);
			assert.equal(s.client.checkSame(s.fight), true);
			s.loop.nextTurn();
			assert.equal(s.loop.actions.filter((action) => action.unit === s.boss).length, 2);
			s.loop.end();
		});
	}

	// 测试：填具体技能ID时只执行该技能，普通行动继续走AI，固定技能不抢写单位的输入意图。
	test(`extraAction: ${Loop.name} executes an explicitly configured skill`, async () => {
		const s = setup(Loop, [[0.5, ids.kill]]);
		await s.prepare();
		await s.loop.processOneTurn(1);
		assert.deepEqual(
			s.messages
				.filter((msg) => msg[0] === 'skill' && msg[2] === s.boss.uid)
				.map((msg) => msg[1]),
			[ids.first, ids.kill],
		);
		assert.deepEqual(s.decisions, [1000]);
		assert.equal(s.boss.myInputTurn, 1);
		assert.equal(s.client.checkSame(s.fight), true);
		s.loop.end();
	});

	// 测试：Boss首次行动后减速，剩余额外行动按新速度倍率重排，已执行的普通行动不会重新加入。
	test(`extraAction: ${Loop.name} slows only the remaining action after the first move`, async () => {
		const s = setup(Loop);
		let slowed = false;
		s.loop.onMsg((msgs) => {
			const batch = typeof msgs[0] === 'string' ? [msgs] : msgs;
			if (
				!slowed &&
				(batch as fightMsg[]).some((msg) => msg[0] === 'actor' && msg[1] === s.boss.uid)
			) {
				slowed = true;
				s.boss.attr.speed = 80;
				s.boss.emit('speed');
				assert.deepEqual(
					s.loop.processUnits.map((unit) => unit.uid),
					[s.actor.uid, s.other.uid, s.boss.uid],
				);
			}
		});
		await s.prepare();
		await s.loop.processOneTurn(1);
		assert.deepEqual(
			s.messages
				.filter((msg) => msg[0] === 'actor' && msg[1] !== s.actor.uid)
				.map((msg) => msg[1]),
			[s.boss.uid, s.other.uid, s.boss.uid],
		);
		const extra = s.messages.find((msg) => msg[0] === 'actor' && msg[3] === 'insert');
		assert.equal(extra[2], 40);
		assert.equal(s.client.actions.length, 0);
		s.loop.end();
	});

	for (const stop of ['rest', 'dead', 'end'] as const) {
		// 测试：首次行动后休息、死亡或战斗结束时不再决策额外AI行动，也不绕过当前状态执行。
		test(`extraAction: ${Loop.name} rechecks ${stop} before an extra AI decision`, async () => {
			const s = setup(Loop);
			s.actor.onContex('hurt', (_unit, ctx, attacker) => {
				if (attacker !== s.boss) return;
				if (stop === 'rest') s.boss.addBuff(s.boss, 'test', ids.rest, 1, ctx);
				if (stop === 'dead') s.boss.onHurt(s.actor, 'test', 99999, ctx);
			});
			if (stop === 'end') {
				const initial = initFightContex(s.fight);
				s.actor.onHurt(s.other, 'test', 900, initial);
				s.loop.bcMsg(initial.msgs);
			}
			await s.prepare();
			await s.loop.processOneTurn(1);
			assert.equal(s.decisions.length, 1);
			assert.equal(
				s.messages.filter((msg) => msg[0] === 'skill' && msg[2] === s.boss.uid).length,
				1,
			);
			if (stop === 'rest')
				assert.equal(
					s.messages.some((msg) => msg[0] === 'skipAction' && msg[1] === s.boss.uid),
					true,
				);
			if (stop === 'dead') assert.equal(s.boss.isDied(), true);
			if (stop === 'end') assert.equal(s.fight.isEnd(), true);
			assert.equal(s.client.checkSame(s.fight), true);
			s.loop.end();
			assert.equal(s.client.actions.length, 0);
		});
	}
}

// 测试：减速重排也保持手工队首插队位置、独立ID和模板倍率，0倍率仍生成一个末尾行动。
test('extraAction: speed changes preserve dynamic insertions and zero speed entries', () => {
	const s = setup(FightLoopPC, [
		[0.5, 0],
		[0, ids.kill],
	]);
	s.loop.insertAction(
		s.boss,
		{ cmd: FightCmdEnum.skill, skill: ids.kill },
		InsertActionPos.first,
	);
	const inserted = s.loop.actions[0].id;
	const configured = s.loop.actions
		.filter((action) => action.speedRate !== undefined)
		.map((action) => action.id);
	s.boss.attr.speed = 80;
	s.boss.emit('speed');
	assert.equal(s.loop.actions[0].id, inserted);
	assert.equal(s.loop.actions[s.loop.actions.length - 1].speedRate, 0);
	assert.deepEqual(
		s.loop.actions
			.filter((action) => action.speedRate !== undefined)
			.map((action) => action.id),
		configured,
	);
	assert.deepEqual(
		s.client.actions.map((action) => action.id),
		s.loop.actions.map((action) => action.id),
	);
	s.loop.end();
});

// 测试：配置技能冷却后后续同技能额外行动跳过，下一回合仍生成行动位但不能绕过CD。
test('extraAction: configured actions respect cooldown on every execution', async () => {
	const s = setup(FightLoopPC, [
		[0.75, ids.kill],
		[0.5, ids.kill],
	]);
	s.boss.findSkill(ids.kill).getXls().cd = 2;
	await s.prepare();
	await s.loop.processOneTurn(1);
	const casts = () =>
		s.messages.filter(
			(msg) => msg[0] === 'skill' && msg[1] === ids.kill && msg[2] === s.boss.uid,
		).length;
	assert.equal(casts(), 1);
	s.loop.nextTurn();
	await s.prepare();
	await s.loop.processOneTurn(2);
	assert.equal(casts(), 1);
	s.loop.end();
});

// 测试：非法倍率、技能、未学技能、大招槽和超量配置在装配时拒绝，不污染原额外行动配置。
test('extraAction: configuration validation is atomic and rejects invalid entries', () => {
	const s = setup(FightLoopPC);
	const original = s.boss.extraAction;
	for (const actions of [
		[[-1, 0]],
		[[NaN, 0]],
		[[Infinity, 0]],
		[[0.5, -1]],
		[[0.5, 1.5]],
		[[0.5, 999999]],
	]) {
		assert.throws(() => s.boss.setExtraActions(actions as [number, number][]), /extraAction/);
		assert.equal(s.boss.extraAction, original);
	}
	s.boss.setUltimateSkill(ids.kill);
	assert.throws(() => s.boss.setExtraActions([[0.5, ids.kill]]), /ultimate/);
	assert.throws(() => s.boss.setExtraActions(Array.from({ length: 65 }, () => [1, 0])), /64/);
	s.loop.end();
});
