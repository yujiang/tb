// 核心的战斗对象
import { FightMap } from './FightMap';
import { FightMimic } from './FightMimic';
import { FightSide } from './FightSide';
import { FightUnit, UnitEventFunc, sortByAttr } from './Unit/FightUnit';
import { FightUnitSummon, FightUnitUser } from './Unit/FightUnitUser';
import { selectSummonPos } from './SummonPos';
import { FightUnitEvent } from './Buffs/BuffDatas';
import type { FightUnitEventMap } from './Buffs/BuffDatas';
import {
	EnemySide,
	FightCmdEnum,
	FightInput,
	FightSideEnum,
	FightResultEnum,
	SkillCost,
	TargetSelectEnum,
	fightMsg,
} from './struct';
import { strict as assert } from 'node:assert';
import EventEmitter from 'node:events';
import { skillFunc } from './Skills/SkillFuncType';
import { attackFunc } from './Skills/Funcs/NormalAttack';
import { getBuffData } from './Buffs/BuffDatas';
import { InsertActionPos } from './struct';
import type { FightBuff } from './Buffs/FightBuff';
import {
	FightSkill,
	getDefaultSkill,
	getDefaultSkillDuiwei,
	getDefaultSkillProtect,
} from './Skills/FightSkill';
import { FightLoopType } from './Loop/FightLoop';

export type AllUnitType = [FightUnit[], FightUnit[]];

// 宿主启动时统一设置，所有战斗共用。
export interface FightGlobalData {
	/** 所有战斗共用的全局回合上限，默认0不设上限；非负安全整数，正数允许完整执行该轮，轮末仍未分胜负则防守方胜。 */
	maxTurn: number;
	/** 西游整轮输入等待秒数，默认30；非负有限数、可用小数，显式0运行时仍回退30秒；PC不限时、烟雨不等待收齐。 */
	waitInputSec: number;
	/** 默认false；true时默认普攻按对位查找，需先createMap；false时随机敌方存活单位，手动目标仍优先。 */
	duiwei: boolean;
	/** 集气开关，默认false；关闭时跳过行动集气、addJp及JP费用，初始化不发送jp/jpMax；true启用集气结算和同步。 */
	jiqi: boolean;
	/** 输入校验模式，默认true调用checkOnline，允许死亡行动者提交和普攻守尸、资源延后复验；false调用checkPC严格即时预检。烟雨预设false；两种检测函数自身规则不变。 */
	attackDie: boolean;
	/** 保护指令施加的已注册 Buff ID，必须 class:protect；缺省保护指令不可用。 */
	protectBuff?: number;

	/** 缺省false；敌方最后一面盾打破且全体存活单位均破盾后，完整动作结束后由实际破盾者自动施放装配大招，每队每回合最多一次；无大招或无法施放直接跳过。 */
	allShieldBreak?: boolean;

	/** 循环类型pc/yanyu/west，默认pc；由createFightLoop创建对应驱动，省略更新时保留当前值。 */
	loopType?: FightLoopType;
}

const gData: FightGlobalData = {
	maxTurn: 0,
	waitInputSec: 30,
	duiwei: false,
	jiqi: false,
	attackDie: true,
	protectBuff: undefined,
	allShieldBreak: false,
	loopType: 'pc',
};

/** 返回独立烟雨预设（loopType=yanyu，对位和集气为true，attackDie为false）；查询不修改共享配置。 */
export function getYanyuGlobalData(): Partial<FightGlobalData> {
	return {
		loopType: 'yanyu',
		duiwei: true,
		jiqi: true,
		attackDie: false,
	};
}

/** 查询进程共享的全局战斗配置；通过setFightGlobalData更新，表格行不覆盖这些字段。 */
export function getFightGlobalData(): Readonly<FightGlobalData> {
	return gData;
}

/** 启动时按字段设置公共配置，省略字段保留当前值；loopType校验枚举，其余配置合法性由宿主保证。 */
export function setFightGlobalData(data: Partial<FightGlobalData>) {
	const next = { ...gData, ...data };
	const loopType = next.loopType ?? 'pc';
	assert.ok(loopType === 'pc' || loopType === 'yanyu' || loopType === 'west', 'loopType must be pc, yanyu or west');

	gData.maxTurn = next.maxTurn;
	gData.waitInputSec = next.waitInputSec;
	gData.duiwei = next.duiwei;
	gData.jiqi = next.jiqi;
	gData.attackDie = next.attackDie;
	gData.protectBuff = next.protectBuff;
	gData.allShieldBreak = next.allShieldBreak ?? false;
	gData.loopType = loopType;
}

// FightData 填xls实现
export interface FightData {
	/** 是否允许逃跑，表格行必填；PC/西游在普通行动位执行，烟雨不接受逃跑输入。 */
	runaway: boolean;
	/** 逃跑等级基准，必填有限数；概率clamp(1-(行动者grade-runawayGrade)/100,0,1)，执行时读取。 */
	runawayGrade: number;
	/** 败方惩罚配置值，必填；0不调用惩罚，单位与执行交给宿主；成功逃跑不惩罚。 */
	deathPenalty: number;
	/** 胜方恢复配置值，必填；单位与执行交给宿主onWin，成功逃跑不恢复。 */
	winRecover: number;
	/** 胜方奖励配置值，必填；含义与发放交给宿主onWin，成功逃跑不发奖。 */
	winReward: number;
}

// 逃跑概率
export function getRunwayRate(unit: number, runawayGrade: number) {
	return Math.min(1, Math.max(0, 1 - (unit - runawayGrade) / 100));
}

// 上下文, 因为反击,连击, 需要回溯堆栈来得到上下文
export interface FightContex {
	fight: Fight;
	attack: FightUnit;
	defend: FightUnit;

