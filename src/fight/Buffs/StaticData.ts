import { BaseAttack, FinalAttack } from '../FightAttr';

export interface StaticData {
	/** Buff/被动表 ID；对应查询以 0 表示无配置，请使用非零 ID。 */
	id: number;
	/** 名称，用于宿主展示及客户端本地文案。 */
	name: string;
	/** 说明文本，类型必填，可填空字符串，不参与数值结算。 */
	desc: string;

	/** 状态列表，必填，可用 []；如封印、沉默、禁疗、休息；休息通过action限制跳过主动行动，支持Buff和被动；自身行动和受作用的禁止关系由 FightStatus 分别配置。 */
	status: string[];
	// tags一般作为数据的逻辑，而不要作为程序的逻辑。
	/** 分类标签，必填，可用 []；用于数据筛选和驱散，不代替独立行为字段。 */
	tags: string[];

	/** 修改物理还是魔法攻击分组：true 为魔法；attackType=heal/poison 时由 attackType 决定。 */
	magic: boolean;
	/** 修改阶段：base/next/kill/spread/fback/heal/poison；必填，其他字符串会在属性重算时报错。 */
	attackType: string;

	/** 对指定阶段 BaseAttack 的固定加成，可填 {}；不会修改 attrOri。 */
	attack: Partial<BaseAttack>;
	/** 对所选物理/魔法组 FinalAttack 的固定加成；heal/poison 分组当前不应用 final。 */
	final: Partial<FinalAttack>;
	/** 每级攻击属性加成，乘 Buff/被动自身等级；缺省无成长，0 级保留固定加成。 */
	attackLevel?: Partial<BaseAttack>;
	/** 每级最终属性加成，乘 Buff/被动自身等级；缺省无成长。 */
	finalLevel?: Partial<FinalAttack>;
}

export class FightStatic {
	protected xls: StaticData;
	level = 0;
	constructor(xls: StaticData, level: number) {
		this.xls = xls;
		this.level = level;
	}

	getLevel() {
		return this.level;
	}

	getXls() {
		return this.xls;
	}

	getId() {
		return this.xls.id;
	}

	getData() {
		return this.xls;
	}

	inStatus(status: string) {
		return this.xls.status.includes(status);
	}

	hasTag(tag: string) {
		return this.xls.tags.includes(tag);
	}

	hasAttr() {
		return this.xls.attack || this.xls.final || this.xls.attackLevel || this.xls.finalLevel;
	}
}
