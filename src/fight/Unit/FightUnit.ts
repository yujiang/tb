import { Fight, FightContex } from '../Fight';
import { FightAttr, getAttackMul, PropEnum, WeaponEnum } from '../FightAttr';
import {
	FightCmdEnum,
	FightDisplay,
	FightDisplayInput,
	FightInput,
	FightSideEnum,
	IdLevelArray,
	IdRand,
	SkillCost,
	SpeedSkill,
	SkillUseType,
} from '../struct';
import { FightSkill } from '../Skills/FightSkill';
import { getSkillData } from '../Skills/SkillDatas';
import { createBuff, FightBuff } from '../Buffs/FightBuff';
import { findForbidStatusByAction, findForbidStatusByBeaction } from '../Buffs/FightStatus';
import { BuffTurnEnum, FightUnitEvent, getBuffData, OverlapEnum } from '../Buffs/BuffDatas';
import type {
	FightUnitEventMap,
	FightUnitContextEvent,
	FightUnitPlainEvent,
} from '../Buffs/BuffDatas';
import { createPassiveSkills, PassiveSkill } from '../Passives/PassiveSkill';
import { calcAttr } from '../Skills/Calc';
import EventEmitter from 'node:events';
import { OrderedEventEmitter } from '../../public/OrderedEventEmitter';
import { fightConsts } from '../FightConsts';
import { getDebugHurtHpLimit } from '../FightDebug';
import { createUnitDisplay } from './CreateUnitDisplay';
import { strict as assert } from 'node:assert';

export enum UnitType {
	user,
	summon,
	monster, //npc
}

/** 完整监听参数，含首项unit；指定事件名即可推导后续参数。 */
export type UnitEventArgs<E extends FightUnitEvent> = [
	unit: FightUnit,
	...args: FightUnitEventMap[E],
];
export type UnitEventFunc<E extends FightUnitEvent = FightUnitEvent> = (
	unit: FightUnit,
	...args: FightUnitEventMap[E]
) => void;
type ContextEventTailMap = {
	[E in FightUnitContextEvent]: FightUnitEventMap[E] extends [FightContex, ...infer Args]
		? Args
		: never;
};
export type UnitContextEventFunc<E extends FightUnitContextEvent = FightUnitContextEvent> = (
	unit: FightUnit,
	ctx: FightContex,
	...args: ContextEventTailMap[E]
) => void;
export type UnitEventListenerMap = { [E in FightUnitEvent]: UnitEventArgs<E> };

// 每次受伤独立创建，后续监听读取前一个监听修改后的伤害。
export type HurtSource = 'skill' | 'buff' | 'dback' | 'share' | 'reflect';

export interface HurtOptions {
	/** 本次减伤前的理论伤害，仅用于表现通知；省略取onHurt传入值，不参与实际结算。 */
	originalDamage?: number;
	magic?: boolean;
	reflected?: boolean; // 已反射的伤害不再次反射
	source?: HurtSource; // 默认 skill（含普攻）；其他伤害来源不能触发保护
	noprotect?: boolean; // 禁止本次伤害被保护分担，省略为 false
	attackProp?: PropEnum; // 本次生效的攻击五行
	attackWeapon?: WeaponEnum; // 本次生效的攻击兵器
	weakPoint?: boolean; // 本次公式命中了受伤者的弱点，供破盾使用，不从 ctx 的展示标记推断
}

export interface PendingHurt extends HurtOptions {
	damage: number;
	cancelled?: boolean;
	shared?: boolean; // 本次伤害已经被保护分担，不能由多个保护 Buff 重复分摊
	share?: { unit: FightUnit; damage: number; buffId: number }; // 与本次命中一起结算的保护伤害
}

export interface HealOptions {
	reflected?: boolean;
	revive?: boolean; // 复活恢复生命，不参与治疗转移，避免存活单位为 0 血
}

export interface PendingHeal extends HealOptions {
	heal: number;
	cancelled?: boolean;
}

// 战斗单元
export abstract class FightUnit {
	// 约定这个uid按照序号递增，绝不重复
	uid: number;
	private _attr: FightAttr;
	/** 属性来源变化后置为 true；读取 attr 或循环行动结束时重算，默认需要首次计算。 */
	attrDirty = true;
	get attr(): FightAttr {
		if (this.attrDirty) this.calcAttr();

		return this._attr;
	}
	attrOri: FightAttr;
	display: FightDisplay;

	constructor(
		id: number,
		attr: FightAttr,
		display: FightDisplayInput,
		passiveSkills: IdLevelArray = [],
	) {
		this.uid = id;
		this.attrOri = attr;
		// 兼容直接传入普通对象的宿主数据；在首次绑定单位时补齐公共默认值。
		this.attrOri.jpAdd ??= fightConsts.jpAdd;
		this.attrOri.damageLimit ??= 0;
		this.attrOri.spHurtRate ??= fightConsts.spHurtRate;
		this.attrOri.spOutputRate ??= fightConsts.spOutputRate;
		this.display = createUnitDisplay(display);
		this.setPassiveSkills(passiveSkills);
		this.calcAttr();
	}

