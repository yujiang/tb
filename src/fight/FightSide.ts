import { Fight } from "./Fight";
import { FightAttr } from "./FightAttr";
import { FightUnit, FightUnitMonster } from "./FightUnit";
import { FightSideEnum } from "./struct";

export interface simpleData {
    name: string;
    id: number;
    pos: number;
    attack?: number;
    defend?: number;
}

export class FightSide {
    units: FightUnit[] = [];
    createSimpleMonster(f:Fight, datas: simpleData[]): void {
        for (const data of datas){
            const attr = new FightAttr()
            attr.hp = 100;
            attr.hpMax = 100;
            attr.attack = data.attack || (50+f.random()*20);
            attr.defend = data.defend || (50-f.random()*20);
            const u = new FightUnitMonster(
                data.id,
                attr,
                {name:data.name},
            )
            this.units.push(u);
            u.setPos(data.pos);
        }
    }
}