import type { Fight, FightContex } from './Fight';
import type { FightUnit } from './Unit/FightUnit';
import { FightCmdEnum, FightInput, SkillCost } from './struct';
import { FightSkill } from './Skills/FightSkill';

type MimicRecord = { input: FightInput; skill?: FightSkill };

// 普通模仿保留全局最近攻击；高级模仿按单位保存最近实际行动，不记录反击等子反应。
export class FightMimic {
	private last?: MimicRecord;
	private byUnit = new Map<FightUnit, MimicRecord>();
	constructor(private fight: Fight) {}
	reset() {
		this.last = undefined;
		this.byUnit.clear();
	}
	hasRecord(unit: FightUnit): boolean {
		return this.byUnit.has(unit);
	}
	record(input: FightInput, ctx: FightContex | undefined, skill?: FightSkill) {
		if (!ctx?.actionStarted) return;

		if (input.cmd === FightCmdEnum.skill) {
			if (!skill || skill.getFunc() === 'mimic') {
				return;
			}
		}

		const record: MimicRecord = {
			input: { ...input },
			skill: skill ? new FightSkill(skill.getXls(), skill.level) : undefined,
		};
		this.byUnit.set(ctx.attack, record);
		if (
			input.cmd === FightCmdEnum.attack ||
			input.cmd === FightCmdEnum.none ||
			skill?.getFunc() === 'normal'
		) {
			this.last = record;
		}
	}
	private getCopy(unit: FightUnit, source?: FightUnit) {
		const record = source ? this.byUnit.get(source) : this.last;
		if (!record) return undefined;

		// 副本仅提供原配置和等级；费用及CD统一由内部指令标记控制。
		const skill = record.skill
			? new FightSkill(record.skill.getXls(), record.skill.level)
			: undefined;
		// 复用指令意图，不带入上一行动的回合号和自动大招内部标记。
		const { cmd, skill: id } = record.input;
		let target = record.input.target;
		if (
			source &&
			source.side !== unit.side &&
			[FightCmdEnum.attack, FightCmdEnum.none, FightCmdEnum.skill].includes(cmd)
		) {
			target = undefined;
		}
		const input: FightInput = { cmd, skill: id, target, ignoreCostCD: true };
		return { skill, input };
	}
	canUse(unit: FightUnit, ownCost?: SkillCost, source?: FightUnit): boolean {
		const copy = this.getCopy(unit, source);
		if (!copy) return false;

		if (ownCost && !unit.canCost(ownCost)) {
			return false;
		}

		const check = () =>
			this.fight.checkPC(unit, this.fight.prepareActionInput(unit, copy.input));
		return copy.skill ? unit.withTemporarySkill(copy.skill, check) : check();
	}
	process(unit: FightUnit, ctx: FightContex, source?: FightUnit): boolean {
		const copy = this.getCopy(unit, source);
		if (!copy) return false;

		const run = () => {
			const input = this.fight.prepareActionInput(unit, copy.input);
			if (!this.fight.checkPC(unit, input)) return false;

			const result = this.fight._executeUnit(unit, input, ctx);
			if (!result) return false;

			this.record(input, result, copy.skill);
			return true;
		};
		return copy.skill ? unit.withTemporarySkill(copy.skill, run) : run();
	}
}