	msgs: fightMsg[];
	effects: string[]; // 当前公式效果：crit 暴击、生 相生、克 相克；各次公式计算独立记录

	//miss?: boolean; // 是否闪避
	//crit?: boolean; // 是否暴击

	damage?: number; // 伤害值
	actionStarted?: boolean; // 根单位行动已通过目标、禁止及费用检查；用于完整行动后统一集气
	actionEntrusted?: boolean; // 当前普通行动位已交给队友，本次托付不额外推动集气。

	killNum?: number; // 追击次数
	nextNum?: number; // 追击次数
	fbackNum?: number; // 反击次数
	dbackNum?: number; // 反震次数
	reactionSteps?: number; // 单次动作共享的结算预算，防止回调无限触发
	supporting?: boolean; // 协战及其后续反应链中不再召唤协战
}

export function initFightContex(f: Fight): FightContex {
	return { fight: f, attack: null, defend: null, msgs: [], effects: [] };
}

export class Fight {
	private readonly mimic = new FightMimic(this);
	resetMimic() {
		this.mimic.reset();
	}
	hasMimicRecord(unit: FightUnit): boolean {
		return this.mimic.hasRecord(unit);
	}
	canMimic(unit: FightUnit, cost?: SkillCost, source?: FightUnit): boolean {
		return this.mimic.canUse(unit, cost, source);
	}
	mimicSkill(unit: FightUnit, ctx: FightContex, source?: FightUnit): boolean {
		return this.mimic.process(unit, ctx, source);
	}
	private actionEntruster?: {
		canUse: (unit: FightUnit) => boolean;
		process: (unit: FightUnit, target: FightUnit, ctx: FightContex) => boolean;
	};
	setActionEntruster(handler: NonNullable<typeof this.actionEntruster>) {
		this.actionEntruster = handler;
	}
	clearActionEntruster(handler: typeof this.actionEntruster) {
		if (this.actionEntruster === handler) this.actionEntruster = undefined;
	}
	canEntrust(unit: FightUnit): boolean {
		return this.actionEntruster?.canUse(unit) ?? false;
	}
	entrustAction(unit: FightUnit, target: FightUnit, ctx: FightContex): boolean {
		if (
			!this.canEntrust(unit) ||
			!target ||
			target === unit ||
			target.side !== unit.side ||
			target.isDied() ||
			this.getUnitById(target.uid) !== target
		) {
			return false;
		}

		return this.actionEntruster.process(unit, target, ctx);
	}
	private actionInserter?: (
		unit: FightUnit,
		input: FightInput,
		pos: InsertActionPos | undefined,
		ctx?: FightContex,
		speedRate?: number,
	) => boolean;
	setActionInserter(handler: NonNullable<typeof this.actionInserter>) {
		this.actionInserter = handler;
	}
	clearActionInserter(handler: typeof this.actionInserter) {
		if (this.actionInserter === handler) this.actionInserter = undefined;
	}
	insertAction(
		unit: FightUnit,
		input: FightInput,
		pos?: InsertActionPos,
		speedRate?: number,
		ctx?: FightContex,
	): boolean {
		return this.actionInserter?.(unit, { ...input }, pos, ctx, speedRate) ?? false;
	}
	fid: number;
	// seed为随机数种子
	seed: number;
	xls: FightData;
	/** 所有战斗共享的全局规则；每场xls只保存表格配置。 */
	get globalData(): Readonly<FightGlobalData> {
		return getFightGlobalData();
	}

	constructor(id: number, data: FightData, seed = 0) {
		this.fid = id;
		this.xls = data;
		this.seed = seed;
		assert.ok(Number.isSafeInteger(seed), 'seed must be a safe integer');
		this.randomState = seed >>> 0;
		this.onUnitEvent('break', (unit, ctx, attacker, allBroken) =>
			this.onShieldBreak(unit, ctx, attacker, allBroken),
		);
	}

	turn = 0; // 当前回合数
	afterTurnStarted = 0; // 已开始处理的回合后边界；其中新增的 Buff 留到下一边界
	nextTurn() {
		this.turn++;
		return this.turn;
	}

	finishTurn() {
		this.checkOutcome();
		if (!this.isEnd() && this.globalData.maxTurn && this.turn >= this.globalData.maxTurn) {
			// 超时防守获胜！
			// this.win = FightSideEnum.defend;
			this.setWin(FightResultEnum.outoftime);
		}
	}

	result: FightResultEnum = -1;
	getResult() {
		return this.result;
	}
	winSide: number = -1;
	getWinSide() {
		return this.winSide;
	}
	getLostSide() {
		if (this.winSide < 0) return -1;
		return this.winSide === FightSideEnum.attack ? FightSideEnum.defend : FightSideEnum.attack;
	}
	runaway = false;
	canRunaway() {
		return this.runaway;
	}

	isEnd() {
		return this.result >= 0;
	}
	onDie(unit: FightUnit) {
		if (this.actionDepth === 0) this.checkOutcome();
	}

	setWin(win: FightResultEnum) {
		this.result = win;
		if (win === FightResultEnum.outoftime || win === FightResultEnum.draw) {
			this.winSide = FightSideEnum.defend;
		} else {
			this.winSide = win;
		}
	}

	checkOutcome() {
		if (this.isEnd() || !this.AllUnits) {
			return;
		}

		const alive = this.AllUnits.map((units) => units.some((u) => !u.isDied()));
		if (!alive[0] && !alive[1]) {
			this.setWin(FightResultEnum.draw);
		} else if (!alive[0]) {
			this.setWin(FightResultEnum.defend);
		} else if (!alive[1]) {
			this.setWin(FightResultEnum.attack);
		}
	}

