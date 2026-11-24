import { FightAI, isContributionsType } from './FightAI';
import type { FightContex } from '../Fight';
import type { FightUnit } from '../Unit/FightUnit';
import type { FightSkill } from '../Skills/FightSkill';
import { FightCmdEnum, FightInput } from '../struct';
import { FightBehavior } from '../FightBehavior';
import { getDefaultSkill } from '../Skills/FightSkill';

// 选择方法与使用的技能独立配置；只决定普通行动，技能结算与嘲讽仍走公共流程。
export class FightAITarget extends FightAI {
	override waitInput(unit: FightUnit, turn: number, ctx: FightContex): FightInput | undefined {
		const id = this.getSkillId();
		const skill =
			id !== undefined ? unit.findSkill(id) : (unit.getAttackSkill() ?? getDefaultSkill());
		const cmd = id !== undefined ? FightCmdEnum.skill : FightCmdEnum.attack;
		if (!skill) return undefined;

		const target = this.findTarget(unit, skill);
		if (!target) return undefined;

		const input: FightInput =
			id !== undefined ? { cmd, skill: id, target: target.uid } : { cmd, target: target.uid };
		return ctx.fight.checkPC(unit, input) ? input : undefined;
	}

	findTarget(unit: FightUnit, skill: FightSkill) {
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
			if (
				candidate &&
				f.getAllUnits().includes(candidate) &&
				f.isLegalTarget(unit, candidate, skill)
			) {
				return candidate;
			}
		}

		return undefined;
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
