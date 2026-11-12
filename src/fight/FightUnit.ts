import { Fight } from "./Fight";
import { FightAttr } from "./FightAttr";
import { DiedSelectEnum, FightDisplay, FightSideEnum } from "./struct";

// 战斗单元
export class FightUnit {
    id: number;
    attr: FightAttr; 
    display: FightDisplay;
    
   constructor(id: number, attr: FightAttr, display: FightDisplay) {
        this.id = id;
        this.attr = attr;
        this.display = display;
    }

    getName() {
        return this.display.name;
    }

    getAttr(key: string){
        return this.attr.getAttr(key);
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

export function sortByAttr(a: FightUnit[], key: string){
    return a.sort((a, b) => b.getAttr(key) - a.getAttr(key));
}