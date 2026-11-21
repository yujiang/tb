import type { Fight, FightContex } from './Fight';
import type { FightUnit } from './Unit/FightUnit';
import { EnemySide, FightCmdEnum, FightInput, FightSideEnum } from './struct';

type SideParam = {
	ready: boolean; // 已获得且尚未消费的机会，回盾不取消。
	usedTurn: number; // 消费或取消机会的回合。
	grantTurn: number; // 发放机会的回合，避免同回合重复发放。
	broken: boolean; // 反应链内登记，完整动作后发布。
};

function createSideParam(): SideParam {
	return { ready: false, usedTurn: -1, grantTurn: -1, broken: false };
}

// 管理一场战斗的破盾大招：登记事件、发放/消费机会、校验及执行，复用Fight的公共技能管线。
export class FightUltimate {
	private sideParam: [SideParam, SideParam] = [createSideParam(), createSideParam()];
	private context: FightContex | undefined;
	private caster: FightUnit | undefined;

	constructor(private readonly fight: Fight) {}

	reset() {
		for (const param of this.sideParam) Object.assign(param, createSideParam());
		this.context = undefined;
		this.caster = undefined;
	}

	hasChance(side: FightSideEnum): boolean {
		const param = this.sideParam[side];
		return param.ready && param.usedTurn !== this.fight.turn && !this.fight.isEnd();
	}

	isCaster(unit: FightUnit): boolean {
		return this.caster === unit;
	}

	isAllShieldBroken(side: FightSideEnum): boolean {
		const units = this.fight.getSideUnits(side).filter((unit) => !unit.isDied());
		return (
			units.length > 0 && units.every((unit) => unit.isMonster() && unit.attr.shield === 0)
		);
	}

	// 登记最后一面盾被打破的事件；回盾不会撤销已经登记的事件。
	onShieldBreak(
		unit: FightUnit,
		ctx: FightContex,
		allBroken = this.isAllShieldBroken(unit.side),
	) {
		if (!this.fight.globalData.allShieldBreak) return;

		if (allBroken) {
			this.sideParam[EnemySide(unit.side)].broken = true;
			this.context = ctx;
		}
	}

	// 反应链中只保存上下文，完整动作及胜负检查后才发布机会增减消息。
	update(ctx: FightContex) {
		const fight = this.fight;
		if (!fight.globalData.allShieldBreak && !this.sideParam.some((param) => param.ready)) {
			return;
		}

		if (fight.isInAction()) {
			this.context = ctx;
			return;
		}

		this.context = undefined;
		for (const side of [FightSideEnum.attack, FightSideEnum.defend]) {
			const param = this.sideParam[side];
			const broken = param.broken;
			param.broken = false;
			let ready = param.ready;
			if (
				!fight.globalData.allShieldBreak ||
				fight.isEnd() ||
				param.usedTurn === fight.turn
			) {
				ready = false;
			} else if (broken && param.grantTurn !== fight.turn) {
				ready = true;
				param.grantTurn = fight.turn;
			}
			if (ready !== param.ready) {
				param.ready = ready;
				ctx.msgs.push(['ultimateReady', side, ready]);
			}
		}
	}

	// Fight在最外层动作退出时调用；失败的动作只清理暂存事件，不发布部分结算结果。
	finishAction(completed: boolean) {
		const context = this.context;
		this.context = undefined;
		if (!completed) {
			for (const param of this.sideParam) param.broken = false;
			return;
		}

		if (context) this.update(context);
	}

	check(unit: FightUnit, input: FightInput): boolean {
		const fight = this.fight;
		if (fight.isInAction()) {
			unit.hintClient('当前行动尚未结束');
			return false;
		}

		if (!fight.getAllUnits().includes(unit) || !this.hasChance(unit.side)) {
			unit.hintClient('当前没有大招机会');
			return false;
		}

		if (!unit.getUltimateSkill()) {
			unit.hintClient('未装备可用大招');
			return false;
		}

		if (
			input?.cmd !== FightCmdEnum.skill ||
			(input.skill !== undefined && input.skill !== unit.ultimateSkill)
		) {
			unit.hintClient('大招技能不匹配');
			return false;
		}

		return fight.checkPC(unit, { ...input, skill: unit.ultimateSkill }, true);
	}

	skip(side: FightSideEnum, ctx: FightContex) {
		this.sideParam[side].usedTurn = this.fight.turn;
		this.update(ctx);
	}

	process(unit: FightUnit, input: FightInput): FightContex | undefined {
		if (!this.check(unit, input)) return undefined;

		const fight = this.fight;
		const prepared = fight.preparePCInput(unit, { ...input, skill: unit.ultimateSkill });
		if (!prepared) return undefined;

		return fight.resolveAction(() => {
			const param = this.sideParam[unit.side];
			const previous = param.usedTurn;
			// 先占用整队机会，避免回调重入；费用、CD及反应链仍走公共技能流程。
			param.usedTurn = fight.turn;
			const caster = this.caster;
			let ctx: FightContex;
			this.caster = unit;
			try {
				ctx = fight.processUnit(unit, prepared);
			} finally {
				this.caster = caster;
			}
			if (!ctx) {
				param.usedTurn = previous;
				return undefined;
			}

			this.update(ctx);
			return ctx;
		});
	}
}
