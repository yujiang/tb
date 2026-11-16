// 战斗属性, 需要注入

export interface BaseAttack {
    property: number;       //攻击属性， 属性有克制~

    rand: number;           //发动概率

    hit: number;            //命中
    dodge: number;          //闪避  

    attack: number;         //攻击力
    defend: number;         //防御力

    hurt: number;           //伤害增加
    hurtP: number;          //伤害加成
    hurtAnti: number;       //减伤
    hurtPAnti: number;      //减伤比

    critP: number;           //暴击率
    critDeep: number;        //暴击增伤
    critPAnit: number;       //暴击减免
    critDeepAnit: number;    //暴击增伤
}

export interface PoisonAttack {

}

export interface PointAttr {
    hp: number;         // 当前血量
    hpMax: number;      // 最大血量
    mp: number;         // 当前蓝量
    mpMax: number;      // 最大蓝量

//     sp: number;         // 当前怒气
//     spMax: number;      // 最大怒气
//     shield: number;     // 当前护盾
//     shieldMax: number;  // 最大护盾
}

export interface FinalAttack {
    dbackP: number;         // 反伤比
    bloodP: number;         // 吸血比
    immunity: number;       // 免伤，最后一步计算跟hurtAni位置不同
    immunityP: number;      // 免伤比    

    // 先别搞太复杂
    // dbackPAnti: number;     // 反反伤比
    // bloodPAnti: number;     // 免吸血
    // immunityAnti: number;   // 免伤害减免
    // immunityPAnti: number;  // 免减伤比    
}

export interface FightTypeAttr{
    base: BaseAttack;    
    
    kill: BaseAttack;       // 追击
    next: BaseAttack;       // 连击
    spread: BaseAttack;     // 溅射！

    fback: BaseAttack;      // 反击

    final: FinalAttack;
}

export class FightAttr {
    point: PointAttr;

    speed: number;          // 速度
    
    physic: FightTypeAttr;
    magic: FightTypeAttr;

    heal: BaseAttack;   // 治疗
    poison: BaseAttack; // 下毒

    // restrain: BaseAttack; // property克制会增伤~

    getBaseAttack(name: string) : BaseAttack{
        return (this as any)[name];
    }

    getPointAttr() : PointAttr{
        return this.point;
    }
  
    getAttr(key: string){
        const point = this.point;
        switch(key){
            case 'hp':
                return point.hp;
            case 'mp':
                return point.mp;

            case "hpp":
                return point.hp / point.hpMax;
            case "hplp":
                return (point.hpMax - point.hp) / point.hpMax ;
        }
        return (this as any)[key] || 0;        
    }

    getSpeed() {
        return this.getAttr("speed");
    }
}

