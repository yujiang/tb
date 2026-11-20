import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { FightResultEnum } from '../../src';
import { runReactionReport } from './fixtures/report_reactions';

// 测试：固定种子战斗完整展示连击、追击、反击、吸血和反伤，简报可读且客户端一致。
test('report: deterministic combo, pursuit, counterattack, lifesteal and reflection are readable', async () => {
	const { fight, client, report, messages, checkedBatches } = await runReactionReport(() => {});
	assert.equal(fight.win, FightResultEnum.attack);
	assert.equal(fight.turn, 2);
	assert.equal(fight.getUnitById(0).getHp(), 101);
	assert.equal(client.checkSame(fight), true);
	assert.ok(checkedBatches > 5);
	assert.ok(messages.every((msg) => msg[0] !== 'sync'));
	assert.ok(messages.some((msg) => msg[1] === 97202));
	assert.ok(messages.some((msg) => msg[1] === 97203));
	assert.equal(messages.filter((msg) => msg[4] === 'next').length, 1);
	assert.equal(messages.filter((msg) => msg[4] === 'kill').length, 1);
	assert.equal(messages.filter((msg) => msg[4] === 'fback').length, 2);
	assert.equal(
		messages.filter(
			(msg) => msg[0] === 'hurt' && msg[2] === 0 && msg[3] === 1 && msg[1] !== 'dback',
		).length,
		1,
	);
	const text = report.toString();
	assert.match(text, /使用\[汲血剑\]/);
	assert.match(text, /【连击】.*使用\[连斩\]/);
	assert.match(text, /【追击】.*使用\[收割\]/);
	assert.match(text, /【反击】.*使用\[普通攻击\]/);
	assert.doesNotMatch(text, /技能 #9720[123]/);
	for (const label of ['连击', '追击', '反击', '吸血', '反伤'])
		assert.ok(text.includes(label), `缺少${label}说明`);
	assert.match(text, /攻击方获胜/);
	assert.doesNotMatch(text, /未识别消息/);
});
