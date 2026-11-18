import type { FightUnit } from "../Unit/FightUnit";
import { BuffTurnEnum, getBuffData } from "./BuffDatas";
import { FightBuff } from "./FightBuff";
import { BuffBuqu } from "./Class/BuffBuqu";
import { BuffRelife } from "./Class/BuffRelife";
import { BuffTaunt } from "./Class/BuffTaunt";
import { BuffReflect } from "./Class/BuffReflect";
import { BuffRest } from "./Class/BuffRest";
import { BuffProtect } from "./Class/BuffProtect";

export function createBuff(attacker: FightUnit, buff: number, lv: number, turn: number, inputTurn: number,
    afterTurn = Math.max(0, turn - 1)): FightBuff {
    const xls = getBuffData(buff);
    if (!xls) return null;
    const t = xls.turnType === BuffTurnEnum.inputTurn ? inputTurn :
        xls.turnType === BuffTurnEnum.afterTurn ? afterTurn : turn;
    const BuffClass = xls.class === "buqu" ? BuffBuqu : xls.class === "relife" ? BuffRelife :
        xls.class === "taunt" ? BuffTaunt : xls.class === "reflect" ? BuffReflect :
        xls.class === "rest" ? BuffRest : xls.class === "protect" ? BuffProtect : FightBuff;
    return new BuffClass(xls, lv, attacker, t);
}
