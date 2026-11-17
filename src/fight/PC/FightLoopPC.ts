
// 单机游戏

import { FightLoop } from "../FightLoop";
import { FightInput } from "../struct";

// 每个单位单独下指令
export class FightLoopPC extends FightLoop {    
    processBeforeTurn(turn: number){};

    async processOneTurn(turn: number){

    };

    processAfterTurn(turn: number){};

    onInput(id: number, input: FightInput){}
}
 