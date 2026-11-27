/** 属性预设分类；显式属性引用和组合查找均按单位类型校验。 */
export type XlsUnitType = 'user' | 'summon' | 'monster';

/** 模拟数据的扁平属性预设；其他数值由展开入口补齐，不是完整FightAttr快照。 */
export interface XlsAttrData {
	/** 本表唯一整数ID，0有效；供单位attr字段显式引用。 */
	id: number;
	/** 编辑用名称，不参与战斗。 */
	name?: string;
	/** 适用单位类型，必填；组合键的第一项。 */
	type: XlsUnitType;
	/** 单位等级，非负整数，如60或70；组合键的第二项。 */
	grade: number;
	/** 难度档位，整数1～5；组合键第三项，同type/grade/diff禁止重复。 */
	diff: number;
	/** 初始生命及上限，正数，单位为点。 */
	hp: number;
	/** 初始法力及上限，非负数，单位为点。 */
	mp: number;
	/** 基础速度点数。 */
	speed: number;
	/** 职业字符串，供AI精确匹配。 */
	career: string;
	/** WeaponEnum数值；0表示无兵器。 */
	weapon: number;
	/** PropEnum人物五行；0表示无。 */
	charProp: number;
	/** PropEnum武器五行；0表示无。 */
	weaponProp: number;
	/** 物理各阶段attack，单位为点。 */
	physicAttack: number;
	/** 物理各阶段defend，单位为点。 */
	physicDefend: number;
	/** 魔法各阶段attack，单位为点。 */
	magicAttack: number;
	/** 魔法各阶段defend，单位为点。 */
	magicDefend: number;
	/** heal.attack，单位为点。 */
	healAttack: number;
	/** 物理命中点数，100表示100%，不是1。 */
	hit: number;
	/** 物理招架点数，可省略，默认0关闭；命中后按攻击命中与本值计算招架，成功不暴击且完整技能伤害减半。 */
	parry?: number;
	/** 暴击概率0～1，0表示无暴击。 */
	critP: number;
	/** 怒气上限点数；初始怒气0。 */
	spMax: number;
	/** 集气上限点数；初始集气0。 */
	jpMax: number;
	/** 单次输出限伤点数，0表示不限。 */
	damageLimit: number;
}


