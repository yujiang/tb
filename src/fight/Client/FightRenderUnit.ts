import type { FightClientUnit } from './FightClient';

/** 已经过客户端协议处理的表现上下文；不负责结算。 */
export interface FightRenderContext {
	/** 来源单位UID，0有效；周期或无来源事件可省略。 */
	actor?: number;
	/** 关联技能ID；无可靠关联时省略。 */
	skill?: number;
	/** 本次原因，如skill/dback/share/poison/blood。 */
	reason?: string;
	/** 结算后的生命值。 */
	hp?: number;
	/** 实际结算的暴击等效果标记。 */
	effects?: readonly string[];
	/** 减伤前的理论伤害，仅供mitigate表现。 */
	originalDamage?: number;
	/** 经过减伤后的伤害，不含剩余生命不足导致的截断。 */
	damage?: number;
	/** 同批次随后hurt消息的实际扣血；减伤文案可据此合并结果，省略时独立表现。 */
	actualDamage?: number;
}

/** 客户端单位表现入口；默认无效果，宿主可继承并仅重写需要的动画方法。方法按消息顺序同步派发，动画完成等待由宿主管理。 */
export class FightRenderUnit {
	constructor(readonly data: FightClientUnit) {}
	get uid(): number {
		return this.data.uid;
	}
	enter(): void {}
	ready(): void {}
	action(skill: number, target: number, reaction?: string): void {}
	miss(attacker: number, skill: number, reaction?: string): void {}
	block(attacker: number): void {}
	mitigate(amount: number, ctx: FightRenderContext = {}): void {}
	hurt(damage: number, ctx: FightRenderContext = {}): void {}
	heal(amount: number, ctx: FightRenderContext = {}): void {}
	die(ctx: FightRenderContext = {}): void {}
	relife(): void {}
	addBuff(id: number, source?: number, initial = false): void {}
	removeBuff(id: number, source?: number, reason = ''): void {}
	buffTimes(id: number, remaining: number): void {}
	defend(): void {}
	protect(target: number): void {}
	skillFailed(skill: number): void {}
	skipAction(buff?: number, status?: string): void {}
	dismiss(operator?: number): void {}
}
