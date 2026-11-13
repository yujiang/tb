import { Fight } from "../../src/fight/Fight";
import { FightSide } from "../../src/fight/FightSide";

export function createFightAndSide(fid: number){
    const fight = new Fight(fid, {
        maxTurn: 100,
        waitInputSec: 1,
        duiwei: false,
    });
    fight.createMap(5,5);
    const s1 = new FightSide();
    const s2 = new FightSide();

    s1.createSimpleMonster(fight,[
        {name: 'a1', id: 1, pos: 1},
        {name: 'a2', id: 2, pos: 3},
        {name: 'a3', id: 3, pos: 5},
        {name: 'a4', id: 4, pos: 7},
    ])
    const u1 = s1.units[1];
    u1.die();

    s2.createSimpleMonster(fight,[
        {name: 'b1', id: 11, pos: 1},
        {name: 'b2', id: 12, pos: 3},
        {name: 'b3', id: 13, pos: 5},
        {name: 'b4', id: 14, pos: 7},
    ])
    // const u2 = s2.units[2];
    // u2.die();

    fight.createSide(s1, s2);
    return fight;
}