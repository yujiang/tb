import { FightContex } from '../Fight';
import { FightUnit, PendingHurt, UnitContextEventFunc } from '../Unit/FightUnit';
import { BuffData, BuffTurnEnum } from '../Datas/BuffDatas';
import { findForbidStatusByAction } from './FightStatus';
import { buffFunc } from './BuffFuncType';
import { FightStatic } from '../Passives/FightStatic';
import type { FightSkill } from '../Skills/FightSkill';
import type { SkillUseType } from '../struct';

export const MAX_POWER = 9999;
export const MAX_LEVEL = 100;

export class FightBuff extends FightStatic {
	protected override xls: BuffData;
	start = 0;
	lastTurn = 0;
	times = 0;
	attacker: FightUnit;
	private lastProcessedTurn: number;

	//level用于
	constructor(xls: BuffData, level: number, attacker: FightUnit, turn: number) {
		super(xls, level);
		this.attacker = attacker;
		this.start = turn;
		this.lastProcessedTurn = turn;
		this.lastTurn = xls.lastTurn;
		this.times = xls.times || 0;
	}

	// 普通次数Buff按配置选择事件；特殊类覆盖为对应事件类型，绑定处保留完整检查。
	func: UnitContextEventFunc<any>;
	onEvent(unit: FightUnit, ctx: FightContex, ...args: unknown[]) {
		this.consumeTimes(unit, ctx);
	}

	// 普通次数 Buff 和特殊类共用计次、增量同步与自然移除。
	protected consumeTimes(unit: FightUnit, ctx: FightContex) {
		// 效果结算可能触发替换，旧实例不能按 ID 同步新实例的次数。
		if (unit.findBuff(this.getId()) !== this) return;

		if (this.times > 0) {
			this.times--;
			if (!this.notDisplay())
				ctx.msgs.push(['buffTimes', unit.uid, this.getId(), this.times]);
			if (this.times <= 0) {
				unit.expireBuff(this, 'times', ctx);
			}
		}
	}

	onAdded(unit: FightUnit) {
		if (this.xls.event && this.times > 0) {
			const func = this.onEvent.bind(this);
			unit.onContex(this.xls.event, func, this.xls.prior ?? 0);
			this.func = func;
		}
	}

	onRemoved(unit: FightUnit) {
		if (this.xls.event && this.func) {
			unit.offContex(this.xls.event, this.func);
			this.func = null;
		}
	}

	override getXls() {
		return this.xls;
	}

	getTurnType() {
		return this.xls.turnType ?? BuffTurnEnum.thisTurn;
	}

	getOverlap() {
		return this.xls.overlap;
	}

	getFunc() {
		return this.xls.func;
	}

	// 特殊目标约束由具体 Buff 提供，普通 Buff 不改变目标。
	getTauntTarget(): FightUnit | undefined {
		return undefined;
	}

	// Buff只提供自己的额外伤害倍率，由单位统一汇总，不修改技能或单位基础属性。
	getDamageRate(unit: FightUnit, skill: FightSkill, type: SkillUseType): number {
		return 0;
	}

	blocksAction(): boolean {
		return findForbidStatusByAction('action')?.some((status) => this.inStatus(status)) ?? false;
	}

	// onTurn(turn: number){
	//     if (this.getTurnType() !== BuffTurnEnum.thisTurn) return false;
	//     return this.doTurn(turn);
	// }

	// inputStart(turn: number, inputTurn: number){
	//     if (this.getTurnType() !== BuffTurnEnum.inputTurn) return false;
	//     return this.doTurn(inputTurn);
	// }

	doTurn(unit: FightUnit, turn: number, ctx: FightContex) {
		if (turn <= this.lastProcessedTurn) return false;

		this.lastProcessedTurn = turn;
		const end = this.start + this.lastTurn;
		if (this.lastTurn > 0 && turn > end) {
			return true;
		}

		if (this.xls.func && !unit.isDied() && !ctx.fight.isEnd()) {
			buffFunc(unit, this, ctx);
		}
		return this.lastTurn > 0 && turn >= end;
	}

	getPower() {
		return this.xls.power ?? 0;
	}

	// 用于buff替换
	greatPower(power: number, lv: number) {
		return this.getPower() > power || (power == this.getPower() && this.level >= lv);
	}

	// 武器装备的buf可能死亡也需要保留
	canRemoveByDie() {
		return !this.xls.dieNotRemove;
	}

	// 被动技能的无法remove
	canRemove(power: number) {
		if (this.xls.notRemove) return false;

		return power >= this.getPower();
	}

	notDisplay() {
		return this.xls.notDisplay;
	}

	// 展示元组：[ID, 等级, 添加边界, 持续边界数, 当前剩余次数]；不按次数到期时为0。
	getDisplayMsg() {
		if (this.notDisplay()) return;

		return [this.getId(), this.level, this.start, this.lastTurn, this.times];
	}

	isHpPendingInvalid(unit: FightUnit, pending: PendingHurt): boolean {
		// 分担的伤害不再触发保护或反射。
		return unit.isDied() || pending.cancelled || pending.source === 'share';
	}
}

// 具体子类的创建集中到工厂，这里保留原有导出路径。
export { createBuff } from './BuffFactory';
