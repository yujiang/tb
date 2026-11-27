import type { RuleData } from '../Datas/RuleDatas';
import type { FightRule } from './FightRule';
import { FightRuleHp } from './FightRuleHp';
import { FightRuleTurn } from './FightRuleTurn';
import { FightRuleHurt } from './FightRuleHurt';
import { FightRuleShieldAdd } from './FightRuleShieldAdd';

// 具体 Rule 的创建集中到工厂；每次创建独立实例，不共享血线、计数或监听。
export function createRule(data: RuleData): FightRule {
	switch (data.type) {
		case 'hp':
			return new FightRuleHp(data);
		case 'turn':
			return new FightRuleTurn(data);
		case 'hurt':
			return new FightRuleHurt(data);
		case 'shieldAdd':
			return new FightRuleShieldAdd(data);
		default:
			throw new Error(`Unknown rule type: ${data.type}`);
	}
}
