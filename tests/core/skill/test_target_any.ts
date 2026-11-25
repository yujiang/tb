import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { FightCmdEnum, TargetSelectEnum, initSkills, SkillData } from '../../../src';
import { setupChain } from '../../fixtures/skill_chain';

const id = 10015501;
function data(num = 1): SkillData {
	return {
		id,
		name: '任意目标',
		magic: true,
		rand: 1,
		attack: {},
		final: {},
		sel: { target: TargetSelectEnum.any, num },
		nosupport: true,
		noprotect: true,
		nofback: true,
		nodback: true,
	};
}

// 测试：新增any保留已有目标枚举数值，any追加为4。
test('target any: preserves existing target enum values', () => {
	assert.deepEqual(
		[
			TargetSelectEnum.self,
			TargetSelectEnum.duiwei,
			TargetSelectEnum.friend,
			TargetSelectEnum.enemy,
			TargetSelectEnum.any,
		],
		[0, 1, 2, 3, 4],
	);
});

// 测试：普通技能的any选择任意阵营且默认只选存活单位，不要求模仿行动记录。
test('target any: ordinary single-target skills can select either side', () => {
	const s = setupChain({ rootSelfBuff: false, finalReactions: false });
	initSkills([data()]);
	const skill = s.actor.addSkill(id, 1);
	s.other.die();
	assert.equal(s.fight.isLegalTarget(s.actor, s.actor, skill), true);
	assert.equal(s.fight.isLegalTarget(s.actor, s.target, skill), true);
	assert.equal(s.fight.isLegalTarget(s.actor, s.other, skill), false);
	s.fight.random = () => 0;
	assert.equal(s.fight.selectMainTarget(s.actor, skill), s.actor);
	assert.equal(
		s.fight.checkPC(s.actor, { cmd: FightCmdEnum.skill, skill: id, target: s.target.uid }),
		true,
	);
});

// 测试：any群体技能无目标类型告警，并在同一普通技能流程中选择双方单位。
test('target any: group selection and config validation support both sides', (t) => {
	const s = setupChain({ rootSelfBuff: false, finalReactions: false });
	const warning = t.mock.method(console, 'warn', () => {});
	initSkills([data(99)]);
	s.actor.addSkill(id, 1);
	assert.equal(warning.mock.calls.length, 0);
	const ctx = s.fight.processUnit(s.actor, { cmd: FightCmdEnum.skill, skill: id });
	assert.deepEqual(
		ctx.msgs.filter((m) => m[0] === 'skill' && m[1] === id).map((m) => m[3]),
		[s.actor.uid, s.target.uid, s.other.uid],
	);
});
