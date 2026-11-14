import { Fight } from "./Fight";
import { BaseAttack, FightAttr, FinalAttack } from "./FightAttr";
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
            const point = {
                hp:100,
                hpMax:100,
                mp:100,
                mpMax:100,
            };
            attr.point = point;
            const physic: BaseAttack = {} as any
            const magic: BaseAttack = {} as any
            const heal: BaseAttack = {} as any
                      
           
            physic.crit = data.physic?.crit || (20+f.random()*10);
            physic.attack = data.physic?.attack || (50+f.random()*20);
            physic.defend = data.physic?.defend || (50-f.random()*20);
            physic.hit = data.physic?.hit || (80+f.random()*10);
            physic.dodge = data.physic?.dodge || (20+f.random()*10);

            attr.kill = {...physic, rand: 0.5} 
            attr.next = {...physic, rand: 0.5} 
            attr.fback = {...physic, rand: 0.5} 

            const fa: FinalAttack = {
                dbackP: 0,
                bloodP: 0,
                immunity: 0,
                immunityP: 0,

                dbackPAnti: 0,
                bloodPAnti: 0,
                immunityAnti: 0,
                immunityPAnti: 0,
            }

            attr.fphysic = {...fa};
            attr.fmagic = {...fa};
            
            magic.crit = data.magic?.crit || (10+f.random()*5);
            magic.attack = data.magic?.attack || (30+f.random()*10);
            magic.defend = data.magic?.defend || (30-f.random()*10);

            heal.crit = 0;
            heal.attack = data.heal?.attack || (30+f.random()*10);
            heal.defend = 0;

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