export enum FightSideEnum {
    attack = 0 ,
    defend = 1,
}

export function DesSide(side: FightSideEnum) : FightSideEnum{
    return 1 - side;
}

export enum DiedSelectEnum {
    alive,
    die,
    all,
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
   
    sortAttr?: string;           //用attr的key排序, 否则随机选
    max?: boolean;               //默认 false，取最小
}

export interface SelectParam extends SelectMainParam { 
    num: number;
    shape?: MapShapeEnum; // shape and num 一般只取其一
    //custom?: any;
}


// 显示属性, 需要注入
export interface FightDisplay {
    name: string;
}

