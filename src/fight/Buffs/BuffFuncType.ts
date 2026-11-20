import { AttrSkill } from '../Skills/AttrSkill';
import { heal } from '../Skills/Funcs/Heal';
import { FightContex } from '../Fight';
import { poison } from '../Skills/Funcs/Poison';
import { getSkillData } from '../Skills/SkillDatas';
import { FightUnit } from '../Unit/FightUnit';
import { FightBuff } from './FightBuff';

export type BuffFuncType = (unit: FightUnit, buff: FightBuff, ctx: FightContex) => boolean;
const BuffFuncMap: Record<string, BuffFuncType> = {
	poison: buffPoisonFunc,
	heal: buffHealFunc,
};

export function buffFunc(unit: FightUnit, buff: FightBuff, ctx: FightContex) {
	const func = BuffFuncMap[buff.getFunc()];
	if (!func) return;

	return func(unit, buff, ctx);
}

function getBuffSkill(buff: FightBuff, attr: string) {
	const xls = buff.getXls();
	if (xls.skill) {
		const data = getSkillData(xls.skill);
		if (!data) return;
		return new AttrSkill(data, xls.skillLevel ?? 0, attr);
	}
}

function buffPoisonFunc(unit: FightUnit, buff: FightBuff, ctx: FightContex) {
	const skill = getBuffSkill(buff, 'poison');
	if (!skill) return false;
	return poison(buff.attacker, unit, skill, 'buff', ctx);
}

function buffHealFunc(unit: FightUnit, buff: FightBuff, ctx: FightContex) {
	const skill = getBuffSkill(buff, 'heal');
	if (!skill) return false;
	return heal(buff.attacker, unit, skill, 'buff', ctx);
}
