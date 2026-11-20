/** 客户端人物描述；字段值可由宿主自己的表枚举约束。 */
export interface MudCharacter {
	/** 武功描述特征，如绝顶/高手/普通/菜鸟；缺省不参与组合匹配。 */
	武功?: string;
	/** 性别描述特征，如男/女；占位符同时支持sex和性别；不影响服务端规则。 */
	sex?: string;
	/** 年纪描述特征，如少年/青年/中年/老年；值由宿主约定。 */
	年纪?: string;
	/** 相貌描述特征，如英俊/普通/丑陋；值由宿主约定。 */
	相貌?: string;
	/** 兵器文字特征，如刀/剑/棍；独立于服务端WeaponEnum，不自动互相转换。 */
	兵器?: string;
	/** 门派文字特征，如华山/武当/少林；缺省不参与组合匹配。 */
	门派?: string;
}

export interface MudTexts {
	/** 攻击出手文案模板；缺省或纯空白逐级回退，不代替服务端出手协议。 */
	出手文本?: string;
	/** 技能直接受伤文案模板；可用{伤害}/{生命}等占位符；无配置回退内置描写。 */
	受伤文本?: string;
	/** 死亡文案模板；整句使用死亡颜色，缺省回退人物/特征/内置描写。 */
	死亡文本?: string;
	/** 未命中文案模板；{未命中}占位符输出蓝色文字。 */
	未命中文本?: string;
	/** 治疗文案模板；{治疗}占位符输出绿色数值，缺省使用内置治疗描写。 */
	治疗文本?: string;
	/** 复活文案模板；整句亮绿色，缺省使用内置复活描写。 */
	复活文本?: string;
}

/** 三张表只在客户端使用，不参与战斗结算或传输。 */
export interface FightMudTables {
	/** 人物描述表，键对应FightDisplay.character；缺省无人物特征，0键有效。 */
	xlsCharacter?: Readonly<Record<string, MudCharacter>>;
	/** 人物专属/特征组合文案：人物键对应character，其余键用+连接特征值，越具体越优先。 */
	xlsText?: Readonly<Record<string, MudTexts>>;
	/** 按技能ID提供最高优先级文案；按事件字段分别回退到人物专属、特征组合和默认描写。 */
	xlsSkillDesc?: Readonly<Record<number, MudTexts>>;
}

const traits: (keyof MudCharacter)[] = ['武功', 'sex', '年纪', '相貌', '兵器', '门派'];

/** 逐字段回退；组合越具体越优先，同等具体程度按表中顺序。 */
export function resolveMudText(
	tables: FightMudTables,
	field: keyof MudTexts,
	character?: string | number,
	skill?: number,
): string | undefined {
	const nonempty = (text?: string) => (text?.trim() ? text : undefined);
	const skillText =
		skill === undefined ? undefined : nonempty(tables.xlsSkillDesc?.[skill]?.[field]);
	if (skillText) return skillText;
	if (character === undefined) return undefined;
	const own = nonempty(tables.xlsText?.[character]?.[field]);
	if (own) return own;
	const profile = tables.xlsCharacter?.[character];
	if (!profile) return undefined;
	const values = traits.map((key) => profile[key]).filter((value): value is string => !!value);
	let result: string | undefined,
		specificity = 0;
	for (const [key, texts] of Object.entries(tables.xlsText ?? {})) {
		if (Object.prototype.hasOwnProperty.call(tables.xlsCharacter ?? {}, key)) continue;
		const text = nonempty(texts[field]);
		if (!text) continue;
		const parts = key.split('+').map((part) => part.trim());
		if (parts.length <= specificity) continue;
		const remaining = [...values];
		const matches = parts.every((part) => {
			const index = remaining.indexOf(part);
			if (index < 0) return false;
			remaining.splice(index, 1);
			return true;
		});
		if (matches) {
			result = text;
			specificity = parts.length;
		}
	}
	return result;
}
