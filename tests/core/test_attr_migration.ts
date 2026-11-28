import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { initFightContex, initSkills, initBuffs, getBuffData } from '../../src';
import { setupChain, chainIds } from '../fixtures/skill_chain';
import { AttrSkill } from '../../src/fight/Skills/AttrSkill';

// 普通技能沿通用管线执行时只计一次使用，避免次数Buff提前消耗及本次增伤翻倍。
test('attr migration: normal skill records one use per cast', () => {
	const s = setupChain({
		rootSelfBuff: false,
		finalReactions: false,
		change: (skills) => {
			skills[0].combo = undefined;
		},
	});
	s.cast();
	assert.equal(s.actor.getSkillUseCount(chainIds.first), 1);
});

// 普攻与普通技能复用结算后，单体攻击仍在完整链结束后消耗一次嘲讽。
test('attr migration: normal skills consume the selected taunt once', () => {
	const s = setupChain({ rootSelfBuff: false, finalReactions: false });
	const id = 991811;
	initBuffs([
		{ ...getBuffData(chainIds.rest), id, class: 'taunt', times: 1, lastTurn: 0, status: [] },
	]);
	s.actor.addBuff(s.target, 'test', id, 1, initFightContex(s.fight));
	s.cast();
	assert.equal(s.actor.findBuff(id), undefined);
});

// 周期技能可只读取表格固定数值和成长，不把受益者自身治疗属性叠加进去。
test('attr migration: periodic skills keep raw table attributes', () => {
	const s = setupChain();
	const data = { ...s.skills[0], id: 991810, attack: { attack: 10 }, attackLevel: { attack: 5 } };
	initSkills([data]);
	const skill = new AttrSkill(data, 2, undefined, 'heal');
	assert.equal(skill.calcHeal(s.fight, s.target, initFightContex(s.fight), s.actor), 20);
});