	getName() {
		return this.display.name;
	}

	speedRand = 0; // 乱敏，用来排序出手
	getSpeed() {
		return this.attr.getSpeed();
	}
	getSpeedOrder() {
		return this.getSpeed() + this.speedRand;
	}

	isCareer(c: string) {
		return c === this.attr.career;
	}

	startFight(f: Fight) {
		this.skillCds.clear();
		this.revealedWeakProp.length = 0;
		this.revealedWeakWeapon.length = 0;
		this.attr.shield = this.attrOri.shield;
		this.lastShieldBreakTurn = -1;
		this.shieldMax = undefined;
		this.speedRand = this.getSpeed() * (f.random() * 0.2 - 0.1);
	}
	endFight() {}
	// 单位永久离场，不触发死亡、驱散或资源变化；本场实例不会再次使用。
	leaveFight() {
		this.input = null;
		this.endFight();
		for (const buff of this.buffs.values()) buff.onRemoved(this);
	}

	getHp() {
		return this.attr.point.hp;
	}
	getHpMax() {
		return this.attr.point.hpMax;
	}
	getHpPercent() {
		return this.getHp() / this.getHpMax();
	}

	// 统一资源增长及上限截断；消息携带实际增加值和最终值，客户端无需重复计算。
	private addPoint(key: 'mp' | 'sp' | 'jp', amount: number, ctx: FightContex): number {
		if (!Number.isFinite(amount) || amount <= 0) {
			return 0;
		}

		const point = this.attr.point;
		const before = point[key] ?? 0;
		const max = point[`${key}Max`] ?? 0;
		const added = Math.max(0, Math.min(amount, max - before));
		if (added <= 0) return 0;

		point[key] = before + added;
		ctx.msgs.push(['addPoint', this.uid, key, added, point[key]]);
		return added;
	}

	addMp(amount: number, ctx: FightContex) {
		return this.addPoint('mp', amount, ctx);
	}
	addSp(amount: number, ctx: FightContex) {
		return this.addPoint('sp', amount, ctx);
	}
	addJp(amount: number, ctx: FightContex) {
		if (!ctx.fight.globalData.jiqi) return 0;

		return this.addPoint('jp', amount, ctx);
	}

	getAttr(key: string) {
		return this.attr.getAttr(key);
	}

	// 加入仇恨列表
	enemyHurt: Map<number, number> = new Map();
	addEnemy(attacker: FightUnit, hp: number) {
		if (attacker == this) return;

		this.enemyHurt.set(attacker.uid, (this.enemyHurt.get(attacker.uid) ?? 0) + hp);
	}
	clearEnemy() {
		this.enemyHurt.clear();
	}
	getEnemyTop(num: number): number[] {
		// sort Enemy
		let arr = Array.from(this.enemyHurt.entries()).sort((a, b) => b[1] - a[1]);
		return arr.slice(0, num).map((v) => v[0]);
	}

	minHp = 0; //boss锁血
	onHurt(
		attacker: FightUnit,
		why: string,
		hp: number,
		ctx: FightContex,
		options: HurtOptions = {},
	) {
		const results: (() => void)[] = [];
		const actual = this.applyHurt(attacker, why, hp, ctx, options, results);
		// 同一次保护命中的双方先扣血、发送伤害，再处理受伤和死亡结果。
		for (const finish of results) finish();
		return actual;
	}

