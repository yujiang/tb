/** 客户端人物描述；字段值可由宿主自己的表枚举约束。 */
export interface MudCharacter {
    武功?: string;
    sex?: string;
    年纪?: string;
    相貌?: string;
    兵器?: string;
    门派?: string;
}

export interface MudTexts {
    出手文本?: string;
    受伤文本?: string;
    死亡文本?: string;
    未命中文本?: string;
    治疗文本?: string;
    复活文本?: string;
}

/** 三张表只在客户端使用，不参与战斗结算或传输。 */
export interface FightMudTables {
    xlsCharacter?: Readonly<Record<string, MudCharacter>>;
    /** 人物 ID 是专属文案，其余键用 + 连接特征值。 */
    xlsText?: Readonly<Record<string, MudTexts>>;
    xlsSkillDesc?: Readonly<Record<number, MudTexts>>;
}

const traits: (keyof MudCharacter)[] = ["武功", "sex", "年纪", "相貌", "兵器", "门派"];

/** 逐字段回退；组合越具体越优先，同等具体程度按表中顺序。 */
export function resolveMudText(tables: FightMudTables, field: keyof MudTexts,
    character?: string | number, skill?: number): string | undefined {
    const nonempty = (text?: string) => text?.trim() ? text : undefined;
    const skillText = skill === undefined ? undefined : nonempty(tables.xlsSkillDesc?.[skill]?.[field]);
    if (skillText) return skillText;
    if (character === undefined) return undefined;
    const own = nonempty(tables.xlsText?.[character]?.[field]);
    if (own) return own;
    const profile = tables.xlsCharacter?.[character];
    if (!profile) return undefined;
    const values = traits.map(key => profile[key]).filter((value): value is string => !!value);
    let result: string | undefined, specificity = 0;
    for (const [key, texts] of Object.entries(tables.xlsText ?? {})) {
        if (Object.prototype.hasOwnProperty.call(tables.xlsCharacter ?? {}, key)) continue;
        const text = nonempty(texts[field]);
        if (!text) continue;
        const parts = key.split("+").map(part => part.trim());
        if (parts.length <= specificity) continue;
        const remaining = [...values];
        const matches = parts.every(part => {
            const index = remaining.indexOf(part);
            if (index < 0) return false;
            remaining.splice(index, 1);
            return true;
        });
        if (matches) { result = text; specificity = parts.length; }
    }
    return result;
}
