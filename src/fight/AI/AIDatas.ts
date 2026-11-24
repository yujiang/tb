// 每只怪物只选一个决策 AI；选择方法与使用的技能独立配置，固定行为组合放在 RuleData 中。
export type AIData = {
	/** 必填AI类型，内置target选人、cond条件施法；未知值在工厂报错，自定义类型需注册工厂。 */
	type: string;
	/** 已学技能ID，正安全整数；target省略时普攻，cond必填；不自动学习，不使用独立大招槽。 */
	skill?: number;

	/** target职业/站位筛选的阵营，缺省false选敌方，true选己方；不改变贡献榜来源。 */
	friend?: boolean;

	/** target贡献来源，缺省不使用；unitHurt/unitHeal为自身受伤/受疗记录，enemyHurt/enemyHeal及friendHurt/friendHeal为敌方、己方阵营输出/治疗榜；有效值优先于职业站位筛选，仅排名有限正值，同分保持记录顺序。 */
	contributions?: string;

	/** target职业字符串，缺省或空串不限职业；与attr.career精确比较，如医生，可与pos组合。 */
	career?: string;
	/** target站位规则，缺省或空串不限；目前back表示行号大于ceil(ny/2)的后排，需地图；未知非空值无候选，与RuleData.pos无关。 */
	pos?: string;

	/** cond条件名，无默认条件；hpLow表示存活且当前HP比例严格小于custom，未知或省略时不施法。 */
	cond?: string;

	/** hpLow读取此值作为生命比例阈值，通常[0,1]，0.5表示50%，省略时条件不成立；其余入口作为宿主附加数据，getCustom原样返回。 */
	custom?: any;
};

// 保留原有导入路径，创建实现由工厂维护。
export { createAI } from './AIFactory';