	private actionDepth = 0;
	private afterActionTasks: (() => void)[] = [];
	private firstUltimateSide?: FightSideEnum;

	/** 是否仍在动作或嵌套反应链中；大招等子模块据此延迟发布或拒绝重入。 */
	isInAction(): boolean {
		return this.actionDepth > 0;
	}

	resetUltimate() {
		this.firstUltimateSide = undefined;
		for (const side of this.Sides ?? []) side.ultimate.reset();
	}

	isAllShieldBroken(side: FightSideEnum): boolean {
		return this.getSide(side).ultimate.isAllShieldBroken();
	}

	onShieldBreak(unit: FightUnit, ctx: FightContex, attacker: FightUnit, allBroken: boolean) {
		if (this.getSide(attacker.side).ultimate.onShieldBreak(unit, ctx, attacker, allBroken)) {
			this.firstUltimateSide ??= attacker.side;
		}
	}
	private finishUltimates(completed: boolean) {
		const firstSide = this.firstUltimateSide ?? FightSideEnum.attack;
		this.firstUltimateSide = undefined;
		const first = this.Sides?.[firstSide]?.ultimate;
		const second = this.Sides?.[EnemySide(firstSide)]?.ultimate;
		// 先同时清空双方待放槽；大招自己的完整动作收尾只处理新登记的机会。
		const firstPending = first?.takePending();
		const secondPending = second?.takePending();
		if (!completed) return;

		first?.processPending(firstPending);
		second?.processPending(secondPending);
	}

	// 完整动作的反应链结束后、胜负检查前执行；不在动作中时直接执行。
	afterAction(run: () => void) {
		if (this.actionDepth === 0) run();
		else this.afterActionTasks.push(run);
	}

	// 接管run的开始和退出
	resolveAction<T>(run: () => T): T {
		if (this.actionDepth >= 64)
			throw new Error('Reaction limit exceeded (64 nested action scopes)');
		this.actionDepth++;
		let completed = false;
		try {
			const result = run();
			if (this.actionDepth === 1) {
				// 保持动作作用域，收尾回调中的死亡及嵌套动作也不能提前判断胜负。
				let index = 0;
				while (index < this.afterActionTasks.length) {
					if (index >= 64)
						throw new Error('Reaction limit exceeded (64 after-action effects)');
					this.afterActionTasks[index++]();
				}
			}
			completed = true;
			return result;
		} finally {
			this.actionDepth--;
			if (this.actionDepth === 0) {
				// 异常动作不能把待处理效果带进下一次行动。
				this.afterActionTasks.length = 0;
				if (completed) this.checkOutcome();
				this.finishUltimates(completed);
			}
		}
	}

	// ***units start
	Sides: FightSide[];
	getSide(side: FightSideEnum): FightSide {
		return this.Sides[side];
	}

	AllUnits: AllUnitType;
	private readonly dismissedUids = new Set<number>();
	createSide(attack: FightSide, des: FightSide) {
		const mapsize = attack.mapsize ?? des.mapsize;
		if (mapsize) {
			if (attack.mapsize && des.mapsize) {
				assert.deepEqual(attack.mapsize, des.mapsize, 'Side map sizes must match');
			}
			if (this.map) {
				assert.deepEqual([this.map.nx, this.map.ny], [...mapsize], 'Fight map size must match formation');
			} else {
				this.createMap(mapsize[0], mapsize[1]);
			}
		}
		this.resetMimic();
		this.dismissedUids.clear();
		attack.clearContributions();
		des.clearContributions();
		this.Sides = [attack, des];
		this.AllUnits = [attack.units, des.units];
		this.resetUltimate();
		//console.log("AllUnits", this.fid, "attack", attack.units.length, "des", des.units.length)
		for (const u of attack.units) {
			u.setFight(this, FightSideEnum.attack);
		}
		for (const u of des.units) {
			u.setFight(this, FightSideEnum.defend);
		}
	}

	getUnitById(id: number): FightUnit {
		return this.getAllUnits().find((u) => u.uid == id)!;
	}
	hasUnit(id: number): boolean {
		return this.getAllUnits().some((u) => u.uid == id);
	}

	/** 返回阵营数组的只读视图，不复制；需要排序或洗牌时使用 getSideUnitsCopy。 */
	getSideUnits(side: FightSideEnum): readonly FightUnit[] {
		return this.AllUnits[side];
	}
	getSideUnitsCopy(side: FightSideEnum): FightUnit[] {
		return [...this.AllUnits[side]];
	}
	/** 当前在场宠物，包含死亡尚未移除的宠物；主人UID为0同样有效。 */
	getFightSummon(user: FightUnit): FightUnitSummon | undefined {
		return this.getSideUnits(user.side).find(value => value instanceof FightUnitSummon && value.user === user.uid) as FightUnitSummon | undefined;
	}
	getAllUnits(): FightUnit[] {
		return this.AllUnits.flat();
	}
	getAllUser(): FightUnit[] {
		return this.getAllUnits().filter((u) => u.isUser());
	}

	getSideUnitsBySkill(
		side: FightSideEnum,
		skill: FightSkill,
		except: FightUnit = null,
	): FightUnit[] {
		return this.AllUnits[side].filter((u) => skill.canTarget(u) && u !== except);
	}

	getSideUnitsByPos(side: FightSideEnum, poses: number[]): FightUnit[] {
		return this.getSideUnits(side).filter((u) => poses.includes(u.pos));
	}
	getSideUnitByPos(side: FightSideEnum, pos: number): FightUnit {
		return this.getSideUnits(side).find((u) => u.pos == pos)!;
	}
	// ***units end

