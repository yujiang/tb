// 核心的战斗对象
import { removeArray } from "../public/Array";
import { attackFunc, FightContex } from "./Skills/NormalAttack";
import { FightMap } from "./FightMap";
import { FightSide } from "./FightSide";
import { FightUnit, UnitEventFunc, sortByAttr } from "./Unit/FightUnit";
import { FightUnitEvent } from "./Buffs/BuffDatas";
import { EnemySide, DiedSelectEnum, FightCmdEnum, FightInput, FightSideEnum, FightResultEnum, SelectMainParam, SelectParam, TargetSelectEnum } from "./struct";
import { strict as assert } from "node:assert";
import EventEmitter from "node:events";
import { skillFunc } from "./Skills/SkillFuncType";

export type AllUnitType = [FightUnit[], FightUnit[]];

//表格化数据
export interface FightData {
    maxTurn: number;
    waitInputSec: number;
    duiwei: boolean; //是否对位战斗？    
}

export class Fight{
    fid: number;
    // seed为随机数种子
    seed: number;
    xls: FightData;

    constructor(id: number, data: FightData, seed = 0) {
        this.fid = id;
        this.xls = data;
        this.seed = seed;
        assert.ok(Number.isSafeInteger(seed), "seed must be a safe integer");
        this.randomState = seed >>> 0;
    }

    turn = 0; // 当前回合数
    nextTurn() {
        this.turn++;
        return this.turn;
    }

    finishTurn() {
        this.checkOutcome();
        if (!this.isEnd() && this.xls.maxTurn && this.turn >= this.xls.maxTurn) {
            // 超时防守获胜！
            this.win = FightSideEnum.defend;
        }
    }

    win: number = -1;
    isEnd() {
        return this.win >= 0;
    }
    onDie(unit: FightUnit) {
        if (this.actionDepth === 0) this.checkOutcome();
    }

    checkOutcome() {
        if (this.isEnd() || !this.AllUnits) return;
        const alive = this.AllUnits.map(units => units.some(u => !u.isDied()));
        if (!alive[0] && !alive[1]) this.win = FightResultEnum.draw;
        else if (!alive[0]) this.win = FightSideEnum.defend;
        else if (!alive[1]) this.win = FightSideEnum.attack;
    }

    private actionDepth = 0;
    resolveAction<T>(run: () => T): T {
        if (this.actionDepth >= 64) throw new Error("Reaction limit exceeded (64 nested action scopes)");
        this.actionDepth++;
        let completed = false;
        try {
            const result = run();
            completed = true;
            return result;
        } finally {
            this.actionDepth--;
            if (completed && this.actionDepth === 0) this.checkOutcome();
        }
    }

    // ***units start
    Sides: FightSide[];
    getSide(side: FightSideEnum) : FightSide {
        return this.Sides[side];
    }

    AllUnits: AllUnitType;
    createSide(attack: FightSide, des: FightSide) {
        this.Sides = [attack, des];
        this.AllUnits = [attack.units, des.units];
        console.log(this.fid, "attack", attack.units.length, "des", des.units.length)
        for (const u of attack.units) {
            u.setFight(this, FightSideEnum.attack);
        }
        for (const u of des.units) {
            u.setFight(this, FightSideEnum.defend);
        }
    }

    getUnitById(id: number) : FightUnit {
        return this.getAllUnits().find(u => u.uid == id)!;
    }


    getSideUnits(side: FightSideEnum) : FightUnit[] {
        return this.AllUnits[side];
    }
    getAllUnits() : FightUnit[] {
        return this.AllUnits.flat();
    }
    getAllUser() : FightUnit[] {
        return this.getAllUnits().filter(u => u.isUser());
    }

    getSideUnitsDie(side: FightSideEnum, die: DiedSelectEnum, except:FightUnit=null) : FightUnit[] {
        return this.AllUnits[side].filter(u => u.isFillterDie(die) && u!==except);
    }

