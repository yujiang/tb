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

// 比如攻击前排, 攻击后排, 攻击对位... ?

export enum TargetSelectEnum {
    self,
    duiwei,        
    des_or_random, //如果没有指定目标, 则随机一个
}

export enum MapShapeEnum {
    none,
    x_line,  // 横线
    y_line,  // 竖线
    cross,   // 十字
}

export interface SelectMainParam{
    target: TargetSelectEnum;   //默认 des 0
    die: DiedSelectEnum;        //默认 alive 0

    attackSide: boolean;        //默认 false，对方
    includeAttack: boolean;     //默认 false，如果是己方不包括自己
    sort?: string;              //用attr的key排序, 否则随机选
    max?: boolean;              //默认 false，取最小
}

export interface SelectParam extends SelectMainParam { 
    num: number;
    shape: MapShapeEnum; // shape and num 一般只取其一

    custom?: any;
}


// 显示属性, 需要注入
export interface FightDisplay {
    name: string;
}

