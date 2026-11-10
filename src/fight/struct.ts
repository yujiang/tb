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
    des,
    self,
    
    attackside,
    defendside,
    duiwei,        
}

export enum MapShapeEnum {
    none,
    one, 
    x_line,  // 横线
    y_line,  // 竖线
    cross,   // 十字
    all,
}


export interface SelectParam{
    die: DiedSelectEnum;        //默认 alive 0
    target: TargetSelectEnum;   //默认 des 0
    shape: MapShapeEnum;
    custom?: any;
}
