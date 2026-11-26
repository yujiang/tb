export interface FightDebugData {
	/** 默认false；物理攻击必定命中，不覆盖发动概率；不能闪避状态优先，hit和miss同时开启时miss优先。 */
	hit?: boolean;
	/** 默认false；物理攻击必定未命中，优先于hit和alwaysHit，但不覆盖不能闪避状态；魔法不做物理命中判定。 */
	miss?: boolean;
	/** 默认false；具备暴击判定资格的攻击与治疗必定暴击，沿用原暴击公式；招架成功及毒伤不判暴击。 */
	crit?: boolean;
	/** 默认false；已有连击或连招子技能必定发动，覆盖零概率；不创建未配置子技能，不绕过反应上限。 */
	next?: boolean;
	/** 默认false；已有溅射子技能必定发动，覆盖零概率；仍按原规则选择合法副目标。 */
	spread?: boolean;
	/** 默认false；真实击杀后已有追击子技能必定发动，覆盖零概率；仍需合法存活目标。 */
	kill?: boolean;
	/** 默认false；已有合格队友的协战技能必定发动，覆盖零概率；仍遵守禁止字段及每单位每回合次数。 */
	support?: boolean;
	/** 默认false；普通或配置反击必定发动，覆盖零概率；仍遵守目标资格、禁止字段和专用类的禁止再次反击。 */
	fback?: boolean;

	/** 单次受伤最多扣除的生命点数，非负有限数；默认0或省略不限制，正数按伤害规则向下取整。防御/盾减伤后、beforeHurt前限伤，保护分担该值；最终扣血也受限。适用于技能、Buff、反伤、反射和分担，不影响治疗或HP费用。 */
	hurtHpLimit?: number;
}

let debug: FightDebugData = {};

/** 替换进程共享的调试配置并保存副本，省略字段均关闭；无参数或传undefined清空，不属于可复现的正式战斗规则。 */
export function setFightDebug(data: FightDebugData = {}) {
	debug = { ...data };
}

export function isDebugHit(): boolean {
	return !!debug.hit;
}

export function isDebugMiss(): boolean {
	return !!debug.miss;
}

export function isDebugCrit(): boolean {
	return !!debug.crit;
}

export function isDebugReaction(
	reaction?: 'next' | 'combo' | 'spread' | 'kill' | 'support' | 'fback',
): boolean {
	if (!reaction) return false;

	return !!debug[reaction === 'combo' ? 'next' : reaction];
}

/** 获取调试受伤上限；0表示关闭，正数表示每次受伤的生命点数上限。 */
export function getDebugHurtHpLimit(): number {
	return debug.hurtHpLimit ?? 0;
}
