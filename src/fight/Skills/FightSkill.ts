// 战斗技能

import { Fight, FightContex } from '../Fight';
import { BaseAttack, FinalAttack } from '../FightAttr';
import { SelectParam, TargetSelectEnum } from '../struct';
import { FightUnit } from '../Unit/FightUnit';
import { calcAttack, calcHurt, mergeTableLevel } from './Calc';
import { getSkillData, SkillData } from './SkillDatas';
import { strict as assert } from 'node:assert';
import { isDebugHit, isDebugMiss } from '../FightDebug';

export class FightSkill {
	protected xls: SkillData; //因为很多都跟自身level有关，所以外部直接用xls多半不行
	level = 0; //但是user身上是有level的！
	constructor(xls: SkillData, level: number) {
		this.xls = xls;
		this.level = level;
		assert.ok(
			xls.nomove === undefined || xls.nomove === 0 || xls.nomove === 1,
			'nomove must be 0 or 1',
		);
		assert.ok(
			Number.isSafeInteger(xls.cd ?? 0) && (xls.cd ?? 0) >= 0,
			'cd must be a nonnegative safe integer',
		);
		for (const field of ['healRate', 'poisonRate'] as const) {
			const rate = xls[field] ?? 1;
			assert.ok(
				Number.isFinite(rate) && rate >= 0,
				`${field} must be finite and nonnegative`,
			);
		}
		// 未与单位属性合并的技能（周期 Buff、复活、普攻）也能直接读取等级数值。
		this.attack = this.mergeAttackData({
			rand: 0,
			hit: 0,
			dodge: 0,
			attack: 0,
			defend: 0,
			hurt: 0,
			hurtP: 0,
			hurtAnti: 0,
			hurtPAnti: 0,
			critP: 0,
			critPAnit: 0,
			critDeep: 0,
			critDeepAnit: 0,
		});
		this.final = mergeTableLevel(
			{ bloodP: 0, dbackP: 0, immunity: 0, immunityP: 0 },
			xls.final,
			xls.finalLevel,
			level,
		);
	}

	getName() {
		return this.xls.name;
	}

	hasTag(tag: string) {
		return this.xls.tags?.indexOf(tag) >= 0;
	}
	canBlood() {
		return !this.xls.noblood;
	}
	canDBack() {
		return !this.xls.nodback;
	}
	canFBack() {
		return !this.xls.nofback;
	}
	canSupport() {
		return !this.xls.nosupport;
	}
	canProtect() {
		return !this.xls.noprotect;
	}

	getXls() {
		return this.xls;
	}

	getId() {
		return this.xls.id;
	}
	// 命中率
	getRand() {
		return this.xls.rand ?? 1;
	}
	getNoMove() {
		return this.xls.nomove ?? 0;
	}
	isMove() {
		return !this.getNoMove();
	}
	isMagic() {
		return this.xls.magic;
	}
	isPhysic() {
		return !this.isMagic();
	}

	// 可能升到level才有kill,next...
	getKill() {
		return this.xls.kill;
	}
	getKillSkill() {
		return this.getRelativeSkill(this.getKill());
	}
	getNext() {
		return this.xls.next ?? this.xls.combo;
	}
	getNextSkill() {
		return this.getRelativeSkill(this.getNext());
	}
	getSpread() {
		return this.xls.spread;
	}
	getSpreadSkill() {
		return this.getRelativeSkill(this.getSpread());
	}

	// 临时的子技能~
	getRelativeSkill(id: number) {
		const data = getSkillData(id);
		if (!data) return;

		return new FightSkill(data, this.level);
	}

	getCost() {
		return this.xls.cost;
	}
	getHealRate() {
		return this.xls.healRate ?? 1;
	}
	getPoisonRate() {
		return this.xls.poisonRate ?? 1;
	}
	getFunc() {
		return this.xls.func || 'normal';
	}
	// 同一模仿func通过目标规则区分：any选择来源，其余沿用全局最近攻击。
	isMimicAny(): boolean {
		return this.getFunc() === 'mimic' && this.getSel()?.target === TargetSelectEnum.any;
	}

	canTarget(target: FightUnit): boolean {
		return !this.getTargetHint(target);
	}

	// 即时输入的目标资格预检，不计算伤害、不抽样；执行函数仍保留自己的状态检查。
	getTargetHint(target: FightUnit): string | undefined {
		const func = this.getFunc();
		if (this.isMimicAny()) {
			// 这里只读取来源的行动记录，不把来源当作实际受击者检查死亡或石化。
			return target.fight?.hasMimicRecord(target) ? undefined : '该单位尚无可模仿的行动';
		}
		if (func === 'relife') {
			if (!target.isDied()) return '目标尚未死亡';

			if (Math.floor(this.getHealRate() * target.getHpMax()) <= 0) {
				return '目标无法复活';
			}
		} else {
			if (target.isDied()) return '目标已死亡';
		}

		// 复活独立于普通受击；其他效果同时遵守技能类别和func的专用限制。
		const action =
			func === 'relife'
				? 'relife'
				: func === 'normal' && this.isPhysic()
					? 'attack'
					: 'skill';
		if (target.isForbidBeAction(action) || target.isForbidBeAction(func)) {
			if (func === 'relife') return '目标无法复活';

			if (func === 'heal') return '目标无法接受治疗';

			if (func === 'poison') return '目标无法中毒';

			return '目标当前无法接受该效果';
		}

		return undefined;
	}
	getSel() {
		return this.xls.sel;
	}

