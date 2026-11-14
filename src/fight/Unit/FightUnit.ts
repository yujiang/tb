import { Fight } from "../Fight";
import { FightContex } from "../Skills/NormalAttack";
import { FightAttr } from "../FightAttr";
import { DiedSelectEnum, FightCmdEnum, FightDisplay, FightInput, FightSideEnum } from "../struct";
import { FightSkill, SkillCost } from "../Skills/FightSkill";
import { getSkillData } from "../Skills/SkillDatas";

export enum UnitType{
    user,
    summon,
    monster, //npc
}

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
    
    
    onHurt(attacker: FightUnit, why: string, hp: number, crit: boolean, ctx:FightContex){
        const point = this.attr.point;
        point.hp -= hp;
        ctx.msgs.push(["hurt", why, this.uid, attacker.uid, hp, crit ? 1 : 0, point.hp])
        this.addEnemy(attacker, hp);
        this.emit("hurt", attacker, hp, crit);
        if(point.hp <= 0){  
            ctx.msgs.push(["die",this.uid])
            this.die();
            this.fight.onDie(this);
        }
    }

    // 加入仇恨列表
    friendHeal : Map<number, number> = new Map();
    addFriend(attacker: FightUnit, hp: number){
        if (attacker == this) return;
        this.friendHeal.set(attacker.uid, this.friendHeal.get(attacker.uid) + hp)
    }
    clearFriend(){
        this.friendHeal.clear();
    }
    getFriendTop(num: number) : number[]{
        // sort Enemy
        let arr = Array.from(this.friendHeal.entries()).sort((a, b) => b[1] - a[1]);
        return arr.slice(0, num).map((v) => v[0]);
    }
        
    onHeal(attacker: FightUnit, why: string, hp: number, crit:boolean, ctx:FightContex){
        const point = this.attr.point;
        ctx.msgs.push(["heal", why, this.uid, attacker.uid, hp, crit ? 1 : 0, point.hp])
        this.addFriend(attacker, hp);
        point.hp = Math.min(point.hp + hp, point.hpMax);
        this.emit("heal", attacker, why, hp, crit);
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

    type: UnitType;
    isUser() {return UnitType.user == this.type;}
    isUserSummon() {return UnitType.summon == this.type;}
    isMonster() {return UnitType.monster == this.type;}
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

    abstract costSkill(cost: SkillCost, ctx: FightContex): boolean;

    skills = new Map<number,FightSkill>();
    findSkill(id: number) : FightSkill{
        if (!id) return;
        return this.skills.get(id);
    }

    backSkill = 0;
    getBackSkill(){
        return this.findSkill(this.backSkill);
    }

    addSkill(id: number, level: number){
        const data = getSkillData(id);
        if (!data) return;
        const skill = new FightSkill(data, level);
        this.skills.set(id, skill);
        return skill;
    }
}

// descend降序
export function sortByAttr(a: FightUnit[], key: string, descend = false){
    if (descend) {
        return a.sort((a, b) => b.getAttr(key) - a.getAttr(key));
    }
    return a.sort((a, b) => a.getAttr(key) - b.getAttr(key));
}