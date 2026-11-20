// 没有伤害的

import { FightUnit } from '../../Unit/FightUnit';
import { FightSkill } from '../FightSkill';
import { FightContex } from '../../Fight';

function addBuffFunc(
	attacker: FightUnit,
	defender: FightUnit,
	skill: FightSkill,
	ctx: FightContex,
) {
	const addbuff = skill.getXls().addBuff;
	if (!addbuff) return false;
	defender.addBuffs(attacker, 'buff', addbuff, ctx);
	return true;
}

function removeBuffFunc(
	attacker: FightUnit,
	defender: FightUnit,
	skill: FightSkill,
	ctx: FightContex,
) {
	const xls = skill.getXls();
	const buffs = xls.rmeoveBuff;
	const tag = xls.removeBuffTag;
	if (buffs) {
		defender.removeBuffs(attacker, 'buff', buffs, skill.getPower(), ctx);
		return true;
	}
	// 一般不可能同时有buffs+tag
	if (tag) {
		defender.removeBuffByTag(attacker, 'buff', tag, xls.removeBuffNum, skill.getPower(), ctx);
		return true;
	}
	return false;
}

// 装备技能~
export function equipSkill(attacker: FightUnit, skill: FightSkill, ctx: FightContex) {
	const xls = skill.getXls();
	if (xls.attackSkill != null) {
		attacker.setAttackSkill(xls.attackSkill);
	}
	if (xls.ultimateSkill != null) attacker.setUltimateSkill(xls.ultimateSkill);
	if (xls.supportSkill) {
		attacker.setSupportSkill(xls.supportSkill);
	}
	if (xls.fbackSkill) {
		attacker.setFBackSkill(xls.fbackSkill);
	}
	return xls.attackSkill || xls.supportSkill || xls.fbackSkill || xls.ultimateSkill;
}

export function afterHurt(
	attacker: FightUnit,
	defender: FightUnit,
	skill: FightSkill,
	ctx: FightContex,
) {
	const b1 = addBuffFunc(attacker, defender, skill, ctx);
	const b2 = removeBuffFunc(attacker, defender, skill, ctx);
	equipSkill(attacker, skill, ctx);
	return b1 || b2;
}

export function nohurtFunc(
	attacker: FightUnit,
	defender: FightUnit,
	skill: FightSkill,
	ctx: FightContex,
) {
	return afterHurt(attacker, defender, skill, ctx);
}

// 一般攻击给对方上buff，这个给自己上buff； 比如三连击自己休息一回合。
export function afterSelfBuff(attacker: FightUnit, skill: FightSkill, ctx: FightContex) {
	const buffs = skill.getXls().afterSelfBuff;
	if (!attacker.isDied() && buffs?.length) attacker.addBuffs(attacker, 'skill', buffs, ctx);
}
