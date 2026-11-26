import type { SkillFuncType } from '../SkillFuncType';

export const observeFunc: SkillFuncType = (attacker, defender, skill, ctx) => {
	ctx.msgs.push(['skill', skill.getId(), attacker.uid, defender.uid]);
	defender.revealAllWeaknesses(ctx);
	return true;
};
