// 治疗

import { Fight, FightContex } from '../Fight';
import { FightUnit } from '../Unit/FightUnit';
import { calcHeal, calcPoison } from './Calc';
import { FightSkill } from './FightSkill';
import { getSkillData, SkillData } from '../Datas/SkillDatas';
import { getHealMul } from '../FightAttr';

export type AttrFunc = (
	attacker: FightUnit,
	defender: FightUnit,
	skill: AttrSkill,
	name: string,
	ctx: FightContex,
) => boolean;

export class AttrSkill extends FightSkill {
	attr: string;
	// 周期效果传undefined，仅使用表格与成长；主动技能传施放者，合并当前属性。
	constructor(xls: SkillData, level: number, unit: FightUnit | undefined, attr: string) {
		super(xls, level);
		this.attr = attr;
		if (unit) this.mergeAttr(unit);
	}

	getAttrSpreadSkill(attacker: FightUnit) {
		return this.createSpreadSkill(this.getSpread(), attacker);
	}

	private createSpreadSkill(id: number, attacker: FightUnit) {
		const data = getSkillData(id);
		if (!data) return;

		return new AttrSkill(data, this.level, attacker, this.attr);
		// skill.mergeAttr(attacker);
	}

	mergeAttr(attacker: FightUnit) {
		// this.xls = {...this.xls};
		this.attack = this.mergeAttackData(this.getAttr(attacker));
	}

	calcHeal(f: Fight, defender: FightUnit, ctx: FightContex, attacker: FightUnit = ctx.attack) {
		const property = this.getXls().skillProp ?? attacker?.attr.charProp;
		// 相生，不用弱点
		const propertyBonus = getHealMul(property, defender.attr.charProp);
		ctx.effects = [];
		const amount = calcHeal(
			f,
			this.getAttack(),
			this.getAttr(defender),
			propertyBonus,
			ctx,
		);
		if (propertyBonus > 0) ctx.effects.push('生');
		return amount;
	}

	calcPoison(f: Fight, defender: FightUnit, ctx: FightContex, attacker: FightUnit = ctx.attack) {
		const property = this.getXls().skillProp ?? attacker?.attr.weaponProp;
		const propertyBonus = defender.getHurtMul(property, attacker?.attr.weapon);
		ctx.effects = [];
		const damage = calcPoison(
			f,
			this.getAttack(),
			this.getAttr(defender),
			defender.getHp(),
			propertyBonus,
			ctx,
		);
		if (propertyBonus > 0) ctx.effects.push('克');
		return damage;
	}

	getAttr(u: FightUnit) {
		return (u.attr as any)[this.attr];
	}
}

export function attrFunc(
	attr: string,
	func: AttrFunc,
	attacker: FightUnit,
	defender: FightUnit,
	skill: FightSkill,
	ctx: FightContex,
) {
	const magic = new AttrSkill(skill.getXls(), skill.level, attacker, attr);
	// magic.mergeAttr(attacker);

	func(attacker, defender, magic, 'heal', ctx);
	const spread = magic.getAttrSpreadSkill(attacker);
	if (spread) {
		spreadAttr(func, attacker, defender, spread, ctx);
	}
	return true;
}

function spreadAttr(
	func: AttrFunc,
	attacker: FightUnit,
	defender: FightUnit,
	skill: AttrSkill,
	ctx: FightContex,
) {
	const f = ctx.fight;
	//const xls = skill.xls;
	const targets = f.selectSpreadTargets(defender, skill);
	if (!targets?.length) return;

	const ids = targets.map((target) => {
		return target.uid;
	});
	ctx.msgs.push(['spread', ids]);
	attacker.recordSkillUse(skill, ctx, 'spread');
	for (const target of targets) {
		func(attacker, target, skill, 'spread', ctx);
	}
}
