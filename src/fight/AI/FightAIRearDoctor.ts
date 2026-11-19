import { FightAI } from "./FightAI";
import type { FightContex } from "../Fight";
import type { FightUnit } from "../Unit/FightUnit";
import { CarerrEnum } from "../FightAttr";
import { DiedSelectEnum, EnemySide, FightCmdEnum, FightInput } from "../struct";

// 优先普攻后排医生；没有合适目标时不指定目标，沿用战斗默认选目标规则。
export class FightAIRearDoctor extends FightAI {
    override waitInput(unit: FightUnit, turn: number, ctx: FightContex): FightInput | undefined {
        const map = ctx.fight.map;
        if (!map || unit.isDied() || unit.isForbid("attack") || unit.getActionBlockBuff()) return undefined;
        const doctors = ctx.fight.getSideUnitsDie(EnemySide(unit.side), DiedSelectEnum.alive)
            .filter(target => target.attr.career === CarerrEnum.医生 && map.isBackRow(target.pos));
        if (!doctors.length) return undefined;
        const target = doctors.length === 1 ? doctors[0] : ctx.fight.randArray(doctors);
        return { cmd: FightCmdEnum.attack, target: target.uid };
    }
}
