import { strict as assert } from 'node:assert';

// 阵型是独立配置，怪物生成只消费 pos；玩家阵型加成可在同一阵型数据上扩展。
export interface ZhenData {
	/** 阵型 ID，0 有效；由宿主预定义，生成阵营时通过此 ID 查位置。 */
	id: number;
	/** 地图尺寸[宽,高]，均为正整数，如[5,5]；XLS组队必填，旧MonsterSide入口可省略。 */
	mapsize?: [number, number];
	/** 平面位置数组，按 ids 列表顺序分配；pos=y*nx+x，从0开始，已用位置需非负整数且不重复。 */
	pos: number[];
}
const zhens = new Map<number, ZhenData>();
export function initZhens(datas: ZhenData[]) {
	for (const data of datas) zhens.set(data.id, data);
}
export function getZhenData(id: number): ZhenData | undefined {
	return zhens.get(id);
}
export function getZhenPos(zhen: number): number[] {
	const data = getZhenData(zhen);
	assert.ok(data, `Unknown formation: ${zhen}`);
	return [...data.pos];
}
