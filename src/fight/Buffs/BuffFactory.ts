import type { FightUnit } from "../Unit/FightUnit";
import { getBuffData } from "./BuffDatas";
import { FightBuff } from "./FightBuff";
import { BuffBuqu } from "./Class/BuffBuqu";
import { BuffRelife } from "./Class/BuffRelife";
import { BuffTaunt } from "./Class/BuffTaunt";
import { BuffReflect } from "./Class/BuffReflect";
import { BuffRest } from "./Class/BuffRest";

export function createBuff(attacker: FightUnit, buff: number, lv: number, turn: number, inputTurn: number): FightBuff {
    const xls = getBuffData(buff);
    if (!xls) return null;
    const t = xls.useInputTurn ? inputTurn : turn;
    const BuffClass = xls.class === "buqu" ? BuffBuqu : xls.class === "relife" ? BuffRelife :
        xls.class === "taunt" ? BuffTaunt : xls.class === "reflect" ? BuffReflect :
        xls.class === "rest" ? BuffRest : FightBuff;
    return new BuffClass(xls, lv, attacker, t);
}
