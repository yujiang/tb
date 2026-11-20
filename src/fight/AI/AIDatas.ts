// 每只怪物只选一个决策 AI；选择方法与使用的技能独立配置，固定行为组合放在 RuleData 中。
export type AIData = {
    /** AI类型，必填字符串，由工厂选择实现；内置rearDoctor/topThreat/topHealer/lowHpHeal，未知类型报错；新增类型无需改此结构。 */
    type: string;
    /** 使用的已学技能ID，正安全整数；选目标AI缺省普攻，lowHpHeal必须配置单体heal；各AI自行校验，均不自动学习、不使用独立大招槽。 */
    skill?: number;
    /** 类型专用参数，缺省undefined；结构、单位、范围及默认值由具体AI约定和校验；当前内置AI均不读取，不统一解释参数含义。 */
    typeParam?: any;
    /** 宿主自定义附加数据，缺省undefined，不参与内置AI决策；可通过getCustom读取。 */
    custom?: any;
};

// 保留原有导入路径，创建实现由工厂维护。
export { createAI } from "./AIFactory";
