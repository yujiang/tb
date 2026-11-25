// self回放全局最近攻击，any回放所选来源的最近行动。
// 原技能的已学、费用和CD限制由内部回放处理，其他校验与结算复用普通流程。
import type { SkillFuncType } from '../SkillFuncType';

export const mimicFunc: SkillFuncType = (attacker, defender, skill, ctx) => {
	ctx.msgs.push(['skill', skill.getId(), attacker.uid, defender.uid]);
	const source = skill.isMimicAny() ? defender : undefined;
	return ctx.fight.mimicSkill(attacker, ctx, source);
};
