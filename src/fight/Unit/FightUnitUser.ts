import { FightContex } from '../Fight';
import { SkillCost } from '../struct';
import { FightUnit, UnitType } from './FightUnit';

export class FightUnitCost extends FightUnit {
	override canCost(cost: SkillCost) {
		const point = this.attr.point;
		if (cost.hp && point.hp <= cost.hp) {
			this.hintClient('生命不足，无法支付技能消耗');
			return false;
		}

		if (cost.mp && point.mp < cost.mp) {
			this.hintClient('法力不足，无法支付技能消耗');
			return false;
		}

		return true;
	}

	costSkill(cost: SkillCost, ctx: FightContex) {
		if (!this.canCost(cost)) return false;

		const point = this.attr.point;
		if (cost.hp) {
			point.hp -= cost.hp;
			ctx.msgs.push(['costHp', this.uid, cost.hp, point.hp]);
		}
		if (cost.mp) {
			point.mp -= cost.mp;
			ctx.msgs.push(['costMp', this.uid, cost.mp, point.mp]);
		}
		return true;
	}
}

export class FightUnitUser extends FightUnitCost {
	override type = UnitType.user;
}

export class FightUnitSummon extends FightUnitCost {
	override type = UnitType.summon;
}
