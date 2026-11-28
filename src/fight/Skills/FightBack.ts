import { strict as assert } from 'node:assert';
import { FightContex } from '../Fight';
import { FightUnit } from '../Unit/FightUnit';
import { FightSkill } from './FightSkill';
import { skillAttackFunc } from './Funcs/NomalSkill';
import { canAttackSkill } from './AttackChecks';

export function skillFBack(
	attacker: FightUnit,
	defender: FightUnit,
	skill: FightSkill,
	ctx: FightContex,
) {
	if (!canAttackSkill(attacker, defender, skill, 'fback')) return false;

	// 反击技能通过表格禁止再次触发反击，先跳过当前无法行动的单位。
	assert(!skill.canFBack(), 'Counter skills must configure nofback: true');
	const data = skill.getXls();
	const counter = ctx.blocked && data.fbackOnBlock
		? new FightSkill({ ...data, rand: 1 }, skill.level)
		: skill;
	const used = skillAttackFunc(attacker, defender, counter, ctx, 'fback');
	if (used) {
		ctx.fbackNum = (ctx.fbackNum || 0) + 1;
	}
	return used;
}

export function tryFBack(attacker: FightUnit, defender: FightUnit, ctx: FightContex) {
	return skillFBack(attacker, defender, attacker.getFBackSkill(), ctx);
}

// 尝试吸血
// bloodP:技能填多少就是多少，没有才用人物身上的，好像也没毛病
export function tryBlood(
	attacker: FightUnit,
	defender: FightUnit,
	magic: boolean,
	damage: number,
	bloodP: number,
	ctx: FightContex,
) {
	const p = bloodP;
	if (p > 0) {
		const p2 = magic ? defender.attr.magic.final.bloodPAnit : defender.attr.physic.final.bloodPAnit;
		// p2 > p 反吸血，相当于吸了一口毒血
		damage *= p - p2;
		if (damage) {
			attacker.onHeal(attacker, 'blood', damage, ctx);		    
		}
	}
}

// 反伤
export function tryDBack(
	attacker: FightUnit,
	defender: FightUnit,
	magic: boolean,
	damage: number,
	ctx: FightContex,
) {
	const p = magic ? defender.attr.magic.final.dbackP : defender.attr.physic.final.dbackP;
	if (p > 0) {
		damage *= p;
		attacker.onHurt(defender, 'dback', damage, ctx, { magic, source: 'dback' });
	}
}
