import { FightAI } from "./FightAI";
import { FightAIRearDoctor } from "./FightAIRearDoctor";

// 每只怪物只选一个决策 AI；固定行为组合放在 RuleData 中。
export interface AIData {
    /** rearDoctor：普攻优先敌方存活后排医生，多人随机；无候选回退默认目标，嘲讽仍可覆盖。 */
    type: "rearDoctor";
}

export function createAI(data: AIData): FightAI {
    switch (data.type) {
        case "rearDoctor": return new FightAIRearDoctor();
        default: throw new Error(`Unknown AI type: ${data.type}`);
    }
}
