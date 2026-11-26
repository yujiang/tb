import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { FightMud, initPassives, fightMsg } from '../../src';
import { setupChain } from '../fixtures/skill_chain';

// 实际施放一次68点攻击，经防御减去46点；彩色打印内功文案和最终22点扣血。
test('report neigong: prints mitigation and actual damage together', () => {
	const neigong = 10019811;
	initPassives([
		{
			id: neigong,
			name: '护体真气',
			desc: '内功表现示例，不提供属性加成',
			magic: false,
			attackType: 'base',
			attack: {},
			final: {},
			status: [],
			tags: [],
			action: '$N气息一沉，运起{技能}，卸去{减伤}点伤害。',
		},
	]);
	const s = setupChain({
		rootSelfBuff: false,
		finalReactions: false,
		change: (skills) => {
			skills[0].combo = undefined;
			skills[0].damageRate = 1;
			skills[0].name = '劈空掌';
			skills[0].action = '$N提气扬掌，一记{技能}直击$n！';
		},
	});
	s.actor.display.name = '山贼';
	s.actor.attr.magic.base.attack = 68;
	s.target.display.name = '刀客';
	s.target.display.neigong = neigong;
	s.target.attr.magic.base.defend = 46;
	const mud = new FightMud(console.log, true);
	mud.onMsg(['start', s.fight.fid]);
	for (const side of [0, 1]) {
		const msg: fightMsg = [
			'side',
			side,
			s.fight.getSide(side).units.map((unit) => unit.getUnitMsg()),
		];
		s.client.onMsg(msg);
		mud.onMsg(msg);
	}
	const ctx = s.cast();
	mud.onMsg(ctx.msgs);
	assert.equal(s.target.getHp(), 978);
	assert.ok(
		mud.lines.includes(
			'刀客（#1）气息一沉，运起[护体真气]，卸去46点伤害。刀客受到了22点伤害。',
		),
	);
});
