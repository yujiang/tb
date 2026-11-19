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

export enum DiedSelectEnum {
    all,
    alive,
    die,
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
}

export interface SelectMainParam{
    target: TargetSelectEnum;   //默认 des 0
    die?: DiedSelectEnum;       //默认 alive；显式 all 才包含死亡单位
   
    sortAttr?: string;          //用attr的key排序, 否则随机选
    sortDescend?: boolean;      //降序 默认false
}

export interface SelectParam extends SelectMainParam { 
    num?: number;
    shape?: MapShapeEnum; // shape and num 一般只取其一
    //custom?: any;
}


// 显示属性, 需要注入
export interface FightDisplay {
    /** 客户端人物描述表 ID，0 也是有效值。 */
    character?: number | string;
    name: string;
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
    turn?: number; // FightLoopWest/YanYu 的网络输入必须携带当前回合；PC/本地可省略，提供时必须匹配
    cmd: FightCmdEnum;
    skill?: number;
    target?: number;
}

export type IdLevel = [number,number];
export type IdRand = IdLevel;
export type IdLevelRand = [number,number,number];
export type IdLevelArray = IdLevel[];


export type fightMsg = [string, ...any[]];


export interface SkillCost {
    hp?: number;
    mp?: number;
}
