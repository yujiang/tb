export enum OverlapEnum {
    NOT = 0, // 不叠加
    REPLACE = 1, // 替换
}

export interface BuffData {
    id: number;
    name: string;
    desc: string;
 
    overlap: OverlapEnum;
    status: string[];
    tags: string[]; //tag like 增益，建议，封印，毒 ... speed, attack.....
}

const buffs = new Map<number,BuffData>();

export function initBuffs(datas: BuffData[]){
    for (const data of datas) {
        buffs.set(data.id, data);
    }
}

export function getBuffData(id: number) : BuffData{
    if (!id) return;
    return buffs.get(id);
}


