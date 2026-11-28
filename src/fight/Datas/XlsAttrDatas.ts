import { BaseAttack, FinalAttack } from '../FightAttr';

/** 属性预设分类；显式属性引用和组合查找均按单位类型校验。 */
export type XlsUnitType = 'user' | 'summon' | 'monster';

export interface xlsFightTypeAttr {
	/** 普通攻击/主攻击使用的基础属性。 */
	base?: Partial<BaseAttack>;

	/** 击杀追击相对base的属性增量；initAllDatas导入时逐字段相加，省略或{}沿用base；直接传给resolveXlsAttr时须已合并。 */
	kill?: Partial<BaseAttack>; // 追击
	/** 连击/连招相对base的属性增量；initAllDatas导入时逐字段相加，省略或{}沿用base，例如base.attack=100、next.attack=10得到110。 */
	next?: Partial<BaseAttack>; // 连击
	/** 溅射相对base的属性增量；initAllDatas导入时相加，不额外固定减伤；attackP/hurtP等百分比参数也按加法合并。 */
	spread?: Partial<BaseAttack>; // 溅射！

	/** 反击相对base的属性增量；initAllDatas导入时相加；rand沿用base时也会相加，未配置默认为0。 */
	fback?: Partial<BaseAttack>; // 反击

	/** 本物理/魔法分组共用的吸血、反伤、免伤属性。 */
	final?: Partial<FinalAttack>;
}

/** 属性表预设；可省略的数值与攻击属性默认0，非零值须显式配置。 */
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
	/** 初始法力及上限，非负数，单位为点；省略为0。 */
	mp?: number;
	/** 基础速度点数；省略为0。 */
	speed?: number;
	/** 职业字符串，供AI精确匹配。 */
	career: string;
	/** WeaponEnum数值；0表示无兵器，省略为0。 */
	weapon?: number;
	/** PropEnum人物五行；0表示无，省略为0。 */
	charProp?: number;
	/** PropEnum武器五行；0表示无，省略为0。 */
	weaponProp?: number;

	/** 物理基础、阶段增量及最终属性；initAllDatas把base加到next/kill/spread/fback，未提供的字段补0；final独立。 */
	physic?: xlsFightTypeAttr;
	/** 魔法基础、阶段增量及最终属性；导入规则同physic，省略整组时各字段补0。 */
	magic?: xlsFightTypeAttr;
	/** 治疗属性，省略字段默认为0。 */
	heal?: Partial<BaseAttack>;
	/** 毒伤属性，省略字段默认为0。 */
	poison?: Partial<BaseAttack>;

	/** 怒气上限点数；初始怒气0；省略为0。 */
	spMax?: number;
	/** 集气上限点数；初始集气0；省略为0。 */
	jpMax?: number;
	/** 单次输出限伤点数，0表示不限，省略为0。 */
	damageLimit?: number;
}


