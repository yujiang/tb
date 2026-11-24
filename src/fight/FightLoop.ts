import { Fight, FightContex, initFightContex } from './Fight';
import { FightUnit, sortByAttr } from './Unit/FightUnit';
import { FightCmdEnum, FightInput, fightMsg, InsertActionPos, FightResultEnum } from './struct';
import EventEmitter from 'node:events';
import { FightActionQueue, FightAction } from './FightActionQueue';

export type bcMsgFunc = (msgs: fightMsg | fightMsg[]) => void;
export interface FightErrorContext {
	/** 本场战斗ID，用于关联宿主日志。 */
	fid: number;
	/** 初始随机种子；不是可恢复的随机状态快照。 */
	seed: number;
	/** 异常发生时的全局回合，初始化阶段可能为0。 */
	turn: number;
	/** 当时正在执行的队列行动ID；队列行动之外可能省略。 */
	action?: number;
	/** 行动者运行uid；没有具体行动者的阶段可能省略。 */
	actor?: number;
	/** 输入意图副本；不是嘲讽等重定向后的实际目标记录。 */
	input?: FightInput;
}

export abstract class FightLoop {
	protected readonly actionQueue = new FightActionQueue();
	protected currentAction: FightAction | undefined;
	private queueTurn = -1;
	get actions(): readonly FightAction[] {
		return this.actionQueue.actions;
	}
	// 兼容宿主读取/设置普通单位队列；调度内部使用可重复单位的行动记录。
	get processUnits(): FightUnit[] {
		return this.actionQueue.units;
	}
	set processUnits(units: FightUnit[]) {
		this.actionQueue.reset(units);
		this.queueTurn = this.fight.turn;
	}
	private actionInserter = (
		unit: FightUnit,
		input: FightInput,
		pos: InsertActionPos | undefined,
		ctx?: FightContex,
		speedRate?: number,
	) => this.insertAction(unit, input, pos, ctx, speedRate);
	insertAction(
		unit: FightUnit,
		input: FightInput,
		pos?: InsertActionPos,
		ctx?: FightContex,
		speedRate?: number,
	): boolean {
		if (!this.canProcessTurn(this.queueTurn) || !this.fight.checkPC(unit, input)) {
			return false;
		}

		const rate = pos === undefined ? speedRate : undefined;
		this.actionQueue.insert(
			unit,
			input,
			rate !== undefined ? InsertActionPos.last : (pos ?? InsertActionPos.first),
			() => this.fight.random(),
			this.currentAction,
			rate,
		);
		if (rate !== undefined) {
			this.actionQueue.sort(
				(a, b) => this.compareProcessUnits(a, b, false),
				(a, b) => this.compareProcessActions(a, b, false),
			);
		}
		this.syncActionOrder(ctx);
		return true;
	}
	cancelAction(id: number): boolean {
		if (!this.actionQueue.cancel(id)) return false;

		this.syncActionOrder();
		return true;
	}
	protected syncActionOrder(ctx?: FightContex) {
		const msg: fightMsg = ['sort', this.processUnits.map((unit) => unit.uid)];
		if (this.actions.some((action) => action.inserted)) msg.push(this.actionQueue.display());
		if (ctx) ctx.msgs.push(msg);
		else this.bcMsg(msg);
	}
	protected takeAction() {
		return (this.currentAction = this.actionQueue.shift());
	}
	private dismissListener = (unit: FightUnit, ctx: FightContex) => {
		this.actionQueue.removeUnit(unit);
		this.syncActionOrder(ctx);
	};
	// 只有普通行动位和模板extraAction推动集气；规则插入、即时技能、大招及内部反应链不推动。
	protected finishAction(action: FightAction, ctx: FightContex | undefined) {
		if (
			!this.fight.globalData.jiqi ||
			!ctx?.actionStarted ||
			(action.inserted && !action.extraAction)
		) {
			return;
		}

		for (const unit of this.fight.getAllUnits()) {
			if (!unit.isDied()) unit.addJp(unit.attr.jpAdd, ctx);
		}
	}
	protected insertedContext(action: FightAction): FightContex | undefined {
		if (action.extraAction) {
			return this.freshInputContext(action, true);
		}

		const input = this.fight.prepareActionInput(action.unit, action.input);
		if (!this.fight.checkPC(action.unit, input)) return undefined;

		return this.fight.processUnit(action.unit, input);
	}
	// 模板普通行动/额外AI行动在实际出手时决策，不重复推进输入周期Buff。
	protected freshInputContext(action: FightAction, automatic = false): FightContex | undefined {
		const unit = action.unit;
		if (unit.isDied()) return undefined;

		if (unit.isForbid('action')) {
			return this.fight.processUnit(unit, { cmd: FightCmdEnum.none });
		}

		const before = initFightContex(this.fight);
		const input =
			action.input ??
			this.fight.resolveAction(() => unit.getActionInput(this.fight.turn, before, automatic));
		action.input = { ...input };
		const executionInput = this.fight.prepareActionInput(unit, input);
		const ctx = this.fight.checkPC(unit, executionInput)
			? this.fight.processUnit(unit, executionInput)
			: undefined;
		if (ctx) ctx.msgs.unshift(...before.msgs);
		else this.bcMsg(before.msgs);
		return ctx;
	}
	protected actorMessage(action: FightAction): fightMsg {
		return action.inserted
			? [
					'actor',
					action.unit.uid,
					action.unit.getSpeed() * (action.speedRate ?? 1),
					'insert',
					action.id,
				]
			: ['actor', action.unit.uid, action.unit.getSpeed()];
	}
	protected stopped = true;
	protected failed = false;
	// 调度、输入和等待恢复后统一检查；省略回合号时仅检查当前循环是否仍可运行。
	protected canProcessTurn(turn = this.fight.turn): boolean {
		return !this.stopped && !this.fight.isEnd() && this.fight.turn === turn;
	}