	// ***map start
	map: FightMap;
	createMap(nx: number, ny: number) {
		this.map = new FightMap(this, nx, ny);
	}

	// 选择主目标 当num=1
	// 主目标只有一个，通常的做法是先打主目标，命中之后，才产生后续的子目标！
	selectMainTarget(attack: FightUnit, skill: FightSkill): FightUnit {
		assert(!attack?.isDied());

		const sel = skill.getSel();
		// 嘲讽，只对enemy和duiwei起作用
		const taunt = this.getTauntTarget(attack, skill);
		if (taunt) return taunt;

		if (sel.target == TargetSelectEnum.duiwei) {
			return this.map.findDuiwei(attack, skill);
		}

		if (sel.target == TargetSelectEnum.self) {
			return skill.canTarget(attack) ? attack : undefined;
		}

		assert(sel.target === TargetSelectEnum.friend || sel.target === TargetSelectEnum.enemy || sel.target === TargetSelectEnum.any);

		const side = sel.target == TargetSelectEnum.friend ? attack.side : EnemySide(attack.side);
		const units = (sel.target === TargetSelectEnum.any ? this.getAllUnits() : this.getSideUnitsCopy(side))
			.filter(u=>skill.canTarget(u));

		if (!units.length) return null;

		if (sel.sortAttr) {
			sortByAttr(units, sel.sortAttr, sel.sortDescend);
			return units[0]; //最小值？
		} else {
			return this.randArray(units);
		}
	}

	// 群体选择不经过主目标，也不受嘲讽重定向；人数足够时保持阵营顺序。
	// 群体按己方、敌方或任意阵营选择。
	selectGroupTargets(attack: FightUnit, skill: FightSkill): FightUnit[] {
		const sel = skill.getSel();
		const side = sel.target == TargetSelectEnum.friend ? attack.side : EnemySide(attack.side);
		const units =
			sel.target === TargetSelectEnum.any
				? this.getAllUnits().filter((unit) => skill.canTarget(unit))
				: this.getSideUnitsBySkill(side, skill);
		// const units = this.getAllUnits().filter(target => this.isLegalTarget(attack, target, skill));
		const num = sel.num ?? 1;

		if (sel.sortAttr) sortByAttr(units, sel.sortAttr, sel.sortDescend);
		else if (num < units.length) this.shuffleArray(units);
		return units.slice(0, num);
	}

	// spread的特点是，他是基于main来选的，并且结果剔除main
	selectSpreadTargetsNum(main: FightUnit, skill: FightSkill, num: number): FightUnit[] {
		const sel = skill.getSel();
		const units = this.getSideUnitsBySkill(main.side, skill, main);
		if (num <= 0) return [];

		if (sel.sortAttr) sortByAttr(units, sel.sortAttr, sel.sortDescend);
		else this.shuffleArray(units);
		return units.slice(0, num);
	}

	// 副目标与当前主目标同阵营；人数、形状和效果资格统一读取溅射子技能。
	selectSpreadTargets(main: FightUnit, skill: FightSkill): FightUnit[] {
		assert(main);
		const sel = skill.getSel();
		if (!sel) return [];

		if (sel.shape === undefined) {
			return this.selectSpreadTargetsNum(main, skill, sel.num ?? 1);
		}

		return this.map
			.selectTargetsShape(main, sel.shape)
			.filter((target) => target !== main && skill.canTarget(target));
	}
	// ***map end

	randomEnemyAlive(side: number) {
		const list = this.getSideUnitsBySkill(EnemySide(side), this.getDefaultSkill());
		if (!list.length) return;

		return this.randArray(list);
	}

	getDefaultSkill() {
		return this.globalData.duiwei ? getDefaultSkillDuiwei() : getDefaultSkill();
	}

	getDefaultEnemy(unit: FightUnit) {
		const taunt = this.getTauntTarget(unit, this.getDefaultSkill());
		if (taunt) return taunt;

		const skill = this.getDefaultSkill();
		return this.selectMainTarget(unit, skill);
	}

	// 目标资格由技能判断，阵营和对位规则由战斗判断。
	isLegalTarget(unit: FightUnit, target: FightUnit, skill: FightSkill): boolean {
		if (!target || !skill.canTarget(target)) {
			return false;
		}
		if (skill.isMimicAny()) return this.hasMimicRecord(target);

		if (skill.getFunc() === 'entrust') {
			if (target === unit || target.side !== unit.side) {
				return false;
			}
		}

		const sel = skill.getSel();
		if (sel.target === TargetSelectEnum.any) return true;

		if (sel.target === TargetSelectEnum.self) return target === unit;

		const side = sel.target === TargetSelectEnum.friend ? unit.side : EnemySide(unit.side);
		if (target.side !== side) return false;

		if (sel.target === TargetSelectEnum.duiwei) {
			return this.map?.findDuiwei(unit, skill) === target;
		}

		return true;
	}

	getTauntTarget(unit: FightUnit, skill: FightSkill): FightUnit | undefined {
		return this.getTauntBuff(unit, skill)?.getTauntTarget();
	}

	// 返回实际生效的实例，计次时不会同时消耗其他嘲讽。查询本身没有副作用。
	getTauntBuff(unit: FightUnit, skill: FightSkill): FightBuff | undefined {
		const sel = skill.getSel();
		if ((sel.num ?? 1) > 1) return undefined;

		if (sel.target !== TargetSelectEnum.enemy && sel.target !== TargetSelectEnum.duiwei) {
			return undefined;
		}

		// Map 保持添加顺序，稳定排序使同优先级按 Buff 实例注册顺序处理。
		// 全局默认对位不限制嘲讽来源；技能显式配置的对位规则仍按技能判断。
		const targetSkill = skill === getDefaultSkillDuiwei() ? getDefaultSkill() : skill;
		const buffs = [...unit.buffs.values()].sort(
			(a, b) => (a.getXls().prior ?? 0) - (b.getXls().prior ?? 0),
		);
		for (const buff of buffs) {
			const target = buff.getTauntTarget();
			if (
				target &&
				!target.isDied() &&
				this.getUnitById(target.uid) &&
				this.isLegalTarget(unit, target, targetSkill)
			) {
				return buff;
			}
		}

		return undefined;
	}

