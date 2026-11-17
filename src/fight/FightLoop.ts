import { Fight, FightContex, initFightContex } from "./Fight";
import { FightUnit, sortByAttr } from "./Unit/FightUnit";
import { FightInput, fightMsg } from "./struct";
import EventEmitter from "node:events";

export type bcMsgFunc = (msgs: fightMsg | fightMsg[])=>void;

export abstract class FightLoop {
    fight: Fight;
    constructor(fight: Fight) {
        this.fight = fight;
    }

    abstract processBeforeTurn(turn: number, ctx: FightContex): void;

    abstract processOneTurn(turn: number): Promise<void>;

    abstract processAfterTurn(turn: number, ctx: FightContex): void;

    async run() {
        const f = this.fight;
        this.start();
        f.checkOutcome();
        while(!f.isEnd()){
            const turn = this.nextTurn();
            //console.log(f);
            if (f.isEnd()) {
                break;
            }
    
            const f1 = initFightContex(f); 
            this.processBeforeTurn(turn, f1);
            this.bcMsg(f1.msgs)

            f.checkOutcome();
            if (f.isEnd()) {
                break;
            }

            const f2 = initFightContex(f); 
            await this.waitInput(turn, f2);
            this.bcMsg(f2.msgs)
            f.checkOutcome();
            if (f.isEnd()) break;

            await this.processOneTurn(turn);

            await this.waitDrawOver();
            
            const f3 = initFightContex(f); 
            this.processAfterTurn(turn, f3); //回合后主要处理死亡等            
            this.bcMsg(f3.msgs)
            
            f.finishTurn();
        }
        this.end();
        return this.fight.win;
    }

    start() {
        const all = this.fight.getAllUnits();        
        for (const u of all){
            u.startFight(this.fight);
        }
        this.emitEvent("start");
    }

    end() {
        this.emitEvent("end");
    }

    nextTurn() {
        const turn = this.fight.nextTurn();
        this.emitEvent("turn")
        return turn;
    }

    // return 0: 超时, 1: 正常结束
    async waitInput(turn: number, ctx: FightContex): Promise<number>{
        return 1;
    }
    abstract onInput(id: number, input: FightInput): void;

    async waitDrawOver(){}

    processUnits: FightUnit[];
    sortUnitsByProcess(){
        const all = this.fight.getAllUnits();
        // all包括死亡单位，如果他中途被复活了，还在列表中，就可以行动；否则下个回合才能行动！
        // 客户端渲染需要剔除死亡的
        //sortByAttr(all, "speed", true);
        all.sort((a, b) => b.getSpeedOrder() - a.getSpeedOrder());

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

