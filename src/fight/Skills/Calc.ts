import { strict as assert } from 'node:assert';
import { Fight, FightContex } from '../Fight';
import { FinalAttack, BaseAttack, FightAttr, FightTypeAttr } from '../FightAttr';
import { FightStatic } from '../Buffs/StaticData';
import { clone } from '../../public/Utilts';
import { isDebugCrit } from '../FightDebug';

const critBonusBase = 0.5;

function finite(value: number, name: string): number {
	assert.ok(Number.isFinite(value), `${name} must be finite; received ${value}`);
	return value;
}

function calcFinal(a: FinalAttack, d: FinalAttack, d1: number) {
	if (d.immunity > 0) {
		d1 -= d.immunity;
	}
	if (d.immunityP && d.immunityP > 0) {
		d1 -= d1 * d.immunityP;
	}
	//const damage = Math.max(Math.floor(d1),1);
	return d1;
}

export function calcHurt(
	f: Fight,
	a: BaseAttack,
	d: BaseAttack,
	af: FinalAttack,
	df: FinalAttack,
	ctx: FightContex,
	rate = 1,
) {
	const result = calcAttackParts(f, a, d, ctx);
	return finite(
		Math.max(calcFinal(af, df, result.damage), 1) * (rate + result.critBonus),
		'damage',
	);
}

export function clamp(v: number, min: number, max: number) {
	return Math.min(Math.max(v, min), max);
}

export function calcPoison(
	f: Fight,
	a: BaseAttack,
	d: BaseAttack,
	hp: number,
	ctx: FightContex,
): number {
	const d1 = a.attack - d.defend;
	const d2 = clamp(a.hurt - d.hurtAnti, 0, 0.5);
	return finite(Math.max(d2 * hp + d1, 1), 'poison damage');
}

export function calcAttack(
	f: Fight,
	a: BaseAttack,
	d: BaseAttack,
	ctx: FightContex,
	rate = 1,
): number {
	const result = calcAttackParts(f, a, d, ctx);
	return finite(result.damage * (rate + result.critBonus), 'damage');
}

// 暴击只判定一次，返回加成，留到最终倍率阶段与技能及属性加成相加。
function calcAttackParts(f: Fight, a: BaseAttack, d: BaseAttack, ctx: FightContex) {
	let d1 = a.attack - d.defend;
	d1 += a.hurt - d.hurtAnti;
	d1 *= 1 + Math.max(a.hurtP - d.hurtPAnti, 0);

	let critBonus = 0;
	if (d1 > 1 && (isDebugCrit() || f.randomLess(a.critP - d.critPAnit))) {
		critBonus = critBonusBase + clamp(a.critDeep - d.critDeepAnit, 0, 1);
		ctx.effects.push('crit');
	}

	return { damage: finite(Math.max(d1, 1), 'damage'), critBonus };
}

// _a _b的字段必须匹配！
export function mergeTable(base: Object, add: Object): any {
	const c: any = { ...base };
	if (!add) return c;

	const a = base as Record<string, number>;
	const b = add as Record<string, number>;
	for (const k in b) {
		c[k] = (a[k] || 0) + b[k];
	}
	assert.ok(
		Object.values(c).every((value) => Number.isFinite(value)),
		'merged attributes must be finite',
	);
	return c;
}

export function mergeTableLevel(base: Object, add: Object, mul: Object, level: number): any {
	if (!mul || level === 0) {
		return mergeTable(base, add);
	}

	const a = (base ?? {}) as Record<string, number>;
	const b = (add ?? {}) as Record<string, number>;
	const d = mul as Record<string, number>;
	const c: any = { ...a };
	for (const k of new Set([...Object.keys(a), ...Object.keys(b), ...Object.keys(d)])) {
		c[k] = (a[k] ?? 0) + (b[k] ?? 0) + (d[k] ?? 0) * level;
	}
	assert.ok(
		Object.values(c).every((value) => Number.isFinite(value)),
		'merged attributes must be finite',
	);
	return c;
}

//use level here!
export function calcAttr(ori: FightAttr, objs: FightStatic[]): FightAttr {
	const result = clone(ori);

	for (const obj of objs) {
		const data = obj.getData();
		const attackType = data.attackType;
		const level = obj.getLevel();
		for (const field of [
			'speed',
			'damageLimit',
			'jpAdd',
			'spHurtRate',
			'spOutputRate',
		] as const) {
			result[field] += (data.attr?.[field] ?? 0) + (data.attrLevel?.[field] ?? 0) * level;
		}

		if (attackType === 'heal' || attackType === 'poison') {
			if (
				(data.attack && Object.keys(data.attack).length) ||
				(data.attackLevel && Object.keys(data.attackLevel).length)
			) {
				result[attackType] = mergeTableLevel(
					result[attackType],
					data.attack,
					data.attackLevel,
					level,
				);
			}
			// if (data.final && Object.keys(data.final).length) {
			//     throw new Error(`Final attributes are not supported for ${attackType}`);
			// }
			continue;
		}

		const attackGroup: FightTypeAttr = data.magic ? result.magic : result.physic;
		let attackKey: 'base' | 'kill' | 'next' | 'spread' | 'fback';
		switch (attackType) {
			case 'base':
			case 'kill':
			case 'next':
			case 'spread':
			case 'fback':
				attackKey = attackType;
				break;
			default:
				throw new Error(`Unsupported attack type: ${attackType}`);
		}

		if (
			(data.attack && Object.keys(data.attack).length) ||
			(data.attackLevel && Object.keys(data.attackLevel).length)
		) {
			attackGroup[attackKey] = mergeTableLevel(
				attackGroup[attackKey],
				data.attack,
				data.attackLevel,
				level,
			);
		}
		if (
			(data.final && Object.keys(data.final).length) ||
			(data.finalLevel && Object.keys(data.finalLevel).length)
		) {
			attackGroup.final = mergeTableLevel(
				attackGroup.final,
				data.final,
				data.finalLevel,
				level,
			);
		}
	}

	for (const field of ['damageLimit', 'jpAdd', 'spHurtRate', 'spOutputRate'] as const) {
		result[field] = Math.max(0, result[field]);
	}
	return result;
}
