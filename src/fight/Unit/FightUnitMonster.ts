import { SkillCost } from "../Skills/FightSkill";
import { FightCmdEnum } from "../struct";
import { FightUnit } from "./FightUnit";


export class FightUnitMonster extends FightUnit {
    override isMonster() { return true; }

    inputSkill = 0;
    inputStart() {
        // ai来做选择
        if (this.inputSkill) {
            this.input = { cmd: FightCmdEnum.skill, skill: this.inputSkill };
        }
        else {
            this.input = { cmd: FightCmdEnum.none };
        }
    }

    // monster不消耗
    costSkill(cost: SkillCost) {
        return true;
    }
}
