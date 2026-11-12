import { Fight } from "./Fight";
import { calcAttack } from "./FightAttack";
import { FightAttr } from "./FightAttr";
import { DiedSelectEnum, FightCmdEnum, FightDisplay, FightInput, FightSideEnum } from "./struct";


// 战斗单元
export abstract class FightUnit {
    uid: number;
    attr: FightAttr; 
    display: FightDisplay;
    
   constructor(id: number, attr: FightAttr, display: FightDisplay) {
        this.uid = id;
        this.attr = attr;
        this.display = display;
    }

    getName() {
        return this.display.name;
    }

    getAttr(key: string){
        return this.attr.getAttr(key);
    }
    onHurt(attacker: FightUnit, hp: number){
        console.log(attacker.uid, "attack", this.uid, "hp", hp)
        this.attr.hp -= hp;
        if(this.attr.hp <= 0){  
            console.log(this.uid, "die")
            this.die();
            this.fight.onDie(this)
        }
    }

    pos: number;
    setPos(pos: number) {
        this.pos = pos;
    }

    fight: Fight;
    side: FightSideEnum;
    setFight(fight: Fight, side: FightSideEnum) {
        this.fight = fight;
        this.side = side;
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

    isUser() {return false;}
    isUserSummon() {return false;}
    isMonster() {return false;}
    needInput() {return this.isUser() || this.isUserSummon();}

    input: FightInput;
    // 回合前处理, buff
    processBeforeTurn(){}
    // 回合后处理, dead...
    processAfterTurn(){}
    processOneTurn(){
        const input = this.input || {cmd: FightCmdEnum.none};
        this.fight.processUnit(this, this.input);
    }


    abstract inputStart(): void

    onInput(input: FightInput){
        this.input = input;
        if (input.cmd == FightCmdEnum.cancel){
            this.input = null;
        }
        return true;
    }

    attack(target: FightUnit){
        // send msg to client...
        calcAttack(this, target);
        // send result to client...
    }
}

export class FightUnitUser extends FightUnit {
    override isUser() {return true;}
    inputStart(){
        this.input = null;        
        // send msg to client ...
    }    
}

export class FightUnitSummon extends FightUnit {
    override isUserSummon() {return true;}
    inputStart(){
        this.input = null;        
        // send msg to client ...
    }    
}

export class FightUnitMonster extends FightUnit {
    override isMonster() {return true;}
    inputStart(){
        // ai来做选择
        this.input = {cmd: FightCmdEnum.none};
    }
}

// descend降序
export function sortByAttr(a: FightUnit[], key: string, descend = false){
    if (descend) {
        return a.sort((a, b) => -b.getAttr(key) + a.getAttr(key));
    }
    return a.sort((a, b) => a.getAttr(key) - b.getAttr(key));
}