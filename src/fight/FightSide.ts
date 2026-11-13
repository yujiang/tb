import { Fight } from "./Fight";
import { BaseAttack, FightAttr } from "./FightAttr";
import { FightUnit } from "./Unit/FightUnit";
import { FightUnitMonster } from "./Unit/FightUnitMonster";
import { FightSideEnum } from "./struct";

export interface simpleData {
    name: string;
    id: number;
    pos: number;
    
    physic?: BaseAttack;
    magic?: BaseAttack;
    heal?: BaseAttack;
}

export class FightSide {
    units: FightUnit[] = [];
    createSimpleMonster(f:Fight, datas: simpleData[]): void {
        for (const data of datas){
            const attr = new FightAttr()
            attr.hp = 100;
            attr.hpMax = 100;
            attr.mp = 100;
            attr.mpMax = 100;
            const physic: BaseAttack = {} as any
            const magic: BaseAttack = {} as any
            const heal: BaseAttack = {} as any
            physic.randFightBack = 0.5;
            physic.randKill = 0.5;
            physic.randNext = 0.5;
            
            magic.randFightBack = 0.2;
            
            physic.crit = data.physic?.crit || (20+f.random()*10);
            physic.attack = data.physic?.attack || (50+f.random()*20);
            physic.defend = data.physic?.defend || (50-f.random()*20);
            physic.hit = data.physic?.hit || (80+f.random()*10);
            physic.dodge = data.physic?.dodge || (20+f.random()*10);
            
            magic.crit = data.magic?.crit || (10+f.random()*5);
            magic.attack = data.magic?.attack || (30+f.random()*10);
            magic.defend = data.magic?.defend || (30-f.random()*10);

            attr.physic = physic;
            attr.magic = magic;
            attr.heal = heal;            

            attr.speed = 100 + Math.floor(f.random()*20);
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