	// 输入入口按共享配置选择检查模式，显式调用checkOnline/checkPC仍保留各自规则。
	checkInput(unit: FightUnit, input: FightInput): boolean {
		if (input?.ignoreCostCD === true) {
			unit.hintClient('客户端不能设置免消耗和冷却标记');
			return false;
		}

		if (input?.ultimate) {
			unit.hintClient('大招由破盾后自动施放');
			return false;
		}

		return this.globalData.attackDie
			? this.checkOnline(unit, input)
			: this.checkPC(unit, input);
	}

	// 网游先收指令再行动：允许死亡单位输入、普攻守尸，目标与资源留到执行时复验。
	checkOnline(unit: FightUnit, input: FightInput): boolean {
		if (input?.ignoreCostCD === true) return false;

		return this.validateInput(unit, input);
	}

	// PC 立即行动：自身可行动、费用足够、目标能接受效果；检查不抽样、不扣费。
	checkPC(unit: FightUnit, input: FightInput): boolean {
		if (unit.isDied()) {
			unit.hintClient('已死亡，行动跳过');
			return false;
		}

		if (unit.isForbid('action')) {
			unit.hintClient('当前无法行动');
			return false;
		}

		if (!this.validateInput(unit, input)) return false;

		const skill = input.cmd === FightCmdEnum.skill ? unit.findSkill(input.skill) : undefined;
		const cost = skill?.getCost();
		if (input.ignoreCostCD !== true && cost && !unit.canCost(cost)) {
			return false;
		}

		if (skill?.getFunc() === 'normal' && unit.isForbid('attack')) {
			unit.hintClient('当前无法普通攻击');
			return false;
		}
		if (
			skill?.getFunc() === 'mimic' &&
			!skill.isMimicAny() &&
			!this.canMimic(unit, input.ignoreCostCD === true ? undefined : skill.getCost())
		) {
			unit.hintClient('没有可模仿的攻击，或当前无法使用原攻击');
			return false;
		}
		if (
			skill?.isMimicAny() &&
			input.target !== undefined &&
			!this.canMimic(
				unit,
				input.ignoreCostCD === true ? undefined : skill.getCost(),
				this.getUnitById(input.target),
			)
		) {
			unit.hintClient('当前无法模仿该单位的行动');
			return false;
		}

		if (input.cmd !== FightCmdEnum.attack && input.cmd !== FightCmdEnum.none && !skill) {
			return true;
		}

		return this.getPCTargets(unit, input) !== undefined;
	}

	// 输入检查通过后准备主目标副本；允许守尸时保留死亡敌人的原始意图，其余仍按即时目标规则选择。
	preparePCInput(unit: FightUnit, input: FightInput): FightInput | undefined {
		const attack = input.cmd === FightCmdEnum.attack || input.cmd === FightCmdEnum.none;
		if (
			this.globalData.attackDie &&
			attack &&
			input.target !== undefined &&
			this.getUnitById(input.target)?.isDied()
		) {
			// 提交阶段保留原始意图；执行前已复活则保留，仍死亡则按未指定目标处理。
			return this.checkOnline(unit, input) ? { ...input } : undefined;
		}

		const skill = input.cmd === FightCmdEnum.skill ? unit.findSkill(input.skill) : undefined;
		if (!attack && !skill) {
			return { ...input };
		}

		const targets = this.getPCTargets(unit, input);
		if (!targets) return undefined;

		if ((skill ?? (attack ? unit.getAttackSkill() : undefined))?.isMulti()) {
			return { ...input };
		}

		const sel = skill
			? skill.getSel()
			: { target: this.globalData.duiwei ? TargetSelectEnum.duiwei : TargetSelectEnum.enemy };
		const taunt = this.getTauntTarget(unit, skill ?? this.getDefaultSkill());
		if (sel.sortAttr) sortByAttr(targets, sel.sortAttr, sel.sortDescend);
		const fixed =
			input.target !== undefined ||
			!!taunt ||
			sel.target === TargetSelectEnum.self ||
			sel.target === TargetSelectEnum.duiwei ||
			!!sel.sortAttr;
		const target = taunt ?? (fixed ? targets[0] : this.randArray(targets));
		return { ...input, target: target.uid };
	}

	private getPCTargets(unit: FightUnit, input: FightInput): FightUnit[] | undefined {
		const attack = input.cmd === FightCmdEnum.attack || input.cmd === FightCmdEnum.none;
		const equipped = attack ? unit.getAttackSkill() : undefined;
		const skill =
			(input.cmd === FightCmdEnum.skill
				? unit.findSkill(input.skill)
				: equipped?.isMulti()
					? equipped
					: undefined) ??
			(attack && input.target !== undefined ? getDefaultSkill() : this.getDefaultSkill());
		const explicit = input.target !== undefined ? this.getUnitById(input.target) : undefined;
		if (input.target !== undefined && !explicit) {
			unit.hintClient('目标不存在');
			return undefined;
		}

		if (attack && explicit?.isDied()) {
			unit.hintClient('目标已死亡');
			return undefined;
		}

		const candidates = explicit && !skill.isMulti() ? [explicit] : this.getAllUnits();
		let hint: string | undefined;
		const targets = candidates.filter((target) => {
			if (!skill.canTarget(target)) {
				hint ??= skill.getTargetHint(target);
				return false;
			}
			if (skill.isMimicAny() && !this.canMimic(unit, undefined, target)) {
				return false;
			}

			return this.isLegalTarget(unit, target, skill);
		});
		if (!targets.length) {
			unit.hintClient(hint ?? '没有可用目标');
			return undefined;
		}

		return targets;
	}

