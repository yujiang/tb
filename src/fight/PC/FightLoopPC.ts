
// 单机游戏

import { FightLoop } from "../FightLoop";
import { FightInput } from "../struct";

// 每个单位单独下指令
export class FightLoopPC extends FightLoop {    
    processBeforeTurn(){};

    async processOneTurn(){

    };

    processAfterTurn(){};

    onInput(id: number, input: FightInput){}
}
 