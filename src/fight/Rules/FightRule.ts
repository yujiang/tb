import { FightBehavior } from '../FightBehavior';
import type { RuleData } from '../Datas/RuleDatas';
import type { FightUnit } from '../Unit/FightUnit';
import type { FightContex } from '../Fight';

// 一个单位可绑定多条固定规则，彼此不抢占AI的普通行动决策。
export class FightRule extends FightBehavior<RuleData> {
	constructor(xls: RuleData = { type: 'custom' }) {
		super(xls);
	}
	override startFight(unit: FightUnit, ctx?: FightContex) {}
	// 移除规则只解绑规则监听；此前添加的Buff继续按自身生命周期生效。
	remove(unit: FightUnit, ctx?: FightContex) {
		this.unbind(unit);
	}
}

// 与FightBuff一致，由基类入口导出工厂，具体规则只在工厂中组装。
export { createRule } from './RuleFactory';
