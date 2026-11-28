// 战斗属性, 需要注入
export enum PropEnum {
	none, //默认，不被克也不被生
	金,
	木,
	水,
	火,
	土,
}

export enum WeaponEnum {
	none, //默认，不被克也不被生
	拳,
	刀,
	枪,
	棍,
	棒,
	奇门,
	暗器,
}

export enum CareerEnum {
	none,
	战士,
	法师,
	控制,
	医生,
}

// 传统五行：金克木、木克土、土克水、水克火、火克金；相克返回加成0.5，其他为0。
export function getAttackMul(a: PropEnum, d: PropEnum) {
	const target = attackProps[a];
	return target !== undefined && target !== PropEnum.none && target === d ? 0.5 : 0;
}

// 金生水生木生火生土生金；相生返回加成0.5，其他为0。
export function getHealMul(a: PropEnum, d: PropEnum) {
	const target = healProps[a];
	return target !== undefined && target !== PropEnum.none && target === d ? 0.5 : 0;
}

const attackProps = [
	PropEnum.none,
	PropEnum.木,
	PropEnum.土,
	PropEnum.火,
	PropEnum.金,
	PropEnum.水,
];
const healProps = [PropEnum.none, PropEnum.水, PropEnum.火, PropEnum.木, PropEnum.土, PropEnum.金];

export interface BaseAttack {
	/** 内置连击/追击/反击发动概率0～1；主动技能是否发动读取SkillData.rand。 */
	rand: number; //发动概率

	/** 物理命中点数，如100；命中概率=(攻击hit-受击dodge)/100，不是0～1比例。 */
	hit: number; //命中
	/** 命中数值比例修正；默认0，0.1表示+10%，各来源先相加，再计算hit×(1+hitP)。 */
	hitP: number;

	/** 物理闪避点数，如20；被禁止dodge时不做随机判断，直接视为命中。 */
	dodge: number; //闪避
	/** 闪避数值比例修正；默认0，0.1表示+10%，各来源先相加。 */
	dodgeP: number;

	/** 物理招架概率；默认0，0.1表示10%，加装配招架技能的parry后减攻击方parryAnit。 */
	parry: number; 		//招架概率
	/** 降低目标招架概率的比例；默认0，0.1抵消10个百分点，保留Anit拼写。 */
	parryAnit: number; 	//破招

	/** 攻击点数，单位、技能固定值及等级成长先相加；普通伤害/治疗再乘(1+attackP)。 */
	attack: number; //攻击力
	/** 攻击比例修正；默认0，0.1表示+10%，各来源相加后对完整攻击值计算一次，可为负修正。 */
	attackP: number; // 0.1 加10%攻击
	/** 防御数值，物理/魔法读取各自分组，治疗/毒也读取对应分组。 */
	defend: number; //防御力
	/** 防御比例修正；默认0，0.1表示+10%，各来源相加后计算defend×(1+defendP)。 */
	defendP: number; // 0.1 加10%防御

	/** 普通攻击/治疗为固定增加点数；毒公式为目标当前生命比例，限制0～1，默认0。 */
	hurt: number; //伤害增加
	/** 最终伤害/治疗/毒伤比例修正；默认0，如0.2表示+20%，与生克、暴击、次数增伤及比例免伤合并后计算一次。 */
	hurtP: number; // 0.1 伤害加成10%
	
	/** 暴击概率，0.2表示20%，先减目标critPAnit；毒公式不判暴击。 */
	critP: number; //暴击率，比例值：0.2 表示 20%
	/** 额外暴击增伤；暴击加成为0.5+clamp(critDeep-目标critDeepAnit,0,1)。 */
	critDeep: number; //暴击增伤
	/** 降低被暴击概率的比例，保留Anit拼写；不是伤害减免比例。 */
	critPAnit: number; //被暴击率减免，与 critP 同为比例值
	/** 抵消对方critDeep的暴击增伤比例，保留Anit拼写；不抵消基础0.5加成。 */
	critDeepAnit: number; //被暴击减伤
}

