
import { SelectMainParam, TargetSelectEnum } from '../../src/fight/struct';
import { createFightAndSide } from './help';

function run(){
    const fight = createFightAndSide(100);
    const s0 = fight.Sides[0];
    const s1 = fight.Sides[1];
    
    const param1:SelectMainParam = { target:TargetSelectEnum.duiwei, };
    const t0 = fight.selectMainTarget(s0.units[2],param1);
    console.log("t0",t0.dump());
    const param2:SelectMainParam = { target:TargetSelectEnum.enmey, };
    const t1 = fight.selectMainTarget(s1.units[2],param2);
    console.log("t1",t1.dump());
}

run();