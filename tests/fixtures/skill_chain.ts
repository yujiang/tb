import { setFightGlobalData } from '../../src/fight/Datas/FightGlobalData';
import { BuffTurnEnum } from '../../src/fight/Datas/BuffDatas';
import { strict as assert } from 'node:assert';
import {
	Fight,
	FightAttr,
	BaseAttack,
	FightSide,
	FightUnitUser,
	FightUnitMonster,
	FightLoopWest,
	FightClient,
	FightReport,
	SkillData,
	initSkills,
	initBuffs,
	OverlapEnum,
	initFightContex,
	FightCmdEnum,
	TargetSelectEnum,
} from '../../src';

export const chainIds = { first: 98001, second: 98002, third: 98003, rest: 98004, kill: 98005 };

export type ChainSkill = SkillData;

function attr(hp: number): FightAttr {
	const base = (attack = 100, rand = 0): BaseAttack => ({
		rand,
		hit: 100,
		dodge: 0,
		parry: 0,
		attack,
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
	const a = new FightAttr();
	a.point = { hp, hpMax: 1000, mp: 100, mpMax: 100 };
	a.speed = 100;
	const group = () => ({
		base: base(100, 1),
		next: base(),
		kill: base(),
		spread: base(),
		fback: base(10),
		final: { bloodP: 0, dbackP: 0, immunity: 0, immunityP: 0 },
	});
	a.physic = group();
	a.magic = group();
	a.heal = base();
	a.poison = base();
	return a;
}

export function setupChain(
	options: {
		targetHp?: number;
		actorHp?: number;
		otherHp?: number;
		finalReactions?: boolean;
		finalKill?: boolean;
		rootSelfBuff?: boolean;
		change?: (skills: ChainSkill[]) => void;
		output?: (line: string) => void;
	} = {},
) {
	const ids = chainIds;
	initBuffs([
		{
			id: ids.rest,
			name: '休息',
			desc: '下回合跳过主动行动',
			class: 'rest',
			overlap: OverlapEnum.REPLACE,
			status: [],
			tags: [],
			magic: false,
			attackType: 'base',
			attack: {},
			final: {},
			lastTurn: 2,
			times: 0,
			event: 'hurt',
			turnType: BuffTurnEnum.afterTurn,
			skill: 0,
			skillLevel: 1,
			notRemove: true,
		},
	]);
	const common = {
		magic: true,
		rand: 1,
		attack: {},
		final: {},
		sel: { target: TargetSelectEnum.enemy },
		nofback: true,
		nodback: true,
		noprotect: false,
		cost: { mp: 99 },
	};
	const skills: ChainSkill[] = [
		{
			...common,
			id: ids.first,
			name: '三连斩·一式',
			damageRate: 0.4,
			combo: ids.second,
			cost: { mp: 10 },
			afterSelfBuff: options.rootSelfBuff === false ? undefined : [[ids.rest, 1, 1]],
		},
		{
			...common,
			id: ids.second,
			name: '三连斩·二式',
			damageRate: 0.7,
			combo: ids.third,
			sel: { target: TargetSelectEnum.enemy },
		},
		{
			...common,
			id: ids.third,
			name: '三连斩·终式',
			damageRate: 1,
			sel: { target: TargetSelectEnum.enemy },
			nofback: !(options.finalReactions ?? true),
			nodback: !(options.finalReactions ?? true),
			kill: options.finalKill ? ids.kill : undefined,
		},
		{ ...common, id: ids.kill, name: '终式追击', cost: { mp: 99 } },
	];
	options.change?.(skills);
	initSkills(skills);
	setFightGlobalData({
		protectBuff: undefined,
		allShieldBreak: false,
		maxTurn: 10,
		waitInputSec: 1,
		duiwei: false,
		jiqi: false,
		attackDie: true,
	});
	const fight = new Fight(
		98000,
		{ id: 1, runaway: false, runawayGrade: 0, deathPenalty: 0, winRecover: 0, winReward: 0 },
		0,
	);
	const actor = new FightUnitUser(0, attr(options.actorHp ?? 1000), { name: '剑客' });
	actor.setPos(0);
	const targetAttr = attr(options.targetHp ?? 1000);
	targetAttr.magic.final.dbackP = 0.2;
	targetAttr.physic.fback.rand = 1;
	const target = new FightUnitMonster(1, targetAttr, { name: '卫士' });
	target.setPos(0);
	const other = new FightUnitMonster(2, attr(options.otherHp ?? 1000), { name: '另一敌人' });
	other.setPos(1);
	const a = new FightSide(),
		b = new FightSide();
	a.units.push(actor);
	b.units.push(target, other);
	fight.createSide(a, b);
	actor.addSkill(ids.first, 1);
	const loop = new FightLoopWest(fight),
		client = new FightClient(),
		report = new FightReport(options.output ?? (() => {}));
	loop.onMsg((msgs) => {
		const wire = JSON.parse(JSON.stringify(msgs));
		client.onMsg(wire);
		report.onMsg(wire);
	});
	loop.start();
	loop.nextTurn();
	const flush = (ctx: ReturnType<typeof initFightContex>) => {
		loop.bcMsg(ctx.msgs);
		assert.equal(client.checkSame(fight), true);
	};
	const cast = () => {
		const ctx = fight.processUnit(actor, {
			cmd: FightCmdEnum.skill,
			skill: ids.first,
			target: target.uid,
		});
		assert.ok(ctx);
		ctx.msgs.unshift(['actor', actor.uid, actor.getSpeed()]);
		flush(ctx);
		return ctx;
	};
	return { fight, actor, target, other, loop, client, report, flush, cast, skills };
}
