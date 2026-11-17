import { StaticData } from "./StaticData";

export enum OverlapEnum {
    NOT = 0, // 不叠加
    REPLACE = 1, // 替换
}

// buff 有 4种
// 1. 状态，比如封印
// 2. 改变属性attr， 比如增益和减益
// 3. 每个回合起作用，加血和扣血
// 4. 有次数，比如减伤3次后消失
export type FightUnitEvent = 
    'die' | 'relife' | 'hurt' | 'heal' | 'addBuff' | "removeBuff" | "attr" | "speed";

export interface BuffData extends StaticData{
    overlap: OverlapEnum;    

    useInputTurn: boolean; //使用inputTurn还是fight.Turn，默认false
    lastTurn: number; //持续后续几个对应边界；0 不按回合过期
    
    times: number; //使用次数
    event: FightUnitEvent; //times的时机

    func?: string;
    skill: number;
    skillLevel: number;
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


