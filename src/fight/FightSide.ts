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
    poison?: BaseAttack;
}

function defaultBaseAttack(): BaseAttack {
    return {
        property: 0,
        rand: 0.5,
        hit: 100,
        dodge: 0,
        attack: 0,
        defend: 0,
        hurt: 0,
        hurtP: 0,
        hurtAnti: 0,
        hurtPAnti: 0,
        critP: 0,
        critPAnit: 0,
        critDeep: 1,
        critDeepAnit: 0,
    };
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
            const physic: BaseAttack = {...defaultBaseAttack(), ...data.physic};
            const magic: BaseAttack = {...defaultBaseAttack(), ...data.magic};
            const heal: BaseAttack = {...defaultBaseAttack(), ...data.heal};
            const poison: BaseAttack = {...defaultBaseAttack(), ...data.poison};
                      
            physic.critP = data.physic?.critP || (20+f.random()*10);
            physic.attack = data.physic?.attack || (50+f.random()*20);
            physic.defend = data.physic?.defend || (50-f.random()*20);
            physic.hit = data.physic?.hit || (80+f.random()*10);
            physic.dodge = data.physic?.dodge || (20+f.random()*10);

            const fa: FinalAttack = {
                dbackP: 0,
                bloodP: 0,
                immunity: 0,
                immunityP: 0,

                // dbackPAnti: 0,
                // bloodPAnti: 0,
                // immunityAnti: 0,
                // immunityPAnti: 0,
            };

            attr.physic = {
                base: {...physic, rand: 0.5} , 
                kill : {...physic, rand: 0.5} ,
                next : {...physic, rand: 0.5} ,
                spread : {...physic, rand: 0.5} ,
                fback : {...physic, rand: 0.5} ,
                final: {...fa},
            }

            
            
            magic.critP = data.magic?.critP || (10+f.random()*5);
            magic.attack = data.magic?.attack || (30+f.random()*10);
            magic.defend = data.magic?.defend || (30-f.random()*10);

            attr.magic = {
                base: {...magic, rand: 0.5} , 
                kill : {...magic, rand: 0.5} ,
                next : {...magic, rand: 0.5} ,
                spread : {...magic, rand: 0.5} ,
                fback : {...magic, rand: 0.5} ,
                final: {...fa},
            }


            heal.critP = 0;
            heal.attack = data.heal?.attack || (30+f.random()*10);
            heal.defend = 0;

            attr.heal = heal;
            attr.poison = poison;

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