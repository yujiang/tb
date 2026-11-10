import { FightUnit } from "./FightUnit";
import { FightSideEnum } from "./struct";

export interface simpleData {
    name: string;
    id: number;
    pos: number
}

export class FightSide {
    side: FightSideEnum;
    units: FightUnit[] = [];
    createSimpleUnits(datas: simpleData[]): void {
        for (const data of datas){
            const u = new FightUnit(data.name, data.id)
            this.units.push(u);
            u.setSidePos(this.side, data.pos);
        }
    }
}