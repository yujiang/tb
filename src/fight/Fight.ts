// 核心的战斗对象
import { removeArray } from "../public/Array";
import { attackFunc, FightContex } from "./Skills/NormalAttack";
import { FightMap } from "./FightMap";
import { FightSide } from "./FightSide";
import { FightUnit, sortByAttr } from "./Unit/FightUnit";
import { EnemySide, DiedSelectEnum, FightCmdEnum, FightInput, FightSideEnum, SelectMainParam, SelectParam, TargetSelectEnum } from "./struct";
import { strict as assert } from "node:assert";
import EventEmitter from "node:events";
import { getSkillById, skillFunc } from "./Skills/Skills";

export type AllUnitType = [FightUnit[], FightUnit[]];
export type UnitEventFunc = (unit: FightUnit, ...args: any[]) => void;

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
    }

    turn = 0; // 当前回合数
    nextTurn() {
        this.turn++;
        if (this.xls.maxTurn && this.turn >= this.xls.maxTurn) {
            // 超时防守获胜！
            this.win = FightSideEnum.defend;
        }
    }

    win: number = -1;
    isEnd() {
        return this.win >= 0;
    }
    onDie(unit: FightUnit) {
        if (this.isEnd()) return;
        const side = unit.side;
        for (const u of this.getSideUnits(side)) {
            if (!u.isDied()) return;
        }
        this.win = EnemySide(side);
    }

    // ***units start
    Sides: FightSide[];
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

    //在input阶段, skill和target都经过验证，是有效并且合规的， 所以此处就没有二次验证。
    processUnit(unit: FightUnit, input: FightInput) : FightContex{
        let cmd = input.cmd;
        let tid = input.target;

        let des = tid && this.getUnitById(tid);
        // 预处理,没有来得及发指令的单位.
        if (cmd == FightCmdEnum.none){
            cmd = FightCmdEnum.attack;
            // des = this.getDefaultEnemy(unit)
        }

        if (!des) {
            if (cmd == FightCmdEnum.attack){
                des = this.getDefaultEnemy(unit);
            }
            else if (cmd == FightCmdEnum.skill){
                const skill = getSkillById(input.skill);
                if (skill){
                    des = this.selectMainTarget(unit, skill.xls.sel);
                }
            }
        }
        if (!des) return;           

        const ctx: FightContex = { fight: this, attack: unit, defend: des, msgs: [] };

        if (cmd == FightCmdEnum.attack){
            if (!des || des.isDied()) return;              
            return attackFunc(unit,des,ctx);
        }

        if (cmd == FightCmdEnum.skill){
            return skillFunc(unit,des,input.skill,ctx);
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

    random() {
        return Math.random();
    }

    // ***event start
    emitUnit = new EventEmitter();
    emitUnitEvent(unit: FightUnit, event: string, ...args: any[]){
        this.emitUnit.emit(event, unit, ...args);
    }
    onUnitEvent(event: string, func: UnitEventFunc){
        this.emitUnit.on(event, func);
    }
}