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
    /** 特殊实现名：buqu/relife/taunt/reflect/rest/protect；省略或未知名使用普通 FightBuff。 */
    class?: string;
    /** 子类参数：relife 为最大生命比例(0,1]、缺省0.2；reflect 为 {magicOnly?:boolean}、缺省true；其他内置类不读此项。 */
    classParam?: any;
    // class="relife"：classParam 为 (0, 1] 的数值，省略默认 0.2。
    // class="reflect"：classParam.magicOnly 默认 true，false 时也反射物理伤害。

    /** 同 ID 重复添加：NOT 保留旧实例，REPLACE 替换，REL​​PACE_BYPOWER 按 power 再等级比较；详见枚举实际拼写。 */
    overlap: OverlapEnum;

    /** 持续时间和周期效果的边界；缺省 thisTurn=全局回合前，inputTurn=本单位输入次数，afterTurn=全局回合后。 */
    turnType?: BuffTurnEnum;
    /** 持续的对应边界次数，必填；正数最后一次生效后移除，0 不按回合到期；不是秒数。 */
    lastTurn: number;
    
    /** 事件使用次数，类型必填，0 不按次数到期；普通 Buff 在 event 后扣减；不屈/自动复活固定一次。 */
    times: number;
    /** 普通次数 Buff 的计次事件；必须使用带 ctx 的事件，attr/speed 不是该签名；特殊类可固定监听别的事件。 */
    event: FightUnitEvent;
    /** 监听优先级，小的先执行，同级按注册顺序；普通/反射默认0，保护500，不屈/自动复活1000。 */
    prior?: number;

    /** 周期效果 heal 或 poison，缺省不执行周期数值效果；与状态、属性、特殊类可组合。 */
    func?: BuffFuncEnum;
    /** 周期效果引用的技能 ID；需已注册，用其原始配置计算，不再合并施放者单位属性。 */
    skill?: number;
    /** 周期引用技能的等级，缺省0；与 Buff 自身用于属性成长的 level 分开。 */
    skillLevel?: number;

    /** true 禁止外部驱散；缺省false，自然到期、次数耗尽、死亡清理仍各自处理。 */
    notRemove?: boolean;
    /** true 死亡时保留；缺省false；自动复活 Buff 必须填 true 才能在死后继续监听。 */
    dieNotRemove?: boolean;
    /** true 不进入单位 Buff 展示列表；缺省false，不影响实际效果与服务端结算。 */
    notDisplay?: boolean;

    /** Buff 驱散强度，当前实现缺省0，显式0有效；驱散只比 power，覆盖同 ID 时还比较 Buff 等级。 */
    power?: number;
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


