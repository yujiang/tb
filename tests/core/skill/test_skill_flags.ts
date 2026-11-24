import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { FightSkill, SkillData, TargetSelectEnum } from '../../../src';

const data = {
	id: 99800,
	name: '开关测试',
	magic: true,
	rand: 1,
	attack: {},
	final: {},
	sel: { target: TargetSelectEnum.enemy },
};

for (const [field, method] of [
	['noblood', 'canBlood'],
	['nodback', 'canDBack'],
	['nofback', 'canFBack'],
	['nosupport', 'canSupport'],
	['noprotect', 'canProtect'],
] as const) {
	// 测试：禁止字段省略或为 false 时允许能力，只有 true 禁止，且不影响其他能力。
	test(`skill flags: ${field} defaults to false and only true disables its ability`, () => {
		for (const value of [undefined, false, true]) {
			const skill = new FightSkill({ ...data, [field]: value } as SkillData, 1);
			assert.equal(skill[method](), value !== true);
			for (const other of [
				'canBlood',
				'canDBack',
				'canFBack',
				'canSupport',
				'canProtect',
			] as const) {
				if (other !== method) assert.equal(skill[other](), true);
			}
		}
	});
}