    getSideUnitsByPos(side:FightSideEnum, poses: number[], die: DiedSelectEnum) : FightUnit[] {
        return this.getSideUnits(side).filter(u => u.isFillterDie(die) && poses.includes(u.pos));
    }
    getSideUnitByPos(side:FightSideEnum, pos: number) : FightUnit {
        return this.getSideUnits(side).find(u => u.pos == pos)!;
    }
    // ***units end


    // ***map start
    map: FightMap;
    createMap(nx: number, ny: number) {
        this.map = new FightMap(this, nx, ny);
    }

    // 主目标只有一个，通常的做法是先打主目标，命中之后，才产生后续的子目标！
    selectMainTarget(attack: FightUnit, sel:SelectMainParam) : FightUnit {
        assert(!attack?.isDied());

        if (sel.target == TargetSelectEnum.duiwei) {
            return this.map.findDuiwei(attack, sel.die);    
        }
        if (sel.target == TargetSelectEnum.self) {
            return attack;
        }
        
        // des_or_random
        const side = sel.target == TargetSelectEnum.friend ? attack.side : EnemySide(attack.side);
        //const except = sel.includeAttack ? null : attack;
        const units = this.getSideUnitsDie(side, sel.die);
        if (!units.length) return null;
        if (sel.sortAttr){
            sortByAttr(units, sel.sortAttr, sel.sortDescend);
            return units[0]; //最小值？
        }
        else {
            return this.randArray(units);
        }
    }
    
    selectTargetsNum(main: FightUnit, sel:SelectParam, num: number) : FightUnit[]|undefined {
        const side = main.side;
        const units = this.getSideUnitsDie(side,sel.die, main);
        if (!units.length) return;        
        if (sel.sortAttr){
            sortByAttr(units, sel.sortAttr, sel.sortDescend);
        }
        else {
            this.shuffleArray(units);
        }
        return units.slice(0, num);
    }

    // 加血一个主单位多个副单位，
    // 1. 群体治疗 没有shape, num = 3
    // 2. 溅射等有多个副目标, shape = line or cross 没有num
    selectTargets(main: FightUnit, sel:SelectParam) : FightUnit[]|undefined {
        assert(main);
        // 
        if (sel.shape === undefined){
            const num = sel.num || 1;
            return this.selectTargetsNum(main, sel, num);
        }
        const units = this.map.selectTargetsShape(main, sel);
        if (units){
            // 去掉主目标
            removeArray(units, main);
        }
        return units;
    }
    // ***map end

    randomEnemyAlive(side: number){
        const list = this.getSideUnitsDie(EnemySide(side), DiedSelectEnum.alive);
        if (!list.length) return;
        return this.randArray(list);
    }


    getDefaultEnemy(unit: FightUnit){
        if (this.xls.duiwei){
            return this.map.findDuiwei(unit, DiedSelectEnum.alive);
        }
        return this.randomEnemyAlive(unit.side);
    }

    isLegalTarget(unit: FightUnit, target: FightUnit, sel: SelectMainParam): boolean {
        if (!target || !target.isFillterDie(sel.die)) return false;
        if (sel.target === TargetSelectEnum.self) return target === unit;
        const side = sel.target === TargetSelectEnum.friend ? unit.side : EnemySide(unit.side);
        if (target.side !== side) return false;
        if (sel.target === TargetSelectEnum.duiwei) return this.map?.findDuiwei(unit, sel.die) === target;
        return true;
    }

