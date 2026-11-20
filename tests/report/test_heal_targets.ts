import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { FightCmdEnum } from '../../src/fight/struct';
import { healIds, runHealExample } from './fixtures/heal_targets';

// 测试：主目标治疗100，两个spread副目标各70，禁疗和尸体不占名额，客户端与服务端一致。
test('heal example: one primary at 100 percent and two spread targets at 70 percent', () => {
	const s = runHealExample('spread', () => {});
	assert.deepEqual(
		s.rows.map((row) => row.healed),
		[0, 0, 100, 70, 70, 0, 0],
	);
	assert.deepEqual(
		s.ctx.msgs.filter((msg) => msg[0] === 'heal').map((msg) => [msg[1], msg[2], msg[4]]),
		[
			['heal', 2, 100],
			['spread', 3, 70],
			['spread', 4, 70],
		],
	);
	assert.deepEqual(
		s.ctx.msgs.find((msg) => msg[0] === 'spread'),
		['spread', [3, 4]],
	);
	assert.equal(s.ctx.defend.uid, 2);
	assert.equal(s.doctor.attr.point.mp, 90);
	assert.equal(s.ctx.msgs.filter((msg) => msg[0] === 'costMp').length, 1);
	assert.equal(s.client.checkSame(s.fight), true);
	assert.doesNotMatch(s.report.toString(), /未识别消息/);
});

// 测试：直接群疗选三个friend目标，各治疗100；禁疗与尸体过滤后才排序取人数，不产生spread。
test('heal example: three friend targets receive full direct healing', () => {
	const s = runHealExample('group', () => {});
	assert.deepEqual(
		s.rows.map((row) => row.healed),
		[0, 0, 100, 100, 100, 0, 0],
	);
	assert.deepEqual(
		s.ctx.msgs.filter((msg) => msg[0] === 'heal').map((msg) => [msg[2], msg[4]]),
		[
			[2, 100],
			[3, 100],
			[4, 100],
		],
	);
	assert.equal(
		s.ctx.msgs.some((msg) => msg[0] === 'spread'),
		false,
	);
	assert.equal(s.ctx.defend, null);
	assert.equal(s.doctor.attr.point.mp, 90);
	assert.equal(s.ctx.msgs.filter((msg) => msg[0] === 'costMp').length, 1);
	assert.equal(s.enemy.getHp(), 1000);
	assert.equal(s.client.checkSame(s.fight), true);
});

// 测试：手动把第一种治疗指定给禁疗队友会被拒绝，不扣费，也不自动改选主目标。
test('heal example: explicit forbidden primary targets are rejected', () => {
	const s = runHealExample('spread', () => {});
	const input = { cmd: FightCmdEnum.skill, skill: healIds.main, target: s.allies[0].uid };
	const hp = s.fight.getAllUnits().map((unit) => unit.getHp());
	assert.equal(s.fight.checkPC(s.doctor, input), false);
	assert.equal(s.fight.processUnit(s.doctor, input), undefined);
	assert.equal(s.doctor.attr.point.mp, 90);
	assert.deepEqual(
		s.fight.getAllUnits().map((unit) => unit.getHp()),
		hp,
	);
});
