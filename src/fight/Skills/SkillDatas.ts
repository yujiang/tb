import { BaseAttack, FinalAttack, PropEnum } from '../FightAttr';
import { IdLevelRand, IdRand, SelectParam, SkillCost } from '../struct';
import { warnSkillConfigs } from './SkillCheck';

//表格化数据
export interface SkillData {
	/** 主动技能表 ID；技能查询以 0 表示无技能，请使用非零 ID。 */
	id: number;
	/** 技能名称；简报/MUD 从客户端本地技能表读取，不随每次攻击重复发送。 */
	name: string;
	/** 可选说明文本，供宿主展示，不参与结算。 */
	desc?: string;

	/** true 使用魔法攻击/防御分组且不做物理命中检查；false 使用物理分组。 */
	magic: boolean;
	/** true跳过物理命中检查，不受目标闪避影响；缺省false，魔法技能原本就不做物理命中检查；不改变发动概率。 */
	alwaysHit?: boolean;
	/** 是否原地施法：0/省略表示需要移动，1表示不移动；缠绕等move禁止状态下仅允许1。普攻装配和各子技能独立读取自身配置。 */
	nomove?: 0 | 1;
	/** 技能五行；缺省时攻击/毒伤取施放者 weaponProp，治疗取 charProp；显式 none 不回退。 */
	skillProp?: PropEnum;

	/** 发动概率，0～1；主攻击及heal/poison/relife/nohurt/observe/entrust/mimic一般填1，注册时只提醒、不改值。类型必填，运行时缺省1；单体每次施放判一次，群体整组判一次，失败仍消耗主动费用/CD，不执行效果或自身Buff；不是命中率，周期Buff不走主动施放判定。 */
	rand: number;

	/** 阵营、目标人数及溅射规则；主动技能需要有效配置，详见 SelectParam；目标资格由技能canTarget判断。mimic配any时单体target为已行动来源，可选双方，非回放指令的效果目标。 */
	sel: SelectParam;
	/** 根主动技能的HP/MP/SP/JP费用，可同时配置；缺省不收费，子技能和装配普攻不重复收费，怪物沿用不耗资源规则。 */
	cost?: SkillCost;
	/** 非负安全整数，全局回合 CD，缺省 0；第 t 回合施放后 t+cd 可再次施放；不随死亡清空。 */
	cd?: number;

	/**
	 * 效果函数：normal/heal/poison/relife/nohurt/observe/entrust/mimic；缺省或未识别名称走 normal。
	 * entrust仅PC普通行动可用，单体选择存活的其他队友，把当前行动位交给目标并重新等其输入，保留目标原行动；费用/CD沿用主动技能配置。
	 * mimic建议单体self，保存本场最近普攻或normal主动技能的输入指令及等级，使用自身属性；保护/防御等不覆盖记录。目标选择及失效回退复用普通流程，群攻不锁定上次目标集合。
	 * mimic配sel.target=any为高级模仿，单体选择任一已实际行动的在场来源，复制其最新指令（含防御、保护、治疗等）及技能等级；双方均可，来源死亡不清记录。敌方来源的普攻/技能清空原target后重选，己方保留原target；回放仍须通过普通校验。
	 * 被模仿技能不要求已学，内部回放指令用ignoreCostCD免除全部资源与CD检查/启动，不改变原技能已有CD；仅结算模仿技能本身的费用/CD，其他检查不变。客户端不能设置ignoreCostCD=true。
	 */
	func?: string;

	// 数据与level加成 => al*(level)+a;
	/** 攻击类数值的固定加成，可填 {}；加到单位对应阶段的 BaseAttack 上。 */
	attack: Partial<BaseAttack>;
	/** 吸血、反伤和免伤数值的固定加成，可填 {}；字段含义见 FinalAttack。 */
	final: Partial<FinalAttack>;
	/** 每级攻击类加成：attackLevel × 技能等级；缺省无成长，0 级仍有 attack 固定值。 */
	attackLevel?: Partial<BaseAttack>;
	/** 每级最终属性加成：finalLevel × 技能等级；缺省无成长。 */
	finalLevel?: Partial<FinalAttack>;

