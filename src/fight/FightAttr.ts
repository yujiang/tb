// 战斗属性, 需要注入
export enum PropEnum {
    none, //默认，不被克也不被生
    金,木,水,火,土,
};

export enum WeaponEnum {
    none, //默认，不被克也不被生
    拳,刀,枪,棍,棒,奇门,暗器
};

export enum CarerrEnum {
    none,
    战士,
    法师,
    控制,
    医生,
}

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
    /** 内置连击/追击/反击发动概率0～1；主动技能是否发动读取SkillData.rand。 */
    rand: number;           //发动概率

    /** 物理命中点数，如100；命中概率=(攻击hit-受击dodge)/100，不是0～1比例。 */
    hit: number;            //命中
    /** 物理闪避点数，如20；被禁止dodge时不做随机判断，直接视为命中。 */
    dodge: number;          //闪避  

    /** 攻击数值，与目标对应分组defend相减；attackRate只缩放此项单位来源值。 */
    attack: number;         //攻击力
    /** 防御数值，物理/魔法读取各自分组，治疗/毒也读取对应分组。 */
    defend: number;         //防御力

    /** 普通攻击/治疗为固定增加值；毒公式为目标当前生命比例，扣抗性后限制0～0.5。 */
    hurt: number;           //伤害增加
    /** 普通攻击/治疗的比例加成，如0.2为20%；扣hurtPAnti后下限0，毒公式不读取。 */
    hurtP: number;          //伤害加成
    /** 抵消施放方hurt，普通公式为固定量，毒公式为比例量。 */
    hurtAnti: number;       //减伤
    /** 抵消施放方hurtP的比例，如0.1抵消10%；毒公式不读取。 */
    hurtPAnti: number;      //减伤比

    /** 暴击概率，0.2表示20%，先减目标critPAnit；毒公式不判暴击。 */
    critP: number;           //暴击率，比例值：0.2 表示 20%
    /** 额外暴击增伤；暴击加成为0.5+clamp(critDeep-目标critDeepAnit,0,1)。 */
    critDeep: number;        //暴击增伤
    /** 降低被暴击概率的比例，保留Anit拼写；不是伤害减免比例。 */
    critPAnit: number;       //被暴击率减免，与 critP 同为比例值
    /** 抵消对方critDeep的暴击增伤比例，保留Anit拼写；不抵消基础0.5加成。 */
    critDeepAnit: number;    //被暴击减伤
}

export interface PointAttr {
    /** 当前生命点数，必填；伤害按实际扣血结算，不扣成负数。 */
    hp: number;         // 当前血量
    /** 最大生命点数，必填；治疗/复活截断到此值，血线规则按hp/hpMax判断。 */
    hpMax: number;      // 最大血量
    /** 当前法力点数，必填；费用允许刚好扣到0，怪物当前不耗资源。 */
    mp: number;         // 当前蓝量
    /** 最大法力点数，必填；由宿主提供，当前没有通用自动回蓝机制。 */
    mpMax: number;      // 最大蓝量

//     sp: number;         // 当前怒气
//     spMax: number;      // 最大怒气
//     shield: number;     // 当前护盾
//     shieldMax: number;  // 最大护盾
}

export interface FinalAttack {
    /** 普通反伤比例，如0.2；读取受击者对应分组，基数为实际扣血，受nodback限制。 */
    dbackP: number;         // 反伤比
    /** 吸血比例，如0.2；基数为实际扣血，受noblood限制，当前伤害>1才尝试。 */
    bloodP: number;         // 吸血比
    /** 普通伤害固定免伤，在基础公式后、技能/生克/暴击合并倍率前扣除。 */
    immunity: number;       // 免伤，最后一步计算跟hurtAni位置不同
    /** 普通伤害比例免伤，在固定immunity后相乘，如0.2为减免20%。 */
    immunityP: number;      // 免伤比    

    // 先别搞太复杂
    // dbackPAnti: number;     // 反反伤比
    // bloodPAnti: number;     // 免吸血
    // immunityAnti: number;   // 免伤害减免
    // immunityPAnti: number;  // 免减伤比    
}

export interface FightTypeAttr{
    /** 普通攻击/主攻击使用的基础属性。 */
    base: BaseAttack;    
    
    /** 击杀追击阶段属性，不自动沿用base。 */
    kill: BaseAttack;       // 追击
    /** 连击/连招阶段属性，不自动沿用base。 */
    next: BaseAttack;       // 连击
    /** 溅射阶段属性，不自动固定减伤，倍率由配置决定。 */
    spread: BaseAttack;     // 溅射！

    /** 反击阶段属性，区别于受伤规则发动的基础属性新攻击。 */
    fback: BaseAttack;      // 反击

    /** 本物理/魔法分组共用的吸血、反伤、免伤属性。 */
    final: FinalAttack;
}

export class FightAttr {
    /** 完整生命/法力结构；资源变化通过单位方法处理，不修改attrOri模拟临时效果。 */
    point: PointAttr;

    /** 速度基础数值，普通行动排序还计初始化乱敏；不影响追加行动的固定插入位置。 */
    speed: number;          // 速度
    /** 服务端兵器枚举，与NPC弱点直接匹配，不自动转换MUD兵器文字。 */
    weapon: WeaponEnum;     // 武器类型
    /** 职业数值，使用CarerrEnum或宿主扩展值；后排医生AI识别CarerrEnum.医生。 */
    career: number;         // 职业
    
    /** 人物五行，默认none；用于受伤相克、治疗相生及治疗施放属性缺省来源。 */
    charProp: PropEnum = PropEnum.none;     // 人物属性--被攻击用，也作治疗相生的默认施放属性
    /** 武器五行，默认none；攻击/毒伤在skillProp省略时使用。 */
    weaponProp: PropEnum = PropEnum.none;   // 武器属性--攻击用

    // npc only.
    /** NPC五行弱点；任一弱点列表已配置就替代受伤相克，[]为无该类弱点，均省略则回退人物相克。 */
    weakProp?: PropEnum[];                 // NPC 的五行弱点，直接匹配攻击属性；配置后替代受伤相克
    /** NPC兵器弱点；五行/兵器任一命中只加一次0.5倍率，不按命中个数叠加。 */
    weakWeapon?: WeaponEnum[];             // NPC 的兵器弱点，直接匹配施放者兵器；命中任一弱点加 0.5

    // 盾，击中弱点盾-1, 盾被击破 = 0, 人物立即进入眩晕状态
    // 然后下一个回合回满盾
    // 盾未破时，伤害变为1半
    // shield = undefined跳过上面
    /** NPC弱点盾，undefined不启用；attrOri为回满值，attr为当前值；0眩晕，下个全局回合前回满。 */
    shield?: number; // attrOri 保存回满值，运行中的 attr 保存当前盾数
    
    /** 完整物理各攻击阶段与最终属性，构造时由宿主提供。 */
    physic: FightTypeAttr;
    /** 完整魔法各攻击阶段与最终属性，构造时由宿主提供。 */
    magic: FightTypeAttr;

    /** 治疗公式的BaseAttack属性，不是FightTypeAttr分组。 */
    heal: BaseAttack;   // 治疗
    /** 毒伤公式的BaseAttack属性，hurt/hurtAnti为当前生命比例，毒伤不判暴击。 */
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

