// 普通攻击

import { FightContex } from '../../Fight';
import { FightTypeAttr, BaseAttack, FinalAttack } from '../../FightAttr';
import { FightUnit } from '../../Unit/FightUnit';
import { FightSkill, getDefaultSkill } from '../FightSkill';
import { SkillData } from '../SkillDatas';
import { magicAttackFunc, skillAttackFunc } from './NomalSkill';

// const AttackBaseRand = {
//     next : 0,
//     kill : 0,
//     back : 0,
// }

// const DamageLost = {
//     healSpread : 0.75,
//     skillSpread : 0.7,
//     nextAttack : 0.8,
// }

const PhysicData: SkillData = {
	id: 0,
	name: 'physic',
	magic: false,
	rand: 1,

	sel: null,
	attack: null,
	final: null,
};

class PhysicSkill extends FightSkill {
	unit: FightUnit;
	physic: FightTypeAttr;

	constructor(name: string, unit: FightUnit, attack: BaseAttack, final: FinalAttack) {
		super({ ...PhysicData, attack, final, rand: name === 'physic' ? 1 : attack.rand }, 1);
		this.unit = unit;
		this.physic = unit.attr.physic;
		this.name = name;
	}

	name: string;
	override getName() {
		return this.name;
	}

	override getNextSkill(): FightSkill {
		return new PhysicSkill('next', this.unit, this.physic.next, this.physic.final);
	}
	override getKillSkill(): FightSkill {
		return new PhysicSkill('kill', this.unit, this.physic.kill, this.physic.final);
	}
	override getSpreadSkill(): FightSkill {
		return new PhysicSkill('spread', this.unit, this.physic.spread, this.physic.final);
	}

	override canBlood() {
		return true;
	}
	override canDBack() {
		return true;
	}
	override canFBack() {
		return true;
	}
	override canProtect() {
		return true;
	}
}

export function attackFunc(attacker: FightUnit, defender: FightUnit, ctx: FightContex) {
	const equipped = attacker.getAttackSkill();
	const f = ctx.fight;
	const taunt = f.getTauntBuff(attacker, equipped ?? f.getDefaultSkill());
	if (equipped) {
		const result = skillAttackFunc(attacker, defender, equipped, ctx);
		if (taunt && taunt.getTauntTarget() === defender) {
			attacker.emitContext('taunt', ctx, taunt);
		}
		return result;
	}

	const skill = new PhysicSkill(
		'physic',
		attacker,
		attacker.attr.physic.base,
		attacker.attr.physic.final,
	);
	const result = magicAttackFunc(attacker, defender, skill, ctx);
	if (taunt && taunt.getTauntTarget() === defender) {
		attacker.emitContext('taunt', ctx, taunt);
	}
	return result;
}
