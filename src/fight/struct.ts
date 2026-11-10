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
    des,
    
    this_x_line = 10,   //横排
    this_y_line,        //竖排
    this_cross,
    this_all,

    des_x_line = 20,
    des_y_line,
    des_cross,

    duiwei = 30,        // 对位, 无target...
    duiwei_xline,       // 对位x横排
    duiwei_yline,       // 对位y竖排
    duiwei_cross,       // 对位十字开花...

    des_all,
   
    custom_start,       // 自定义
}

export function is_this_line(target: TargetSelectEnum) {
    return target >= TargetSelectEnum.this_x_line && target <= TargetSelectEnum.this_all;    
}

export function is_des_line(target: TargetSelectEnum) {
    return target >= TargetSelectEnum.des_x_line && target <= TargetSelectEnum.des_all;
}

export function is_duiwei(target: TargetSelectEnum) {
    return target >= TargetSelectEnum.duiwei && target <= TargetSelectEnum.duiwei_cross;
}

export enum MapSelectEnum {
    none,
    x_line,
    y_line,
    cross,
}

