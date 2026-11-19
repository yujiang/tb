import { FightAI } from "./FightAI";
import { FightAIHp, HpAxisLine } from "./FightAIHp";
import { FightAITurn } from "./FightAITurn";
import { FightAIHurt } from "./FightAIHurt";

// 模板只放配置，每次生成怪物都创建新 AI 实例，不共享计数、阶段或监听。
export type AIData = { prior?: number } & (
    { type: "hp"; lines: HpAxisLine[] } |
    { type: "turn"; every: number; skill: number } |
    { type: "hurt"; every: number; skill?: number }
);

export function createAI(data: AIData): FightAI {
    switch (data.type) {
        case "hp": return new FightAIHp(data.lines);
        case "turn": return new FightAITurn(data.every, data.skill);
        case "hurt": return new FightAIHurt(data.every, data.skill);
        default: throw new Error(`Unknown AI type: ${(data as { type: string }).type}`);
    }
}
