import { FightLoopWest } from '../../src/fight/Online/FightLoopWest';
import { createFightAndSide } from './help';

// 测试：运行手写回合示例，查看战斗结束时的胜方和回合数。
async function run() {
	const fight = createFightAndSide(100);

	const loop = new FightLoopWest(fight);
	fight.xls.waitInputSec = 1;
	const win = await loop.run();
	console.log('win', win, 'at turn', fight.turn);
}

run();
