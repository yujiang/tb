import { FightAttr } from "./FightAttr";
import { FightUnit } from "./FightUnit";
import { FightSideEnum } from "./struct";

export interface simpleData {
    name: string;
    id: number;
    pos: number;
}

export class FightSide {
    side: FightSideEnum;
    units: FightUnit[] = [];
    createSimpleUnits(datas: simpleData[]): void {
        for (const data of datas){
            const attr = new FightAttr()
            attr.hp = 100;
            attr.hpMax = 100;
            const u = new FightUnit(
                data.id,
                attr,
                {name:data.name},
            )
            this.units.push(u);
            u.setSidePos(this.side, data.pos);
        }
    }
}