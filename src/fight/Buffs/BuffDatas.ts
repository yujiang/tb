import { StaticData } from './StaticData';
import type { SkillUseType } from '../struct';
import type { FightContex } from '../Fight';
import type { FightUnit, PendingHurt, PendingHeal } from '../Unit/FightUnit';
import type { FightSkill } from '../Skills/FightSkill';
import type { FightBuff } from './FightBuff';

export enum OverlapEnum {
	NOT = 0, // 不叠加
	REPLACE = 1, // 替换
	RELPACE_BYPOWER = 2, // 高power替换低的: 比如2个毒buff，一个更深可以替换掉原来的
}

export enum BuffTurnEnum {
	thisTurn, // 全局回合前
	inputTurn, // 单位输入次数
	afterTurn, // 全局回合后
}

// buff 有 5种
// 1. 状态，比如封印
// 2. 改变属性attr， 比如增益和减益
// 3. 每个回合起作用，加血和毒（扣血）
// 4. 有次数，比如减伤3次后消失
// 5. 特殊的buff，通过class选择实现
// 但是1~5并不互斥，可以同时存在，所以没有type字段

/** 单位事件参数契约；下列元组不含首项unit，普通上下文事件包含ctx，attr/speed不含ctx。 */
export interface FightUnitEventMap {
	/** 嘲讽先影响选目标，此通知在完整动作/反应链后发出；仅实际诱导才发，含未命中和发动失败，用于扣次数。 */
	taunt: [ctx: FightContex, buff: FightBuff];
	/** 发动判定通过后、效果前；计数已含本次且增伤已汇总。群攻/溅射每次只发一次，未命中仍发。 */
	useSkill: [ctx: FightContex, skill: FightSkill, type: SkillUseType, skillCount: number, typeCount: number];
	/** 移动型主目标物理攻击命中前；追击/溅射/陷阱自身不发。startAttack同步提前通知出手，自动去重。 */
	beforeAttack: [ctx: FightContex, attacker: FightUnit, skill: FightSkill, startAttack: () => void];
	/** 扣血前，可修改pending.damage或设置cancelled；后续监听读取前序修改。 */
	beforeHurt: [ctx: FightContex, attacker: FightUnit, pending: PendingHurt];
	/** 治疗前，可修改pending.heal或设置cancelled；revive标记用于避免转移复活恢复。 */
	beforeHeal: [ctx: FightContex, healer: FightUnit, pending: PendingHeal];
	/** 盾从正数变0时；allBroken是此刻本阵营存活单位全破盾的快照，不是动态查询。 */
	break: [ctx: FightContex, attacker: FightUnit, allBroken: boolean];
	/** 真实HP变化，先于hurt/heal；含保护分担和生命费用，费用source为本人，不额外发hurt。 */
	hp: [ctx: FightContex, source: FightUnit, previous: number, current: number];
	/** 已扣血后的通知；damage为实际扣血，pending只读提供来源等信息；保护分担不发hurt。 */
	hurt: [ctx: FightContex, attacker: FightUnit, damage: number, pending: Readonly<PendingHurt>];
	/** 治疗及HP变化后；amount为取整后的申请治疗量，可能包含溢出，实际回血通过hp事件读取。 */
	heal: [ctx: FightContex, healer: FightUnit, why: string, amount: number];
	/** 已标记死亡并完成死亡Buff清理后；真实死亡通知，自动复活仍等完整动作结束。 */
	die: [ctx: FightContex, attacker: FightUnit, why: string];
	/** 已解除死亡标记，复活回血尚未结算；healer为复活来源。 */
	relife: [ctx: FightContex, healer: FightUnit, why: string];
	/** 新Buff已加入并绑定监听；buff是本次实际新增实例，初始化无ctx时不发。 */
	addBuff: [ctx: FightContex, attacker: FightUnit, why: string, buff: FightBuff];
	/** Buff已移除并解绑后；buff是已移除实例，why表示移除原因。 */
	removeBuff: [ctx: FightContex, attacker: FightUnit, why: string, buff: FightBuff];
	/** 属性重算完成，只传unit，不携带ctx或Buff参数。 */
	attr: [];
	/** 当前速度已改变，传新速度；不携带ctx或Buff参数。 */
	speed: [speed: number];
	/** 已从阵营移除且解绑内部监听，不触发die；operator是执行移除指令者。 */
	dismiss: [ctx: FightContex, operator: FightUnit];
	/** 单位回合后处理完成时，turn为本次全局回合号。 */
	afterTurn: [ctx: FightContex, turn: number];
}