// 全部初始为0
export function ZeroBaseAttack() : BaseAttack{
	return {
		rand: 0, 
		hit: 0, hitP: 0, dodge: 0, dodgeP: 0, 
		parry: 0, parryAnit: 0,
		attack: 0, attackP: 0, defend: 0, defendP: 0,
		hurt: 0, hurtP: 0, 
		critP: 0, critPAnit: 0, critDeep: 0, critDeepAnit: 0,
	}
}

export interface PointAttr {
	/** 当前生命点数，必填；伤害按实际扣血结算，不扣成负数。 */
	hp: number; // 当前血量
	/** 最大生命点数，必填；治疗/复活截断到此值，血线规则按hp/hpMax判断。 */
	hpMax: number; // 最大血量
	/** 当前法力点数，必填；费用允许刚好扣到0，怪物当前不耗资源。 */
	mp: number; // 当前蓝量
	/** 最大法力点数，必填；由宿主提供，当前没有通用自动回蓝机制。 */
	mpMax: number; // 最大蓝量
	/** 当前怒气点数；省略初始化为0，可与HP/MP/JP同时存在。 */
	sp?: number;
	/** 怒气上限，非负有限数；省略为0，表示不积累怒气。 */
	spMax?: number;
	/** 当前集气点数；省略初始化为0，不与MP互斥；仅全局jiqi开启时结算并发送客户端。 */
	jp?: number;
	/** 集气上限，非负有限数；省略为0表示不积累集气；全局jiqi关闭时不发送客户端。 */
	jpMax?: number;

	//     shield: number;     // 当前护盾
	//     shieldMax: number;  // 最大护盾
}

export interface FinalAttack {
	/** 普通反伤比例，如0.2；读取受击者对应分组，基数为实际扣血，受nodback限制。 */
	dbackP: number; 	// 反伤比
	/** 吸血比例，如0.2；基数为实际扣血，受noblood限制，当前伤害>1才尝试。 */
	bloodP: number; 	// 吸血比
	/** 被吸血时抵消对方吸血比例，默认0；可大于对方比例形成毒血，保留Anit拼写。 */
	bloodPAnit: number; // 反吸血，比如自己是毒血

	/** 普通伤害固定免伤，在基础公式后、技能/生克/暴击合并倍率前扣除。 */
	immunity: number; 	// 免伤，最后一步计算跟hurtAni位置不同
	/** 普通伤害比例免伤；默认0，如0.2抵消20个百分点，与最终增伤参数相加后统一计算。 */
	immunityP: number; 	// 免伤比

	// 先别搞太复杂
	// dbackPAnti: number;     // 反反伤比
	// bloodPAnti: number;     // 免吸血
	// immunityAnti: number;   // 免伤害减免
	// immunityPAnti: number;  // 免减伤比
}

export function ZeroFinalAttack() : FinalAttack{
	return {
		dbackP: 0, bloodP: 0, bloodPAnit: 0, immunity: 0, immunityP: 0,
	}
}

export interface FightTypeAttr {
	/** 普通攻击/主攻击使用的基础属性。 */
	base: BaseAttack;

	/** 击杀追击阶段属性，不自动沿用base。 */
	kill: BaseAttack; // 追击
	/** 连击/连招阶段属性，不自动沿用base。 */
	next: BaseAttack; // 连击
	/** 溅射阶段属性，不自动固定减伤，倍率由配置决定。 */
	spread: BaseAttack; // 溅射！

	/** 反击阶段属性，区别于受伤规则发动的基础属性新攻击。 */
	fback: BaseAttack; // 反击

	/** 本物理/魔法分组共用的吸血、反伤、免伤属性。 */
	final: FinalAttack;
}

export class FightAttr {
	/** HP/MP/SP/JP四槽资源结构；显示由宿主决定，资源变化通过单位方法处理，不修改attrOri模拟临时效果。 */
	point: PointAttr;
	/** 单位等级，用于与FightData.runawayGrade比较计算逃跑概率；宿主提供，未提供时逃跑按0计算，不是技能等级。 */
	grade: number;

	/** 本单位每次造成伤害的生命点数上限，如9999；非负有限数，默认0或省略不限制，正数最终按伤害规则取整。读取来源单位当前attr，可由Buff/被动attr与attrLevel修正；防御/盾减伤后、beforeHurt前生效，与调试限伤同时开启取较小值。不影响治疗或HP费用。 */
	damageLimit = 0;

