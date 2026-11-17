import { IdLevelArray } from "../struct";
import { FightUnit } from "../Unit/FightUnit";
import { getPassiveData, PassiveData } from "./PassiveDatas";
import { FightStatic } from "./StaticData";

// 被动技能跟buff反而更像
export class PassiveSkill extends FightStatic{
    protected override xls: PassiveData; 
    constructor(xls: PassiveData, level: number) {
        super(xls, level);
    }

    onInit(unit: FightUnit){
        const xls = this.xls;
        if (xls.addbuff){
            unit.addBuffsByPassiveSkill(xls.addbuff)
        }
    }
}

export function createPassiveSkills(passiveSkills: IdLevelArray){
    return passiveSkills.map(
        ([id, level]) => new PassiveSkill(getPassiveData(id), level)
    )
}