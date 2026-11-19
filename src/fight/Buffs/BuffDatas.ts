import { StaticData } from "./StaticData";

export enum OverlapEnum {
    NOT = 0,                // 不叠加
    REPLACE = 1,            // 替换
    RELPACE_BYPOWER = 2,    // 高power替换低的: 比如2个毒buff，一个更深可以替换掉原来的
}

export enum BuffTurnEnum {
    thisTurn,  // 全局回合前
    inputTurn, // 单位输入次数
    afterTurn, // 全局回合后
}

// buff 有 5种
// 1. 状态，比如封印
// 2. 改变属性attr， 比如增益和减益
// 3. 每个回合起作用，加血和毒（扣血）
// 4. 有次数，比如减伤3次后消失
// 5. 特殊的buff，用class, classParam字段来派生
// 但是1~5并不互斥，可以同时存在，所以没有type字段

export type FightUnitEvent = 
    'beforeHurt' | 'beforeHeal' | 'afterTurn' | 'die' | 'relife' | 'hurt' | 'heal' | 'hp' | 'break' | 'addBuff' | "removeBuff" | "attr" | "speed";
// break(unit, ctx, attacker, allBroken)：盾正数变 0 时；allBroken 为该瞬间本阵营全体存活单位破盾的快照。
// hp(unit, ctx, attacker, previous, current)：真实生命值变化，包含分担扣血与截断后的治疗。
// hurt(unit, ctx, attacker, damage, pending)：最后一项提供 HurtOptions/source；分担伤害仍不发 hurt。

export type BuffFuncEnum = 'poison' | 'heal'

export interface BuffData extends StaticData{
    class?: string;  // 特殊的类，省略时使用普通 FightBuff
    classParam?: any; // 针对class的参数, 比如自动复活就是血量比例
    // class="relife"：classParam 为 (0, 1] 的数值，省略默认 0.2。
    // class="reflect"：classParam.magicOnly 默认 true，false 时也反射物理伤害。

    overlap: OverlapEnum;    

    turnType?: BuffTurnEnum;    //计时/周期触发边界，默认 thisTurn
    lastTurn: number;           //持续后续几个对应边界；0 不按回合过期
    
    times: number;              //使用次数
    event: FightUnitEvent;      //times发生和扣除的时机
    prior?: number;             //带 ctx 事件的监听优先级，默认 0，小的先执行，同优先级按注册顺序

    func?: BuffFuncEnum;        
    skill?: number;             //类型3对应的skill
    skillLevel?: number;

    notRemove?: boolean;        //不能驱散
    dieNotRemove?: boolean;     //die不删除
    notDisplay?: boolean;       //客户端不显示

    power?: number;             //removeBuff用到， 低power不能移除高power的buff
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


