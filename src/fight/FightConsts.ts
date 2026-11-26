import { strict as assert } from 'node:assert';

/** 全库共用的战斗常量配置；创建FightAttr时读取默认值，宿主可从自己的常量表加载。 */
export interface FightConstData {
	/** 每点实际受伤增加的怒气，非负有限数；默认0，0不增加，例如0.2表示受伤100点增加20怒气。 */
	spHurtRate: number;
	/** 每点实际输出伤害或实际治疗增加的怒气，非负有限数；默认0，伤害和治疗共用此倍率。 */
	spOutputRate: number;
	/** 每次有效行动条行动结束时，单位默认增加的集气点数，非负有限数；默认1，允许小数及显式0。 */
	jpAdd: number;
}

const values: FightConstData = {
	spHurtRate: 0,
	spOutputRate: 0,
	jpAdd: 1,
};

/** 当前公共默认值，只读查询；通过initFightConsts更新，不回写已经创建的属性。 */
export const fightConsts: Readonly<FightConstData> = values;

/** 按字段更新公共默认值，省略的字段保留原值；整批校验通过后才生效。 */
export function initFightConsts(data: Partial<FightConstData>) {
	const next = { ...values, ...data };
	const fields = Object.keys(values) as (keyof FightConstData)[];
	for (const field of fields) {
		assert.ok(
			Number.isFinite(next[field]) && next[field] >= 0,
			`${field} must be finite and nonnegative`,
		);
	}
	for (const field of fields) values[field] = next[field];
}