export type FightUnitEvent = keyof FightUnitEventMap;
export type FightUnitPlainEvent = 'attr' | 'speed';
export type FightUnitContextEvent = Exclude<FightUnitEvent, FightUnitPlainEvent>;

export type BuffFuncEnum = 'poison' | 'heal';

export interface BuffData extends StaticData {
	/** 特殊实现名：buqu/relife/taunt/reflect/rest/protect/trap/damageByUse；省略或未知名使用普通FightBuff；damageByUse按出手次数增加同类型伤害，配置见damageUse；trap按来袭技能isMove判断近身物理攻击，死亡清理由dieNotRemove控制；rest等同提供休息状态。 */
	class?: string;
	/** 自动复活恢复的最大生命比例，数值 (0, 1]，缺省 0.2；仅 relife 读取。 */
	relifeRatio?: number;
	/** 反射是否只转移魔法伤害，缺省 true；false 也转移物理伤害。仅 reflect 读取，治疗转移不受此字段限制。 */
	reflectMagicOnly?: boolean;
	/** 按本场出手次数增加本次伤害倍率，仅class=damageByUse读取；省略时为协战每次+0.05、最多+0.5，当前这次也计入，只增强指定类型的攻击，不修改技能表或单位基础属性。 */
	damageUse?: {
		/** 统计并增强的出手类型；缺省support；可用SkillUseType中的类型，其他类型不受加成。 */
		type?: SkillUseType;
		/** 每次发动增加的伤害倍率，非负有限数，缺省0.05；0表示不增加，与技能damageRate相加。 */
		rate?: number;
		/** 累计增加的倍率上限，非负有限数，缺省0.5；0表示不增加，不是无限。 */
		max?: number;
	};

	/** 同 ID 重复添加：NOT 保留旧实例，REPLACE 替换，RELPACE_BYPOWER 按 power 再等级比较；详见枚举实际拼写。 */
	overlap: OverlapEnum;

	/** 持续时间和周期效果的边界；缺省 thisTurn=全局回合前，inputTurn=本单位输入次数，afterTurn=全局回合后。 */
	turnType?: BuffTurnEnum;
	/** 持续的对应边界次数，必填；正数最后一次生效后移除，0 不按回合到期；不是秒数。 */
	lastTurn: number;

	/** 事件使用次数，类型必填，0 不按次数到期；普通 Buff 在 event 后扣减；嘲讽按实际诱导的普通行动扣减；不屈/自动复活固定一次。 */
	times: number;
	/** 普通次数Buff的计次事件；必须带ctx，attr/speed不是该签名；嘲讽固定taunt，trap固定beforeAttack，damageByUse固定useSkill，忽略本字段且只在匹配类型实际触发时计次；其他特殊类也可固定监听。 */
	event: FightUnitContextEvent;
	/** 监听优先级，小的先执行，同级按注册顺序；普通/反射默认0，保护500，不屈/自动复活1000。 */
	prior?: number;

	/** 周期效果 heal 或 poison，缺省不执行周期数值效果；与状态、属性、特殊类可组合。 */
	func?: BuffFuncEnum;
	/** 周期效果或trap引用的技能ID，需已注册；周期效果用原始配置计算，trap合并陷阱持有者当前物理/魔法base与final，执行一次伤害及附加Buff，不走连击、追击或溅射，不要求已学，不收费用/CD。缺省无引用效果。 */
	skill?: number;
	/** 周期效果或trap引用技能的等级，缺省0；与Buff自身用于属性成长的level分开。 */
	skillLevel?: number;

	/** true 禁止外部驱散；缺省false，自然到期、次数耗尽、死亡清理仍各自处理。 */
	notRemove?: boolean;
	/** true 死亡时保留；缺省false；自动复活 Buff 必须填 true 才能在死后继续监听。 */
	dieNotRemove?: boolean;
	/** true 不进入单位 Buff 展示列表；缺省false，不影响实际效果与服务端结算。 */
	notDisplay?: boolean;

	/** Buff 驱散强度，当前实现缺省0，显式0有效；驱散只比 power，覆盖同 ID 时还比较 Buff 等级。 */
	power?: number;
}

const buffs = new Map<number, BuffData>();

export function initBuffs(datas: BuffData[]) {
	for (const data of datas) {
		buffs.set(data.id, data);
	}
}

export function getBuffData(id: number): BuffData {
	if (!id) return;

	return buffs.get(id);
}
