// FightData 填xls实现

export interface FightData {
	id: number;
	/** 是否允许逃跑，表格行必填；PC/西游在普通行动位执行，烟雨不接受逃跑输入。 */
	runaway: boolean;
	/** 逃跑等级基准，必填有限数；概率clamp(1-(行动者grade-runawayGrade)/100,0,1)，执行时读取。 */
	runawayGrade: number;
	/** 败方惩罚配置值，必填；0不调用惩罚，单位与执行交给宿主；成功逃跑不惩罚。 */
	deathPenalty: number;
	/** 胜方恢复配置值，必填；单位与执行交给宿主onWin，成功逃跑不恢复。 */
	winRecover: number;
	/** 胜方奖励配置值，必填；含义与发放交给宿主onWin，成功逃跑不发奖。 */
	winReward: number;
	
	/** 攻击方side表ID，缺省时由宿主提供；0有效。 */
	aSide?: number;
	/** 防守方side表ID，缺省时由宿主提供；0有效。 */
	dSide?: number;
}

const fights = new Map<number, FightData>();

export function initFights(datas: FightData[]) {
	for (const data of datas) {
		fights.set(data.id, data);
	}
}

export function getFightData(id: number): FightData {
	if (!id) return;

	return fights.get(id);
}
