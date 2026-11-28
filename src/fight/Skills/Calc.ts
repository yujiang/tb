import { strict as assert } from 'node:assert';
import { Fight, FightContex } from '../Fight';
import { FinalAttack, BaseAttack, FightAttr, FightTypeAttr } from '../FightAttr';
import { FightStatic } from '../Passives/FightStatic';
import { clone } from '../../public/Utilts';
import { isDebugCrit } from '../FightDebug';
import { FightSkill } from './FightSkill';

const critBonusBase = 0.5;

function finite(value: number, name: string): number {
	assert.ok(Number.isFinite(value), `${name} must be finite; received ${value}`);
	return value;
}

export function hitTest(f: Fight, a: BaseAttack, d: BaseAttack){
	const d2 = a.hit * (1 + a.hitP) - d.dodge * (1 + d.dodgeP);
	return f.randomLess(d2 / 100);
}

// 因为parryskill是对面的技能，并没有merge
export function parryTest(f: Fight, a: BaseAttack, d: BaseAttack, parryskill: FightSkill){
	const p = parryskill?.getAttack()?.parry || 0;
	const d2 = d.parry + p - a.parryAnit;
	return f.randomLess(d2);
}

// 返回伤害和伤害比
function calcFinal(a: FinalAttack, d: FinalAttack, d1: number, rate: number, ctx: FightContex) {
	if (d.immunity > 0) {
		d1 -= d.immunity;
		ctx.effects.push('immunity');
	}
	if (d.immunityP > 0) {
		rate -= d.immunityP;
		ctx.effects.push('immunityP');
	}
	return Math.max(1, finite(d1 * (1 + rate), 'finalDamage'));
}

// 暴击+免伤
export function calcHurt(
	f: Fight,
	a: BaseAttack,
	d: BaseAttack,
	af: FinalAttack,
	df: FinalAttack,
	ctx: FightContex,
	rate = 0,
	allowCrit = true,
) {
	let dhp = calcBaseAttack(a, d);
	let crit = allowCrit ? calcCrit(f, a, d, ctx) : 0;
	return calcFinal(af, df, dhp, rate + crit + a.hurtP, ctx);
}

export function clamp(v: number, min: number, max: number) {
	return Math.min(Math.max(v, min), max);
}

// 毒没有暴击,也不走免伤，
// 对于毒, attack扣血, hurt扣百分比
export function calcPoison(
	f: Fight,
	a: BaseAttack,
	d: BaseAttack,
	hp: number,
	rate: number,
	ctx: FightContex,
): number {
	const d1 = a.attack - d.defend;
	const d2 = clamp(a.hurt, 0, 1);
	return finite(Math.max((d2 * hp + d1) * (1 + rate + a.hurtP), 1), 'Poison');
}

// 加血有暴击,没有免伤，
export function calcHeal(
	f: Fight,
	a: BaseAttack,
	d: BaseAttack,
	rate: number,
	ctx: FightContex,
): number {
	const result = calcBaseAttack(a, d);
	let crit = calcCrit(f, a, d, ctx);
	return finite(result * (1 + rate + crit + a.hurtP), 'Heal');
}

// 暴击只判定一次，返回加成，留到最终倍率阶段与技能及属性加成相加。
// allowCrit = false when 格挡后无法crit 
function calcCrit(f: Fight,
	a: BaseAttack,
	d: BaseAttack,
	ctx: FightContex,
){
	if ((isDebugCrit() || f.randomLess(a.critP - d.critPAnit))) {
		ctx.effects.push('crit');
		return critBonusBase + clamp(a.critDeep - d.critDeepAnit, 0, 1);
	}
	return 0;
}

function calcBaseAttack(
	a: BaseAttack,
	d: BaseAttack,
) {
	return a.attack * (1 + a.attackP) - d.defend * (1 + d.defendP) + a.hurt;
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
