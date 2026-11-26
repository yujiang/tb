import { BuffData, FightUnit, initBuffs, initFightContex, initSkills, OverlapEnum, SkillData, TargetSelectEnum } from '../../src';
import { setupChain } from './skill_chain';

export const trapId = 10018101, hitId = 10018102, rootId = 10018103, placeId = 10018104;

export function setupTrap(
	root = false,
	extra: Partial<BuffData> = {},
	attack: Partial<SkillData> = {},
	output?: (line: string) => void,
) {
	const s = setupChain({
		output,
		rootSelfBuff: false,
		finalReactions: false,
		change: (skills) => Object.assign(skills[0], {
			magic: false, combo: undefined, nosupport: true, noprotect: true, ...attack,
		}),
	});
	initBuffs([
		{
			id: rootId, name: '缠绕', desc: '', status: ['缠绕'], tags: [],
			magic: false, attackType: 'base', attack: {}, final: {},
			overlap: OverlapEnum.REPLACE, lastTurn: 2, times: 0, event: undefined,
		},
		{
			id: trapId, name: '陷阱', desc: '', class: 'trap', status: [], tags: [],
			magic: false, attackType: 'base', attack: {}, final: {},
			overlap: OverlapEnum.REPLACE, lastTurn: 3, times: 1, event: undefined,
			skill: hitId, skillLevel: 2, ...extra,
		},
	]);
	initSkills([
		{
			id: hitId, name: '陷阱伤害', magic: true, nomove: 1, rand: 1,
			sel: { target: TargetSelectEnum.enemy }, attackRate: 0,
			attack: { attack: 40 }, attackLevel: { attack: 5 }, final: {},
			cost: { mp: 999 }, cd: 9, nosupport: true, noprotect: true,
			nofback: true, nodback: true, addBuff: root ? [[rootId, 1, 1]] : undefined,
		},
		{
			id: placeId, name: '布置陷阱', func: 'nohurt', magic: false, nomove: 1,
			rand: 1, sel: { target: TargetSelectEnum.self }, attack: {}, final: {},
			cost: { mp: 10 }, cd: 2, addBuff: [[trapId, 1, 1]],
		},
	]);
	const place = (unit: FightUnit = s.target) => {
		const ctx = initFightContex(s.fight);
		unit.addBuff(unit, 'skill', trapId, 1, ctx);
		s.flush(ctx);
	};
	return { ...s, place };
}

