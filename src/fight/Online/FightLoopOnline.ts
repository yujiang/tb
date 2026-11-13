import { fightMsg } from "../Skills/NormalAttack";
import { FightLoop } from "../FightLoop";
import { FightUnit, sortByAttr } from "../Unit/FightUnit";
import { FightInput } from "../struct";
import { setTimeout as delay } from 'node:timers/promises';

export abstract class FightLoopOnline extends FightLoop {
    //回合前开始处理buff等
    processBeforeTurn(){
        const all = this.fight.getAllUnits();
        for (const u of all) {
            u.processBeforeTurn();
        }
    }

    //回合后主要处理死亡等            
    processAfterTurn(){
        const all = this.fight.getAllUnits();
        for (const u of all) {
            u.processAfterTurn();
        }
    }    
}

// 梦幻西游
// 网游的常规流程, 指令全部下完,统一处理
export class FightLoopWest extends FightLoopOnline {    
    loopUnits: FightUnit[];
    override async processOneTurn(){
        // 根据玩家速度来建立出手列表
        // 按出手列表顺序,依次处理
        const all = this.sortUnitsByProcess(); //但是如果有插队,降速会扰乱出手表?
        let index = 0;
        while (all.length) {
            const u = all.shift();
            let ctx = u.processOneTurn(); 
            if (ctx){
                ctx.msgs.unshift(["actor", u.uid, u.getSpeed()]);
                this.bcMsg(ctx.msgs);
            }
            index++;
        }
    }

    override nextTurn() {
        super.nextTurn()
        this.bcMsg(["turn", this.fight.turn]);
    }    

    bcMsg(msgs: fightMsg | fightMsg[]){
        // 暂时没有发消息, 直接打印
        console.log(msgs);
    }

    input = 0;
    inputed = 0;
    inputResolve: (value: number) => void = null;
    override async waitInput(): Promise<number>{
        const all = this.fight.getAllUnits();
        let input = 0;
        for (const u of all) {
            u.inputStart();
            if (u.needInput()){                
                input++;
            }
        }
        this.input = input;
        this.inputed = 0;
        this.inputResolve = null;
        if (input == 0) return 1;
        const p = new Promise((resolve, reject) => {
            this.inputResolve = resolve;
        })
        const wait = this.fight.xls.waitInputSec || 30;
        const p2 = delay(wait*1000, 0);
        return Promise.race([p, p2]) as Promise<number>;
    }

    onInput(id: number, input: FightInput){
        if (this.input == 0) return;

        const unit = this.fight.getUnitById(id);
        if (unit){
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
    override async processOneTurn(){}

    onInput(id: number, input: FightInput){}
}
