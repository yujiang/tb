import { FightAI } from '../../src/fight/AI/FightAI';
import type { AIData } from '../../src/fight/AI/AIDatas';
import type { FightUnit } from '../../src/fight/Unit/FightUnit';

// 供生命周期及自定义指令测试使用；不参与选人，具体测试可覆盖waitInput。
export class EmptyAI extends FightAI {
	constructor(xls: AIData = { type: 'custom' }) {
		super(xls);
	}
	override findTarget(): FightUnit | undefined {
		return undefined;
	}
}
