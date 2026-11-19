import { strict as assert } from "node:assert";

// 阵型是独立配置，怪物生成只消费 pos；玩家阵型加成可在同一阵型数据上扩展。
export interface ZhenData {
    id: number;
    pos: number[];
}
const zhens = new Map<number, ZhenData>();
export function initZhens(datas: ZhenData[]) {
    for (const data of datas) zhens.set(data.id, data);
}
export function getZhenData(id: number): ZhenData | undefined { return zhens.get(id); }
export function getZhenPos(zhen: number): number[] {
    const data = getZhenData(zhen);
    assert.ok(data, `Unknown formation: ${zhen}`);
    return [...data.pos];
}
