import type { Fight, FightContex } from './Fight';
import type { FightUnit } from './Unit/FightUnit';
import { FightCmdEnum, FightSideEnum } from './struct';

// 最后一面盾破碎时记录实际攻击者，完整动作及胜负检查后自动施放其装配大招。
export class FightUltimate {
	private usedTurn: [number, number] = [-1, -1];
	private pending: { unit: FightUnit; targetUid: number; ctx: FightContex }[] = [];

	constructor(private readonly fight: Fight) {}

	reset() {
		this.usedTurn = [-1, -1];
		this.pending.length = 0;
	}

	isAllShieldBroken(side: FightSideEnum): boolean {
		const units = this.fight.getSideUnits(side).filter((unit) => !unit.isDied());
		return (
			units.length > 0 && units.every((unit) => unit.isMonster() && unit.attr.shield === 0)
		);
	}

	onShieldBreak(unit: FightUnit, ctx: FightContex, attacker: FightUnit, allBroken: boolean) {
		if (!this.fight.globalData.allShieldBreak || !allBroken || attacker.side === unit.side) {
			return;
		}

		if (this.usedTurn[attacker.side] === this.fight.turn) return;

		// 登记即占用本回合触发；没有大招、执行受阻或回盾都不转交队友、不保留机会。
		this.usedTurn[attacker.side] = this.fight.turn;
		this.pending.push({ unit: attacker, targetUid: unit.uid, ctx });
	}

	finishAction(completed: boolean) {
		const pending = this.pending;
		this.pending = [];
		if (!completed) return;

		for (const { unit, targetUid, ctx } of pending) {
			if (!this.fight.globalData.allShieldBreak || this.fight.isEnd()) return;

			const skill = unit.getUltimateSkill();
			if (!skill) continue;

			// 单体追击最后被破盾者；群体沿用自身选人，目标已失效则复用公共回退规则。
			const input = this.fight.prepareActionInput(unit, {
				cmd: FightCmdEnum.skill,
				skill: skill.getId(),
				ultimate: true,
				...(skill.isMulti() ? {} : { target: targetUid }),
			});
			if (!this.fight.checkPC(unit, input)) continue;

			const result = this.fight.processUnit(unit, input);
			if (!result?.actionStarted) continue;

			ctx.msgs.push(['actor', unit.uid, unit.getSpeed(), 'ultimate'], ...result.msgs);
		}
	}
}
