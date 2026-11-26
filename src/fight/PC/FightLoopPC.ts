// 单机游戏

import { FightContex, initFightContex } from '../Fight';
import { FightLoop } from '../Loop/FightLoop';
import { FightCmdEnum, FightInput } from '../struct';
import { FightUnit } from '../Unit/FightUnit';

// 每个玩家单位单独下指令
export class FightLoopPC extends FightLoop {
	private ordinaryActionActive = false;
	private entruster = {
		canUse: (unit: FightUnit) =>
			this.canProcessTurn() &&
			this.currentAction?.unit === unit &&
			!this.currentAction.inserted &&
			this.ordinaryActionActive &&
			(!this.fight.isInAction() ||
				(this.currentAction.input?.cmd === FightCmdEnum.skill &&
					(unit.findSkill(this.currentAction.input.skill)?.getFunc() === 'entrust' ||
						unit.findSkill(this.currentAction.input.skill)?.isMimicAny()))),
		process: (unit: FightUnit, target: FightUnit, ctx: FightContex) => {
			if (!this.entruster.canUse(unit) || ctx.attack !== unit) {
				return false;
			}

			this.actionQueue.entrust(this.currentAction, target);
			ctx.actionEntrusted = true;
			this.syncActionOrder(ctx);
			return true;
		},
	};
	private running: Promise<void> | undefined;
	private waiting:
		{ unit: FightUnit; turn: number; resolve: (input?: FightInput) => void } | undefined;

	get inputUnit(): FightUnit | undefined {
		return this.waiting?.unit;
	}

	override start() {
		this.closeInput();
		super.start();
		this.fight.setActionEntruster(this.entruster);
		this.fight.offUnitEvent('die', this.onWaitingUnitDied);
		this.fight.onUnitEvent('die', this.onWaitingUnitDied);
		this.fight.offUnitEvent('dismiss', this.onWaitingUnitDied);
		this.fight.onUnitEvent('dismiss', this.onWaitingUnitDied);
	}

	override nextTurn() {
		this.closeInput();
		return super.nextTurn();
	}

	override processOneTurn(turn: number): Promise<void> {
		if (!this.canProcessTurn(turn)) {
			return Promise.resolve();
		}

		if (!this.running) this.running = this.processQueue(turn);
		return this.running;
	}

	private async processQueue(turn: number) {
		// 先完成 running 赋值，输入与消息回调重入时复用同一轮调度。
		await Promise.resolve();
		try {
			while (this.canProcessTurn(turn) && this.processUnits?.length) {
				const action = this.takeAction(),
					unit = action.unit;
				this.ordinaryActionActive = !action.inserted;
				if (action.inserted) {
					const ctx = this.insertedContext(action);
					this.finishAction(action, ctx);
					if (ctx) {
						ctx.msgs.unshift(this.actorMessage(action));
						this.bcMsg(ctx.msgs);
						await this.waitDrawOver();
					} else this.syncActionOrder();
					continue;
				}
				if (unit.isDied()) {
					this.syncActionOrder();
					continue;
				}
				this.bcMsg(['actor', unit.uid, unit.getSpeed()]);
				const before = initFightContex(this.fight);
				this.fight.resolveAction(() => unit.inputStart(turn, before));
				this.bcMsg(before.msgs);
				if (before.msgs.length) {
					await this.waitDrawOver();
				}
				if (!this.canProcessTurn(turn)) {
					break;
				}
				if (unit.isDied()) continue;

				let input = unit.input ?? { cmd: FightCmdEnum.none };
				if (unit.needInput() && !unit.isForbid('action')) {
					input = await this.waitUnitInput(unit, turn);
					if (!this.canProcessTurn(turn)) {
						break;
					}
					if (!input) continue;

					input = this.fight.prepareActionInput(unit, input);
					if (!this.fight.checkInput(unit, input)) continue;
				}
				action.input = { ...input };
				const ctx = this.fight.processUnit(unit, input);
				this.ordinaryActionActive = false;
				this.finishAction(action, ctx);
				if (ctx) this.bcMsg(ctx.msgs);
				await this.waitDrawOver();
			}
		} catch (error) {
			this.fail(error);
		} finally {
			this.ordinaryActionActive = false;
			this.closeInput();
			this.running = undefined;
		}
	}

	private waitUnitInput(unit: FightUnit, turn: number): Promise<FightInput | undefined> {
		const input = new Promise<FightInput | undefined>((resolve) => {
			this.waiting = { unit, turn, resolve };
		});
		// 回调放在 Promise executor 外，提交同步完成后再抛错也必须传给宿主。
		this.emitEvent('input', unit, turn);
		return input;
	}

	override onInput(id: number, input: FightInput): boolean {
		try {
			return this.acceptInput(id, input);
		} catch (error) {
			this.fail(error, this.fight.getUnitById(id), input);
			return false;
		}
	}

	private acceptInput(id: number, input: FightInput): boolean {
		const pending = this.waiting;
		if (
			!pending ||
			!this.canProcessTurn(pending.turn) ||
			id !== pending.unit.uid ||
			!input ||
			(input.turn !== undefined && input.turn !== pending.turn)
		) {
			return false;
		}

		const unit = pending.unit;
		if (unit.isDied() || !unit.needInput()) {
			this.closeInput();
			return false;
		}

		if (unit.isForbid('action')) {
			unit.hintClient('当前无法行动');
			this.closeInput({ cmd: FightCmdEnum.none });
			return false;
		}

		if (!this.fight.checkInput(unit, input)) return false;

		if (input.cmd === FightCmdEnum.cancel) {
			unit.input = null;
			return true;
		}

		const prepared = this.fight.preparePCInput(unit, input);
		if (!prepared) return false;

		unit.input = prepared;
		this.closeInput({ ...unit.input });
		return true;
	}

	private closeInput(input?: FightInput) {
		const pending = this.waiting;
		this.waiting = undefined;
		pending?.resolve(input);
	}

	private onWaitingUnitDied = (unit: FightUnit) => {
		if (this.waiting?.unit === unit) this.closeInput();
	};

	// 每个行动已经单独等待动画，回合末无须再等一次。
	protected override async waitTurnDrawOver() {}

	override end() {
		this.closeInput();
		this.ordinaryActionActive = false;
		this.fight.clearActionEntruster(this.entruster);
		this.fight.offUnitEvent('die', this.onWaitingUnitDied);
		this.fight.offUnitEvent('dismiss', this.onWaitingUnitDied);
		super.end();
	}
}
