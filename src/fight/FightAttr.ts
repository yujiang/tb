// 战斗属性, 需要注入
export enum PropEnum {
    none, //默认，不被克也不被生
    金,木,水,火,土,
};

export enum WeaponEnum {
    none, //默认，不被克也不被生
    拳,刀,枪,棍,棒,奇门,暗器
};

// 传统五行：金克木、木克土、土克水、水克火、火克金；相克返回 1.5，其他返回 1。
export function getAttackMul(a: PropEnum, d: PropEnum){
    const target = attackProps[a];
    return target !== undefined && target !== PropEnum.none && target === d ? 1.5 : 1;
}

// 金生水生木生火生土生金 return 1.5 其他 1
export function getHealMul(a: PropEnum, d: PropEnum){
    const target = healProps[a];
    return target !== undefined && target !== PropEnum.none && target === d ? 1.5 : 1;
}

const attackProps = [PropEnum.none, PropEnum.木, PropEnum.土, PropEnum.火, PropEnum.金, PropEnum.水];
const healProps = [PropEnum.none, PropEnum.水, PropEnum.火, PropEnum.木, PropEnum.土, PropEnum.金];


export interface BaseAttack {
    rand: number;           //发动概率

    hit: number;            //命中
    dodge: number;          //闪避  

    attack: number;         //攻击力
    defend: number;         //防御力

    hurt: number;           //伤害增加
    hurtP: number;          //伤害加成
    hurtAnti: number;       //减伤
    hurtPAnti: number;      //减伤比

    critP: number;           //暴击率，比例值：0.2 表示 20%
    critDeep: number;        //暴击增伤
    critPAnit: number;       //被暴击率减免，与 critP 同为比例值
    critDeepAnit: number;    //被暴击减伤
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
    weapon: WeaponEnum;     // 武器类型
    
    charProp: PropEnum = PropEnum.none;     // 人物属性--被攻击用，也作治疗相生的默认施放属性
    weaponProp: PropEnum = PropEnum.none;   // 武器属性--攻击用

    // npc only.
    weakProp?: PropEnum[];                 // NPC 的五行弱点，直接匹配攻击属性；配置后替代受伤相克
    weakWeapon?: WeaponEnum[];             // NPC 的兵器弱点，直接匹配施放者兵器；命中任一弱点加 0.5

    // 盾，击中弱点盾-1, 盾被击破 = 0, 人物立即进入眩晕状态
    // 然后下一个回合回满盾
    // 盾未破时，伤害变为1半
    // shield = undefined跳过上面
    shield?: number; // attrOri 保存回满值，运行中的 attr 保存当前盾数
    
    physic: FightTypeAttr;
    magic: FightTypeAttr;

    heal: BaseAttack;   // 治疗
    poison: BaseAttack; // 下毒

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

