
import {Fight} from '../../src/fight/fight';
import { FightSide } from '../../src/fight/FightSide';
import { DiedSelectEnum, TargetSelectEnum } from '../../src/fight/struct';

function run(){
    const fight = new Fight(100);
    fight.createMap(5,5);
    const s1 = new FightSide();
    s1.createSimpleUnits([
        {name: 'a1', id: 1, pos: 1},
        {name: 'a2', id: 2, pos: 3},
        {name: 'a3', id: 3, pos: 4},
        {name: 'a4', id: 4, pos: 7},
    ])
    const u1 = s1.units[1];
    u1.die();

    const s2 = new FightSide();
    s2.createSimpleUnits([
        {name: 'b1', id: 11, pos: 1},
        {name: 'b2', id: 12, pos: 3},
        {name: 'b3', id: 13, pos: 4},
        {name: 'b4', id: 14, pos: 7},
    ])
    const u2 = s1.units[2];
    u2.die();
    
    const t1 = fight.selectTargets(s1.units[2],null,DiedSelectEnum.alive, TargetSelectEnum.duiwei);
    console.log("t1",t1);
    const t2 = fight.selectTargets(s2.units[2],null,DiedSelectEnum.alive, TargetSelectEnum.duiwei);
    console.log("t2",t2);
}

run();