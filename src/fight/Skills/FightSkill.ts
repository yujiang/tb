// 战斗技能

import { Fight, FightContex } from '../Fight';
import { BaseAttack, FinalAttack, ZeroBaseAttack, ZeroFinalAttack } from '../FightAttr';
import { TargetSelectEnum } from '../struct';
import { FightUnit } from '../Unit/FightUnit';
import { calcHurt, hitTest, mergeTableLevel, parryTest } from './Calc';
import { getSkillData, SkillData } from '../Datas/SkillDatas';
import { strict as assert } from 'node:assert';
import { isDebugHit, isDebugMiss } from '../FightDebug';
import { getFightGlobalData } from '../Datas/FightGlobalData';

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
		// 未与单位属性合并的技能（周期 Buff、复活、普攻）也能直接读取等级数值。
		this.attack = this.mergeAttackData(ZeroBaseAttack());
		this.final = mergeTableLevel(
			ZeroFinalAttack(),
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
	// 只有物理近战才吸血
	canBlood() {
		// return this.isPhysic() && this.isMove() && !this.xls.noblood;
		return !this.xls.noblood;
	}
	getBloodP(): number {
		return this.getFinal().bloodP;
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
	canParry() {
		return !this.xls.noparry;
	}

	// relifeP这个字段太少用了, 没法放进baseAttack!
	// 只能直接写入skill
	getRelifeP() {
		return this.xls.relifeP ?? 0.2;
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
	passRand(f:Fight) {
		return f.randomLess(this.getRand());
	}

	getNoMove() {
		return this.xls.nomove ?? 0;
	}
	isMove() {
		return !this.getNoMove();
	}
	// 武侠里，magic相当于远程（弓箭，暗器等）
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
		const a = this.getAttack();
		const d = defender.attr.physic.base;
		return hitTest(f,a,d);
	}

	physicParryTest(f: Fight, attacker:FightUnit, defender: FightUnit): boolean {
		if (!this.isPhysic() || !this.canParry()) return false;

		if (defender.isForbid('parry')) {
			return false;
		}

		// const pskill = defender.getParrySkill();
		return parryTest(f, this.getAttack(), defender.attr.physic.base, defender.getParrySkill())
	}

	calcHurt(
		f: Fight,
		defender: FightUnit,
		ctx: FightContex,
		attacker: FightUnit = ctx.attack,
		damageRateAdd = 0,
		allowCrit = true,
	) {
		const ismagic = this.isMagic();
		const dft = ismagic ? defender.attr.magic : defender.attr.physic;
		const rate = damageRateAdd;
		assert.ok(Number.isFinite(rate) && rate >= 0, 'damageRate must be finite and nonnegative');
		const property = this.xls.skillProp ?? attacker?.attr.weaponProp;
		const propertyBonus = defender.getHurtMul(property, attacker?.attr.weapon);
		ctx.effects = [];
		const damage = calcHurt(
			f,
			this.getAttack(),
			dft.base,
			this.getFinal(),
			dft.final,
			ctx,
			rate + propertyBonus,
			allowCrit,
		);
		if (propertyBonus > 0) ctx.effects.push('克');
		return damage;
	}

	// 动态的才调用
	mergeAttack(attack: BaseAttack, final: FinalAttack) {
		// 每次由单位属性与原始配置重算，避免重复合并时累计等级成长。
		this.attack = this.mergeAttackData(attack);
		this.final = mergeTableLevel(final, this.xls.final, this.xls.finalLevel, this.level);
	}

	protected mergeAttackData(attack: BaseAttack): BaseAttack {
		return mergeTableLevel(attack, this.xls.attack, this.xls.attackLevel, this.level);
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


// 现在有了表格，就是用表格，不必创建了。

export function getDefaultAttackSkill(): FightSkill {
	return getDefaultSkill(getFightGlobalData().defaultAttackSkill);
}

export function getDefaultProtectSkill(): FightSkill {
	return getDefaultSkill(getFightGlobalData().defaultProtectSkill);
}

export function getDefaultFBackSkill(): FightSkill {
	return getDefaultSkill(getFightGlobalData().defaultFBackSkill);
}

function getDefaultSkill(id: number): FightSkill {
	const xls = getSkillData(id);
	assert(xls, `Default skill ${id} must be registered`);
	return new FightSkill(xls, 0);
}
