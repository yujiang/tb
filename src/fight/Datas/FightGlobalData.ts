import { strict as assert } from 'node:assert/strict';
import { FightLoopType } from '../Loop/FightLoop';

// 宿主启动时统一设置，所有战斗共用。

export interface FightGlobalData {
	/** 所有战斗共用的全局回合上限，默认0不设上限；非负安全整数，正数允许完整执行该轮，轮末仍未分胜负则防守方胜。 */
	maxTurn: number;
	/** 西游整轮输入等待秒数，默认30；非负有限数、可用小数，显式0运行时仍回退30秒；PC不限时、烟雨不等待收齐。 */
	waitInputSec: number;
	/** 默认false；true时默认普攻按对位查找，需先createMap；false时随机敌方存活单位，手动目标仍优先。 */
	duiwei: boolean;

	/** 默认普攻技能表ID，宿主必须先注册；初始0未配置，使用时断言失败。装配普攻优先，否则完整复用此技能的目标、属性及子技能配置，不额外收费。 */
	defaultAttackSkill: number;
	/** 默认保护目标规则的技能表ID，宿主必须先注册；初始0未配置，使用时断言失败；保护效果仍由protectBuff指定。 */
	defaultProtectSkill: number;
	/** 默认反击技能表ID，宿主必须先注册；初始0未配置，使用时断言失败。装配反击优先，否则使用此技能的rand与属性加成，示例rand=0.1；物理/魔法读取对应fback阶段，不额外收费，必须配置nofback:true。 */
	defaultFBackSkill: number;

	/** 集气开关，默认false；关闭时跳过行动集气、addJp及JP费用，初始化不发送jp/jpMax；true启用集气结算和同步。 */
	jiqi: boolean;
	/** 输入校验模式，默认true调用checkOnline，允许死亡行动者提交和普攻守尸、资源延后复验；false调用checkPC严格即时预检。烟雨预设false；两种检测函数自身规则不变。 */
	attackDie: boolean;
	/** 保护指令施加的已注册 Buff ID，必须 class:protect；缺省保护指令不可用。 */
	protectBuff?: number;

	/** 缺省false；敌方最后一面盾打破且全体存活单位均破盾后，完整动作结束后由实际破盾者自动施放装配大招，每队每回合最多一次；无大招或无法施放直接跳过。 */
	allShieldBreak?: boolean;

	/** 循环类型pc/yanyu/west，默认pc；由createFightLoop创建对应驱动，省略更新时保留当前值。 */
	loopType?: FightLoopType;

	/** 每点实际受伤增加的怒气，非负有限数；默认0，0不增加，例如0.2表示受伤100点增加20怒气。 */
	spHurtRate?: number;
	/** 每点实际输出伤害或实际治疗增加的怒气，非负有限数；默认0，伤害和治疗共用此倍率。 */
	spOutputRate?: number;
	/** 每次有效行动条行动结束时，单位默认增加的集气点数，非负有限数；默认1，允许小数及显式0。 */
	jpAdd?: number;
}

let gData: FightGlobalData = {
	maxTurn: 0,
	waitInputSec: 30,
	duiwei: false,
	jiqi: false,
	attackDie: true,
	protectBuff: undefined,
	allShieldBreak: false,
	loopType: 'pc',
	jpAdd: 1,
	spHurtRate: 0,
	spOutputRate: 0,

	defaultAttackSkill:0,
	defaultProtectSkill:0,
	defaultFBackSkill:0,
};

/** 返回独立烟雨预设（loopType=yanyu，对位和集气为true，attackDie为false）；查询不修改共享配置。 */

export function getYanyuGlobalData(): Partial<FightGlobalData> {
	return {
		loopType: 'yanyu',
		duiwei: true,
		jiqi: true,
		attackDie: false,
	};
}
/** 查询进程共享的全局战斗配置；通过setFightGlobalData更新，表格行不覆盖这些字段。 */

export function getFightGlobalData(): Readonly<FightGlobalData> {
	return gData;
}
/** 启动时按字段设置公共配置，省略字段保留当前值；loopType校验枚举，其余配置合法性由宿主保证。 */

export function setFightGlobalData(data: Partial<FightGlobalData>) {
	const next = { ...gData, ...data };
	const loopType = next.loopType ?? 'pc';
	assert.ok(
		loopType === 'pc' || loopType === 'yanyu' || loopType === 'west',
		'loopType must be pc, yanyu or west'
	);

	gData = next as any;
}
