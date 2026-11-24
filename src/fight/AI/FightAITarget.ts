import { FightAI, isContributionsType } from './FightAI';
import type { FightUnit } from '../Unit/FightUnit';
import type { FightSkill } from '../Skills/FightSkill';
import { FightBehavior } from '../FightBehavior';

// 选择方法与使用的技能独立配置；只决定普通行动，技能结算与嘲讽仍走公共流程。
export class FightAITarget extends FightAI {
	override findTarget(unit: FightUnit, turn: number, skill: FightSkill) {
		const xls = this.getXls();
		if (!FightBehavior.inCond(unit, turn, xls.cond, xls.condData)) return;

		if (xls.self) return unit;

		if (isContributionsType(this.xls.contributions)) {
			return this.findContributions(unit, skill);
		}

		if (this.xls.pos || this.xls.career) {
			return this.findCareerPos(unit, skill);
		}
	}

	// 从仇恨列表拿出对象
	findContributions(unit: FightUnit, skill: FightSkill): FightUnit | undefined {
		const ranked = FightBehavior.findContributionsRank(unit, this.xls.contributions);
		if (!ranked) return;

		const f = unit.fight;
		for (const [uid] of ranked) {
			const candidate = f.getUnitById(uid);
			if (candidate && f.isLegalTarget(unit, candidate, skill)) {
				return candidate;
			}
		}
	}

	findCareerPos(unit: FightUnit, skill: FightSkill): FightUnit | undefined {
		const finds = FightBehavior.findCareerPos(
			unit,
			this.xls.friend,
			this.xls.career,
			this.xls.pos,
		);
		if (!finds) return;

		const f = unit.fight;
		const finds2 = finds.filter((candidate) => f.isLegalTarget(unit, candidate, skill));

		return f.randArray(finds2);
	}
}
