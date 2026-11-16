import { BaseAttack, FinalAttack } from "../FightAttr";

export interface StaticData {
    id: number;
    name: string;
    desc: string;
 
    status: string[];       //封印，沉默，禁疗等
    tags: string[];         //增益，减益，封印，毒 ... speed, attack.....  

    magic: boolean;
    attackType: string;     // base, next, kill, spread, fback, heal, poison
    attack: Partial<BaseAttack>;
    final: Partial<FinalAttack>;
}


export class FightStatic {
    protected xls: StaticData;
    level = 0; 
    constructor(xls: StaticData, level: number) {
        this.xls = xls;
        this.level = level;
    }

    getId() {
        return this.xls.id;
    }

    inStatus(status: string) {
        return this.xls.status.includes(status);
    }

    hasTag(tag: string) {
        return this.xls.tags.includes(tag);
    }

    hasAttr(){
        return this.xls.attack || this.xls.final;
    }
}
