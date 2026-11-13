
import {FightLoopWest} from '../../src/fight/Online/FightLoopOnline';
import { createFightAndSide } from './help';

async function run(){
    const fight = createFightAndSide(100);
    
    const loop = new FightLoopWest(fight);
    fight.xls.waitInputSec = 1;
    const win = await loop.run();
    console.log("win", win, "at turn", fight.turn);
}

run();