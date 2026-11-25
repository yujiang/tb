// A托付B，A把自己的这次行动让给B
import type { SkillFuncType } from '../SkillFuncType';

// 托付仅交接当前行动位；等待输入及输入周期Buff仍由PC普通行动流程处理。
export const entrustFunc: SkillFuncType = (attacker, defender, skill, ctx) => {
	ctx.msgs.push(['skill', skill.getId(), attacker.uid, defender.uid]);
	return ctx.fight.entrustAction(attacker, defender, ctx);
};
