import { SkillCost } from "../Skills/FightSkill";
import { FightContex } from "../Skills/NormalAttack";
import { FightCmdEnum } from "../struct";
import { FightUnit } from "./FightUnit";


export class FightUnitMonster extends FightUnit {
    override isMonster() { return true; }

    inputSkill = 0;
    override inputStart(turn: number, ctx: FightContex) {
        super.inputStart(turn,ctx);
        // ai来做选择
        if (this.inputSkill) {
            this.input = { cmd: FightCmdEnum.skill, skill: this.inputSkill };
        }
        else if (this.skills.size > 0) {
            //没有指定技能，随机选择一个
            this.input = { cmd: FightCmdEnum.skill, skill: this.skills.keys().next().value };
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
