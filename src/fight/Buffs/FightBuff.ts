import { FightContex } from "../Fight";
import { FightUnit, UnitContextEventFunc, UnitEventFunc } from "../Unit/FightUnit";
import { BuffData } from "./BuffDatas";
import { buffFunc } from "./BuffFuncType";
import { FightStatic } from "./StaticData";

export const MAX_POWER = 99;

export class FightBuff extends FightStatic{
    protected override xls: BuffData;
    start = 0;
    lastTurn = 0;
    times = 0;
    attacker: FightUnit;
    private lastProcessedTurn: number;

    //level用于
    constructor(xls: BuffData, level: number, attacker: FightUnit, turn:number) {        
        super(xls, level);
        this.attacker = attacker;
        this.start = turn;
        this.lastProcessedTurn = turn;
        this.lastTurn = xls.lastTurn;
        this.times = xls.times || 0;
    }

    func: UnitContextEventFunc;
    onEvent(unit: FightUnit, ctx:FightContex, ...args: any[]){
        if (unit.findBuff(this.getId()) !== this) return;
        if (this.times > 0){
            this.times --;
            if (this.times <= 0 ){
                unit.expireBuff(this, "times", ctx);
            }
        }
    }

    onAdded(unit: FightUnit){
        if (this.xls.event && this.times > 0){
            const func = this.onEvent.bind(this)
            unit.onContex(this.xls.event, func, this.xls.prior ?? 0);
            this.func = func;
        }
    }

    onRemoved(unit: FightUnit){
        if (this.xls.event && this.func){
            unit.offContex(this.xls.event, this.func);
            this.func = null;
        }
    }

    override getXls(){
        return this.xls;
    }

    useInputTurn() {
        return this.xls.useInputTurn;
    }

    getOverlap() {
        return this.xls.overlap;
    }

    getFunc() {
        return this.xls.func;
    }

    // 特殊目标约束由具体 Buff 提供，普通 Buff 不改变目标。
    getTauntTarget(): FightUnit | undefined {
        return undefined;
    }

    blocksAction(): boolean {
        return false;
    }

    // onTurn(turn: number){
    //     if (this.useInputTurn()) return false;
    //     return this.doTurn(turn);
    // }

    // inputStart(turn: number, inputTurn: number){
    //     if (!this.useInputTurn()) return false;
    //     return this.doTurn(inputTurn);
    // }

    doTurn(unit: FightUnit, turn: number, ctx: FightContex){
        if (turn <= this.lastProcessedTurn) return false;
        this.lastProcessedTurn = turn;
        const end = this.start + this.lastTurn;
        if (this.lastTurn > 0 && turn > end) return true;
        if (this.xls.func) {
            buffFunc(unit, this, ctx);
        }
        return this.lastTurn > 0 && turn >= end;
    }

    getPower() {
        return this.xls.power ?? this.getLevel();
    }

    // 武器装备的buf可能死亡也需要保留
    canRemoveByDie(){
        return !this.xls.dieNotRemove;
    }

    // 被动技能的无法remove
    canRemove(power: number){
        if (this.xls.notRemove) return false;
        return power >= this.getPower();
    }

    notDisplay(){
        return this.xls.notDisplay;
    }

    getDisplayMsg(){
        if (this.notDisplay()) return;
        return [this.getId(), this.level, this.start, this.lastTurn];
    }
}

// 具体子类的创建集中到工厂，这里保留原有导出路径。
export { createBuff } from "./BuffFactory";
