// 战斗属性, 需要注入

export interface BaseAttack {
    property: number;       //攻击属性， 属性有克制~

    hit: number;            //命中
    dodge: number;          //闪避  

    crit: number;           //暴击
    critDefend: number;     //暴击减免
    critDeep: number;       //暴击增伤

    attack: number;         //攻击力
    defend: number;         //防御力

    //连击，追击，反击率
    randNext: number;
    randKill: number;
    randFightBack: number;    

    blood: number;          //吸血        
    damageBack: number;     //反弹伤害

    hurtDec: number;        //伤害减免
    hurtDecPercent: number; //减伤比
}

export class FightAttr {
    hp: number;         // 当前血量
    hpMax: number;      // 最大血量
    mp: number;         // 当前蓝量
    mpMax: number;      // 最大蓝量

    speed: number;      // 速度
    
    physic: BaseAttack;
    magic: BaseAttack;
    heal: BaseAttack;
    // restrain: BaseAttack; // property克制会增伤~
  
    getAttr(key: string){
        switch(key){
            case "hpp":
                return this.hp / this.hpMax;
            case "hplp":
                return (this.hpMax - this.hp) / this.hpMax ;
        }
        return (this as any)[key] || 0;        
    }

    getSpeed() {
        return this.getAttr("speed");
    }
}

