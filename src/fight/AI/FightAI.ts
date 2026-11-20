import type { FightContex } from "../Fight";
import type { FightInput } from "../struct";
import type { FightUnit } from "../Unit/FightUnit";
import { FightBehavior } from "../FightBehavior";
import type { AIData } from "./AIDatas";

// AI与Rule同级，共用FightBehavior的绑定和生命周期；一个怪物只绑定一个AI，负责普通行动决策。
export class FightAI extends FightBehavior<AIData> {
    constructor(xls: AIData = { type: "custom" }) {
        super(xls);
    }

    waitInput(unit: FightUnit, turn: number, ctx: FightContex): FightInput | undefined {
        return undefined;
    }
}

// 与 FightBuff 一致，由基类入口导出工厂，具体类只在工厂中组装。
export { createAI } from "./AIFactory";
