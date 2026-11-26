import type { FightContex } from './Fight';
import type { FightSide } from './FightSide';
import type { FightUnit } from './Unit/FightUnit';
import { FightCmdEnum } from './struct';

type PendingUltimate = { unit: FightUnit; targetUid: number; ctx: FightContex };

// 最后一面盾破碎时记录实际攻击者，完整动作及胜负检查后自动施放其装配大招。
export class FightUltimate {
	private usedTurn = -1;
	private pending?: PendingUltimate;

	constructor(private readonly side: FightSide) {}

	reset() {
		this.usedTurn = -1;
		this.pending = undefined;
	}

	isAllShieldBroken(): boolean {
		const units = this.side.units.filter((unit) => !unit.isDied());
		return (
			units.length > 0 && units.every((unit) => unit.isMonster() && unit.attr.shield === 0)
		);
	}

	onShieldBreak(
		unit: FightUnit,
		ctx: FightContex,
		attacker: FightUnit,
		allBroken: boolean,
	): boolean {
		const fight = ctx.fight;
		if (!fight.globalData.allShieldBreak || !allBroken || attacker.side === unit.side) {
			return false;
		}

		if (this.usedTurn === fight.turn) return false;

		// 登记即占用本回合触发；没有大招、执行受阻或回盾都不转交队友、不保留机会。
		this.usedTurn = fight.turn;
		this.pending = { unit: attacker, targetUid: unit.uid, ctx };
		return true;
	}

	// Fight先取走双方记录，再依次执行，避免嵌套动作收尾重复消费另一边。
	takePending() {
		const pending = this.pending;
		this.pending = undefined;
		return pending;
	}
	processPending(pending?: PendingUltimate) {
		if (!pending) return;

		const { unit, targetUid, ctx } = pending;
		const fight = ctx.fight;
		if (!fight.globalData.allShieldBreak || fight.isEnd()) return;

		const skill = unit.getUltimateSkill();
		if (!skill) return;

		// 单体追击最后被破盾者；群体沿用自身选人，目标已失效则复用公共回退规则。
		const input = fight.prepareActionInput(unit, {
			cmd: FightCmdEnum.skill,
			skill: skill.getId(),
			ultimate: true,
			...(skill.isMulti() ? {} : { target: targetUid }),
		});
		if (!fight.checkPC(unit, input)) return;

		const result = fight.processUnit(unit, input);
		if (!result?.actionStarted) return;

		ctx.msgs.push(['actor', unit.uid, unit.getSpeed(), 'ultimate'], ...result.msgs);
	}
}
