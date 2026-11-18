import { FightContex } from "../Fight";
import { fightMsg } from "../struct";
import { FightLoop } from "../FightLoop";
import { FightUnit } from "../Unit/FightUnit";
import { FightInput } from "../struct";
import { setTimeout as delay } from 'node:timers/promises';

export abstract class FightLoopOnline extends FightLoop {
    //回合前开始处理buff等
    processBeforeTurn(turn: number, ctx: FightContex){
        const all = this.fight.getAllUnits();
        this.fight.resolveAction(() => {
            for (const u of all) u.processBeforeTurn(turn, ctx);
        });
    }

    //回合后主要处理死亡等            
    processAfterTurn(turn: number, ctx: FightContex){
        const all = this.fight.getAllUnits();
        this.fight.resolveAction(() => {
            for (const u of all) u.processAfterTurn(turn, ctx);
        });
    }    
}

// 梦幻西游
// 网游的常规流程, 指令全部下完,统一处理
export class FightLoopWest extends FightLoopOnline {    
    loopUnits: FightUnit[];
    private inputOrderReady = false;

    override sortUnitsByProcess(withInput = true) {
        this.inputOrderReady = withInput;
        return super.sortUnitsByProcess(withInput);
    }
    override async processOneTurn(turn: number){
        // 根据玩家速度来建立出手列表
        // 按出手列表顺序,依次处理
        let index = 0;
        let all = this.processUnits;
        this.inputOrderReady = true;
        // 指令收齐后按优先级、速度统一排序，先同步行动条，再逐个执行。
        all.sort((a, b) => this.compareProcessUnits(a, b));
        this.bcMsg(["sort", all.map(u => u.uid)]);
        while (all.length && !this.fight.isEnd()) {
            const u = all.shift();
            let ctx = u.processOneTurn(turn); 
            if (ctx){
                ctx.msgs.unshift(["actor", u.uid, u.getSpeed()]);
                this.bcMsg(ctx.msgs);
            }
            index++;
        }
    }

    override nextTurn() {
        const rt = super.nextTurn()
        this.bcMsg(["turn", this.fight.turn]);
        const all = this.sortUnitsByProcess(false); // 本轮尚未收指令，只发布速度预排序。
        this.bcMsg(["sort", all.map(u => u.uid)]);
        return rt;
    }    


    override start() {
        super.start();
        this.bcMsg(["start", this.fight.fid]);
        for (let s of [0,1]){
            const side = this.fight.getSide(s);
            this.bcMsg(["side", s, side.units.map(
                u => u.getUnitMsg())
            ]);
        }
        this.fight.offUnitEvent("speed", this.speedListener);
        this.fight.onUnitEvent("speed", this.speedListener);
    }

    private speedListener = (u: FightUnit) => this.onChangeSpeed(u);
    onChangeSpeed(u: FightUnit){
        const all = this.processUnits;
        if (all?.includes(u)){
            // this.processUnits 重新排序？
            all.sort((a, b) => this.compareProcessUnits(a, b, this.inputOrderReady));
            this.bcMsg(["sort", all.map(u => u.uid)]);
        }
    }

    override end() {
        this.fight.offUnitEvent("speed", this.speedListener);
        this.bcMsg(["end", this.fight.win]);
    }

    input = 0;
    inputed = 0;
    inputResolve: (value: number) => void = null;
    override async waitInput(turn: number,ctx: FightContex): Promise<number>{
        const all = this.fight.getAllUnits();
        let input = 0;
        this.fight.resolveAction(() => {
            for (const u of all) {
                u.inputStart(turn, ctx);
                if (u.needInput()) input++;
            }
        });
        this.input = this.fight.isEnd() ? 0 : input;
        this.inputed = 0;
        this.inputResolve = null;
        if (this.input == 0) return 1;
        const p = new Promise<number>((resolve) => {
            this.inputResolve = resolve;
        })
        const wait = this.fight.xls.waitInputSec || 30;
        const timer = new AbortController();
        const p2 = delay(wait*1000, 0, {signal: timer.signal});
        try {
            return await Promise.race([p, p2]);
        } finally {
            this.input = 0;
            this.inputResolve = null;
            timer.abort();
        }
    }

    onInput(id: number, input: FightInput){
        if (this.input == 0 || this.fight.isEnd() || input?.turn !== this.fight.turn) return;

        const unit = this.fight.getUnitById(id);
        if (unit && unit.needInput()){
            const isnull = (unit.input == null);
            if (unit.onInput(input) && unit.needInput()){
                if (unit.input && isnull){
                    this.inputed++;
                    if (this.inputed >= this.input){
                        this.input = 0;
                        this.inputResolve?.(1);
                    }
                }
                else if(!unit.input && !isnull){ //取消输入
                    this.inputed--;
                }
            }
        }
    }
}

// 烟雨江湖
// 自动打, 玩家只需要按大招
export class FightLoopYY extends FightLoopOnline {    
    override async processOneTurn(turn: number){}

    onInput(id: number, input: FightInput){}
}