	private applyHurt(
		attacker: FightUnit,
		why: string,
		hp: number,
		ctx: FightContex,
		options: HurtOptions,
		results: (() => void)[],
	): number {
		if (this.isDied()) return 0;

		const originalDamage = options.originalDamage ?? hp;
		if (this.isDefend()) {
			hp *= 0.5;
		}
		// 有盾时仅非弱点伤害减半，保护、不屈等读取减伤后的数值。
		const shield = this.hasShield() ? this.attr.shield : undefined;
		const weakPoint =
			options.weakPoint ?? this.isWeakPoint(options.attackProp, options.attackWeapon);
		if (shield > 0 && !weakPoint) {
			hp *= 0.5;
		}
		// 来源单位的伤害上限与调试限伤取较小值，受伤前效果也应看到限伤后的伤害。
		let hurtLimit = getDebugHurtHpLimit();
		const damageLimit = attacker.attr.damageLimit;
		if (damageLimit > 0) {
			hurtLimit = hurtLimit > 0 ? Math.min(hurtLimit, damageLimit) : damageLimit;
		}
		if (hurtLimit > 0) hp = Math.min(hp, hurtLimit);

		const pending: PendingHurt = {
			...options,
			source: options.source ?? 'skill',
			weakPoint,
			damage: hp,
		};
		this.emitContext('beforeHurt', ctx, attacker, pending);
		if (pending.cancelled || this.isDied()) {
			if (pending.cancelled && !this.isDied()) {
				this.reportMitigation(attacker, originalDamage, 0, ctx);
			}
			return 0;
		}

		if (pending.weakPoint && pending.damage >= 1) {
			this.revealWeakness(options.attackProp, options.attackWeapon, ctx);
		}

		if (shield > 0 && pending.weakPoint && pending.damage >= 1) {
			this.attr.shield = Math.max(0, this.attr.shield - 1);
			if (this.attr.shield === 0) {
				this.lastShieldBreakTurn = ctx.fight.turn;
			}
			const shieldMsg: FightContex['msgs'][number] = ['shield', this.uid, this.attr.shield];
			ctx.msgs.push(shieldMsg);
			if (this.attr.shield === 0) {
				const max = this.shieldMax;
				this.emitContext('break', ctx, attacker, ctx.fight.isAllShieldBroken(this.side));
				if (this.shieldMax !== max) shieldMsg.push(null, this.shieldMax);
			}
		}
		const point = this.attr.point;
		const previousHp = point.hp;
		// 锁血只限制本次可扣生命；当前血量已低于锁血线时不能因受伤回血。
		const availableHp = Math.max(0, previousHp - Math.max(0, this.minHp));
		// 受伤前回调仍可能增加伤害，最终扣血再次遵守生效的上限。
		const damage = hurtLimit > 0 ? Math.min(pending.damage, hurtLimit) : pending.damage;
		this.reportMitigation(
			attacker,
			originalDamage,
			this.minHp > 0 ? Math.min(damage, availableHp) : damage,
			ctx,
		);
		if (pending.share) {
			const share = pending.share;
			ctx.msgs.push(['buffTrigger', this.uid, share.buffId, 'protect', share.unit.uid]);
			//protect的不再反伤反击，否则战斗就乱了
			share.unit.applyHurt(
				attacker,
				'share',
				share.damage,
				ctx,
				{ magic: pending.magic, source: 'share' },
				results,
			);
		}
		const actual = Math.min(availableHp, Math.max(0, Math.floor(damage)));
		point.hp -= actual;

		ctx.msgs.push(['hurt', why, this.uid, attacker.uid, actual, point.hp, ctx.effects]);
		this.addSp(actual * this.attr.spHurtRate, ctx);
		if (attacker !== this) {
			attacker.addSp(actual * attacker.attr.spOutputRate, ctx);
		}
		this.addEnemy(attacker, actual);
		ctx.fight.Sides?.[attacker.side]?.recordHurt(attacker.uid, actual);
		results.push(() => {
			if (point.hp !== previousHp)
				this.emitContext('hp', ctx, attacker, previousHp, point.hp);
			// 分担只承担伤害，不展开保护者自己的受伤反应链；死亡流程仍正常执行。
			if (pending.source !== 'share') {
				this.emitContext('hurt', ctx, attacker, actual, pending);
			}
			if (point.hp <= 0) {
				point.hp = 0;
				ctx.msgs.push(['die', this.uid]);
				this.onDie(attacker, why, ctx);
				this.fight.onDie(this);
			}
		});
		return actual;
	}

	private reportMitigation(
		attacker: FightUnit,
		originalDamage: number,
		damage: number,
		ctx: FightContex,
	) {
		const before = Math.max(0, Math.floor(originalDamage));
		const after = Math.max(0, Math.floor(damage));
		if (before > after) ctx.msgs.push(['mitigate', this.uid, attacker.uid, before, after]);
	}

	// 加入仇恨列表
	friendHeal: Map<number, number> = new Map();
	addFriend(attacker: FightUnit, hp: number) {
		if (hp <= 0) return;

		this.friendHeal.set(attacker.uid, (this.friendHeal.get(attacker.uid) ?? 0) + hp);
	}
	clearFriend() {
		this.friendHeal.clear();
	}
	getFriendTop(num: number): number[] {
		// sort Enemy
		let arr = Array.from(this.friendHeal.entries()).sort((a, b) => b[1] - a[1]);
		return arr.slice(0, num).map((v) => v[0]);
	}

	onHeal(
		attacker: FightUnit,
		why: string,
		hp: number,
		ctx: FightContex,
		options: HealOptions = {},
	) {
		const effects = options.revive || why === 'blood' ? [] : [...ctx.effects];
		const pending: PendingHeal = { ...options, heal: hp };
		this.emitContext('beforeHeal', ctx, attacker, pending);
		if (pending.cancelled) return;

		hp = Math.floor(pending.heal);

		const point = this.attr.point;
		ctx.msgs.push(['heal', why, this.uid, attacker.uid, hp, point.hp, effects]);
		const previousHp = point.hp;
		point.hp = Math.min(point.hp + hp, point.hpMax);
		attacker.addSp((point.hp - previousHp) * attacker.attr.spOutputRate, ctx);
		this.addFriend(attacker, point.hp - previousHp);
		ctx.fight.Sides?.[attacker.side]?.recordHeal(attacker.uid, point.hp - previousHp);
		if (point.hp !== previousHp) this.emitContext('hp', ctx, attacker, previousHp, point.hp);
		this.emitContext('heal', ctx, attacker, why, hp);
	}

