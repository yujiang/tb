export interface XlsSideData {
	/** 队伍模板ID，不是实际阵营0/1，0有效。 */
	id: number;
	/** 编辑用名称，不参与战斗。 */
	name?: string;
	/** 队伍类型，user的ids只查user表，monster的ids只查monster表。 */
	type: 'user' | 'monster';
	/** 对应类型的模板ID列表，可重复；每次生成分配独立运行UID。 */
	ids: number[];
	/** zhen表ID，按ids顺序分配主人/怪物的位置；宠物按前、左、右、后找空位，再随机空位。 */
	zhen: number;
}

const sides = new Map<number, XlsSideData>();

export function initSides(datas: XlsSideData[]) {
	for (const data of datas) {
		sides.set(data.id, data);
	}
}

export function getSideData(id: number): XlsSideData {
	if (!id) return;

	return sides.get(id);
}
