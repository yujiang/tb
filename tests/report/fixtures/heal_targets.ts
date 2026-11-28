import '../../fixtures/default_skills';
import { setFightGlobalData } from '../../../src/fight/Datas/FightGlobalData';
import { BuffTurnEnum } from '../../../src/fight/Datas/BuffDatas';
import { strict as assert } from 'node:assert';
import {
	BaseAttack,
	Fight,
	FightAttr,
	FightClient,
	FightCmdEnum,
	FightReport,
	FightSide,
	FightUnitMonster,
	FightUnitUser,
	initBuffs,
	initFightContex,
	initSkills,
	OverlapEnum,
	SkillData,
	TargetSelectEnum,
	fightMsg,
} from '../../../src';

export const healIds = { main: 10011501, spread: 10011502, group: 10011503, forbidden: 10011504 };

function attributes(hp: number): FightAttr {
	const base = (attack = 0): BaseAttack => ({
		rand: 0,
		hitP: 0, dodgeP: 0, parryAnit: 0, attackP: 0, defendP: 0,
		hit: 100,
		dodge: 0,
		parry: 0,
		attack,
		defend: 0,
		hurt: 0,
		hurtP: 0,		critP: 0,
		critPAnit: 0,
		critDeep: 0,
		critDeepAnit: 0,
	});
	const group = () => ({
		base: base(),
		next: base(),
		kill: base(),
		spread: base(),
		fback: base(),
		final: { bloodPAnit: 0, bloodP: 0, dbackP: 0, immunity: 0, immunityP: 0 },
	});
	const attr = new FightAttr();
	attr.point = { hp, hpMax: 1000, mp: 100, mpMax: 100 };
	attr.speed = 100;
	attr.physic = group();
	attr.magic = group();
	attr.heal = base(100);
	attr.poison = base();
	return attr;
}

// 两种治疗使用独立但相同的初始场面；无五行、暴击、减疗或满血截断，基础治疗量固定100。
export function runHealExample(
	mode: 'spread' | 'group',
	output: (line: string) => void = console.log,
) {
	const common: Omit<SkillData, 'id' | 'name' | 'sel'> = {
		magic: true,
		rand: 1,
		func: 'heal',
		attack: {},
		final: {},
		nosupport: true,
		noprotect: true,
	};
	initSkills([
		{
			...common,
			id: healIds.main,
			name: '主疗与扩散',

			cost: { mp: 10 },
			sel: { target: TargetSelectEnum.friend, sortAttr: 'hp' },
			spread: healIds.spread,
		attack: { hurtP: 0 }},
		// 子技能的num是额外人数，排除主目标；倍率70%，不另收子技能费用。
		{
			...common,
			id: healIds.spread,
			name: '七成扩散治疗',

			cost: { mp: 99 },
			sel: { target: TargetSelectEnum.friend, num: 2, sortAttr: 'hp' },
		attack: { hurtP: -0.3 }},
		{
			...common,
			id: healIds.group,
			name: '三人群疗',

			cost: { mp: 10 },
			sel: { target: TargetSelectEnum.friend, num: 3, sortAttr: 'hp' },
		attack: { hurtP: 0 }},
	]);
	initBuffs([
		{
			id: healIds.forbidden,
			name: '禁疗',
			desc: '无法成为治疗目标',
			status: ['禁疗'],
			tags: [],
			magic: false,
			attackType: 'base',
			attack: {},
			final: {},
			overlap: OverlapEnum.REPLACE,
			turnType: BuffTurnEnum.thisTurn,
			lastTurn: 0,
			times: 0,
			event: 'hurt',
		},
	]);

	setFightGlobalData({
		protectBuff: undefined,
		allShieldBreak: false,
		maxTurn: 10,
		waitInputSec: 1,
		duiwei: false,
	});
	const fight = new Fight(
		10011500,
		{ id: 1, runaway: false, runawayGrade: 0, deathPenalty: 0, winRecover: 0, winReward: 0 },
		0,
	);
	const doctor = new FightUnitUser(0, attributes(900), { name: '医师' });
	const allies = [
		new FightUnitMonster(1, attributes(50), { name: '禁疗队友' }),
		new FightUnitMonster(2, attributes(100), { name: '重伤队友' }),
		new FightUnitMonster(3, attributes(200), { name: '队友甲' }),
		new FightUnitMonster(4, attributes(300), { name: '队友乙' }),
		new FightUnitMonster(5, attributes(400), { name: '候补队友' }),
		new FightUnitMonster(6, attributes(0), { name: '死亡队友' }),
	];
	allies[5].die();
	const enemy = new FightUnitMonster(10, attributes(1000), { name: '敌人' });
	const friends = [doctor, ...allies];
	friends.forEach((unit, pos) => unit.setPos(pos));
	enemy.setPos(0);
	const side = new FightSide(),
		opposing = new FightSide();
	side.units.push(...friends);
	opposing.units.push(enemy);
	fight.createSide(side, opposing);
	doctor.addSkill(healIds.main, 1);
	doctor.addSkill(healIds.group, 1);
	allies[0].addBuff(enemy, 'example', healIds.forbidden, 1, initFightContex(fight));

	const client = new FightClient(),
		report = new FightReport(output, false);
	const publish = (msgs: fightMsg[]) => {
		const wire = JSON.parse(JSON.stringify(msgs)) as fightMsg[];
		client.onMsg(wire);
		report.onMsg(wire);
		assert.equal(client.checkSame(fight), true);
	};
	output(
		mode === 'spread' ? '\n主目标100% + 两个spread目标70%' : '\n直接治疗三个friend目标，各100%',
	);
	publish([
		['start', fight.fid],
		['side', 0, friends.map((unit) => unit.getUnitMsg())],
		['side', 1, [enemy.getUnitMsg()]],
	]);
	const before = friends.map((unit) => unit.getHp());
	const skill = mode === 'spread' ? healIds.main : healIds.group;
	assert.equal(fight.checkPC(doctor, { cmd: FightCmdEnum.skill, skill }), true);
	const ctx = fight.processUnit(doctor, { cmd: FightCmdEnum.skill, skill });
	assert.ok(ctx);
	publish([['actor', doctor.uid, doctor.getSpeed()], ...ctx.msgs]);
	const rows = friends.map((unit, index) => ({
		name: unit.getName(),
		before: before[index],
		after: unit.getHp(),
		healed: unit.getHp() - before[index],
	}));
	for (const row of rows) output(`${row.name}：${row.before} → ${row.after}（+${row.healed}）`);
	return { fight, doctor, allies, enemy, client, report, ctx, rows };
}

if (require.main === module) {
	runHealExample('spread');
	runHealExample('group');
}
