import type { HpAxisLine } from "./FightRuleHp";
import type { InsertActionPos } from "../struct";

// 模板只放配置，每次生成怪物都创建新规则实例，不共享计数、阶段或监听。
export type RuleData = {
    /** 规则类型，必填字符串；内置hp血轴、turn回合轴、hurt受伤轴；未知类型工厂报错，字段统一平铺便于XLS配置。 */
    type: string;
    /** 规则执行顺序，有限数，缺省0；小的先执行，同级按添加顺序；不是事件监听器的 prior。 */
    prior?: number;
    /** hp必填的血线列表，允许空数组；每项hp为生命比例(0,1]，attackRate为非负增攻比例，多条相加，每条每场一次；其他规则忽略。 */
    lines?: HpAxisLine[];
    /** turn/hurt必填的正安全整数；turn为全局回合间隔，hurt为有效直接受伤次数阈值；hp忽略，无统一缺省值。 */
    every?: number;
    /** turn必填、hurt可选的已学技能ID，正安全整数；hurt缺省普攻/装配普攻且不额外收费/CD，turn正常校验并禁止使用独立大招槽；hp忽略。 */
    skill?: number;
    /** turn的行动插入位置，缺省first；支持first/last/random/afterSelf，同步客户端行动条；hp/hurt忽略。 */
    pos?: InsertActionPos;
    /** 宿主自定义附加数据，缺省undefined，不参与内置规则结算；可通过getCustom读取。 */
    custom?: any;
};

// 保留原有导入路径，创建实现由工厂维护。
export { createRule } from "./RuleFactory";
