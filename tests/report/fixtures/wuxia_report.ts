import '../../fixtures/default_skills';
import { FightMud, FightMudTables, fightMsg, initSkills, TargetSelectEnum } from '../../../src';

/** 展示专用协议场景，不代表一次真实引擎战斗；真实循环的同种子对照另由test_mud覆盖。 */
export function wuxiaScene(): { messages: fightMsg[]; tables: FightMudTables } {
	const actions: Record<number, string[]> = {
		99581: ['$N腕底翻出一道寒光，使出{技能}，刀锋斜掠，攻向$n！'],
		99582: [
			'$N剑尖轻颤，使出{技能}，一线剑光倏地攻向$n！',
			'$N手腕轻转，使出{技能}，剑光忽虚忽实，攻向$n！',
			'$N剑势一敛，使出{技能}，锋芒从细微处递出，攻向$n！',
		],
		99587: ['$N弓起身子，使出{技能}，爪牙齐张，攻向$n！'],
	};
	initSkills(
		[
			[99581, '断流刀', false, 'normal'],
			[99582, '回岚剑', false, 'normal'],
			[99583, '归元诀', true, 'heal'],
			[99584, '震脉指', true, 'normal'],
			[99585, '蚀骨散', true, 'poison'],
			[99586, '护脉诀', true, 'nohurt'],
			[99587, '裂风爪', false, 'normal'],
		].map(([id, name, magic, func]) => ({
			id: id as number,
			name: name as string,
			magic: magic as boolean,
			func: func as string,
			rand: 1,
			attack: {},
			final: {},
			action: actions[id as number],
			sel: { target: TargetSelectEnum.enemy },
		})),
	);
	const unit = (uid: number, name: string) => ({
		uid,
		pos: uid,
		dead: false,
		display: { name, character: uid },
		point: { hp: 260, hpMax: 260, mp: 100, mpMax: 100 },
		buffs: [] as number[][],
	});
	return {
		tables: {
			xlsCharacter: {
				0: { id: 0 },
				1: { id: 1 },
				2: { id: 2 },
				3: { id: 3 },
				4: { id: 4 },
			},
		},
		messages: [
			['start', 99580],
			['side', 0, [unit(0, '陆行舟'), unit(1, '青衣客'), unit(2, '白芷'), unit(4, '灵狼')]],
			['side', 1, [unit(3, '黑风寨主')]],
			['turn', 1],
			['actor', 0, 100],
			['skill', 99581, 0, 3],
			['hurt', 'skill', 3, 0, 24, 236, []],
			['actor', 3, 95],
			['skill', 99584, 3, 0],
			['hurt', 'skill', 0, 3, 80, 180, ['crit']],
			['actor', 1, 90],
			['skill', 99582, 1, 3],
			['hurt', 'skill', 3, 1, 35, 201, []],
			['miss', 99582, 1, 3, 'combo'],
			['skill', 99582, 1, 3, 'combo'],
			['hurt', 'skill', 3, 1, 45, 156, []],
			['actor', 2, 85],
			['skill', 99583, 2, 0],
			['heal', 'heal', 0, 2, 200, 180, []],
			['actor', 4, 80],
			['skill', 99587, 4, 3],
			['hurt', 'skill', 3, 4, 12, 144, []],
			['turn', 2],
			['actor', 0, 100],
			['defend', 0],
			['actor', 2, 85],
			['skill', 99585, 2, 3],
			['hurt', 'poison', 3, 2, 12, 132, []],
			['skill', 99586, 2, 0],
			['actor', 1, 90],
			['skill', 99582, 1, 3],
			['hurt', 'skill', 3, 1, 131, 1, []],
			['skill', 99582, 1, 3, 'next'],
			['hurt', 'skill', 3, 1, 0, 1, []],
			['skill', 99582, 1, 3, 'combo'],
			['hurt', 'skill', 3, 1, 1, 0, []],
			['die', 3],
			['end', 0, 0, false],
		],
	};
}

export function runWuxiaReport(
	output: (line: string) => void = console.log,
	color = true,
): FightMud {
	const scene = wuxiaScene();
	const mud = new FightMud(output, color, scene.tables);
	mud.onMsg(scene.messages);
	return mud;
}