	// 两种输入共用的基础合法性检查，保留原接口供本地调用及执行复验使用。
	validateInput(unit: FightUnit, input: FightInput): boolean {
		if (!input || this.isEnd() || !this.getUnitById(unit.uid)) {
			return false;
		}

		if (
			![
				FightCmdEnum.none,
				FightCmdEnum.attack,
				FightCmdEnum.defend,
				FightCmdEnum.skill,
				FightCmdEnum.runaway,
				FightCmdEnum.summon,
				FightCmdEnum.dismiss,
				FightCmdEnum.cancel,
				FightCmdEnum.protect,
			].includes(input.cmd)
		) {
			return false;
		}

		if (input.cmd === FightCmdEnum.summon) {
			if (
				!(unit instanceof FightUnitUser) ||
				!Number.isSafeInteger(input.summon) ||
				input.summon < 0 ||
				!unit.summons.has(input.summon)
			) {
				return false;
			}

			return !!this.map && (
				!!this.getFightSummon(unit) ||
				this.getSideUnits(unit.side).length < this.map.nx * this.map.ny
			);
		}

		if (input.cmd === FightCmdEnum.dismiss) {
			if (!Number.isSafeInteger(input.target)) return false;

			const target = this.getUnitById(input.target);
			if (!target) return false;

			if (target instanceof FightUnitSummon) return target.user === unit.uid;

			return target.isMonster() && unit.isMonster();
		}

		if (input.cmd === FightCmdEnum.runaway) {
			if (!this.xls.runaway) {
				unit.hintClient('本场战斗不能逃跑');
				return false;
			}

			// escapse沿用状态表的现有拼写；逃跑本身需要移动。
			if (unit.isForbid('move') || unit.isForbid('escapse')) {
				unit.hintClient('当前状态无法逃跑');
				return false;
			}

			return true;
		}

		// 普攻可以显式指定死亡敌人守尸；自动选目标仍只选存活敌人。
		let skill = input.target !== undefined ? getDefaultSkill() : this.getDefaultSkill();
		let guardCorpse = input.cmd === FightCmdEnum.attack || input.cmd === FightCmdEnum.none;
		if (input.cmd === FightCmdEnum.protect) {
			if (
				input.target === undefined ||
				input.target === unit.uid ||
				getBuffData(this.globalData.protectBuff)?.class !== 'protect'
			) {
				return false;
			}

			skill = getDefaultSkillProtect();
		} else if (input.cmd === FightCmdEnum.skill) {
			skill = unit.findSkill(input.skill);
			if (!skill) {
				unit.hintClient('未学会该技能');
				return false;
			}

			if (input.skill === unit.ultimateSkill && !input.ultimate) {
				unit.hintClient('大招由破盾后自动施放');
				return false;
			}

			if (unit.isForbid('skill')) {
				unit.hintClient('当前无法施放技能');
				return false;
			}

			const cd = unit.getSkillCd(input.skill);
			if (cd > 0 && input.ignoreCostCD !== true) {
				unit.hintClient(`[${skill.getName()}]冷却中，还需 ${cd} 回合`);
				return false;
			}

			if (!skill.getSel()) return false;

			if (skill.isMimicAny() && skill.isMulti()) {
				unit.hintClient('高级模仿只能选择一个行动来源');
				return false;
			}

			if (skill.getFunc() === 'entrust' && (!this.canEntrust(unit) || skill.isMulti())) {
				unit.hintClient('托付只能在PC普通行动中使用，且只能指定一名队友');
				return false;
			}
		} else if (
			(input.cmd === FightCmdEnum.attack || input.cmd === FightCmdEnum.none) &&
			unit.isForbid('attack')
		) {
			unit.hintClient('当前无法普通攻击');
			return false;
		}

		if (
			(input.cmd === FightCmdEnum.attack || input.cmd === FightCmdEnum.none) &&
			unit.getAttackSkill()?.isMulti()
		) {
			skill = unit.getAttackSkill();
			guardCorpse = false;
		}
		if (
			input.cmd === FightCmdEnum.attack ||
			input.cmd === FightCmdEnum.none ||
			input.cmd === FightCmdEnum.skill
		) {
			const actionSkill =
				input.cmd === FightCmdEnum.skill ? skill : (unit.getAttackSkill() ?? skill);
			if (!actionSkill.getNoMove() && unit.isForbid('move')) {
				unit.hintClient('当前无法移动，只能使用原地技能');
				return false;
			}
		}
		if (input.target !== undefined) {
			const target = this.getUnitById(input.target);
			if (!Number.isSafeInteger(input.target) || !target) {
				unit.hintClient('目标不存在');
				return false;
			}

			// 普攻手动守尸只检查敌方身份，自动选择和技能仍由 canTarget 过滤。
			if (
				!(guardCorpse && target.isDied() && target.side === EnemySide(unit.side)) &&
				!this.isLegalTarget(unit, target, skill)
			) {
				unit.hintClient(skill.getTargetHint(target) ?? '目标不符合要求');
				return false;
			}
		}

		return true;
	}

