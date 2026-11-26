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

		if (cost.sp && (point.sp ?? 0) < cost.sp) {
			this.hintClient('怒气不足，无法支付技能消耗');
			return false;
		}

		if (this.fight?.globalData.jiqi && cost.jp && (point.jp ?? 0) < cost.jp) {
			this.hintClient('集气不足，无法支付技能消耗');
			return false;
		}

		return true;
	}

	costSkill(cost: SkillCost, ctx: FightContex) {
		if (!this.canCost(cost)) return false;

		const point = this.attr.point;
		const previousHp = point.hp;
		if (cost.hp) {
			point.hp -= cost.hp;
			ctx.msgs.push(['costHp', this.uid, cost.hp, point.hp]);
		}
		if (cost.mp) {
			point.mp -= cost.mp;
			ctx.msgs.push(['costMp', this.uid, cost.mp, point.mp]);
		}
		if (cost.sp) {
			point.sp -= cost.sp;
			ctx.msgs.push(['costSp', this.uid, cost.sp, point.sp]);
		}
		if (ctx.fight.globalData.jiqi && cost.jp) {
			point.jp -= cost.jp;
			ctx.msgs.push(['costJp', this.uid, cost.jp, point.jp]);
		}
		// 先完成整笔扣费，hp监听中重算属性也不会让其他费用写入过期的point对象。
		if (point.hp !== previousHp) {
			this.emitContext('hp', ctx, this, previousHp, point.hp);
		}
		return true;
	}
}

export class FightUnitUser extends FightUnitCost {
	override type = UnitType.user;
	/** 本场尚未使用的备用宠物：键为宿主宠物配置ID（0有效），工厂创建全新、存活且UID唯一的实例；成功召唤后删除，初始出战宠物不加入。 */
	readonly summons = new Map<number, () => FightUnitSummon>();
}

export class FightUnitSummon extends FightUnitCost {
	override type = UnitType.summon;

	/** 主人FightUnit的uid，由宿主创建召唤物时设置，0有效；dismiss通过此字段校验操作者，不配置时不能被指令移除。 */
	user: number;
}
