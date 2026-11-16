import { StaticData } from "./StaticData";

export enum OverlapEnum {
    NOT = 0, // 不叠加
    REPLACE = 1, // 替换
}

export interface BuffData extends StaticData{
    overlap: OverlapEnum;    
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


