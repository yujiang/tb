import { getDefaultSkill } from '../../src/fight/Skills/FightSkill';

import { SelectParam, TargetSelectEnum } from '../../src/fight/struct';
import { createFightAndSide } from './help';

// 测试：运行手写地图示例，查看对位和敌方主目标的选择结果。
function run() {
	const fight = createFightAndSide(100);
	const s0 = fight.Sides[0];
	const s1 = fight.Sides[1];

	const param1: SelectParam = { target: TargetSelectEnum.duiwei };
	const t0 = fight.selectMainTarget(s0.units[2], getDefaultSkill(param1));
	console.log('t0', t0.dump());
	const param2: SelectParam = { target: TargetSelectEnum.enmey };
	const t1 = fight.selectMainTarget(s1.units[2], getDefaultSkill(param2));
	console.log('t1', t1.dump());
}

run();
