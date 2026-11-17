import { Fight} from "../Fight";
import { FightContex } from "../Skills/NormalAttack";
import { FightAttr } from "../FightAttr";
import { DiedSelectEnum, FightCmdEnum, FightDisplay, FightInput, FightSideEnum, IdLevelArray, IdRand } from "../struct";
import { FightSkill, SkillCost } from "../Skills/FightSkill";
import { getSkillData } from "../Skills/SkillDatas";
import { createBuff, FightBuff} from "../Buffs/FightBuff";
import { findForbidStatusByAction } from "../Buffs/FightStatus";
import { FightUnitEvent, OverlapEnum } from "../Buffs/BuffDatas";
import { createPassiveSkills, PassiveSkill } from "../Buffs/PassiveSkill";
import { calcAttr } from "../Skills/Calc";
import EventEmitter from "node:events";

export enum UnitType{
    user,
    summon,
    monster, //npc
}

export type UnitEventFunc = (unit: FightUnit, ...args: any[]) => void;
export type UnitContextEventFunc = (unit: FightUnit, ctx:FightContex, ...args: any[]) => void;


// 战斗单元
export abstract class FightUnit {
    uid: number;
    attr: FightAttr; 
    attrOri: FightAttr; 
    display: FightDisplay;
    
   constructor(id: number, attr: FightAttr, display: FightDisplay, passiveSkills: IdLevelArray = []) {
        this.uid = id;
        this.attrOri = attr;
        this.display = display;
        this.setPassiveSkills(passiveSkills);
        this.calcAttr();
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
    
    
    minHp = 0; //boss锁血         
    onHurt(attacker: FightUnit, why: string, hp: number, ctx:FightContex){
        if (this.isDied()) return 0;
        if (this.isDefend()) {
            hp *= 0.5;
        }     
        hp = Math.min(this.getHp(), Math.max(0, Math.floor(hp)));

        const point = this.attr.point;
        point.hp -= hp;
        if (point.hp < this.minHp) {
            point.hp = this.minHp;
        }

        ctx.msgs.push(["hurt", why, this.uid, attacker.uid, hp, point.hp, ctx.effects])
        this.addEnemy(attacker, hp);
        this.emitContext("hurt", ctx, attacker, hp);

        if(point.hp <= 0){  
            point.hp = 0;
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
        this.emitContext("heal", ctx, attacker, why, hp);
    }

    emitter = new EventEmitter();
    emitContext(event: FightUnitEvent, ctx:FightContex, ...args: any[]){
        this.emitter.emit(event, this, ctx, ...args);
        this.fight?.emitUnitEvent(event, this, ctx, ...args);
    }

    emit(event: FightUnitEvent, ...args: any[]){
        this.emitter.emit(event, this, ...args);
        this.fight?.emitUnitEvent(event, this, ...args);
    }

    on(event: FightUnitEvent, listener: UnitEventFunc) {
        this.emitter.on(event, listener);
    }
    onContex(event: FightUnitEvent, listener: UnitContextEventFunc) {
        this.emitter.on(event, listener);
    }
    off(event: FightUnitEvent, listener: UnitEventFunc) {
        this.emitter.off(event, listener);
    }
    offContex(event: FightUnitEvent, listener: UnitContextEventFunc) {
        this.emitter.off(event, listener);
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
        this.emitContext("die", ctx, attacker, why);
    }
    die() {
        this.dead = true;
        this.clearBuffByDie();
    }
    onRelife(attacker: FightUnit, why: string, ctx:FightContex){
        this.relife();
        this.emitContext("relife", ctx, attacker, why);
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
    processBeforeTurn(turn: number, ctx: FightContex){
        this.onBuffTurn(turn, false, ctx);
    }
    // 回合后处理, dead...
    processAfterTurn(turn: number, ctx: FightContex){}
    processOneTurn(turn: number){
        if (this.isDied()) return;
        const input = this.input || {cmd: FightCmdEnum.none};
        return this.fight.processUnit(this, input);
    }

    private onBuffTurn(turn: number, inputTurn: boolean, ctx: FightContex){
        for (const buff of [...this.buffs.values()]){
            if (this.isDied()) break;
            if (this.findBuff(buff.getId()) !== buff) continue;
            if (buff.useInputTurn() == inputTurn){
                if (buff.doTurn(this,turn,ctx)){
                    if (this.findBuff(buff.getId()) === buff) {
                        this.expireBuff(buff, "turn", ctx);
                    }
                }
            }
        }
    }

    // 维持一个自己动作的turn，解决一个回合多动的问题！
    myInputTurn = 0;
    inputStart(turn: number, ctx: FightContex): void{
        this.defend = false;
        this.input = null;
        // 处理buff
        this.myInputTurn ++;
        this.onBuffTurn(this.myInputTurn, true, ctx);
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

    // 装配反击技能
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
    passiveSkills : PassiveSkill[] ;
    setPassiveSkills(passiveSkills: IdLevelArray){
        this.passiveSkills = createPassiveSkills(passiveSkills);
        for (const skill of this.passiveSkills){
            skill.onInit(this);
        }
        if (this.attr) this.calcAttr();
    }

    //buff status and forbid
    buffs = new Map<number,FightBuff>();
    clearBuffByDie(){
        const removed = Array.from(this.buffs.values()).filter((v) => v.canRemoveByDie());
        // this.buffs.clear();
        for (const buff of removed){
            buff.onRemoved(this);
            this.buffs.delete(buff.getId());
        }
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

    findRemoveBuffsByTag(tag: string, power: number) : FightBuff[]{
        return Array.from(this.buffs.values()).filter((v) =>
            v.hasTag(tag) && v.canRemove(power));
    }

    findBuffsByTag(tag: string) : FightBuff[]{
        return Array.from(this.buffs.values()).filter((v) => v.hasTag(tag));
    }

    deleteBuff(buff: FightBuff){
        buff.onRemoved(this);
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

    addBuffsByPassiveSkill(addbuff: IdLevelArray){
        const added: FightBuff[] = [];
        for (const buff of addbuff) {
            const [id, lv]  = buff;
            const buf = this._addBuff(this, "passive", id, lv, null);
            if (buf) added.push(buf);
        }
        // 构造期间统一在末尾计算；已有单位添加后立即生效。
        if (this.attr) this.onBuffChanged("passive", added);
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
        const b = createBuff(attacker, buff, lv, this.fight?.turn ?? 0, this.myInputTurn);
        if (!b) return;
        this.buffs.set(b.getId(), b);
        b.onAdded(this);
        if (ctx) {
            ctx.msgs.push(["addBuff", why, this.uid, attacker.uid, buff, lv])
            this.emitContext("addBuff", ctx, attacker, why, b);
        }
        return b;
    }

    removeBuff(attacker: FightUnit, why: string, buff: number, power: number, ctx:FightContex) : FightBuff{
        const buf = this._removeBuff(attacker, why, buff, power, ctx);
        if (buf) this.onBuffChanged("remove", buf);
        return buf;
    }

    removeBuffs(attacker: FightUnit, why: string, buffs: IdRand[], power: number, ctx:FightContex) : FightBuff[]{
        const f = ctx.fight;
        const rts = []
        for (const buff of buffs) {
            const [id, rand]  = buff;
            if (rand < 1 && f.randomGreat(rand)) continue;
            const buf = this._removeBuff(attacker, why, id, power, ctx);
            if (buf) rts.push(buf);
        }
        this.onBuffChanged("remove", rts);
        return rts;
    }

    _removeBuff(attacker: FightUnit, why: string, buff: number, power:number, ctx:FightContex) : FightBuff{
        const buf = this.findBuff(buff);
        if (!buf || !buf.canRemove(power)) return ;
        return this.finishRemoveBuff(attacker, why, buf, ctx);
    }

    // 自然结束不受驱散标签或强度限制；实例检查避免误删同编号的新 Buff。
    expireBuff(buff: FightBuff, why: string, ctx: FightContex) {
        if (this.findBuff(buff.getId()) !== buff) return;
        this.finishRemoveBuff(this, why, buff, ctx);
        this.onBuffChanged(why, buff);
    }

    private finishRemoveBuff(attacker: FightUnit, why: string, buf: FightBuff, ctx: FightContex): FightBuff {
        const buff = buf.getId();
        this.deleteBuff(buf);
        ctx.msgs.push(["removeBuff", why, this.uid, attacker.uid, buff])
        this.emitContext("removeBuff", ctx, attacker, why, buf);
        return buf;
    }

    removeBuffByTag(attacker: FightUnit, why: string, tag: string, num: number, power:number, ctx:FightContex) : FightBuff[]{
        const bufs = this.findRemoveBuffsByTag(tag, power);
        const f = ctx.fight;
        const bs = (num > 0 && bufs.length > num) ? f.shuffleArray(bufs).slice(0, num) : bufs ;
        const rts: FightBuff[] = [];
        for (const buff of bs) {
            const removed = this._removeBuff(attacker, why, buff.getId(), power, ctx);
            if (removed) rts.push(removed);
        }
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