	// 执行时将已离场、或死亡且不符合技能资格的目标视为未指定，保留原提交指令。
	prepareActionInput(unit: FightUnit, input: FightInput): FightInput {
		if (
			!input ||
			input.target === undefined ||
			!Number.isSafeInteger(input.target) ||
			![FightCmdEnum.none, FightCmdEnum.attack, FightCmdEnum.skill].includes(input.cmd)
		) {
			return input;
		}

		const target = this.getUnitById(input.target);
		if (!target) {
			// 只接受确实离场的UID；从未存在的显式ID仍由输入校验拒绝。
			return this.dismissedUids.has(input.target) ? { ...input, target: undefined } : input;
		}

		if (!target.isDied()) return input;

		const skill =
			input.cmd === FightCmdEnum.skill
				? unit.findSkill(input.skill)
				: (unit.getAttackSkill() ?? getDefaultSkill());
		if (!skill || skill.canTarget(target)) {
			return input;
		}

		const sel = skill.getSel();
		const correctSide =
			sel?.target === TargetSelectEnum.self
				? target === unit
				: target.side ===
					(sel?.target === TargetSelectEnum.friend ? unit.side : EnemySide(unit.side));
		return correctSide ? { ...input, target: undefined } : input;
	}

	// 提交后阵营、生命状态和封印都可能变化，执行时重新校验。
	processUnit(unit: FightUnit, input: FightInput): FightContex {
		// 收指令时允许死亡，真正轮到行动时必须已经复活。
		if (this.isEnd() || !this.getUnitById(unit.uid)) {
			return;
		}

		if (unit.isDied()) {
			unit.hintClient('已死亡，行动跳过');
			return;
		}

		if (unit.isForbid('action')) {
			const block = unit.getActionBlockBuff();
			unit.hintClient('当前无法行动');
			return {
				fight: this,
				attack: unit,
				defend: null,
				effects: [],
				msgs: [
					block
						? ['skipAction', unit.uid, block.getId()]
						: ['skipAction', unit.uid, null, unit.getActionBlockStatus()],
				],
			};
		}

		input = this.prepareActionInput(unit, input);
		if (!this.validateInput(unit, input)) {
			return;
		}

		return this.executeUnit(unit, input);
	}

	executeUnit(unit: FightUnit, input: FightInput): FightContex {
		const root = !this.isInAction();
		return this.resolveAction(() => {
			const skill =
				input.cmd === FightCmdEnum.skill ? unit.findSkill(input.skill) : undefined;
			const ctx = this._executeUnit(unit, input);
			// 在动作收尾前记录，随后自动施放的大招可作为更新的攻击覆盖它。
			if (root) this.mimic.record(input, ctx, skill);
			return ctx;
		});
	}

	exeSummon(unit: FightUnitUser, id: number, ctx?: FightContex): FightContex {
		if (!this.validateInput(unit, { cmd: FightCmdEnum.summon, summon: id })) return;

		const old = this.getFightSummon(unit);
		const pos = old?.pos ?? selectSummonPos(unit.pos, this.map, new Set(this.getSideUnits(unit.side).map(value => value.pos)), new Set(), () => this.random());
		const pet = unit.summons.get(id)();
		assert.ok(pet instanceof FightUnitSummon && !pet.isDied(), 'Summon factory must create a living pet');
		assert.ok(Number.isSafeInteger(pet.uid) && !this.hasUnit(pet.uid) && !this.dismissedUids.has(pet.uid), 'Summon UID must be unique');
		assert.ok(!pet.fight, 'Summon factory must create a fresh instance');
		pet.user = unit.uid;
		pet.setPos(pos);
		pet.setFight(this, unit.side);
		pet.startFight(this);
		unit.summons.delete(id);
		ctx ??= { ...initFightContex(this), attack: unit };
		ctx.actionStarted = true;
		ctx.defend = null;
		if (old) this.exeDismiss(unit, old.uid, ctx);

		this.AllUnits[unit.side].push(pet);
		ctx.msgs.push(['summon', unit.uid, unit.side, pet.getUnitMsg()]);
		return ctx;
	}

	exeDismiss(unit: FightUnit, tid: number, ctx?: FightContex): FightContex {
		const target = this.getUnitById(tid);
		if (!target) return;

		ctx ??= { ...initFightContex(this), attack: unit };
		ctx.actionStarted = true;
		ctx.defend = null;
		const units = this.AllUnits[target.side];
		units.splice(units.indexOf(target), 1);
		this.dismissedUids.add(target.uid);
		target.leaveFight();
		ctx.msgs.push(['dismiss', unit.uid, target.uid]);
		target.emitContext('dismiss', ctx, unit);
		return ctx;
	}

	exeDefend(unit: FightUnit, ctx?: FightContex) {
		unit.doDefend();
		ctx ??= { ...initFightContex(this), attack: unit };
		ctx.actionStarted = true;
		ctx.defend = null;
		ctx.msgs.push(['defend', unit.uid]);
		return ctx;
	}

	exeRunaway(unit: FightUnit, ctx?: FightContex): FightContex {
		ctx ??= { ...initFightContex(this), attack: unit };
		ctx.actionStarted = true;
		ctx.defend = null;
		const success = this.randomLess(getRunwayRate(unit.attr.grade ?? 0, this.xls.runawayGrade));
		ctx.msgs.push(['runaway', unit.uid, success]);
		if (success) {
			this.runaway = true;
			this.setWin(
				unit.side === FightSideEnum.attack
					? FightResultEnum.defend
					: FightResultEnum.attack,
			);
		}
		return ctx;
	}

	exeProtect(unit: FightUnit, tid: number, ctx?: FightContex): FightContex {
		const des = this.getUnitById(tid);
		if (!des) return;

		ctx ??= { ...initFightContex(this), attack: unit };
		ctx.defend = des;
		ctx.actionStarted = true;
		ctx.msgs.push(['protect', unit.uid, des.uid]);
		des.addBuff(unit, 'protect', this.globalData.protectBuff, 1, ctx);
		return ctx;
	}

