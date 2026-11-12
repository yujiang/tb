import { Fight } from "./Fight";

export class FightLoop {
    fight: Fight;
    constructor(fight: Fight) {
        this.fight = fight;
    }

    startLoop() {
        const f = this.fight;
        while(!f.isEnd()){
            f.nextTurn();
            //console.log(f);
            if (f.isEnd()) {
                break;
            }
            
        }
    }
}