	private emitter = new EventEmitter();
	readonly contextEmitter = new OrderedEventEmitter<
		FightUnitContextEvent,
		UnitEventListenerMap
	>();
	emitContext<E extends FightUnitContextEvent>(event: E, ...args: FightUnitEventMap[NoInfer<E>]) {
		// 泛型索引在此展开为完整参数元组；收发入口均已由同一事件表约束。
		this.contextEmitter.emit<E>(
			event,
			...([this, ...args] as unknown as UnitEventListenerMap[E]),
		);
		this.emitter.emit(event, this, ...args);
		this.fight?.emitUnitEvent(event, this, ...args);
	}

	emit<E extends FightUnitPlainEvent>(event: E, ...args: FightUnitEventMap[NoInfer<E>]) {
		this.emitter.emit(event, this, ...args);
		this.fight?.emitUnitEvent(event, this, ...args);
	}

	on<E extends FightUnitEvent>(event: E, listener: UnitEventFunc<NoInfer<E>>) {
		this.emitter.on(event, listener);
	}
	onContex<E extends FightUnitContextEvent>(
		event: E,
		listener: UnitContextEventFunc<NoInfer<E>>,
		prior = 0,
	) {
		this.contextEmitter.on<E>(
			event,
			listener as unknown as (...args: UnitEventListenerMap[E]) => void,
			prior,
		);
	}
	off<E extends FightUnitEvent>(event: E, listener: UnitEventFunc<NoInfer<E>>) {
		this.emitter.off(event, listener);
	}
	offContex<E extends FightUnitContextEvent>(
		event: E,
		listener: UnitContextEventFunc<NoInfer<E>>,
	) {
		this.contextEmitter.off<E>(
			event,
			listener as unknown as (...args: UnitEventListenerMap[E]) => void,
		);
	}

	pos: number;
	setPos(pos: number) {
		this.pos = pos;
	}

	dump() {
		return {
			uid: this.uid,
			name: this.getName(),
			side: this.side,
			pos: this.pos,
		};
	}

	fight: Fight;
	side: FightSideEnum;
	setFight(fight: Fight, side: FightSideEnum) {
		if (this.fight !== fight) {
			this.skillUseCounts.clear();
			this.skillTypeUseCounts.clear();
		}

		this.lastAfterTurn = 0;
		this.lastSupportTurn = -1;
		this.fight = fight;
		this.side = side;
	}

	dead = false;
	isDied() {
		return this.dead;
	}
	onDie(attacker: FightUnit, why: string, ctx: FightContex) {
		this.die(ctx);
		this.emitContext('die', ctx, attacker, why);
	}
	die(ctx?: FightContex) {
		this.dead = true;
		this.clearBuffByDie(ctx);
	}
	onRelife(attacker: FightUnit, why: string, ctx: FightContex) {
		this.relife();
		ctx.msgs.push(['relife', this.uid]);
		this.emitContext('relife', ctx, attacker, why);
	}
	relife() {
		this.dead = false;
	}

	defend = false;
	isDefend() {
		return this.defend;
	}
	doDefend() {
		if (!this.dead) {
			this.defend = true;
		}
	}

	type: UnitType;
	isUser() {
		return UnitType.user == this.type;
	}
	isUserSummon() {
		return UnitType.summon == this.type;
	}
	isMonster() {
		return UnitType.monster == this.type;
	}

	private lastShieldBreakTurn = -1;
	private shieldMax?: number;

	/** 在破盾事件中更新回盾上限，当前盾仍保持破盾状态。 */
	setShieldMax(layers: number) {
		this.shieldMax = layers;
	}
	private hasShield() {
		return this.isMonster() && this.attr.shield !== undefined;
	}
	private revealedWeakProp: PropEnum[] = [];
	private revealedWeakWeapon: WeaponEnum[] = [];

	/** 一次同步本单位当前的完整弱点列表，包括已揭示项。 */
	revealAllWeaknesses(ctx: FightContex) {
		this.revealedWeakProp = this.isMonster()
			? [...new Set(this.attr.weakProp)].filter((prop) => prop !== PropEnum.none)
			: [];
		this.revealedWeakWeapon = this.isMonster()
			? [...new Set(this.attr.weakWeapon)].filter((weapon) => weapon !== WeaponEnum.none)
			: [];
		ctx.msgs.push([
			'weaknessAll',
			this.uid,
			[...this.revealedWeakProp],
			[...this.revealedWeakWeapon],
		]);
	}

	private revealWeakness(
		prop: PropEnum | undefined,
		weapon: WeaponEnum | undefined,
		ctx: FightContex,
	) {
		if (prop !== undefined && this.isWeakPoint(prop) && !this.revealedWeakProp.includes(prop)) {
			this.revealedWeakProp.push(prop);
			ctx.msgs.push(['weakness', this.uid, 'prop', prop]);
		}
		if (
			weapon !== undefined &&
			this.isWeakPoint(PropEnum.none, weapon) &&
			!this.revealedWeakWeapon.includes(weapon)
		) {
			this.revealedWeakWeapon.push(weapon);
			ctx.msgs.push(['weakness', this.uid, 'weapon', weapon]);
		}
	}

