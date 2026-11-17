import { FightContex } from "../Skills/NormalAttack";
import { FightUnit, UnitContextEventFunc, UnitEventFunc } from "../Unit/FightUnit";
import { BuffData, getBuffData } from "./BuffDatas";
import { buffFunc } from "./BuffFuncType";
import { FightStatic } from "./StaticData";

export class FightBuff extends FightStatic{
    protected override xls: BuffData;
    start = 0;
    lastTurn = 0;
    times = 0;
    attacker: FightUnit;
    private lastProcessedTurn: number;
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
                unit.removeBuff(unit, "times", this.getId(), ctx);
            }
        }
    }

    onAdded(unit: FightUnit){
        if (this.xls.event && this.times > 0){
            const func = this.onEvent.bind(this)
            unit.onContex(this.xls.event, func);
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
}

export function createBuff(attacker: FightUnit, buff: number, lv: number, turn: number, inputTurn: number){
    const xls = getBuffData(buff);
    if (!xls) return null;
    const t = xls.useInputTurn ? inputTurn : turn;
    return new FightBuff(xls, lv, attacker, t);
}
