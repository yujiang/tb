import type { FightDisplay, FightDisplayInput } from '../struct';

/** 原生、XLS及直接构造共用展示装配；武学编号缺省0，其他可选字段保持省略。 */
export function createUnitDisplay(data: FightDisplayInput): FightDisplay {
	return {
		name: data.name,
		wugong: data.wugong ?? 0,
		neigong: data.neigong ?? 0,
		qinggong: data.qinggong ?? 0,
		...(data.character !== undefined ? { character: data.character } : {}),
		...(data.weaponName !== undefined ? { weaponName: data.weaponName } : {}),
	};
}
