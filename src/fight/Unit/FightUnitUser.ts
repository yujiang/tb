import { SkillCost } from "../Skills/FightSkill";
import { FightContex } from "../Skills/NormalAttack";
import { FightUnit, UnitType } from "./FightUnit";


export class FightUnitCost extends FightUnit {
    canCost(cost: SkillCost) {
        if (cost.hp && this.attr.hp <= cost.hp)
            return false;
        if (cost.mp && this.attr.mp < cost.mp)
            return false;

        return true;
    }

    costSkill(cost: SkillCost, ctx: FightContex) {
        if (!this.canCost(cost)) return false;
        if (cost.hp){
            this.attr.hp -= cost.hp;
            ctx.msgs.push(["costHp",this.uid, cost.hp, this.attr.hp])            
        }
        if (cost.mp){
            this.attr.mp -= cost.mp;
            ctx.msgs.push(["costMp",this.uid, cost.mp, this.attr.mp])            
        }
        return true;
    }
    inputStart() {
        this.input = null;
        // send msg to client ...
    }
}

export class FightUnitUser extends FightUnitCost {
    override type = UnitType.user
}


export class FightUnitSummon extends FightUnitCost {
    override type = UnitType.summon
}
