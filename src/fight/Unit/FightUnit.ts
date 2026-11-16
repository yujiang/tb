import { Fight } from "../Fight";
import { FightContex } from "../Skills/NormalAttack";
import { FightAttr } from "../FightAttr";
import { DiedSelectEnum, FightCmdEnum, FightDisplay, FightInput, FightSideEnum } from "../struct";
import { FightSkill, SkillCost } from "../Skills/FightSkill";
import { getSkillData } from "../Skills/SkillDatas";
import { createBuff, FightBuff} from "../Buffs/FightBuff";
import { findForbidStatusByAction } from "../Buffs/FightStatus";
import { OverlapEnum } from "../Buffs/BuffDatas";
import { PassiveSkill } from "../Buffs/PassiveSkill";
import { calcAttr } from "../Skills/Calc";

export enum UnitType{
    user,
    summon,
    monster, //npc
}


export type FightUnitEvent = 
    'die' | 'relife' | 'hurt' | 'heal' | 'addBuff' | "removeBuff" | "attr" | "speed";


// 战斗单元
export abstract class FightUnit {
    uid: number;
    attr: FightAttr; 
    attrOri: FightAttr; 
    display: FightDisplay;
    
   constructor(id: number, attr: FightAttr, display: FightDisplay, passiveSkills: PassiveSkill[] = []) {
        this.uid = id;
        this.attrOri = attr;
        this.display = display;
        this.setPassiveSkills(passiveSkills);
    }

    getName() {
        return this.display.name;
    }

    speedRand = 0;      // 乱敏，用来排序出手
    getSpeed(){
        return this.attr.getSpeed();
    }
    getSpeedOrder() {
        return this.getSpeed() + this.speedRand;
    }

    startFight(f: Fight){
        this.speedRand = this.getSpeed() * (f.random() * 0.2 - 0.1);
    }

    getHp(){
        return this.attr.point.hp;
    }
    getHpMax(){
        return this.attr.point.hpMax;
    }

    getAttr(key: string){
        return this.attr.getAttr(key);
    }

    // 加入仇恨列表
    enemyHurt : Map<number, number> = new Map();
    addEnemy(attacker: FightUnit, hp: number){
        if (attacker == this) return;
        this.enemyHurt.set(attacker.uid, (this.enemyHurt.get(attacker.uid) ?? 0) + hp)
    }
    clearEnemy(){
        this.enemyHurt.clear();
    }
    getEnemyTop(num: number) : number[]{
        // sort Enemy
        let arr = Array.from(this.enemyHurt.entries()).sort((a, b) => b[1] - a[1]);
        return arr.slice(0, num).map((v) => v[0]);
    }
    
    onHurt(attacker: FightUnit, why: string, hp: number, ctx:FightContex){
        if (this.isDied()) return 0;
        if (this.isDefend()) {
            hp *= 0.5;
        }     
        hp = Math.min(this.getHp(), Math.max(0, Math.floor(hp)));

        const point = this.attr.point;
        point.hp -= hp;
        ctx.msgs.push(["hurt", why, this.uid, attacker.uid, hp, point.hp, ctx.effects])
        this.addEnemy(attacker, hp);
        this.emit("hurt", attacker, hp, ctx);
        if(point.hp <= 0){  
            ctx.msgs.push(["die",this.uid])
            this.onDie(attacker, why, ctx);
            this.fight.onDie(this);
        }
        return hp;
    }

    // 加入仇恨列表
    friendHeal : Map<number, number> = new Map();
    addFriend(attacker: FightUnit, hp: number){
        if (attacker == this) return;
        this.friendHeal.set(attacker.uid, (this.friendHeal.get(attacker.uid) ?? 0) + hp)
    }
    clearFriend(){
        this.friendHeal.clear();
    }
    getFriendTop(num: number) : number[]{
        // sort Enemy
        let arr = Array.from(this.friendHeal.entries()).sort((a, b) => b[1] - a[1]);
        return arr.slice(0, num).map((v) => v[0]);
    }
        
    onHeal(attacker: FightUnit, why: string, hp: number, ctx:FightContex){
        hp = Math.floor(hp);

        const point = this.attr.point;
        ctx.msgs.push(["heal", why, this.uid, attacker.uid, hp, point.hp, ctx.effects])
        this.addFriend(attacker, hp);
        point.hp = Math.min(point.hp + hp, point.hpMax);
        this.emit("heal", attacker, why, hp, ctx);
    }

    emit(event: FightUnitEvent, ...args: any[]){
        this.fight?.emitUnitEvent(this, event, ...args);
    }

    pos: number;
    setPos(pos: number) {
        this.pos = pos;
    }