	isWeakPoint(property: PropEnum, weapon: WeaponEnum = WeaponEnum.none): boolean {
		if (!this.isMonster()) return false;

		const propMatch =
			property !== undefined &&
			property !== PropEnum.none &&
			this.attr.weakProp?.includes(property);
		const weaponMatch = weapon !== WeaponEnum.none && this.attr.weakWeapon?.includes(weapon);
		return !!(propMatch || weaponMatch);
	}
	// 带弱点盾的 NPC 通过护盾减伤体现弱点；无盾 NPC 保留原有弱点倍率。
	getHurtMul(property: PropEnum, weapon: WeaponEnum = WeaponEnum.none): number {
		const { weakProp, weakWeapon } = this.attr;
		if (this.isMonster() && (weakProp !== undefined || weakWeapon !== undefined)) {
			if (this.hasShield()) return 1;

			return this.isWeakPoint(property, weapon) ? 1.5 : 1;
		}

		return getAttackMul(property, this.attr.charProp);
	}
	// 死亡单位也要收指令：本轮轮到它之前可能被其他单位复活。
	needInput() {
		return this.isUser() || this.isUserSummon();
	}

	input: FightInput;
	// 回合前处理, buff，盾0回盾
	processBeforeTurn(turn: number, ctx: FightContex) {
		if (
			this.hasShield() &&
			this.attr.shield === 0 &&
			this.lastShieldBreakTurn < turn &&
			(this.shieldMax ?? this.attrOri.shield) > 0
		) {
			this.attr.shield = this.shieldMax ?? this.attrOri.shield;
			ctx.msgs.push(['shield', this.uid, this.attr.shield, 'recover']);
		}
		this.onBuffTurn(turn, BuffTurnEnum.thisTurn, ctx);
	}
	// 回合后处理, dead...
	processAfterTurn(turn: number, ctx: FightContex) {
		if (turn <= this.lastAfterTurn) return;

		this.lastAfterTurn = turn;
		this.fight.afterTurnStarted = Math.max(this.fight.afterTurnStarted, turn);
		this.onBuffTurn(turn, BuffTurnEnum.afterTurn, ctx);
		this.emitContext('afterTurn', ctx, turn);
	}
	processOneTurn(turn: number) {
		if (this.isDied()) return;

		const input = this.input || { cmd: FightCmdEnum.none };
		return this.fight.processUnit(this, input);
	}

	private lastAfterTurn = 0;
	private onBuffTurn(turn: number, turnType: BuffTurnEnum, ctx: FightContex) {
		for (const buff of [...this.buffs.values()]) {
			if (this.isDied() && turnType !== BuffTurnEnum.afterTurn) {
				break;
			}
			if (this.findBuff(buff.getId()) !== buff) continue;
			if (buff.getTurnType() === turnType) {
				if (buff.doTurn(this, turn, ctx)) {
					if (this.findBuff(buff.getId()) === buff) {
						this.expireBuff(buff, 'turn', ctx);
					}
				}
			}
		}
	}

	// 维持一个自己动作的turn，解决一个回合多动的问题！
	myInputTurn = 0;
	inputStart(turn: number, ctx: FightContex): void {
		this.defend = false;
		this.input = null;
		// 处理buff
		this.myInputTurn++;
		this.onBuffTurn(this.myInputTurn, BuffTurnEnum.inputTurn, ctx);
	}

	getExtraActions(): readonly SpeedSkill[] {
		return [];
	}
	// 仅决策普通行动，不推进输入次数或触发输入周期Buff。
	getActionInput(turn: number, ctx: FightContex, automatic = false): FightInput {
		return { ...(this.input ?? { cmd: FightCmdEnum.none }) };
	}

	onInput(input: FightInput) {
		if (!this.fight?.checkInput(this, input)) return false;

		this.input = { ...input };
		if (input.cmd == FightCmdEnum.cancel) {
			this.input = null;
		}
		return true;
	}

	// 默认无资源费用限制；玩家与召唤物覆盖，不足时 hintClient 提示，预检不扣费。
	canCost(cost: SkillCost): boolean {
		return true;
	}
	abstract costSkill(cost: SkillCost, ctx: FightContex): boolean;

	skills = new Map<number, FightSkill>();
	private temporarySkills: FightSkill[] = [];
	// 仅查询临时技能是否存在；费用与CD规则由执行指令的ignoreCostCD显式控制。
	isTemporarySkill(id: number): boolean {
		return this.temporarySkills.some((skill) => skill.getId() === id);
	}
	// 临时提供技能查询能力，不修改已学列表；无论结算成功或抛错都撤销这次借用。
	withTemporarySkill<T>(skill: FightSkill, run: () => T): T {
		this.temporarySkills.push(skill);
		try {
			return run();
		} finally {
			this.temporarySkills.pop();
		}
	}
	// 按单位、技能编号保存恢复回合；升级、死亡及复活不重置。
	private skillCds = new Map<number, number>();
	getSkillCd(id: number): number {
		return Math.max(0, (this.skillCds.get(id) ?? 0) - (this.fight?.turn ?? 0));
	}
	startSkillCd(skill: FightSkill, ctx: FightContex) {
		const cd = skill.getXls().cd ?? 0;
		if (!cd) return;

		const readyTurn = ctx.fight.turn + cd;
		this.skillCds.set(skill.getId(), readyTurn);
		ctx.msgs.push(['skillCd', this.uid, skill.getId(), readyTurn]);
	}
	findSkill(id: number): FightSkill {
		if (!id) return;

		for (let i = this.temporarySkills.length - 1; i >= 0; i--) {
			if (this.temporarySkills[i].getId() === id) return this.temporarySkills[i];
		}

		return this.skills.get(id);
	}

