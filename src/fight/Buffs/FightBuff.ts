import { BuffData, getBuffData } from "./BuffDatas";
import { FightStatic } from "./StaticData";

export class FightBuff extends FightStatic{
    protected override xls: BuffData;
    constructor(xls: BuffData, level: number) {
        super(xls, level);
    }

    getOverlap() {
        return this.xls.overlap;
    }
}

export function createBuff(buff: number, lv: number){
    const xls = getBuffData(buff);
    if (!xls) return null;
    return new FightBuff(xls, lv);
}