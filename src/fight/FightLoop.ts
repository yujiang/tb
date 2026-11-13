import { Fight } from "./Fight";
import { FightUnit, sortByAttr } from "./Unit/FightUnit";
import { FightInput } from "./struct";

export abstract class FightLoop {
    fight: Fight;
    constructor(fight: Fight) {
        this.fight = fight;
    }

    abstract processBeforeTurn(): void;

    abstract processOneTurn(): Promise<void>;

    abstract processAfterTurn(): void;

    async run() {
        const f = this.fight;
        while(!f.isEnd()){
            this.nextTurn();
            //console.log(f);
            if (f.isEnd()) {
                break;
            }
            this.processBeforeTurn();             
            if (f.isEnd()) {
                break;
            }
            await this.waitInput();
            await this.processOneTurn();
            await this.waitDrawOver();
            this.processAfterTurn(); //回合后主要处理死亡等            
        }
        return this.fight.win;
    }

    nextTurn() {
        this.fight.nextTurn();
    }

    // return 0: 超时, 1: 正常结束
    async waitInput(): Promise<number>{
        return 1;
    }
    abstract onInput(id: number, input: FightInput): void;

    async waitDrawOver(){}

    processUnits: FightUnit[];
    sortUnitsByProcess(){
        const all = this.fight.getAllUnits();
        sortByAttr(all, "speed", true);
        this.processUnits = all; //但是如果有插队,降速会扰乱出手表?

        //const debug = all.map(u => `${u.getName()} ${u.getSpeed()}`);
        //console.log("sortUnitsByProcess", debug);

        return all;
    }
    
}

