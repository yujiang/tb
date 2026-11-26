import { FightContex } from '../Fight';
import { FightUnit } from '../Unit/FightUnit';
import { FightSkill } from './FightSkill';
import { magicAttackFunc } from './Funcs/NomalSkill';
import { SkillData } from './SkillDatas';
import { canAttackSkill } from './AttackChecks';

// 优先用装备的技能反击，最后采用attackBack

const PhysicFBackData: SkillData = {
	id: 0,
	name: 'fback',
	magic: false,
	rand: 1,

	sel: null,
	attack: null,
	final: null,
};

class PhysicFBackSkill extends FightSkill {
	constructor(unit: FightUnit) {
		super(
			{
				...PhysicFBackData,
				attack: unit.attr.physic.fback,
				final: unit.attr.physic.final,
				rand: unit.attr.physic.fback.rand,
			},
			1,
		);
	}

	// 否则没完没了
	override canFBack() {
		return false;
	}
}

class MagicFBackSkill extends FightSkill {
	// 否则没完没了
	override canFBack() {
		return false;
	}
}

// 物理反击
function attackFback(attacker: FightUnit, defender: FightUnit, ctx: FightContex) {
	const skill = new PhysicFBackSkill(attacker);
	return magicAttackFunc(attacker, defender, skill, ctx, 'fback');
}

export function skillFBack(
	attacker: FightUnit,
	defender: FightUnit,
	skill: FightSkill,
	ctx: FightContex,
) {
	if (!canAttackSkill(attacker, defender, skill, 'fback')) {
		return false;
	}

	ctx.fbackNum = (ctx.fbackNum || 0) + 1;
	const data = skill.getXls();
	const guaranteed = ctx.blocked === true && data.fbackOnBlock === true;
	const magic = new MagicFBackSkill(guaranteed ? { ...data, rand: 1 } : data, skill.level);

	const ft = skill.isMagic() ? attacker.attr.magic : attacker.attr.physic;
	magic.mergeAttack(ft.fback, ft.final);

	return magicAttackFunc(attacker, defender, magic, ctx, 'fback');
}

export function tryFBack(attacker: FightUnit, defender: FightUnit, ctx: FightContex) {
	const fback = attacker.getFBackSkill();
	if (fback) {
		return skillFBack(attacker, defender, fback, ctx);
	}

	if (!canAttackSkill(attacker, defender, null, 'fback')) {
		return false;
	}

	return attackFback(attacker, defender, ctx);
}

// 尝试吸血
// bloodP:技能填多少就是多少，没有才用人物身上的，好像也没毛病
export function tryBlood(
	attacker: FightUnit,
	defender: FightUnit,
	magic: boolean,
	damage: number,
	bloodP: number | undefined,
	ctx: FightContex,
) {
	const p =
		bloodP ?? (magic ? attacker.attr.magic.final.bloodP : attacker.attr.physic.final.bloodP);
	if (p > 0) {
		damage *= p;
		attacker.onHeal(attacker, 'blood', damage, ctx);
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