	// 装配替代普攻的攻击技能；0 表示使用原有普通攻击。
	attackSkill = 0;
	getAttackSkill() {
		return this.findSkill(this.attackSkill);
	}
	setAttackSkill(id: number) {
		this.attackSkill = id;
	}

	ultimateSkill = 0;
	getUltimateSkill() {
		return this.findSkill(this.ultimateSkill);
	}
	setUltimateSkill(id: number) {
		this.ultimateSkill = id;
	}

	// 装配反击技能
	fbackSkill = 0;
	getFBackSkill() {
		return this.findSkill(this.fbackSkill);
	}
	setFBackSkill(id: number) {
		this.fbackSkill = id;
	}

	private readonly skillUseCounts = new Map<number, number>();
	private readonly skillTypeUseCounts = new Map<SkillUseType, number>();

	/** 本场指定技能ID实际发动次数；未使用返回0，默认普攻及内置反击等无表ID技能统一使用0。 */
	getSkillUseCount(id: number): number {
		return this.skillUseCounts.get(id) ?? 0;
	}

	/** 本场指定出手类型的累计发动次数，跨技能ID统计；未使用返回0。 */
	getSkillTypeUseCount(type: SkillUseType): number {
		return this.skillTypeUseCounts.get(type) ?? 0;
	}

	/** 汇总当前所有Buff对指定出手的额外伤害倍率；只读取贡献值，不累加到技能对象。 */
	getDamageRate(skill: FightSkill, type: SkillUseType): number {
		let rate = 0;
		for (const buff of this.buffs.values()) rate += buff.getDamageRate(this, skill, type);
		return rate;
	}

	// 技能管线在实际发动时调用；更新次数后汇总本次增伤，再发事件处理Buff到期，保留最后一次效果。
	recordSkillUse(skill: FightSkill, ctx: FightContex, type: SkillUseType = 'normal'): number {
		const skillCount = this.getSkillUseCount(skill.getId()) + 1;
		const typeCount = this.getSkillTypeUseCount(type) + 1;
		this.skillUseCounts.set(skill.getId(), skillCount);
		this.skillTypeUseCounts.set(type, typeCount);
		const damageRate = this.getDamageRate(skill, type);
		this.emitContext('useSkill', ctx, skill, type, skillCount, typeCount);
		return damageRate;
	}

	// 每次施放独立的计数入口；群攻和溅射的多个目标共用它，嵌套技能各自新建。
	createSkillUse(
		skill: FightSkill,
		ctx: FightContex,
		type: SkillUseType = 'normal',
	): () => number {
		let used = false;
		let damageRate = 0;
		return () => {
			if (used) return damageRate;

			used = true;
			damageRate = this.recordSkillUse(skill, ctx, type);
			return damageRate;
		};
	}

	// 装配协战技能；改装、死亡与复活都不重置当回合次数。
	supportSkill = 0;
	lastSupportTurn = -1;
	getSupportSkill() {
		return this.findSkill(this.supportSkill);
	}
	setSupportSkill(id: number) {
		if (id !== 0) {
			const data = getSkillData(id);
			assert.ok(
				data && (data.func || 'normal') === 'normal',
				`Support skill ${id} must be a registered normal skill`,
			);
		}

		this.supportSkill = id;
	}

	addSkill(id: number, level: number) {
		const data = getSkillData(id);
		if (!data) return;

		const skill = new FightSkill(data, level);
		this.skills.set(id, skill);
		return skill;
	}

	// passive skills 不会add remove
	passiveSkills: PassiveSkill[];
	setPassiveSkills(passiveSkills: IdLevelArray) {
		this.passiveSkills = createPassiveSkills(passiveSkills);
		for (const skill of this.passiveSkills) {
			skill.onInit(this);
		}
		this.attrDirty = true;
	}

	//buff status and forbid
	buffs = new Map<number, FightBuff>();
	getActionBlockStatus(): string | undefined {
		return findForbidStatusByAction('action')?.find((status) => this.inStatus(status));
	}

