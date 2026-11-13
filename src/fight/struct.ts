export enum FightSideEnum {
    attack = 0 ,
    defend = 1,
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
    die?: DiedSelectEnum;       //默认 alive 0
   
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
    name: string;
}


export enum FightCmdEnum{
    none,       //没有来得及发指令, 默认攻击!
    //stand,      //什么都不干
    attack,     //攻击
    //defend,     //防御
    skill,      //技能
    //runaway,    //逃跑
    //catch,      //捕捉宠物
    cancel,     //取消
}

export interface FightInput {
    cmd: FightCmdEnum;
    skill?: number;
    target?: number;
}
