import { BuffData, getBuffData } from "./BuffDatas";

export class FightBuff {
    protected xls: BuffData;
    level = 0; 
    constructor(xls: BuffData, level: number) {
        this.xls = xls;
        this.level = level;
    }

    getId() {
        return this.xls.id;
    }

    inStatus(status: string) {
        return this.xls.status.includes(status);
    }

    getOverlap() {
        return this.xls.overlap;
    }

    hasTag(tag: string) {
        return this.xls.tags.includes(tag);
    }
}

export function createBuff(buff: number, lv: number){
    const xls = getBuffData(buff);
    if (!xls) return null;
    return new FightBuff(xls, lv);
}