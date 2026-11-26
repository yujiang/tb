/** 单句或候选数组；跳过空白，按同一人物、技能、事件的展示次数轮换，不消耗战斗随机数。 */
export type MudText = string | readonly string[];

/** 人物可覆盖的展示事件；省略、空白或全空数组均回退通用表达。 */
export interface MudTexts {
	/** 首次入场及召唤入场；$N为入场者，$w为其兵器名。 */
	出场文本?: MudText;
	/** 每次行动准备时显示；$N为行动者，$w为其兵器；省略或空白回退“凝神应战，准备出手”，与初次出场独立。 */
	准备文本?: MudText;
	/** 未配置SkillData.action时的角色出招描写；$N为施放者，$n为目标。 */
	出手文本?: MudText;
	/** 闪避结果；$N为闪避者，$n为攻击者；{未命中}保留蓝色。 */
	未命中文本?: MudText;
	/** 格挡展示消息；$N为格挡者，$n为攻击者；只表现，不新增战斗格挡判定。 */
	格挡文本?: MudText;
	/** 实际发生减伤/免伤时；$N为减伤者，{减伤}为本次减少的点数；优先于内功被动action。 */
	减伤文本?: MudText;
	/** 可见Buff添加；$N为承受者，$n为施加者，{Buff}为带颜色的Buff名。 */
	添加Buff文本?: MudText;
	/** 可见Buff移除；$N为承受者，{Buff}为Buff名，{原因}为移除原因。 */
	移除Buff文本?: MudText;
	/** 正数受伤；$N为受伤者，$n为伤害来源，可用{伤害}/{生命}/{最大生命}，零伤害仍使用通用描写。 */
	受伤文本?: MudText;
	/** 收到die才使用，整句暗红；$N为死亡者，$n为已知致死伤害来源。 */
	死亡文本?: MudText;
	/** 恢复生命；$N为恢复者，$n为治疗来源；{治疗}为上限截断后的实际恢复量。 */
	治疗文本?: MudText;
	/** 复活消息，整句亮绿；$N为复活者。 */
	复活文本?: MudText;
}

/** character表的一行；每个人物编号独立配置，不按年龄、门派或性别组合匹配。 */
export interface CharacterData extends MudTexts {
	/** 人物描述编号，对应display.character；非负安全整数，0有效。 */
	id: number;
	/** 表格编辑用名称，可省略，不覆盖单位display.name。 */
	name?: string;
}

/** 客户端MUD资料，只读取一张character表；技能出招另由SkillData.action提供。 */
export interface FightMudTables {
	/** 人物编号到专属文案，省略或未知编号使用通用表达；不参与战斗结算。 */
	xlsCharacter?: Readonly<Record<number, CharacterData>>;
}

/** 文案数组按展示序号轮换；负数/非整数序号回退第一句。 */
export function pickMudText(text: MudText | undefined, index = 0): string | undefined {
	const options = (typeof text === 'string' ? [text] : (text ?? [])).filter((value) =>
		value.trim(),
	);
	if (!options.length) return undefined;

	return options[(Number.isSafeInteger(index) && index >= 0 ? index : 0) % options.length];
}

/** 只按display.character查找当前事件，不推导人物特征或借用其他角色的文案。 */
export function resolveMudText(
	tables: FightMudTables,
	field: keyof MudTexts,
	character?: number,
	index = 0,
): string | undefined {
	if (character === undefined) return undefined;

	return pickMudText(tables.xlsCharacter?.[character]?.[field], index);
}