	// rate作用与skill的最后一步
	/** 非负有限数，缺省 1；只缩放单位 attack 数值，再叠加技能固定值和等级成长。 */
	attackRate?: number;
	/** 非负有限数，缺省 1；攻击伤害倍率，与相克和暴击加成相加后应用，不缩放治疗/毒伤。 */
	damageRate?: number;
	/** 非负有限数，缺省 1；治疗公式倍率，与相生/暴击相加；relife 则表示目标 hpMax 的恢复比例。 */
	healRate?: number;
	/** 非负有限数，缺省 1；毒伤公式倍率，与相克加成相加；毒伤不判暴击。 */
	poisonRate?: number;

	/** 溅射子技能 ID，缺省无配置溅射；副目标由该子技能的 sel.num/shape 和 canTarget 选择，使用溅射阶段属性。 */
	spread?: number;
	/** 连击子技能 ID，按子技能 sel 重新选目标，使用 next 阶段属性；缺省无配置连击。 */
	next?: number;
	/** 连招子技能 ID，继承实际主目标，死亡停止，末段统一普通反伤/反击；与 next 同填时 next 优先。 */
	combo?: number;
	/** 击杀后追击子技能 ID，按子技能规则重新选目标，使用 kill 阶段属性；缺省无配置追击。 */
	kill?: number;

	// 命中后可能加buff，减buff！
	/** 命中/效果处理时给目标附加 [Buff ID, Buff 等级, 概率0～1][]；缺省不附加。 */
	addBuff?: IdLevelRand[];
	/** 按 [Buff ID, 概率0～1][] 驱散目标 Buff；字段保留现有 rmeove 拼写，优先于按 tag 驱散。 */
	rmeoveBuff?: IdRand[];
	/** 按分类 tag 驱散目标 Buff；缺省不按 tag 驱散，有 rmeoveBuff 时忽略此项。 */
	removeBuffTag?: string;
	/** 按 tag 驱散的数量上限；正数且少于候选时随机选，缺省或 <=0 移除所有合格候选。 */
	removeBuffNum?: number;
	/** 该段及后续链结束后给自身附加 [Buff ID, 等级, 概率][]；未发动不加，攻击未命中仍加。 */
	afterSelfBuff?: IdLevelRand[];
	/** 技能驱散强度，显式 0 有效，缺省取技能等级；与 Buff 的配置 power 比较。 */
	power?: number;

	/** 效果处理时给施放者装配替代普攻技能；只装配不学习，缺省不变，0 卸下。 */
	attackSkill?: number;
	/** 效果处理时给施放者装配已学反击技能；缺省不变，当前此入口忽略 0。 */
	fbackSkill?: number;
	/** 效果处理时装配协战技能；须已注册且func为normal（省略同normal），否则断言失败；只装配不学习，未学时不参与协战；缺省不变，当前此入口忽略0。 */
	supportSkill?: number;
	/** 效果处理时给施放者装配已学破盾大招；缺省不变，0 卸下，仍需自身打破敌方最后一面盾后自动触发。 */
	ultimateSkill?: number;

	// 类型集合
	/** 数据分类标签，缺省无标签；不代替 noblood 等固定行为开关。 */
	tags?: string[];
	// 程序逻辑，从tags分离出来
	/** true 禁止本次攻击吸血；缺省 false，仅表示不禁止，仍需有效吸血比例。 */
	noblood?: boolean;
	/** true 禁止本次攻击受到普通比例反伤；缺省 false；不控制 BuffReflect 的反射。 */
	nodback?: boolean;
	/** true 禁止本次攻击触发目标反击；缺省 false；专用反击类仍不会互相无限反击。 */
	nofback?: boolean;
	/** true 禁止本次攻击召唤队友协战；缺省 false；群攻/溅射建议填 true，仅告警不强制。 */
	nosupport?: boolean;
	/** true 禁止目标被保护分担本次伤害；缺省 false；群攻/溅射、大招建议填 true。 */
	noprotect?: boolean;
}

const skills = new Map<number, SkillData>();

export function initSkills(datas: SkillData[]) {
	for (const data of datas) {
		skills.set(data.id, data);
	}
	warnSkillConfigs(datas, skills);
}

export function getSkillData(id: number): SkillData {
	if (!id) return;

	return skills.get(id);
}
