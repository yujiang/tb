import { Fight } from "./Fight";
import { attackFunc, FightContex, fightMsg } from "./Skills/NormalAttack";
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
    getSpeed(){
        return this.attr.getSpeed();
    }

    getAttr(key: string){
        return this.attr.getAttr(key);
    }

    // 加入仇恨列表
    enemyHurt : Map<number, number> = new Map();
    addEnemy(attacker: FightUnit, hp: number){
        if (attacker == this) return;
        this.enemyHurt.set(attacker.uid, this.enemyHurt.get(attacker.uid) + hp)
    }
    clearEnemy(){
        this.enemyHurt.clear();
    }
    getEnemyTop(num: number) : number[]{
        // sort Enemy
        let arr = Array.from(this.enemyHurt.entries()).sort((a, b) => b[1] - a[1]);
        return arr.slice(0, num).map((v) => v[0]);
    }
    
    onHurt(attacker: FightUnit, hp: number, ctx:FightContex){
        ctx.msgs.push(["hurt",this.uid, hp, this.attr.hp])
        this.attr.hp -= hp;
        this.addEnemy(attacker, hp);
        this.emit("hurt", attacker, hp);
        if(this.attr.hp <= 0){  
            ctx.msgs.push(["die",this.uid])
            this.die();
            this.fight.onDie(this);
        }
    }
    onHeal(attacker: FightUnit, hp: number, ctx:FightContex){
        ctx.msgs.push(["heal",this.uid, hp, this.attr.hp])
        this.addEnemy(attacker, hp);
        this.attr.hp = Math.max(this.attr.hp + hp, this.attr.hpMax);
        this.emit("heal", attacker, hp);
    }

    emit(event: string, ...args: any[]){
        this.fight.emitUnitEvent(this, event, ...args);
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
        if (!die) { // DiedSelectEnum.all
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
        if (this.isDied()) return;
        const input = this.input || {cmd: FightCmdEnum.none};
        return this.fight.processUnit(this, input);
    }


    abstract inputStart(): void

    onInput(input: FightInput){
        this.input = input;
        if (input.cmd == FightCmdEnum.cancel){
            this.input = null;
        }
        return true;
    }

    dump() {
        return {
            uid: this.uid,
            name: this.getName(),
            side: this.side,
            pos: this.pos,
        }
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
        return a.sort((a, b) => b.getAttr(key) - a.getAttr(key));
    }
    return a.sort((a, b) => a.getAttr(key) - b.getAttr(key));
}