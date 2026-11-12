// 核心的战斗对象
import { randArray, shuffleArray, removeArray } from "../public/Array";
import { FightMap } from "./FightMap";
import { FightSide } from "./FightSide";
import { FightUnit, sortByAttr } from "./FightUnit";
import { DesSide, DiedSelectEnum, FightCmdEnum, FightInput, FightSideEnum, SelectMainParam, SelectParam, TargetSelectEnum } from "./struct";
import { strict as assert } from "node:assert";

export type AllUnitType = [FightUnit[], FightUnit[]];


export class Fight {
    fid: number;
    constructor(id: number) {
        // TODO
        this.fid = id;
    }

    turn = 0; // 当前回合数
    nextTurn() {
        this.turn++;
        console.log(this.fid, "this.turn", this.turn);
        if (this.turn >= 100) {
            this.end = true;
        }
    }

    end: boolean = false;
    isEnd() {
        return this.end;
    }
    win: number = -1;
    onDie(unit: FightUnit) {
        if (this.end) return;
        const side = unit.side;
        for (const u of this.getSideUnits(side)) {
            if (!u.isDied()) return;
        }
        this.end = true;
        this.win = DesSide(side);
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
    selectMainTarget(attack: FightUnit, des: FightUnit|null, sel:SelectMainParam) : FightUnit {
        assert(!attack?.isDied());

        if (sel.target == TargetSelectEnum.duiwei) {
            return this.map.findDuiwei(attack, sel.die);    
        }
        if (sel.target == TargetSelectEnum.self) {
            return attack;
        }
        
        // des_or_random
        if (!des) {
            const side = sel.target == TargetSelectEnum.friend ? attack.side : DesSide(attack.side);
            //const except = sel.includeAttack ? null : attack;
            const units = this.getSideUnitsDie(side, sel.die);
            if (!units.length) return null;
            if (sel.sortAttr){
                sortByAttr(units, sel.sortAttr, sel.sortDescend);
                des = units[0]; //最小值？
            }
            else {
                des = randArray(units);
            }
        }
        return des;
    }
    
    selectTargetsNum(main: FightUnit, sel:SelectParam, num: number) : FightUnit[]|undefined {
        const side = main.side;
        const units = this.getSideUnitsDie(side,sel.die, main);
        if (!units.length) return;
        if (sel.sortAttr){
            sortByAttr(units, sel.sortAttr, sel.sortDescend);
        }
        else {
            shuffleArray(units);
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


    processUnit(unit: FightUnit, input: FightInput){
        let cmd = input.cmd;
        let tid = input.target;

        // 预处理,没有来得及发指令的单位.
        if (cmd == FightCmdEnum.none){
            cmd = FightCmdEnum.attack;
            const list = this.getSideUnitsDie(DesSide(unit.side), DiedSelectEnum.alive);
            if (!list.length) return;
            let des = randArray(list);
            tid = des.uid;
        }

        if (cmd == FightCmdEnum.attack){
            const des = this.getUnitById(tid);
            if (!des || des.isDied()) return;              
            unit.attack(des);
        }
    }
}