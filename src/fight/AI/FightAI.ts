import type { FightContex } from "../Fight";
import type { FightInput } from "../struct";
import type { FightUnit } from "../Unit/FightUnit";
import { FightRule } from "../Rules/FightRule";

// AI 在规则的监听、生命周期能力上增加普通行动的决策，一个怪物只绑定一个 AI。
export class FightAI extends FightRule {
    waitInput(unit: FightUnit, turn: number, ctx: FightContex): FightInput | undefined {
        return undefined;
    }
}