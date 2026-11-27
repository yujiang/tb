// 每只怪物只选一个决策 AI；选择方法与使用的技能独立配置，固定行为组合放在 RuleData 中。
export type AIData = {
	id: number;
	/** 必填AI类型，目前工厂仅内置target；条件、选人和技能在同一配置组合，未知值报错，自定义工厂类型需另行注册。 */
	type: string;
	/** 已学技能ID，正安全整数；省略时使用装配普攻或默认普攻；不自动学习，不使用独立大招槽。 */
	skill?: number;

	// --- target start
	/** true时选择自身，缺省或false不启用；在条件通过后优先于贡献和职业/站位筛选，仍须符合技能目标资格。 */
	self?: boolean;

	/** target贡献来源，缺省不使用；unitHurt/unitHeal为自身受伤/受疗记录，enemyHurt/enemyHeal及friendHurt/friendHeal为敌方、己方阵营输出/治疗榜；有效值优先于职业站位筛选，仅排名有限正值，同分保持记录顺序。 */
	contributions?: string;

	/** target职业/站位筛选的阵营，缺省false选敌方，true选己方；不改变贡献榜来源。 */
	friend?: boolean;
	/** target职业字符串，缺省或空串不限职业；与attr.career精确比较，如医生，可与pos组合。 */
	career?: string;
	/** target站位规则，缺省或空串不限；目前back表示行号大于ceil(ny/2)的后排，需地图；未知非空值无候选，与RuleData.pos无关。 */
	pos?: string;
	// --- target end

	/** 选人前置条件，省略或空串不限制；hpLow表示存活且当前HP比例严格小于condData，未知非空值不通过。 */
	cond?: string;
	/** 条件参数，hpLow读取生命比例阈值，通常[0,1]，0.5表示50%，显式0有效，省略时hpLow不成立；无条件时不读取，通过getXls().condData访问。 */
	condData?: any;
};


const AIs = new Map<number, AIData>();

export function initAIs(datas: AIData[]) {
	for (const data of datas) {
		AIs.set(data.id, data);
	}
}

export function getAIData(id: number): AIData {
	if (!id) return;

	return AIs.get(id);
}

