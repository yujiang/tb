import { Fight } from '../Fight';
import { FightLoopPC } from '../PC/FightLoopPC';
import { FightLoopWest } from './FightLoopWest';
import { FightLoopYanYu } from './FightLoopYanYu';

/** 按创建时的共享loopType选择驱动；不启动战斗，后续改配置不会替换已创建的循环。 */
export function createFightLoop(fight: Fight): FightLoopPC | FightLoopWest | FightLoopYanYu {
	switch (fight.globalData.loopType ?? 'pc') {
		case 'pc': return new FightLoopPC(fight);
		case 'west': return new FightLoopWest(fight);
		case 'yanyu': return new FightLoopYanYu(fight);
		default: throw new Error(`Unknown loopType: ${fight.globalData.loopType}`);
	}
}
