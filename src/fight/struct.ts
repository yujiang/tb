export enum FightSideEnum {
    attack = 0 ,
    defend = 1,
}

export enum FightResultEnum {
    ongoing = -1,
    attack = 0,
    defend = 1,
    draw = 2,
}

export function EnemySide(side: FightSideEnum) : FightSideEnum{
    return 1 - side;
}

export enum TargetSelectEnum {
    self,
    duiwei,     // 对位  
    friend,     // 己方：加血，buff
    enmey,      // 敌方：伤害, debuff
}

export enum MapShapeEnum {
    none,
    x_line,  // 横线
    y_line,  // 竖线
    cross,   // 十字
    cross_line,
}

export interface SelectParam{
    /** 目标类型，必填：self自身、duiwei对位、friend己方、enmey敌方；直接群体施放仅支持friend/enmey，其他组合注册时warn；保留现有 enmey 拼写。 */
    target: TargetSelectEnum;
    /** 直接施放时为总人数，缺省1，>1为群体，99可覆盖全体；作为溅射子技能时为副目标人数，不含主目标，0不选。 */
    num?: number;
    /** 溅射子技能的形状，配置后优先于num；省略按人数，none不是有效形状；直接群体施放不使用。 */
    shape?: MapShapeEnum;
   
    /** 候选排序键，来自 FightAttr.getAttr，如hp/hpp/hplp/speed；缺省随机，不能使用嵌套属性路径。 */
    sortAttr?: string;
    /** 排序是否降序，缺省false升序；仅配置sortAttr时生效。 */
    sortDescend?: boolean;
}



// 显示属性, 需要注入
export interface FightDisplay {
    /** 客户端人物描述表xlsCharacter的键，数字或字符串，0有效；缺省使用默认文案。 */
    character?: number | string;
    /** 单位显示名称，由宿主提供，初始化时传给客户端。 */
    name: string;
}


export enum InsertActionPos {
    first,      // 剩余队列最前（默认）
    last,       // 剩余队列最后
    random,     // 剩余队列的随机间隙
    afterSelf,  // 自己的普通行动后，已行动则插到最前
}

export interface FightActionDisplay {
    /** 本场行动记录ID，区分同一单位的多次出手，不能用uid代替。 */
    id: number;
    /** 此条行动的单位uid，可以与其他行动重复。 */
    uid: number;
    /** 追加技能行动的技能ID；普通行动或追加普攻可省略。 */
    skill?: number;
    /** true表示独立追加行动，缺省表示普通行动；供客户端行动条标注。 */
    inserted?: boolean;
}

export enum FightCmdEnum{
    none,       //没有来得及发指令, 默认攻击!
    //stand,      //什么都不干
    attack,     //攻击
    defend,     //防御
    skill,      //技能
    //runaway,    //逃跑
    //catch,      //捕捉宠物
    cancel,     //取消
    protect,    //保护队友，行动优先级高于普通指令
}

export interface FightInput {
    /** West/YanYu网络入口必填当前全局回合；PC入口可省略，提供时须匹配；底层本地调用可省略。 */
    turn?: number;
    /** 指令枚举：none默认普攻、attack、defend、skill、cancel、protect；必须由宿主先鉴权。 */
    cmd: FightCmdEnum;
    /** cmd=skill时的已学技能ID；独立大招入口可省略，按装备的ultimateSkill推导。 */
    skill?: number;
    /** 明确目标的运行uid，0有效；省略才自动选择，非法明确目标不会自动换人。 */
    target?: number;
}

/** [配置ID, 等级]；等级0有效，按对应表查找。 */
export type IdLevel = [number,number];
/** [配置ID, 概率0～1]；虽然复用了IdLevel的元组结构，第二项不是等级。 */
export type IdRand = IdLevel;
/** [Buff ID, Buff等级, 附加概率0～1]。 */
export type IdLevelRand = [number,number,number];
/** 技能/被动/初始化Buff等的[ID,等级]列表。 */
export type IdLevelArray = IdLevel[];


export type fightMsg = [string, ...any[]];


export interface SkillCost {
    /** 生命点数费用，建议非负数；省略/0不扣，玩家/召唤物支付后必须仍>0，怪物不耗资源。 */
    hp?: number;
    /** 法力点数费用，建议非负数；省略/0不扣，玩家/召唤物允许刚好用完。 */
    mp?: number;
}
