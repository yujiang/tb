import { createFightAndSide } from './help';

async function run(){
    const fight = createFightAndSide(100);
    const s0 = fight.Sides[0];
    const s1 = fight.Sides[1];
}

run();