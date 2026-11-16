import { SkillCost } from "../Skills/FightSkill";
import { FightContex } from "../Skills/NormalAttack";
import { FightUnit, UnitType } from "./FightUnit";


export class FightUnitCost extends FightUnit {
    canCost(cost: SkillCost) {
        const point = this.attr.point;
        if (cost.hp && point.hp <= cost.hp)
            return false;
        if (cost.mp && point.mp < cost.mp)
            return false;

        return true;
    }

    costSkill(cost: SkillCost, ctx: FightContex) {
        if (!this.canCost(cost)) return false;
        const point = this.attr.point;
        if (cost.hp){
            point.hp -= cost.hp;
            ctx.msgs.push(["costHp",this.uid, cost.hp, point.hp])            
        }
        if (cost.mp){
            point.mp -= cost.mp;
            ctx.msgs.push(["costMp",this.uid, cost.mp, point.mp])            
        }
        return true;
    }
}

export class FightUnitUser extends FightUnitCost {
    override type = UnitType.user
}


export class FightUnitSummon extends FightUnitCost {
    override type = UnitType.summon
}