	isMulti() {
		return (this.getSel()?.num ?? 1) > 1;
	}

	// 保留已合并的阶段属性和专用类行为；每个目标复用单体流程，不重复发动或添加自身 Buff。
	forSingleTarget(): this {
		const skill: this = Object.assign(Object.create(Object.getPrototypeOf(this)), this);
		skill.xls = {
			...this.xls,
			sel: { ...this.xls.sel, num: 1 },
			rand: 1,
			afterSelfBuff: undefined,
		};
		return skill;
	}

	getXlsAttack() {
		return this.xls.attack;
	}
	getXlsFinal() {
		return this.xls.final;
	}

	physicHitTest(f: Fight, defender: FightUnit) {
		if (defender.isForbid('dodge')) return true;

		if (isDebugMiss()) return false;

		if (isDebugHit()) return true;

		if (this.xls.alwaysHit) return true;

		// 70 = 100 - 30
		const d2 = this.getAttack().hit - defender.attr.physic.base.dodge;
		return f.randomLess(d2 / 100);
	}

	calcHurt(f: Fight, defender: FightUnit, ctx: FightContex, attacker: FightUnit = ctx.attack) {
		const ismagic = this.isMagic();
		const dft = ismagic ? defender.attr.magic : defender.attr.physic;
		const rate = this.xls.damageRate ?? 1;
		assert.ok(Number.isFinite(rate) && rate >= 0, 'damageRate must be finite and nonnegative');
		const property = this.xls.skillProp ?? attacker?.attr.weaponProp;
		const propertyBonus = defender.getHurtMul(property, attacker?.attr.weapon) - 1;
		ctx.effects = [];
		const damage = calcHurt(
			f,
			this.getAttack(),
			dft.base,
			this.getFinal(),
			dft.final,
			ctx,
			rate + propertyBonus,
		);
		if (propertyBonus > 0) ctx.effects.push('克');
		return damage;
	}

	calcAttack(f: Fight, defender: FightUnit, ctx: FightContex) {
		const dft = defender.attr.magic;
		return calcAttack(f, this.getAttack(), dft.base, ctx);
	}

	// 动态的才调用
	mergeAttack(attack: BaseAttack, final: FinalAttack) {
		// 每次由单位属性与原始配置重算，避免重复合并时累计等级成长。
		this.attack = this.mergeAttackData(attack);
		this.final = mergeTableLevel(final, this.xls.final, this.xls.finalLevel, this.level);
	}

	protected mergeAttackData(attack: BaseAttack): BaseAttack {
		const rate = this.xls.attackRate ?? 1;
		assert.ok(Number.isFinite(rate) && rate >= 0, 'attackRate must be finite and nonnegative');
		const unitAttack = { ...attack, attack: attack.attack * rate };
		return mergeTableLevel(unitAttack, this.xls.attack, this.xls.attackLevel, this.level);
	}

	attack: BaseAttack;
	getAttack() {
		return this.attack;
	}

	final: FinalAttack;
	getFinal() {
		return this.final;
	}

	getPower() {
		return this.xls.power ?? this.level;
	}
}

function createDefaultData(target: TargetSelectEnum): SkillData {
	return {
		id: 0,
		name: '默认普攻',
		magic: false,
		rand: 1,
		sel: { target },
		attack: {},
		final: {},
	};
}

/** 默认普通攻击的选目标规则；按敌方、对位和友方分别缓存实例，未注册进技能表，不携带单位属性；调用者不得修改共享配置。 */
const defaultData: SkillData = createDefaultData(TargetSelectEnum.enemy);
let defaultSkill: FightSkill;
export function getDefaultSkill(): FightSkill {
	if (!defaultSkill) {
		defaultSkill = new FightSkill(defaultData, 0);
	}
	return defaultSkill;
}

const defaultData2: SkillData = createDefaultData(TargetSelectEnum.duiwei);
let defaultSkill2: FightSkill;
export function getDefaultSkillDuiwei(): FightSkill {
	if (!defaultSkill2) {
		defaultSkill2 = new FightSkill(defaultData2, 0);
	}
	return defaultSkill2;
}

const defaultData3: SkillData = createDefaultData(TargetSelectEnum.friend);
let defaultSkill3: FightSkill;
export function getDefaultSkillProtect(): FightSkill {
	if (!defaultSkill3) {
		defaultSkill3 = new FightSkill(defaultData3, 0);
	}
	return defaultSkill3;
}