	// 宿主可以覆盖日志入口；原始异常对象保留堆栈，context 保存当前行动意图。
	onError(error: unknown, context: FightErrorContext) {
		console.error('战斗异常，停止战斗；未结束时判攻击方失败，已有结果保留：', context, error);
	}
	private reportFailure(error: unknown, unit?: FightUnit, input?: FightInput) {
		this.failed = true;
		if (this.fight.result === FightResultEnum.ongoing) {
			this.fight.setWin(FightResultEnum.defend);
		}
		this.fight.resetUltimate();
		const action = unit === undefined && input === undefined ? this.currentAction : undefined;
		unit ??= this.currentAction?.unit;
		input ??= this.currentAction?.input ?? unit?.input;
		const context: FightErrorContext = {
			fid: this.fight.fid,
			seed: this.fight.seed,
			turn: this.fight.turn,
			...(action ? { action: action.id } : {}),
			...(unit ? { actor: unit.uid } : {}),
			...(input ? { input: { ...input } } : {}),
		};
		try {
			this.onError(error, context);
		} catch (loggingError) {
			console.error('战斗异常日志回调失败：', loggingError, '原始异常：', error);
		}
	}
	protected fail(error: unknown, unit?: FightUnit, input?: FightInput) {
		if (this.failed) return;

		this.reportFailure(error, unit, input);
		this.end();
	}
	fight: Fight;
	constructor(fight: Fight) {
		this.fight = fight;
	}

	processBeforeTurn(turn: number, ctx: FightContex) {
		this.fight.resolveAction(() => {
			for (const unit of this.fight.getAllUnits()) unit.processBeforeTurn(turn, ctx);
		});
	}

	abstract processOneTurn(turn: number): Promise<void>;

	processAfterTurn(turn: number, ctx: FightContex) {
		this.fight.resolveAction(() => {
			for (const unit of this.fight.getAllUnits()) unit.processAfterTurn(turn, ctx);
		});
	}

	async run() {
		try {
			await this.runBattle();
		} catch (error) {
			this.reportFailure(error);
		} finally {
			this.end();
		}
		return this.fight.result;
	}

	private async runBattle() {
		const f = this.fight;
		this.start();
		f.checkOutcome();
		while (this.canProcessTurn()) {
			const turn = this.nextTurn();
			//console.log(f);
			if (!this.canProcessTurn(turn)) {
				break;
			}

			const f1 = initFightContex(f);
			this.processBeforeTurn(turn, f1);
			this.bcMsg(f1.msgs);

			f.checkOutcome();
			if (!this.canProcessTurn(turn)) {
				break;
			}
			const f2 = initFightContex(f);
			await this.waitInput(turn, f2);
			this.bcMsg(f2.msgs);
			f.checkOutcome();
			if (!this.canProcessTurn(turn)) {
				break;
			}

			await this.processOneTurn(turn);
			if (this.stopped) break;

			await this.waitTurnDrawOver();
			if (this.stopped) break;

			const f3 = initFightContex(f);
			this.processAfterTurn(turn, f3); //回合后主要处理死亡等
			this.bcMsg(f3.msgs);
			if (this.stopped) break;

			f.finishTurn();
		}
	}

	start() {
		this.stopped = false;
		this.failed = false;
		this.actionQueue.clear();
		this.queueTurn = -1;
		this.currentAction = undefined;
		this.fight.setActionInserter(this.actionInserter);
		this.fight.resetUltimate();
		const all = this.fight.getAllUnits();
		for (const u of all) {
			u.startFight(this.fight);
		}
		this.emitEvent('start');
		this.bcMsg(['start', this.fight.fid]);
		for (const side of [0, 1]) {
			this.bcMsg([
				'side',
				side,
				this.fight.getSide(side).units.map((unit) => unit.getUnitMsg()),
			]);
		}
		this.fight.offUnitEvent('speed', this.speedListener);
		this.fight.onUnitEvent('speed', this.speedListener);
		this.fight.offUnitEvent('dismiss', this.dismissListener);
		this.fight.onUnitEvent('dismiss', this.dismissListener);
	}

