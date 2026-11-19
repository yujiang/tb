import { Fight, FightContex, initFightContex } from "./Fight";
import { FightUnit, sortByAttr } from "./Unit/FightUnit";
import { FightCmdEnum, FightInput, fightMsg, FightSideEnum } from "./struct";
import EventEmitter from "node:events";

export type bcMsgFunc = (msgs: fightMsg | fightMsg[])=>void;
export interface UltimateInput { unit: FightUnit; input: FightInput; }

export abstract class FightLoop {
    protected stopped = false;
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
        this.closeUltimateInput();
        this.fight.offUnitEvent("speed", this.speedListener);
        for (const unit of this.fight.getAllUnits()) unit.endFight();
        this.bcMsg(["end", this.fight.win]);
        this.emitEvent("end");
    }

    nextTurn() {
        this.closeUltimateInput();
        const turn = this.fight.nextTurn();
        this.emitEvent("turn")
        this.bcMsg(["turn", turn]);
        this.bcMsg(["sort", this.sortUnitsByProcess(false).map(unit => unit.uid)]);
        return turn;
    }

    private speedListener = (unit: FightUnit) => this.onChangeSpeed(unit);
    onChangeSpeed(unit: FightUnit) {
        if (!this.processUnits?.includes(unit)) return;
        this.processUnits.sort((a, b) => this.compareProcessUnits(a, b, false));
        this.bcMsg(["sort", this.processUnits.map(unit => unit.uid)]);
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

    processUnits: FightUnit[];
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

