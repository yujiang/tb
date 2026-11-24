import type { HpAxisLine } from './FightRuleHp';
import type { InsertActionPos } from '../struct';

// 模板只放配置，每次生成怪物都创建新规则实例，不共享计数、阶段或监听。
export type RuleData = {
	/** 规则类型，必填字符串；内置hp血轴、turn回合轴、hurt受伤轴；未知类型工厂报错，字段统一平铺便于XLS配置。 */
	type: string;
	/** 规则执行顺序，有限数，缺省0；小的先执行，同级按添加顺序；不是事件监听器的 prior。 */
	prior?: number;
	/** hp必填的血线列表，允许空数组；每项含hp比例(0,1]与buff:[已注册BuffID,等级]，hp必须严格递减，乱序/重复报错；跨多线直接进入最深阶段，跳过中间Buff和消息；先强制移除实际旧阶段Buff再添加最终Buff，回血不回退；其他规则忽略。 */
	lines?: HpAxisLine[];
	/** turn必填的全局回合间隔，正安全整数，无缺省值；hurt/hp忽略。 */
	everyTurn?: number;
	/** hurt必填的有效直接受伤次数阈值，正安全整数，无缺省值；turn/hp忽略。 */
	everyHurt?: number;
	/** turn必填、hurt可选的已学技能ID，正安全整数；hurt缺省普攻/装配普攻；指定技能统一按普通技能校验、收费和启动冷却（费用/CD留空则不消耗），turn/hurt均禁止使用独立大招槽；hp忽略。 */
	skill?: number;
	/** turn的固定行动插入位置；支持first/last/random/afterSelf；显式配置时优先于speedRate，省略时按speedRate排序；同步客户端行动条，hp/hurt忽略。 */
	pos?: InsertActionPos;
	/** turn的行动速度倍率，非负有限数，缺省1，0有效；仅pos省略时使用，按当前getSpeedOrder()×倍率排序，速度变化重排剩余行动；不修改单位速度，不推进额外输入或集气；hp/hurt忽略。 */
	speedRate?: number;
	/** 宿主自定义附加数据，缺省undefined，不参与内置规则结算；可通过getXls().custom读取。 */
	custom?: any;
};

// 保留原有导入路径，创建实现由工厂维护。
export { createRule } from './RuleFactory';