	_executeUnit(unit: FightUnit, input: FightInput, ctx?: FightContex): FightContex {
		let cmd = input.cmd;
		let tid = input.target;

		switch (cmd) {
			case FightCmdEnum.summon:
				return this.exeSummon(unit as FightUnitUser, input.summon, ctx);
			case FightCmdEnum.dismiss:
				return this.exeDismiss(unit, tid, ctx);
			case FightCmdEnum.protect:
				return this.exeProtect(unit, tid, ctx);
			case FightCmdEnum.defend:
				return this.exeDefend(unit, ctx);
			case FightCmdEnum.runaway:
				return this.exeRunaway(unit, ctx);
		}
		return this.exeSkillAttack(unit, input, ctx);
	}

	//only none, attack, skill below
	exeSkillAttack(unit: FightUnit, input: FightInput, ctx?: FightContex): FightContex {
		let cmd = input.cmd;
		let tid = input.target;
		ctx ??= { ...initFightContex(this), attack: unit };

		let des = tid !== undefined ? this.getUnitById(tid) : undefined;
		// 预处理,没有来得及发指令的单位.
		if (cmd == FightCmdEnum.none) {
			cmd = FightCmdEnum.attack;
			// des = this.getDefaultEnemy(unit)
		}
		const actionSkill =
			cmd === FightCmdEnum.skill
				? unit.findSkill(input.skill)
				: cmd === FightCmdEnum.attack
					? unit.getAttackSkill()
					: undefined;
		if (actionSkill?.isMulti()) {
			ctx.defend = null;
			if (cmd === FightCmdEnum.skill)
				skillFunc(unit, null, input.skill, ctx, input.ignoreCostCD === true);
			else {
				ctx.actionStarted = true;
				attackFunc(unit, null, ctx);
			}
			return ctx;
		}

		// 不改写提交的 input，只在实际执行时按当前有效嘲讽覆盖主目标。
		if (cmd === FightCmdEnum.attack || cmd === FightCmdEnum.skill) {
			const skill =
				cmd === FightCmdEnum.skill ? unit.findSkill(input.skill) : this.getDefaultSkill();
			des = this.getTauntTarget(unit, skill) ?? des;
		}

		if (!des) {
			if (cmd == FightCmdEnum.attack) {
				des = this.getDefaultEnemy(unit);
			} else if (cmd == FightCmdEnum.skill) {
				const skill = unit.findSkill(input.skill);
				if (skill) {
					des = this.selectMainTarget(unit, skill);
				}
			}
		}
		if (!des) {
			unit.hintClient('没有可用目标');
			return;
		}
		ctx.defend = des;
		return this.exeSkillAttackContext(unit, input, des, ctx);
	}

	exeSkillAttackContext(
		unit: FightUnit,
		input: FightInput,
		des: FightUnit,
		ctx: FightContex,
	): FightContex {
		const cmd = input.cmd;
		if (!this.checkPC(unit, input)) {
			return ctx;
		}

		if (cmd == FightCmdEnum.attack || cmd == FightCmdEnum.none) {
			ctx.actionStarted = true;
			attackFunc(unit, des, ctx);
			return ctx;
		}

		if (cmd == FightCmdEnum.skill) {
			skillFunc(unit, des, input.skill, ctx, input.ignoreCostCD === true);
			return ctx;
		}
	}

	// 保持随机数, 以便重建战斗保持一致~
	randArray<T>(items: T[]): T {
		if (items.length <= 1) return items[0];
		return items[Math.floor(this.random() * items.length)];
	}

	// 洗牌打乱
	shuffleArray<T>(items: T[]): T[] {
		for (let i = items.length - 1; i > 0; i--) {
			const j = Math.floor(this.random() * (i + 1));
			[items[i], items[j]] = [items[j], items[i]];
		}
		return items;
	}

	private randomState: number;
	// Mulberry32 v1；包括零种子，固定使用 uint32 状态。
	random() {
		this.randomState = (this.randomState + 0x6d2b79f5) >>> 0;
		let value = this.randomState;
		value = Math.imul(value ^ (value >>> 15), value | 1);
		value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
		return ((value ^ (value >>> 14)) >>> 0) / 0x100000000;
	}
	randomGreat(g: number) {
		if (g >= 1) return false;

		if (g <= 0) return true;

		return this.random() >= g;
	}
	randomLess(g: number) {
		if (g >= 1) return true;

		if (g <= 0) return false;

		return this.random() <= g;
	}

	// ***event start
	private emitUnit = new EventEmitter();
	emitUnitEvent<E extends FightUnitEvent>(event: E, unit: FightUnit, ...args: FightUnitEventMap[NoInfer<E>]) {
		this.emitUnit.emit(event, unit, ...args);
	}
	onUnitEvent<E extends FightUnitEvent>(event: E, func: UnitEventFunc<NoInfer<E>>) {
		this.emitUnit.on(event, func);
	}
	offUnitEvent<E extends FightUnitEvent>(event: E, func: UnitEventFunc<NoInfer<E>>) {
		this.emitUnit.off(event, func);
	}

	onEnd() {
		if (!this.isEnd() || this.canRunaway()) {
			return; //逃跑没有奖励和惩罚。
		}

		if (this.xls.deathPenalty) {
			const side = this.getLostSide();
			if (side >= 0) {
				this.Sides[side].deathPenalty(this.xls.deathPenalty);
			}
		}
		const side = this.getWinSide();
		if (side >= 0) {
			this.Sides[side].onWin(this.xls.winReward, this.xls.winRecover);
		}
	}
}
