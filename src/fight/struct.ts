export enum FightSideEnum {
	attack = 0,
	defend = 1,
}

export enum FightResultEnum {
	ongoing = -1,
	attack = 0,
	defend = 1,
	draw = 2,
	outoftime = 3,
}

export function EnemySide(side: FightSideEnum): FightSideEnum {
	return 1 - side;
}

export enum TargetSelectEnum {
	self,
	duiwei, // 对位
	friend, // 己方：加血，buff
	enemy, // 敌方：伤害, debuff
	any, // 任意
}

export enum MapShapeEnum {
	none,
	x_line, // 横线
	y_line, // 竖线
	cross, // 十字
	cross_line,
}

export interface SelectParam {
	/** 目标类型，必填：self自身、duiwei对位、friend己方、enemy敌方、any任意阵营（含自身）；直接群体支持friend/enemy/any，其他组合注册时warn。mimic配any时单体选择任一已行动来源，配self时使用全局最近攻击。 */
	target: TargetSelectEnum;
	/** 直接施放时为总人数，缺省1，>1为群体，99可覆盖全体；作为溅射子技能时为副目标人数，不含主目标，0不选。 */
	num?: number;
	/** 溅射子技能的形状，配置后优先于num；省略按人数，none不是有效形状；直接群体施放不使用。 */
	shape?: MapShapeEnum;

	/** 候选排序键，来自 FightAttr.getAttr，如hp/hpp/hplp/speed；缺省随机，不能使用嵌套属性路径。 */
	sortAttr?: string;
	/** 排序是否降序，缺省false升序；仅配置sortAttr时生效。 */
	sortDescend?: boolean;
}

// 显示属性, 需要注入
export interface FightDisplay {
	/** 客户端人物描述表xlsCharacter的键，数字或字符串，0有效；缺省使用默认文案。 */
	character?: number | string;
	/** 单位显示名称，由宿主提供，初始化时传给客户端。 */
	name: string;
}

export enum InsertActionPos {
	first, // 剩余队列最前（默认）
	last, // 剩余队列最后
	random, // 剩余队列的随机间隙
	afterSelf, // 自己的普通行动后，已行动则插到最前
}

/** [当前速度倍率, 已学技能ID]；倍率为非负有限数，0有效；技能0表示出手时由AI重新决策，无AI则普攻。 */
export type SpeedSkill = [number, number];

export interface FightActionDisplay {
	/** 本场行动记录ID，区分同一单位的多次出手，不能用uid代替。 */
	id: number;
	/** 此条行动的单位uid，可以与其他行动重复。 */
	uid: number;
	/** 追加技能行动的技能ID；普通行动或追加普攻可省略。 */
	skill?: number;
	/** true表示独立追加行动，缺省表示普通行动；供客户端行动条标注。 */
	inserted?: boolean;
	/** 按速度排序的追加行动倍率（模板extraAction或规则）；非负有限数，0有效；省略则按固定插入位置，实际速度随单位速度变化。 */
	speedRate?: number;
}

export enum FightCmdEnum {
	none, //没有来得及发指令, 默认攻击!
	//stand,    //什么都不干
	attack, //攻击
	defend, //防御
	skill, //技能
	runaway, //逃跑
	//catch,    //捕捉宠物
	dismiss, // 移除单位，target必填；怪物可移除怪物，召唤物校验user归属，玩家不可移除
	cancel, //取消
	protect, //保护队友，行动优先级高于普通指令
}

export interface FightInput {
	/** West/YanYu网络入口必填当前全局回合；PC入口可省略，提供时须匹配；底层本地调用可省略。 */
	turn?: number;
	/** 指令枚举：none默认普攻、attack、defend、skill、runaway逃跑、dismiss移除、cancel、protect；runaway/dismiss为普通行动，PC/西游支持，烟雨网络入口不接受；必须由宿主先鉴权。 */
	cmd: FightCmdEnum;
	/** cmd=skill时的已学技能ID；自动大招由内部按装配的ultimateSkill填写，无独立输入入口。 */
	skill?: number;
	/** 明确目标的运行uid，0有效；dismiss必填；普攻/技能执行时未指定、已离场或死亡且不符合技能条件的目标统一按未指定处理，复活技能保留合法尸体；提交时非法明确目标仍拒绝。 */
	target?: number;
	/** 内部自动大招执行标记，默认false；普通输入入口拒绝true，宿主不可用此字段申请机会。 */
	ultimate?: boolean;
	/** 内部执行标记，缺省/false正常结算；true跳过技能费用预检/扣除及CD检查/启动，不修改已有CD，也不绕过已学、状态或目标检查。客户端提交入口拒绝true，宿主仅可在可信执行指令中设置。 */
	ignoreCostCD?: boolean;
}

/** [配置ID, 等级]；等级0有效，按对应表查找。 */
export type IdLevel = [number, number];
/** [配置ID, 概率0～1]；虽然复用了IdLevel的元组结构，第二项不是等级。 */
export type IdRand = IdLevel;
/** [Buff ID, Buff等级, 附加概率0～1]。 */
export type IdLevelRand = [number, number, number];
/** 技能/被动/初始化Buff等的[ID,等级]列表。 */
export type IdLevelArray = IdLevel[];

export type fightMsg = [string, ...any[]];

export interface SkillCost {
	/** 生命点数费用，建议非负数；省略/0不扣，玩家/召唤物支付后必须仍>0，怪物不耗资源。真实变化在整笔费用支付后发送hp事件（来源为本人），不发hurt、不产怒气。 */
	hp?: number;
	/** 法力点数费用，建议非负数；省略/0不扣，玩家/召唤物允许刚好用完。 */
	mp?: number;
	/** 怒气点数费用，非负有限数；省略/0不扣，玩家/召唤物允许刚好用完，怪物不耗资源。 */
	sp?: number;
	/** 集气点数费用，非负有限数；省略/0不扣，玩家/召唤物允许刚好用完，怪物不耗资源；全局jiqi关闭时忽略校验及扣费、不发消息。 */
	jp?: number;
}