	// 只查询展示原因；是否跳过统一用isForbid("action")，也支持被动状态。
	getActionBlockBuff(): FightBuff | undefined {
		return [...this.buffs.values()].find((buff) => buff.blocksAction());
	}
	clearBuffByDie(ctx?: FightContex) {
		const removed = Array.from(this.buffs.values()).filter((v) => v.canRemoveByDie());
		// this.buffs.clear();
		for (const buff of removed) {
			buff.onRemoved(this);
			this.buffs.delete(buff.getId());
			if (ctx) ctx.msgs.push(['removeBuff', 'die', this.uid, this.uid, buff.getId()]);
		}
		this.onBuffChanged('clear', removed);
	}

	//封印 - attack普攻，物品，skill技能，大招
	isForbid(action: string) {
		const status = findForbidStatusByAction(action);
		if (!status) return false;

		for (const s of status) {
			if (this.inStatus(s)) return true;
		}

		return false;
	}

	// 受作用限制与自身行动限制分开；死亡同时识别真实生命状态和配置状态。
	isForbidBeAction(action: string): boolean {
		const statuses = findForbidStatusByBeaction(action);
		return (
			statuses?.some(
				(status) => (status === '死亡' && this.isDied()) || this.inStatus(status),
			) ?? false
		);
	}

	inStatus(status: string) {
		if (status === '眩晕' && this.hasShield() && this.attr.shield === 0) {
			return true;
		}

		for (const p of this.passiveSkills) {
			if (p.inStatus(status)) return true;
		}

		for (const buff of this.buffs.values()) {
			if (buff.inStatus(status)) return true;
		}

		return false;
	}

	findBuff(id: number): FightBuff {
		return this.buffs.get(id);
	}

	findRemoveBuffsByTag(tag: string, power: number): FightBuff[] {
		return Array.from(this.buffs.values()).filter((v) => v.hasTag(tag) && v.canRemove(power));
	}

	findBuffsByTag(tag: string): FightBuff[] {
		return Array.from(this.buffs.values()).filter((v) => v.hasTag(tag));
	}

	deleteBuff(buff: FightBuff) {
		buff.onRemoved(this);
		this.buffs.delete(buff.getId());
	}

	onBuffChanged(why: string, buf: FightBuff | FightBuff[]) {
		let attr = false;
		if (Array.isArray(buf)) {
			for (const b of buf) {
				if (b.hasAttr()) {
					attr = true;
					break;
				}
			}
		} else if (buf && buf.hasAttr()) {
			attr = true;
		}
		if (attr) this.attrDirty = true;
	}

	calcAttr() {
		const attrs = [];
		for (const p of this.passiveSkills) {
			if (p.hasAttr()) {
				attrs.push(p);
			}
		}
		for (const buff of this.buffs.values()) {
			if (buff.hasAttr()) {
				attrs.push(buff);
			}
		}
		const oldspeed = this._attr?.speed;
		const point = this._attr?.point;
		const shield = this._attr?.shield;
		const attr = calcAttr(this.attrOri, attrs);
		this._attr = attr;
		if (shield !== undefined && attr.shield !== undefined) {
			attr.shield = shield;
		}
		if (point) {
			attr.point.hp = point.hp;
			attr.point.mp = point.mp;
			attr.point.sp = point.sp;
			attr.point.jp = point.jp;
		}
		attr.point.sp ??= 0;
		attr.point.spMax ??= 0;
		attr.point.jp ??= 0;
		attr.point.jpMax ??= 0;
		// 扩展和事件可能读取 attr，先清标记，避免递归；回调中新置脏仍留待下次计算。
		this.attrDirty = false;
		this.modifyAttr(attr);
		this.emit('attr');
		if (oldspeed != attr.speed) {
			this.emit('speed', attr.speed);
		}
	}

	protected modifyAttr(attr: FightAttr) {}

	addBuff(
		attacker: FightUnit,
		why: string,
		buff: number,
		lv: number,
		ctx: FightContex,
	): FightBuff {
		const rt = this._addBuff(attacker, why, buff, lv, ctx);
		if (rt) this.onBuffChanged('add', rt);
		return rt;
	}

	addBuffsByPassiveSkill(addbuff: IdLevelArray) {
		const added: FightBuff[] = [];
		for (const buff of addbuff) {
			const [id, lv] = buff;
			const buf = this._addBuff(this, 'passive', id, lv, null);
			if (buf) added.push(buf);
		}
		this.onBuffChanged('passive', added);
	}

	addBuffs(
		attacker: FightUnit,
		why: string,
		addbuff: [number, number, number][],
		ctx: FightContex,
	) {
		const f = ctx.fight;
		const rts = [];
		for (const buff of addbuff) {
			const [id, lv, rand] = buff;
			if (rand < 1 && f.randomGreat(rand)) {
				continue;
			}
			const buf = this._addBuff(attacker, why, id, lv, ctx);
			if (buf) rts.push(buf);
		}
		this.onBuffChanged('add', rts);
		return rts;
	}