	/** 速度基础数值，普通行动排序还计初始化乱敏；不影响追加行动的固定插入位置。 */
	speed: number; // 速度
	/** 每次有效行动条行动后增加的集气点数；默认取创建属性时的fightConsts.jpAdd（初始1），Buff/被动可修正。 */
	jpAdd?: number;
	/** 每点实际受伤增加的怒气；默认取创建属性时的fightConsts.spHurtRate（初始0），Buff/被动可修正，比例不限定0～1。 */
	spHurtRate?: number;
	/** 每点实际输出伤害或治疗增加的怒气；默认取创建属性时的fightConsts.spOutputRate（初始0），Buff/被动可修正。 */
	spOutputRate?: number;

	/** 服务端兵器枚举，与NPC弱点直接匹配，不自动转换MUD兵器文字。 */
	weapon: WeaponEnum; // 武器类型
	/** 职业字符串，由宿主提供名称；target AI通过career精确匹配，如医生；缺省undefined不匹配指定职业。 */
	career: string; // 职业

	/** 人物五行，默认none；用于受伤相克、治疗相生及治疗施放属性缺省来源。 */
	charProp: PropEnum = PropEnum.none; // 人物属性--被攻击用，也作治疗相生的默认施放属性
	/** 武器五行，默认none；攻击/毒伤在skillProp省略时使用。 */
	weaponProp: PropEnum = PropEnum.none; // 武器属性--攻击用

	// npc only.
	/** NPC五行弱点；任一弱点列表已配置就替代受伤相克，[]为无该类弱点，均省略则回退人物相克。 */
	weakProp?: PropEnum[]; // NPC 的五行弱点，直接匹配攻击属性；配置后替代受伤相克
	/** NPC兵器弱点；启用弱点盾时命中任一弱点按原伤并扣一格，未启用盾时最多加一次0.5倍率。 */
	weakWeapon?: WeaponEnum[];

	// 盾，击中弱点盾-1, 盾被击破 = 0, 人物立即进入眩晕状态
	// 然后下一个回合回满盾
	// 有盾时，仅未命中弱点的伤害减半
	// shield = undefined跳过上面
	/** NPC弱点盾，undefined不启用；attrOri为初始回满值，attr为当前值；大于0时非弱点伤害减半，弱点命中按原伤扣1格；0眩晕，下个全局回合前回满。 */
	shield?: number; // attrOri 保存初始回满值，运行中的 attr 保存当前盾数

	/** 完整物理各攻击阶段与最终属性，构造时由宿主提供。 */
	physic: FightTypeAttr;
	/** 完整魔法各攻击阶段与最终属性，构造时由宿主提供。 */
	magic: FightTypeAttr;

	/** 治疗公式的BaseAttack属性，不是FightTypeAttr分组。 */
	heal: BaseAttack; // 治疗
	/** 毒伤公式的BaseAttack属性，hurt为目标当前生命比例，毒伤不判暴击；attack/defend直接计算点数差，不读取attackP/defendP。 */
	poison: BaseAttack; // 下毒

	getBaseAttack(name: string): BaseAttack {
		return (this as any)[name];
	}

	getPointAttr(): PointAttr {
		return this.point;
	}

	getAttr(key: string) {
		const point = this.point;
		switch (key) {
			case 'hp':
				return point.hp;
			case 'mp':
				return point.mp;
			case 'sp':
				return point.sp ?? 0;
			case 'jp':
				return point.jp ?? 0;

			case 'hpp':
				return point.hp / point.hpMax;
			case 'hplp':
				return (point.hpMax - point.hp) / point.hpMax;
		}

		return (this as any)[key] || 0;
	}

	getSpeed() {
		return this.getAttr('speed');
	}
}

/** Buff/被动可统一修正的单位公共数值属性；均为点数或倍率，具体单位见FightAttr对应字段。 */
export type CommonAttr = Pick<
	FightAttr,
	'speed' | 'damageLimit' | 'jpAdd' | 'spHurtRate' | 'spOutputRate'
>;
