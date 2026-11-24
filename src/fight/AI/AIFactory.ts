import type { AIData } from './AIDatas';
import type { FightAI } from './FightAI';
import { FightAITarget } from './FightAITarget';

// 具体 AI 的创建集中到工厂；每次创建独立实例，不共享决策状态或监听。
export function createAI(data: AIData): FightAI {
	switch (data.type) {
		case 'target':
			return new FightAITarget(data);
		default:
			throw new Error(`Unknown AI type: ${data.type}`);
	}
}
