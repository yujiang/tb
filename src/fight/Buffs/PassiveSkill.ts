import { PassiveData } from "./PassiveDatas";
import { FightStatic } from "./StaticData";

// 被动技能跟buff反而更像
export class PassiveSkill extends FightStatic{
    protected override xls: PassiveData; 
    constructor(xls: PassiveData, level: number) {
        super(xls, level);
    }
}