	end() {
		if (this.stopped) return;

		this.stopped = true;
		this.fight.offUnitEvent('dismiss', this.dismissListener);
		this.fight.clearActionInserter(this.actionInserter);
		this.actionQueue.clear();
		this.queueTurn = -1;
		this.currentAction = undefined;
		this.fight.offUnitEvent('speed', this.speedListener);
		for (const unit of this.fight.getAllUnits()) {
			try {
				unit.endFight();
			} catch (error) {
				this.reportFailure(error, unit);
			}
		}
		// 收尾回调完成后再发送最终结果；异常逐项记录，保留已经确定的胜负。
		try {
			this.fight.onEnd();
		} catch (error) {
			this.reportFailure(error);
		}
		try {
			this.emitEvent('end');
		} catch (error) {
			this.reportFailure(error);
		}
		try {
			this.bcMsg([
				'end',
				this.fight.result,
				this.fight.getWinSide(),
				this.fight.canRunaway(),
			]);
		} catch (error) {
			this.reportFailure(error);
		}
	}

	nextTurn() {
		const turn = this.fight.nextTurn();
		this.emitEvent('turn');
		this.bcMsg(['turn', turn]);
		this.currentAction = undefined;
		this.sortUnitsByProcess(false);
		this.syncActionOrder();
		return turn;
	}

	private speedListener = (unit: FightUnit) => this.onChangeSpeed(unit);
	onChangeSpeed(unit: FightUnit) {
		if (!this.processUnits?.includes(unit)) return;

		this.actionQueue.sort(
			(a, b) => this.compareProcessUnits(a, b, false),
			(a, b) => this.compareProcessActions(a, b, false),
		);
		this.syncActionOrder();
	}

	// return 0: 超时, 1: 正常结束
	async waitInput(turn: number, ctx: FightContex): Promise<number> {
		return 1;
	}

	abstract onInput(id: number, input: FightInput): void;

	async waitDrawOver() {}
	// 默认每回合统一等待；逐动作等待的循环可覆盖，避免重复等待。
	protected async waitTurnDrawOver() {
		await this.waitDrawOver();
	}

	compareProcessUnits(a: FightUnit, b: FightUnit, withInput = true) {
		const priority = (unit: FightUnit) =>
			withInput && unit.input?.cmd === FightCmdEnum.protect ? 1 : 0;
		return priority(b) - priority(a) || b.getSpeedOrder() - a.getSpeedOrder();
	}

	protected compareProcessActions(a: FightAction, b: FightAction, withInput = true) {
		if (a.speedRate === undefined && b.speedRate === undefined) {
			return this.compareProcessUnits(a.unit, b.unit, withInput);
		}

		const priority = (action: FightAction) =>
			withInput &&
			(action.speedRate !== undefined ? action.input : action.unit.input)?.cmd ===
				FightCmdEnum.protect
				? 1
				: 0;
		return (
			priority(b) - priority(a) ||
			b.unit.getSpeedOrder() * (b.speedRate ?? 1) -
				a.unit.getSpeedOrder() * (a.speedRate ?? 1)
		);
	}

	sortUnitsByProcess(withInput = true) {
		const all = this.fight.getAllUnits();
		// all包括死亡单位，如果他中途被复活了，还在列表中，就可以行动；否则下个回合才能行动！
		// 客户端渲染需要剔除死亡的
		//sortByAttr(all, "speed", true);
		all.sort((a, b) => this.compareProcessUnits(a, b, withInput));

		this.processUnits = all; //但是如果有插队,降速会扰乱出手表?
		this.actionQueue.sort(
			(a, b) => this.compareProcessUnits(a, b, withInput),
			(a, b) => this.compareProcessActions(a, b, withInput),
		);

		return all;
	}

	msgFunc: bcMsgFunc[] = [];
	onMsg(func: bcMsgFunc) {
		this.msgFunc.push(func);
	}
	bcMsg(msgs: fightMsg | fightMsg[]) {
		// 暂时没有发消息, 直接打印
		if (!msgs?.length) return;

		if (this.msgFunc.length > 0) {
			for (const msgFunc of this.msgFunc) {
				msgFunc(msgs);
			}
		} else {
			console.log(msgs);
		}
	}

	private emit = new EventEmitter();
	on(event: string, func: (...args: any[]) => void) {
		this.emit.on(event, func);
	}
	emitEvent(event: string, ...args: any[]) {
		this.emit.emit(event, ...args);
	}
}
