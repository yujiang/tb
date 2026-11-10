import { Fight } from "./Fight";
import { DiedSelectEnum, FightSideEnum } from "./struct";

// 战斗单元
export class FightUnit {
    name: string;
    id: number;
    constructor(name: string, id: number) {
        this.name = name;
        this.id = id;
    }

    side: FightSideEnum;
    pos: number;
    setSidePos(side: FightSideEnum, pos: number) {
        this.side = side;
        this.pos = pos;
    }

    fight: Fight;
    setFight(fight: Fight) {
        this.fight = fight;
    }

    dead = false;
    isDied() {
        return this.dead;
    }
    die() {
        this.dead = true;
    }
    relife(){
        this.dead = false;
    }

    isFillterDie(die: DiedSelectEnum){
        if (die == DiedSelectEnum.all) {
            return true;
        } else if (die == DiedSelectEnum.alive) {
            return !this.dead;
        } else if (die == DiedSelectEnum.die) {
            return this.dead;
        }
    }
}