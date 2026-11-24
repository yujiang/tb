import { setFightGlobalData } from '../../../src/fight/Fight';
import { strict as assert } from 'node:assert';
import {
	BaseAttack,
	Fight,
	FightAttr,
	FightClient,
	FightLoopPC,
	FightReport,
	CreateMonsterSide,
	TargetSelectEnum,
	initMonsters,
	initZhens,
	initSkills,
	fightMsg,
} from '../../../src';

const heroSkill = 1001300,
	bossAttack = 1001301,
	bossSkill = 1001302,
	heroId = 1001303,
	bossId = 1001304,
	heroZhen = 1001305,
	bossZhen = 1001306;

function attributes(hp: number, attack: number, speed: number): FightAttr {
	const base = (value: number, rand = 0): BaseAttack => ({
		attack: value,
		rand,
		hit: 100,
		dodge: 0,
		defend: 0,
		hurt: 0,
		hurtP: 0,
		hurtAnti: 0,
		hurtPAnti: 0,
		critP: 0,
		critPAnit: 0,
		critDeep: 0,
		critDeepAnit: 0,
	});
	const attr = new FightAttr();
	attr.point = { hp, hpMax: hp, mp: 0, mpMax: 0 };
	attr.speed = speed;
	const group = () => ({
		base: base(attack, 1),
		next: base(0),
		kill: base(0),
		spread: base(0),
		fback: base(0),
		final: { bloodP: 0, dbackP: 0, immunity: 0, immunityP: 0 },
	});
	attr.physic = group();
	attr.magic = group();
	attr.heal = base(0);
	attr.poison = base(0);
	return attr;
}

export async function runAIReport(
	output: (line: string) => void = (line) => console.log(line),
	color = true,
) {
	const common = {
		magic: true,
		rand: 1,
		final: {},
		nofback: true,
		nodback: true,
		nosupport: true,
		sel: { target: TargetSelectEnum.enemy },
	};
	initSkills([
		{ ...common, id: heroSkill, name: '断岳刀', attack: {} },
		{ ...common, id: bossAttack, name: '猛虎拳', attack: {} },
		{ ...common, id: bossSkill, name: '裂地斩', attack: { attack: 80 } },
	]);
	initMonsters([
		{
			id: heroId,
			name: '刀客',
			attr: attributes(1200, 200, 100),
			skills: [[heroSkill, 1]],
			attackSkill: heroSkill,
		},
		{
			id: bossId,
			name: '山贼首领',
			attr: attributes(600, 80, 200),
			skills: [
				[bossAttack, 1],
				[bossSkill, 1],
			],
			attackSkill: bossAttack,
			rules: [
				{
					type: 'hp',
					lines: [
						{ hp: 0.7, attackRate: 0.2 },
						{ hp: 0.4, attackRate: 0.3 },
					],
				},
				{ type: 'turn', every: 3, skill: bossSkill },
				{ type: 'hurt', every: 2 },
			],
		},
	]);
	initZhens([
		{ id: heroZhen, pos: [0] },
		{ id: bossZhen, pos: [4] },
	]);
	let nextUid = 0;
	const allocateUid = () => nextUid++;
	const left = CreateMonsterSide([heroId], heroZhen, allocateUid);
	const right = CreateMonsterSide([bossId], bossZhen, allocateUid);
	setFightGlobalData({
		protectBuff: undefined,
		allShieldBreak: false,
		maxTurn: 5,
		waitInputSec: 1,
		duiwei: false,
	});
	const fight = new Fight(
		1001307,
		{ runaway: false, runawayGrade: 0, deathPenalty: 0, winRecover: 0, winReward: 0 },
		0,
	);
	fight.createSide(left, right);
	const loop = new FightLoopPC(fight),
		client = new FightClient(),
		report = new FightReport(output, color);
	const messages: fightMsg[] = [];
	let checked = 0;
	const extraAttackBars: number[][] = [];
	loop.onMsg((msgs) => {
		const wire = JSON.parse(JSON.stringify(msgs));
		const batch: fightMsg[] = typeof wire[0] === 'string' ? [wire] : wire;
		messages.push(...batch);
		client.onMsg(wire);
		report.onMsg(wire);
		if (batch.some((msg) => msg[0] === 'aiAttack')) {
			assert.ok(!batch.some((msg) => msg[0] === 'actor' || msg[0] === 'sort'));
			extraAttackBars.push([...client.sort]);
		}
		if (client.sides[0].length && client.sides[1].length) {
			assert.ok(client.checkSame(fight));
			checked++;
		}
	});
	const result = await loop.run();
	return {
		fight,
		client,
		report,
		messages,
		checked,
		extraAttackBars,
		result,
		hero: left.units[0],
		boss: right.units[0],
	};
}
