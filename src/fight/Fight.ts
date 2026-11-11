// 核心的战斗对象
import { randArray, shuffleArray, removeArray } from "../public/Array";
import { FightMap } from "./FightMap";
import { FightSide } from "./FightSide";
import { FightUnit } from "./FightUnit";
import { DesSide, DiedSelectEnum, FightSideEnum, SelectMainParam, SelectParam, TargetSelectEnum } from "./struct";
import { strict as assert } from "node:assert";

export type AllUnitType = [FightUnit[], FightUnit[]];


export class Fight {
    id: number;
    constructor(id: number) {
        // TODO
        this.id = id;
    }

    Sides: FightSide[];
    AllUnits: AllUnitType;
    createSide(attack: FightSide, des: FightSide) {
        attack.side = FightSideEnum.attack;
        des.side = FightSideEnum.defend;
        this.Sides = [attack, des];
        this.AllUnits = [attack.units, des.units];
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



    map: FightMap;
    createMap(nx: number, ny: number) {
        this.map = new FightMap(this, nx, ny);
    }

    // 主目标只有一个，通常的做法是先打主目标，命中之后，才产生后续的子目标！
    selectMainTarget(attack: FightUnit, des: FightUnit|null, sel:SelectMainParam) : FightUnit {
        assert(attack);

        if (sel.target == TargetSelectEnum.duiwei) {
            return this.map.findDuiwei(attack, sel.die);    
        }
        if (sel.target == TargetSelectEnum.self) {
            return attack;
        }
        
        // des_or_random
        if (!des) {
            const side = sel.attackSide ? attack.side : DesSide(attack.side);
            const except = sel.includeAttack ? null : attack;
            const units = this.getSideUnitsDie(side, sel.die, except);
            if (!units.length) return null;
            if (sel.sort){
                units.sort((a, b) => a.getAttr(sel.sort) - b.getAttr(sel.sort));
                des = sel.max ? units[units.length-1] : units[0]; //最小值？
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
        if (sel.sort){
            units.sort((a, b) => a.getAttr(sel.sort) - b.getAttr(sel.sort));
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
        if (!sel.shape){
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
}

