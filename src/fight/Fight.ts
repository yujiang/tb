// 核心的战斗对象
import { FightMap } from "./FightMap";
import { FightSide } from "./FightSide";
import { FightUnit } from "./FightUnit";
import { DiedSelectEnum, FightSideEnum, SelectParam, TargetSelectEnum } from "./struct";
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

    getSideUnitsDie(side: FightSideEnum, die: DiedSelectEnum) : FightUnit[] {
        return this.AllUnits[side].filter(u => u.isFillterDie(die));
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

    selectTargets(attack: FightUnit, des: FightUnit|null, sel:SelectParam) : FightUnit[]|undefined {
        //const attacks = this.getSideUnits(0).filter(u => u.isFillterDie(die));
        //const dess = this.getSideUnits(1).filter(u => u.isFillterDie(die));
        return this.map.selectTargets(attack, des, sel);
    }
}