    dump() {
        return {
            uid: this.uid,
            name: this.getName(),
            side: this.side,
            pos: this.pos,
        }
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
    onDie(attacker: FightUnit, why: string, ctx:FightContex){
        this.die();
        this.emit("die", attacker, why, ctx);
    }
    die() {
        this.dead = true;
        this.clearBuff();
    }
    onRelife(attacker: FightUnit, why: string, ctx:FightContex){
        this.relife();
        this.emit("relife", attacker, why, ctx);
    }
    relife(){
        this.dead = false;
    }

    defend = false;
    isDefend() {
        return this.defend;
    }
    doDefend(){
        if (!this.dead) {
            this.defend = true;
        }
    }

    isFillterDie(die: DiedSelectEnum = DiedSelectEnum.alive){
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
    // 死亡单位也要收指令：本轮轮到它之前可能被其他单位复活。
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


    inputStart(): void{
        this.defend = false;
        this.input = null;
    }

    onInput(input: FightInput){
        if (!this.fight?.validateInput(this, input)) return false;
        this.input = {...input};
        if (input.cmd == FightCmdEnum.cancel){
            this.input = null;
        }
        return true;
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

    // passive skills 不会add remove
    passiveSkills : PassiveSkill[] = [];
    setPassiveSkills(passiveSkills: PassiveSkill[]){
        this.passiveSkills = passiveSkills;
        this.calcAttr();
    }

    //buff status and forbid
    buffs = new Map<number,FightBuff>();
    clearBuff(){
        const removed = Array.from(this.buffs.values());
        this.buffs.clear();
        this.onBuffChanged("clear", removed);
    }


    //封印 - attack普攻，物品，skill技能，大招
    isForbid(action: string) {
        const status = findForbidStatusByAction(action);
        if (!status) return false;
        for (const s of status){
            if (this.inStatus(s)) return true;
        }
        return false;
    }

    inStatus(status: string) {
        for (const p of this.passiveSkills){
            if (p.inStatus(status)) return true;
        }
        for (const buff of this.buffs.values()){
            if (buff.inStatus(status)) return true;
        }
        return false;
    }

    findBuff(id: number) : FightBuff{
        return this.buffs.get(id);
    }

    findBuffsByTag(tag: string) : FightBuff[]{
        return Array.from(this.buffs.values()).filter((v) => v.hasTag(tag));
    }

    deleteBuff(buff: FightBuff){
        this.buffs.delete(buff.getId());
    }

    onBuffChanged(why: string, buf: FightBuff | FightBuff[]){
        let attr = false;
        if (Array.isArray(buf)){
            for (const b of buf){
                if (b.hasAttr()) {
                    attr = true;
                    break;
                }
            }
        } else if (buf && buf.hasAttr()) {
            attr = true;
        }
        if (attr) this.calcAttr();
    }
 
    calcAttr(){
        const attrs = [];
        for (const p of this.passiveSkills){
            if (p.hasAttr()) {
                attrs.push(p);
            }
        }
        for (const buff of this.buffs.values()){
            if (buff.hasAttr()) {
                attrs.push(buff);
            }
        }
        const oldspeed = this.attr?.speed;
        const point = this.attr?.point;
        this.attr = calcAttr(this.attrOri, attrs);
        if (point) {
            this.attr.point.hp = point.hp;
            this.attr.point.mp = point.mp;
        }
        this.emit("attr");
        if (oldspeed != this.attr.speed) {
            this.emit("speed", this.attr.speed);
        }
    }
    
    addBuff(attacker: FightUnit, why: string, buff: number, lv: number, ctx:FightContex) : FightBuff{
        const rt = this._addBuff(attacker, why, buff, lv, ctx);        
        if (rt) this.onBuffChanged("add", rt);
        return rt;
    }

    addBuffs(attacker: FightUnit, why: string, addbuff: [number,number,number][], ctx: FightContex){
        const f = ctx.fight;
        const rts = []
        for (const buff of addbuff) {
            const [id, lv, rand]  = buff;
            if (rand < 1 && f.randomGreat(rand)) continue;
            const buf = this._addBuff(attacker, why, id, lv, ctx);
            if (buf) rts.push(buf);
        }
        this.onBuffChanged("add", rts);
        return rts;
    }

    _addBuff(attacker: FightUnit, why: string, buff: number, lv: number, ctx:FightContex) : FightBuff{
        const buf = this.findBuff(buff);
        if (buf){
            const lap = buf.getOverlap()
            if (lap === OverlapEnum.NOT) return;
            // replace
            this.deleteBuff(buf);
        }
        const b = createBuff(buff, lv);
        if (!b) return;
        this.buffs.set(b.getId(), b);
        ctx.msgs.push(["addBuff", why, this.uid, attacker.uid, buff, lv])
        this.emit("addBuff", attacker, why, b, ctx);
        return b;
    }

    removeBuff(attacker: FightUnit, why: string, buff: number, ctx:FightContex) : FightBuff{
        const buf = this._removeBuff(attacker, why, buff, ctx);
        if (buf) this.onBuffChanged("remove", buf);
        return buf;
    }

    removeBuffs(attacker: FightUnit, why: string, buffs: [number,number][], ctx:FightContex) : FightBuff[]{
        const f = ctx.fight;
        const rts = []
        for (const buff of buffs) {
            const [id, rand]  = buff;
            if (rand < 1 && f.randomGreat(rand)) continue;
            const buf = this._removeBuff(attacker, why, id, ctx);
            if (buf) rts.push(buf);
        }
        this.onBuffChanged("remove", rts);
        return rts;
    }

    _removeBuff(attacker: FightUnit, why: string, buff: number, ctx:FightContex) : FightBuff{
        const buf = this.findBuff(buff);
        if (!buf) return ;
        this.deleteBuff(buf);
        ctx.msgs.push(["removeBuff", why, this.uid, attacker.uid, buff])
        this.emit("removeBuff", attacker, why, buf, ctx);
        return buf;
    }

    removeBuffByTag(attacker: FightUnit, why: string, tag: string, num: number, ctx:FightContex) : FightBuff[]{
        const bufs = this.findBuffsByTag(tag);        
        const f = ctx.fight;
        const bs = (num > 0 && bufs.length > num) ? f.shuffleArray(bufs).slice(0, num) : bufs ;
        const rts = bs.map((v) => this._removeBuff(attacker, why, v.getId(), ctx));
        this.onBuffChanged("remove", rts);
        return rts;
    }

}

// descend降序
export function sortByAttr(a: FightUnit[], key: string, descend = false){
    if (descend) {
        return a.sort((a, b) => b.getAttr(key) - a.getAttr(key));
    }
    return a.sort((a, b) => a.getAttr(key) - b.getAttr(key));
}
