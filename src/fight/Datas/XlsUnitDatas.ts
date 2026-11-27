import { MonsterData } from "./MonsterDatas";

/** 三类单位共用的表格模板；原生MonsterData仍接收完整attr。 */
export interface XlsUnitData extends Omit<MonsterData, 'attr' | 'ai' | 'rules'> {
	/** 显式attr表ID，0有效；省略才按type+grade+diff查找，填错ID不回退。 */
	attr?: number;
	/** 组合查找等级，省略attr时必填非负整数；显式attr时忽略。 */
	grade?: number;
	/** 组合查找难度，省略attr时必填整数1～5；显式attr时忽略。 */
	diff?: number;
	/** 怪物AI表ID，省略无AI；不是运行AI实例。 */
	aiId?: number;
	/** 怪物rule表ID数组，省略空；按此顺序创建独立实例。 */
	ruleIds?: number[];
}

/** 玩家表不提供普攻/反击/协战/大招装配字段；被动技能仍可装配。 */
export interface XlsUserData extends Omit<
	XlsUnitData,
	'attackSkill' | 'fbackSkill' | 'supportSkill' | 'ultimateSkill'
> {
	/** 出战宠物的summon表ID，省略不出战；0有效，可同时列于summons，但本场不再作为备用宠物。 */
	fightSummon?: number;
	/** 可替换宠物的summon表ID数组，省略空；除初始fightSummon外按需创建，每个配置本场只可召唤一次。 */
	summons?: number[];
}

export type XlsMonsterData = XlsUnitData;
export type XlsSummonData = XlsUnitData;

const monsters = new Map<number, XlsMonsterData>();

export function initMonsters(datas: XlsMonsterData[]) {
	for (const data of datas) {
		monsters.set(data.id, data);
	}
}

export function getMonsterData(id: number): XlsMonsterData {
	if (!id) return;

	return monsters.get(id);
}


const users = new Map<number, XlsUserData>();

export function initUsers(datas: XlsUserData[]) {
	for (const data of datas) {
		users.set(data.id, data);
	}
}

export function getUserData(id: number): XlsUserData {
	if (!id) return;

	return users.get(id);
}

const summons = new Map<number, XlsSummonData>();

export function initSummons(datas: XlsSummonData[]) {
	for (const data of datas) {
		summons.set(data.id, data);
	}
}

export function getSummonData(id: number): XlsSummonData {
	if (!id) return;

	return summons.get(id);
}