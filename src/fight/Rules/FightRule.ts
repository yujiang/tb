import { FightBehavior } from '../FightBehavior';
import type { RuleData } from './RuleDatas';

// 一个单位可绑定多条固定规则，彼此不抢占AI的普通行动决策。
export class FightRule extends FightBehavior<RuleData> {
	constructor(xls: RuleData = { type: 'custom' }) {
		super(xls);
	}
}

// 与FightBuff一致，由基类入口导出工厂，具体规则只在工厂中组装。
export { createRule } from './RuleFactory';
