import type { FightUnit } from '../Unit/FightUnit';
import { BuffTurnEnum, getBuffData } from './BuffDatas';
import { FightBuff } from './FightBuff';
import { BuffBuqu } from './Class/BuffBuqu';
import { BuffRelife } from './Class/BuffRelife';
import { BuffTaunt } from './Class/BuffTaunt';
import { BuffReflect } from './Class/BuffReflect';
import { BuffRest } from './Class/BuffRest';
import { BuffProtect } from './Class/BuffProtect';
import { BuffTrap } from './Class/BuffTrap';
import { BuffDamageByUse } from './Class/BuffDamageByUse';

// 特殊 Buff 按配置中的 class 查找构造类，其余配置使用通用 FightBuff。
const buffClasses = new Map<string, typeof FightBuff>([
	['buqu', BuffBuqu],
	['relife', BuffRelife],
	['taunt', BuffTaunt],
	['reflect', BuffReflect],
	['rest', BuffRest],
	['protect', BuffProtect],
	['trap', BuffTrap],
	['damageByUse', BuffDamageByUse],
]);

export function createBuff(
	attacker: FightUnit,
	buff: number,
	lv: number,
	turn: number,
	inputTurn: number,
	afterTurn = Math.max(0, turn - 1),
): FightBuff {
	const xls = getBuffData(buff);
	if (!xls) return null;

	const t =
		xls.turnType === BuffTurnEnum.inputTurn
			? inputTurn
			: xls.turnType === BuffTurnEnum.afterTurn
				? afterTurn
				: turn;
	const BuffClass = buffClasses.get(xls.class) ?? FightBuff;
	return new BuffClass(xls, lv, attacker, t);
}
