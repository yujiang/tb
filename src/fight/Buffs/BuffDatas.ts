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
    'beforeHurt' | 'beforeHeal' | 'afterTurn' | 'die' | 'relife' | 'hurt' | 'heal' | 'addBuff' | "removeBuff" | "attr" | "speed";

export interface BuffData extends StaticData{
    class?: string;  // 特殊的类，省略时使用普通 FightBuff
    classParam?: any; // 针对class的参数, 比如自动复活就是血量比例
    // class="relife"：classParam 为 (0, 1] 的数值，省略默认 0.2。
    // class="reflect"：classParam.magicOnly 默认 true，false 时也反射物理伤害。

    overlap: OverlapEnum;    

    useInputTurn: boolean; //使用inputTurn还是fight.Turn，默认false
    lastTurn: number; //持续后续几个对应边界；0 不按回合过期
    
    times: number; //使用次数
    event: FightUnitEvent; //times的时机
    prior?: number; //带 ctx 事件的监听优先级，默认 0，小的先执行，同优先级按注册顺序

    func?: string;
    skill: number;
    skillLevel: number;

    notRemove?: boolean; //不能驱散
    dieNotRemove?: boolean; //die不删除
    notDisplay?: boolean; //客户端不显示

    power?: number; //removeBuff用到， 低power不能移除高power的buff
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