	_addBuff(
		attacker: FightUnit,
		why: string,
		buff: number,
		lv: number,
		ctx: FightContex,
	): FightBuff {
		const buf = this.findBuff(buff);
		const xls = getBuffData(buff);
		if (buf) {
			const lap = buf.getOverlap();
			if (lap === OverlapEnum.NOT) return;

			if (lap === OverlapEnum.RELPACE_BYPOWER && buf.greatPower(xls.power ?? 0, lv)) {
				return;
			}

			this.deleteBuff(buf);
		}

		const turn = this.fight?.turn ?? 0;
		const afterTurn = Math.max(0, turn - 1, this.fight?.afterTurnStarted ?? 0);
		const b = createBuff(attacker, buff, lv, turn, this.myInputTurn, afterTurn);
		if (!b) return;

		this.buffs.set(b.getId(), b);
		b.onAdded(this);
		if (ctx) {
			// 附带本次新增实例的展示数据；隐藏 Buff 使用 null，不要求客户端读取配置。
			const display = b.getDisplayMsg();
			ctx.msgs.push([
				'addBuff',
				why,
				this.uid,
				attacker.uid,
				buff,
				lv,
				display ? display.slice(2) : null,
			]);
			this.emitContext('addBuff', ctx, attacker, why, b);
		}
		return b;
	}

	removeBuff(
		attacker: FightUnit,
		why: string,
		buff: number,
		power: number,
		ctx: FightContex,
	): FightBuff {
		const buf = this._removeBuff(attacker, why, buff, power, ctx);
		if (buf) this.onBuffChanged('remove', buf);
		return buf;
	}

	removeBuffs(
		attacker: FightUnit,
		why: string,
		buffs: IdRand[],
		power: number,
		ctx: FightContex,
	): FightBuff[] {
		const f = ctx.fight;
		const rts = [];
		for (const buff of buffs) {
			const [id, rand] = buff;
			if (rand < 1 && f.randomGreat(rand)) {
				continue;
			}
			const buf = this._removeBuff(attacker, why, id, power, ctx);
			if (buf) rts.push(buf);
		}
		this.onBuffChanged('remove', rts);
		return rts;
	}

	_removeBuff(
		attacker: FightUnit,
		why: string,
		buff: number,
		power: number,
		ctx: FightContex,
	): FightBuff {
		const buf = this.findBuff(buff);
		if (!buf || !buf.canRemove(power)) {
			return;
		}

		return this.finishRemoveBuff(attacker, why, buf, ctx);
	}

	// 自然结束不受驱散标签或强度限制；实例检查避免误删同编号的新 Buff。
	expireBuff(buff: FightBuff, why: string, ctx: FightContex) {
		if (this.findBuff(buff.getId()) !== buff) return;

		this.finishRemoveBuff(this, why, buff, ctx);
		this.onBuffChanged(why, buff);
	}

	private finishRemoveBuff(
		attacker: FightUnit,
		why: string,
		buf: FightBuff,
		ctx: FightContex,
	): FightBuff {
		const buff = buf.getId();
		this.deleteBuff(buf);
		ctx.msgs.push(['removeBuff', why, this.uid, attacker.uid, buff]);
		this.emitContext('removeBuff', ctx, attacker, why, buf);
		return buf;
	}

	removeBuffByTag(
		attacker: FightUnit,
		why: string,
		tag: string,
		num: number,
		power: number,
		ctx: FightContex,
	): FightBuff[] {
		const bufs = this.findRemoveBuffsByTag(tag, power);
		const f = ctx.fight;
		const bs = num > 0 && bufs.length > num ? f.shuffleArray(bufs).slice(0, num) : bufs;
		const rts: FightBuff[] = [];
		for (const buff of bs) {
			const removed = this._removeBuff(attacker, why, buff.getId(), power, ctx);
			if (removed) rts.push(removed);
		}
		this.onBuffChanged('remove', rts);
		return rts;
	}

	getUnitMsg() {
		const point = { ...this.attr.getPointAttr() };
		if (!this.fight?.globalData.jiqi) {
			delete point.jp;
			delete point.jpMax;
		}
		const buffs = Array.from(this.buffs.values())
			.map((b) => b.getDisplayMsg())
			.filter((b) => b);
		return {
			uid: this.uid,
			pos: this.pos,
			dead: this.dead,
			display: structuredClone(this.display),
			point,
			// 被动技能不传输，但是buff要传
			buffs,
			...(this.hasShield()
				? { shield: this.attr.shield, shieldMax: this.shieldMax ?? this.attrOri.shield }
				: {}),
			...(this.revealedWeakProp.length
				? { revealedWeakProp: [...this.revealedWeakProp] }
				: {}),
			...(this.revealedWeakWeapon.length
				? { revealedWeakWeapon: [...this.revealedWeakWeapon] }
				: {}),
			...(this.skillCds.size ? { skillCds: [...this.skillCds] } : {}),
		};
	}

	// 提示单个客户端，由宿主覆盖发送；不写入战斗广播或简报。
	hintClient(msg: string) {}
}

// descend降序
export function sortByAttr(a: FightUnit[], key: string, descend = false) {
	if (descend) {
		return a.sort((a, b) => b.getAttr(key) - a.getAttr(key));
	}

	return a.sort((a, b) => a.getAttr(key) - b.getAttr(key));
}
