import { BaseAttack, FinalAttack } from "../FightAttr";
import { StaticData } from "./StaticData";

export interface PassiveData extends StaticData{
}

const passives = new Map<number,PassiveData>();

export function initPassives(datas: PassiveData[]){
    for (const data of datas) {
        passives.set(data.id, data);
    }
}

export function getPassiveData(id: number) : PassiveData{
    if (!id) return;
    return passives.get(id);
}
