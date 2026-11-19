import { Fight, FightContex, initFightContex } from "./Fight";
import { FightUnit, sortByAttr } from "./Unit/FightUnit";
import { FightCmdEnum, FightInput, fightMsg, FightSideEnum, InsertActionPos, FightResultEnum } from "./struct";
import EventEmitter from "node:events";
import { FightActionQueue, FightAction } from "./FightActionQueue";

export type bcMsgFunc = (msgs: fightMsg | fightMsg[])=>void;
export interface UltimateInput { unit: FightUnit; input: FightInput; }
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
    get actions(): readonly FightAction[] { return this.actionQueue.actions; }
    // 兼容宿主读取/设置普通单位队列；调度内部使用可重复单位的行动记录。
    get processUnits(): FightUnit[] { return this.actionQueue.units; }
    set processUnits(units: FightUnit[]) { this.actionQueue.reset(units); this.queueTurn = this.fight.turn; }
    private actionInserter = (unit: FightUnit, input: FightInput, pos: InsertActionPos, ctx?: FightContex) => this.insertAction(unit, input, pos, ctx);
    insertAction(unit: FightUnit, input: FightInput, pos = InsertActionPos.first, ctx?: FightContex): boolean {
        if (this.stopped || this.fight.isEnd() || this.queueTurn !== this.fight.turn ||
            unit.fight !== this.fight || !this.fight.getAllUnits().includes(unit) || !this.fight.checkPC(unit, input)) return false;
        this.actionQueue.insert(unit, input, pos, () => this.fight.random(), this.currentAction);
        this.syncActionOrder(ctx);
        return true;
    }
    cancelAction(id: number): boolean {
        if (!this.actionQueue.cancel(id)) return false;
        this.syncActionOrder(); return true;
    }
    protected syncActionOrder(ctx?: FightContex) {
        const msg: fightMsg = ["sort", this.processUnits.map(unit => unit.uid)];
        if (this.actions.some(action => action.inserted)) msg.push(this.actionQueue.display());
        if (ctx) ctx.msgs.push(msg); else this.bcMsg(msg);
    }
    protected takeAction() { return this.currentAction = this.actionQueue.shift(); }
    protected insertedContext(action: FightAction): FightContex | undefined {
        if (!this.fight.checkPC(action.unit, action.input)) return undefined;
        return this.fight.processUnit(action.unit, action.input);
    }
    protected actorMessage(action: FightAction): fightMsg {
        return action.inserted ? ["actor", action.unit.uid, action.unit.getSpeed(), "insert", action.id] :
            ["actor", action.unit.uid, action.unit.getSpeed()];
    }
    protected stopped = false;
    protected failed = false;
    // 宿主可以覆盖日志入口；原始异常对象保留堆栈，context 保存当前行动意图。
    onError(error: unknown, context: FightErrorContext) {
        console.error("战斗异常，停止战斗并判攻击方失败：", context, error);
    }
    private reportFailure(error: unknown, unit?: FightUnit, input?: FightInput) {
        if (this.failed) return;
        this.failed = true;
        this.fight.win = FightResultEnum.defend;
        this.fight.resetUltimate();
        const action = unit === undefined && input === undefined ? this.currentAction : undefined;
        unit ??= this.currentAction?.unit;
        input ??= this.currentAction?.input ?? unit?.input;
        const context: FightErrorContext = { fid: this.fight.fid, seed: this.fight.seed, turn: this.fight.turn,
            ...(action ? { action: action.id } : {}),
            ...(unit ? { actor: unit.uid } : {}), ...(input ? { input: { ...input } } : {}) };
        try { this.onError(error, context); }
        catch (loggingError) { console.error("战斗异常日志回调失败：", loggingError, "原始异常：", error); }
    }
    protected fail(error: unknown, unit?: FightUnit, input?: FightInput) {
        if (this.failed) return;
        this.reportFailure(error, unit, input);
        this.end();
    }
    private ultimateInput: { side: FightSideEnum; turn: number; resolve: (choice?: UltimateInput) => void } | undefined;
    get ultimateSide(): FightSideEnum | undefined { return this.ultimateInput?.side; }
    fight: Fight;
    constructor(fight: Fight) {
        this.fight = fight;
    }

    processBeforeTurn(turn: number, ctx: FightContex) {
        this.fight.resolveAction(() => {
            for (const unit of this.fight.getAllUnits()) unit.processBeforeTurn(turn, ctx);
            this.fight.updateUltimate(ctx);
        });
    }

    abstract processOneTurn(turn: number): Promise<void>;

    processAfterTurn(turn: number, ctx: FightContex) {
        this.fight.resolveAction(() => {
            for (const unit of this.fight.getAllUnits()) unit.processAfterTurn(turn, ctx);
        });
    }

    async run() {
        try { return await this.runBattle(); }
        catch (error) { this.fail(error); return this.fight.win; }
    }

    private async runBattle() {
        const f = this.fight;
        this.start();
        f.checkOutcome();
        while(!f.isEnd() && !this.stopped){
            const turn = this.nextTurn();
            //console.log(f);
            if (f.isEnd() || this.stopped) {
                break;
            }
    
            const f1 = initFightContex(f); 
            this.processBeforeTurn(turn, f1);
            this.bcMsg(f1.msgs)

            f.checkOutcome();
            if (f.isEnd() || this.stopped) {
                break;
            }

            if (f.xls.allShieldBreak) await this.processUltimate(turn, true);
            if (f.isEnd() || this.stopped) break;
            const f2 = initFightContex(f); 
            await this.waitInput(turn, f2);
            this.bcMsg(f2.msgs)
            f.checkOutcome();
            if (f.isEnd() || this.stopped) break;
            if (f.xls.allShieldBreak) await this.processUltimate(turn, true);
            if (f.isEnd() || this.stopped) break;

            await this.processOneTurn(turn);
            if (this.stopped) break;

            await this.waitTurnDrawOver();
            if (this.stopped) break;
            
            const f3 = initFightContex(f); 
            this.processAfterTurn(turn, f3); //回合后主要处理死亡等            
            this.bcMsg(f3.msgs)
            if (f.xls.allShieldBreak) await this.processUltimate(turn, true);
            if (this.stopped) break;
            
            f.finishTurn();
        }
        if (!this.stopped) this.end();
        return this.fight.win;
    }

    start() {
        this.stopped = false;
        this.failed = false;
        this.actionQueue.clear(); this.queueTurn = -1; this.currentAction = undefined;
        this.fight.setActionInserter(this.actionInserter);
        this.closeUltimateInput();
        this.fight.resetUltimate();
        const all = this.fight.getAllUnits();        
        for (const u of all){
            u.startFight(this.fight);
        }
        this.emitEvent("start");
        this.bcMsg(["start", this.fight.fid]);
        for (const side of [0, 1]) {
            this.bcMsg(["side", side, this.fight.getSide(side).units.map(unit => unit.getUnitMsg())]);
        }
        this.fight.offUnitEvent("speed", this.speedListener);
        this.fight.onUnitEvent("speed", this.speedListener);
    }

    end() {
        if (this.stopped) return;
        this.stopped = true;
        this.fight.clearActionInserter(this.actionInserter);
        this.actionQueue.clear(); this.queueTurn = -1; this.currentAction = undefined;
        this.closeUltimateInput();
        this.fight.offUnitEvent("speed", this.speedListener);
        for (const unit of this.fight.getAllUnits()) {
            try { unit.endFight(); }
            catch (error) { this.reportFailure(error, unit); }
        }
        // 收尾回调完成后再发送最终结果，回调异常同样按攻击方失败结算。
        try { this.emitEvent("end"); }
        catch (error) { this.reportFailure(error); }
        try { this.bcMsg(["end", this.fight.win]); }
        catch (error) { this.reportFailure(error); }
    }

    nextTurn() {
        this.closeUltimateInput();
        const turn = this.fight.nextTurn();
        this.emitEvent("turn")
        this.bcMsg(["turn", turn]);
        this.currentAction = undefined;
        this.sortUnitsByProcess(false);
        this.syncActionOrder();
        return turn;
    }

    private speedListener = (unit: FightUnit) => this.onChangeSpeed(unit);
    onChangeSpeed(unit: FightUnit) {
        if (!this.processUnits?.includes(unit)) return;
        this.actionQueue.sort((a, b) => this.compareProcessUnits(a, b, false));
        this.syncActionOrder();
    }

    // return 0: 超时, 1: 正常结束
    async waitInput(turn: number, ctx: FightContex): Promise<number>{
        return 1;
    }

    // 全体破盾后的独立输入窗口，不占普通行动；宿主选择同阵营一人，或取消本轮机会。
    waitInputUtimate(turn: number, side: FightSideEnum): Promise<UltimateInput | undefined> {
        const waiting = new Promise<UltimateInput | undefined>(resolve => {
            this.ultimateInput = { side, turn, resolve };
        });
        this.emitEvent("ultimate", side, turn, this.getUltimateUnits(side));
        return waiting;
    }

    private getUltimateUnits(side: FightSideEnum): FightUnit[] {
        return this.fight.getSideUnits(side).filter(unit => !unit.isDied() && !unit.getActionBlockBuff() &&
            !unit.isForbid("skill") && unit.getUltimateSkill() && unit.getSkillCd(unit.ultimateSkill) === 0);
    }

    onInputUltimate(id: number, input: FightInput): boolean {
        try { return this.acceptUltimateInput(id, input); }
        catch (error) { this.fail(error, this.fight.getUnitById(id), input); return false; }
    }

    private acceptUltimateInput(id: number, input: FightInput): boolean {
        const pending = this.ultimateInput;
        if (this.stopped || !pending || this.fight.isEnd() || pending.turn !== this.fight.turn ||
            !input || (input.turn !== undefined && input.turn !== pending.turn)) return false;
        const unit = this.fight.getUnitById(id);
        if (!unit || unit.side !== pending.side) return false;
        if (input.cmd === FightCmdEnum.cancel) { this.closeUltimateInput(); return true; }
        if (!this.fight.checkUltimate(unit, input)) return false;
        const prepared = this.fight.preparePCInput(unit, { ...input, skill: unit.ultimateSkill });
        if (!prepared) return false;
        this.closeUltimateInput({ unit, input: prepared });
        return true;
    }

    private closeUltimateInput(choice?: UltimateInput) {
        const pending = this.ultimateInput;
        this.ultimateInput = undefined;
        pending?.resolve(choice);
    }

    protected async processUltimate(turn: number, waitBefore = false) {
        try { await this.processUltimateActions(turn, waitBefore); }
        catch (error) { this.fail(error); }
    }

    private async processUltimateActions(turn: number, waitBefore: boolean) {
        for (const side of [FightSideEnum.attack, FightSideEnum.defend]) {
            if (!this.fight.hasUltimateChance(side) || !this.getUltimateUnits(side).length) continue;
            if (waitBefore) await this.waitDrawOver();
            while (!this.stopped && !this.fight.isEnd() && this.fight.turn === turn && this.fight.hasUltimateChance(side)) {
                let choice: UltimateInput | undefined;
                try {
                    choice = await this.waitInputUtimate(turn, side);
                } finally {
                    this.closeUltimateInput();
                }
                if (this.stopped || this.fight.isEnd() || this.fight.turn !== turn) return;
                if (!choice) {
                    const ctx = initFightContex(this.fight); this.fight.skipUltimate(side, ctx); this.bcMsg(ctx.msgs);
                    break;
                }
                const ctx = this.fight.processUltimate(choice.unit, choice.input);
                if (!ctx) { if (!this.getUltimateUnits(side).length) break; continue; }
                ctx.msgs.unshift(["actor", choice.unit.uid, choice.unit.getSpeed(), "ultimate"]);
                this.bcMsg(ctx.msgs);
                await this.waitDrawOver();
                break;
            }
        }
    }
    abstract onInput(id: number, input: FightInput): void;

    async waitDrawOver(){}
    // 默认每回合统一等待；逐动作等待的循环可覆盖，避免重复等待。
    protected async waitTurnDrawOver() { await this.waitDrawOver(); }

    compareProcessUnits(a: FightUnit, b: FightUnit, withInput = true) {
        const priority = (unit: FightUnit) => withInput && unit.input?.cmd === FightCmdEnum.protect ? 1 : 0;
        return priority(b) - priority(a) || b.getSpeedOrder() - a.getSpeedOrder();
    }

    sortUnitsByProcess(withInput = true){
        const all = this.fight.getAllUnits();
        // all包括死亡单位，如果他中途被复活了，还在列表中，就可以行动；否则下个回合才能行动！
        // 客户端渲染需要剔除死亡的
        //sortByAttr(all, "speed", true);
        all.sort((a, b) => this.compareProcessUnits(a, b, withInput));

        this.processUnits = all; //但是如果有插队,降速会扰乱出手表?
    
        return all;
    }

    msgFunc: bcMsgFunc[] = [];
    onMsg(func: bcMsgFunc){
        this.msgFunc.push(func);
    }
    bcMsg(msgs: fightMsg | fightMsg[]){
        // 暂时没有发消息, 直接打印
        if (!msgs?.length) return;
        if (this.msgFunc.length > 0) {
            for (const msgFunc of this.msgFunc) {
                msgFunc(msgs);
            }
        }
        else {
            console.log(msgs);
        }
    }    


    private emit = new EventEmitter();
    on(event: string, func: (...args: any[]) => void){
        this.emit.on(event, func);
    }
    emitEvent(event: string, ...args: any[]){
        this.emit.emit(event, ...args);
    }
}