    validateInput(unit: FightUnit, input: FightInput): boolean {
        if (!input || this.isEnd() || !this.getAllUnits().includes(unit)) return false;
        if (![FightCmdEnum.none, FightCmdEnum.attack, FightCmdEnum.defend, FightCmdEnum.skill, FightCmdEnum.cancel].includes(input.cmd)) return false;
        // 普攻可以显式指定死亡敌人守尸；自动选目标仍只选存活敌人。
        let sel: SelectMainParam = {target: TargetSelectEnum.enmey, die: DiedSelectEnum.all};
        if (input.cmd === FightCmdEnum.skill) {
            const skill = unit.findSkill(input.skill);
            if (!skill || unit.isForbid("skill")) return false;
            sel = skill.getSel();
            if (!sel) return false;
        } else if ((input.cmd === FightCmdEnum.attack || input.cmd === FightCmdEnum.none) && unit.isForbid("attack")) {
            return false;
        }
        if (input.target !== undefined) {
            if (!Number.isSafeInteger(input.target) || !this.isLegalTarget(unit, this.getUnitById(input.target), sel)) return false;
        }
        return true;
    }

    // 提交后阵营、生命状态和封印都可能变化，执行时重新校验。
    processUnit(unit: FightUnit, input: FightInput) : FightContex{
        // 收指令时允许死亡，真正轮到行动时必须已经复活。
        if (unit.isDied()) return;
        if (!this.validateInput(unit, input)) return;
        return this.resolveAction(() => this.executeUnit(unit, input));
    }

    private executeUnit(unit: FightUnit, input: FightInput): FightContex {
        let cmd = input.cmd;
        let tid = input.target;

        let des = tid !== undefined ? this.getUnitById(tid) : undefined;
        // 预处理,没有来得及发指令的单位.
        if (cmd == FightCmdEnum.none){
            cmd = FightCmdEnum.attack;
            // des = this.getDefaultEnemy(unit)
        }

        if (cmd === FightCmdEnum.defend){
            unit.doDefend();
            return;
        }

        if (!des) {
            if (cmd == FightCmdEnum.attack){
                des = this.getDefaultEnemy(unit);
            }
            else if (cmd == FightCmdEnum.skill){
                const skill = unit.findSkill(input.skill);
                if (skill){
                    des = this.selectMainTarget(unit, skill.getSel());
                }
            }
        }
        if (!des) return;           

        const ctx: FightContex = { fight: this, attack: unit, defend: des, msgs: [], effects: []};

        if (cmd == FightCmdEnum.attack){
            if (des.isDied() || unit.isForbid("attack")) return;              
            attackFunc(unit,des,ctx);
            return ctx;
        }

        if (cmd == FightCmdEnum.skill){
            if (unit.isForbid("skill")) return;              
            skillFunc(unit,des,input.skill,ctx);
            return ctx;
        }
    }


    // 保持随机数, 以便重建战斗保持一致~
    randArray<T>(items: T[]) : T {
        return items[Math.floor(this.random() * items.length)];
    }

    // 洗牌打乱
    shuffleArray<T>(items: T[]) : T[] {
        for (let i = items.length - 1; i > 0; i--) {
            const j = Math.floor(this.random() * (i + 1));
            [items[i], items[j]] = [items[j], items[i]];
        }
        return items;
    }

    private randomState: number;
    // Mulberry32 v1；包括零种子，固定使用 uint32 状态。
    random() {
        this.randomState = (this.randomState + 0x6D2B79F5) >>> 0;
        let value = this.randomState;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 0x100000000;
    }
    randomGreat(g: number){
        if (g >= 1) return false;
        if (g <= 0) return true;
        return this.random() >= g;
    }
    randomLess(g: number){
        if (g >= 1) return true;
        if (g <= 0) return false;
        return this.random() <= g;
    }

    // ***event start
    private emitUnit = new EventEmitter();
    emitUnitEvent(event: FightUnitEvent,unit: FightUnit, ...args: any[]){
        this.emitUnit.emit(event, unit, ...args);
    }
    onUnitEvent(event: FightUnitEvent, func: UnitEventFunc){
        this.emitUnit.on(event, func);
    }
    offUnitEvent(event: FightUnitEvent, func: UnitEventFunc){
        this.emitUnit.off(event, func);
    }
    
}
