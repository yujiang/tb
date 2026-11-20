// 核心的战斗对象
import { FightMap } from "./FightMap";
import { FightSide } from "./FightSide";
import { FightUnit, UnitEventFunc, sortByAttr } from "./Unit/FightUnit";
import { FightUnitEvent } from "./Buffs/BuffDatas";
import { EnemySide, FightCmdEnum, FightInput, FightSideEnum, FightResultEnum, TargetSelectEnum, fightMsg } from "./struct";
import { strict as assert } from "node:assert";
import EventEmitter from "node:events";
import { skillFunc } from "./Skills/SkillFuncType";
import { attackFunc } from "./Skills/Funcs/NormalAttack";
import { getBuffData } from "./Buffs/BuffDatas";
import { InsertActionPos } from "./struct";
import type { FightBuff } from "./Buffs/FightBuff";
import { FightSkill, getDefaultSkill } from "./Skills/FightSkill";

export type AllUnitType = [FightUnit[], FightUnit[]];

//表格化数据
export interface FightData {
    /** 全局回合上限，0 不设上限；正数允许完整执行该轮，轮末仍未分胜负则防守方胜。 */
    maxTurn: number;
    /** 西游整轮输入等待秒数，可用小数；0/缺省运行时回退30秒，PC 不限时、烟雨不等待收齐。 */
    waitInputSec: number;
    /** true 时默认普攻按对位查找，需先 createMap；false 时随机敌方存活单位，手动目标仍优先。 */
    duiwei: boolean;
    /** 保护指令施加的已注册 Buff ID，必须 class:protect；缺省保护指令不可用。 */
    protectBuff?: number;

    /** 缺省false；敌方最后一面盾打破且全体存活单位均破盾后，action 结束开放队伍共享一次大招，每回合最多一次。 */
    allShieldBreak?: boolean;
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

    killNum?: number; // 追击次数
    nextNum?: number; // 追击次数
    fbackNum?: number; // 反击次数
    dbackNum?: number; // 反震次数
    reactionSteps?: number; // 单次动作共享的结算预算，防止回调无限触发
    supporting?: boolean; // 协战及其后续反应链中不再召唤协战
}

export function initFightContex(f:Fight) : FightContex{
    return { fight: f, attack: null, defend: null, msgs: [], effects: []}
}

export class Fight{
    private actionInserter?: (unit: FightUnit, input: FightInput, pos: InsertActionPos, ctx?: FightContex) => boolean;
    setActionInserter(handler: NonNullable<typeof this.actionInserter>) { this.actionInserter = handler; }
    clearActionInserter(handler: typeof this.actionInserter) { if (this.actionInserter === handler) this.actionInserter = undefined; }
    insertAction(unit: FightUnit, input: FightInput, pos = InsertActionPos.first, ctx?: FightContex): boolean {
        return this.actionInserter?.(unit, { ...input }, pos, ctx) ?? false;
    }
    fid: number;
    // seed为随机数种子
    seed: number;
    xls: FightData;

    constructor(id: number, data: FightData, seed = 0) {
        this.fid = id;
        this.xls = data;
        this.seed = seed;
        assert.ok(Number.isSafeInteger(seed), "seed must be a safe integer");
        this.randomState = seed >>> 0;
        this.onUnitEvent("break", (unit, ctx, _attacker, allBroken) => this.onShieldBreak(unit, ctx, allBroken));
    }

    turn = 0; // 当前回合数
    afterTurnStarted = 0; // 已开始处理的回合后边界；其中新增的 Buff 留到下一边界
    nextTurn() {
        this.turn++;
        return this.turn;
    }

    finishTurn() {
        this.checkOutcome();
        if (!this.isEnd() && this.xls.maxTurn && this.turn >= this.xls.maxTurn) {
            // 超时防守获胜！
            this.win = FightSideEnum.defend;
        }
    }

    win: number = -1;
    isEnd() {
        return this.win >= 0;
    }
    onDie(unit: FightUnit) {
        if (this.actionDepth === 0) this.checkOutcome();
    }

    checkOutcome() {
        if (this.isEnd() || !this.AllUnits) return;
        const alive = this.AllUnits.map(units => units.some(u => !u.isDied()));
        if (!alive[0] && !alive[1]) this.win = FightResultEnum.draw;
        else if (!alive[0]) this.win = FightSideEnum.defend;
        else if (!alive[1]) this.win = FightSideEnum.attack;
    }

    private actionDepth = 0;
    private afterActionTasks: (() => void)[] = [];
    private ultimateReady: [boolean, boolean] = [false, false];
    private ultimateUsedTurn: [number, number] = [-1, -1];
    private ultimateGrantTurn: [number, number] = [-1, -1];
    private ultimateBreak: [boolean, boolean] = [false, false];
    private ultimateContext: FightContex | undefined;
    private ultimateCaster: FightUnit | undefined;

    resetUltimate() {
        this.ultimateReady = [false, false];
        this.ultimateUsedTurn = [-1, -1];
        this.ultimateGrantTurn = [-1, -1];
        this.ultimateBreak = [false, false];
        this.ultimateContext = undefined;
    }

    hasUltimateChance(side: FightSideEnum): boolean {
        return !!this.ultimateReady[side] && this.ultimateUsedTurn[side] !== this.turn && !this.isEnd();
    }

    // 最后一面盾被打破的时刻记录事件；行动完成后再开放输入，而非持续轮询全破状态。
    isAllShieldBroken(side: FightSideEnum): boolean {
        const units = this.getSideUnits(side).filter(unit => !unit.isDied());
        return units.length > 0 && units.every(unit => unit.isMonster() && unit.attr.shield === 0);
    }

    onShieldBreak(unit: FightUnit, ctx: FightContex, allBroken = this.isAllShieldBroken(unit.side)) {
        if (!this.xls.allShieldBreak) return;
        if (allBroken) {
            this.ultimateBreak[EnemySide(unit.side)] = true;
            this.ultimateContext = ctx;
        }
    }

    // 反应链内先登记，最外层完成死亡、自动复活与胜负结算后统一发布事件。
    updateUltimate(ctx: FightContex) {
        if (!this.xls.allShieldBreak && !this.ultimateReady.some(Boolean)) return;
        if (this.actionDepth > 0) { this.ultimateContext = ctx; return; }
        const broken = this.ultimateBreak;
        this.ultimateBreak = [false, false];
        this.ultimateContext = undefined;
        for (const side of [FightSideEnum.attack, FightSideEnum.defend]) {
            let ready = this.ultimateReady[side];
            if (!this.xls.allShieldBreak || this.isEnd() || this.ultimateUsedTurn[side] === this.turn) ready = false;
            else if (broken[side] && this.ultimateGrantTurn[side] !== this.turn) {
                ready = true;
                this.ultimateGrantTurn[side] = this.turn;
            }
            if (ready !== this.ultimateReady[side]) {
                this.ultimateReady[side] = ready;
                ctx.msgs.push(["ultimateReady", side, ready]);
            }
        }
    }

    checkUltimate(unit: FightUnit, input: FightInput): boolean {
        if (this.actionDepth > 0) { unit.hintClient("当前行动尚未结束"); return false; }
        if (!this.getAllUnits().includes(unit) || !this.hasUltimateChance(unit.side)) {
            unit.hintClient("当前没有大招机会"); return false;
        }
        if (!unit.getUltimateSkill()) { unit.hintClient("未装备可用大招"); return false; }
        if (input?.cmd !== FightCmdEnum.skill || (input.skill !== undefined && input.skill !== unit.ultimateSkill)) {
            unit.hintClient("大招技能不匹配"); return false;
        }
        return this.checkPC(unit, { ...input, skill: unit.ultimateSkill }, true);
    }

    skipUltimate(side: FightSideEnum, ctx: FightContex) {
        this.ultimateUsedTurn[side] = this.turn;
        this.updateUltimate(ctx);
    }

    processUltimate(unit: FightUnit, input: FightInput): FightContex | undefined {
        if (!this.checkUltimate(unit, input)) return undefined;
        const prepared = this.preparePCInput(unit, { ...input, skill: unit.ultimateSkill });
        if (!prepared) return undefined;
        return this.resolveAction(() => {
            const previous = this.ultimateUsedTurn[unit.side];
            // 先占用整队机会，避免伤害回调重入施放；普通技能入口处理费用、CD 与反应链。
            this.ultimateUsedTurn[unit.side] = this.turn;
            const caster = this.ultimateCaster;
            let ctx: FightContex;
            this.ultimateCaster = unit;
            try { ctx = this.processUnit(unit, prepared); }
            finally { this.ultimateCaster = caster; }
            if (!ctx) { this.ultimateUsedTurn[unit.side] = previous; return undefined; }
            this.updateUltimate(ctx);
            return ctx;
        });
    }

    // 完整动作的反应链结束后、胜负检查前执行；不在动作中时直接执行。
    afterAction(run: () => void) {
        if (this.actionDepth === 0) run();
        else this.afterActionTasks.push(run);
    }

    // 接管run的开始和退出
    resolveAction<T>(run: () => T): T {
        if (this.actionDepth >= 64) throw new Error("Reaction limit exceeded (64 nested action scopes)");
        this.actionDepth++;
        let completed = false;
        try {
            const result = run();
            if (this.actionDepth === 1) {
                // 保持动作作用域，收尾回调中的死亡及嵌套动作也不能提前判断胜负。
                let index = 0;
                while (index < this.afterActionTasks.length) {
                    if (index >= 64) throw new Error("Reaction limit exceeded (64 after-action effects)");
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
                const ultimate = this.ultimateContext;
                this.ultimateContext = undefined;
                if (completed) {
                    this.checkOutcome();
                    if (ultimate) this.updateUltimate(ultimate);
                } else this.ultimateBreak = [false, false];
            }
        }
    }

    // ***units start
    Sides: FightSide[];
    getSide(side: FightSideEnum) : FightSide {
        return this.Sides[side];
    }

    AllUnits: AllUnitType;
    createSide(attack: FightSide, des: FightSide) {
        attack.clearContributions(); des.clearContributions();
        this.Sides = [attack, des];
        this.AllUnits = [attack.units, des.units];
        //console.log("AllUnits", this.fid, "attack", attack.units.length, "des", des.units.length)
        for (const u of attack.units) {
            u.setFight(this, FightSideEnum.attack);
        }
        for (const u of des.units) {
            u.setFight(this, FightSideEnum.defend);
        }
    }

    getUnitById(id: number) : FightUnit {
        return this.getAllUnits().find(u => u.uid == id)!;
    }


    getSideUnits(side: FightSideEnum) : FightUnit[] {
        return this.AllUnits[side];
    }
    getSideUnitsCopy(side: FightSideEnum) : FightUnit[] {
        return [...this.AllUnits[side]];
    }
    getAllUnits() : FightUnit[] {
        return this.AllUnits.flat();
    }
    getAllUser() : FightUnit[] {
        return this.getAllUnits().filter(u => u.isUser());
    }

    getSideUnitsBySkill(side: FightSideEnum, skill:FightSkill, except:FightUnit=null) : FightUnit[] {
        return this.AllUnits[side].filter(u => skill.canTarget(u) && u!==except);
    }

    getSideUnitsByPos(side:FightSideEnum, poses: number[]) : FightUnit[] {
        return this.getSideUnits(side).filter(u => poses.includes(u.pos));
    }
    getSideUnitByPos(side:FightSideEnum, pos: number) : FightUnit {
        return this.getSideUnits(side).find(u => u.pos == pos)!;
    }
    // ***units end


    // ***map start
    map: FightMap;
    createMap(nx: number, ny: number) {
        this.map = new FightMap(this, nx, ny);
    }

    // 选择主目标 当num=1
    // 主目标只有一个，通常的做法是先打主目标，命中之后，才产生后续的子目标！
    selectMainTarget(attack: FightUnit, skill:FightSkill) : FightUnit {
        assert(!attack?.isDied());

        const sel = skill.getSel();
        const taunt = this.getTauntTarget(attack, skill);
        if (taunt) return taunt;

        if (sel.target == TargetSelectEnum.duiwei) {
            return this.map.findDuiwei(attack, skill);
        }
        if (sel.target == TargetSelectEnum.self) {
            return skill.canTarget(attack) ? attack : undefined;
        }
        
        // des_or_random
        const side = sel.target == TargetSelectEnum.friend ? attack.side : EnemySide(attack.side);
        //const except = sel.includeAttack ? null : attack;
        const units = this.getSideUnitsBySkill(side, skill);
        if (!units.length) return null;
        if (sel.sortAttr){
            sortByAttr(units, sel.sortAttr, sel.sortDescend);
            return units[0]; //最小值？
        }
        else {
            return this.randArray(units);
        }
    }
    
    // 群体选择不经过主目标，也不受嘲讽重定向；人数足够时保持阵营顺序。
    // 群攻只有TargetSelectEnum.friend,emeny两种
    selectGroupTargets(attack: FightUnit, skill: FightSkill): FightUnit[] {
        const sel = skill.getSel();
        const side = sel.target == TargetSelectEnum.friend ? attack.side : EnemySide(attack.side);
        const units = this.getSideUnitsBySkill(side, skill);
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
        if (sel.shape === undefined) return this.selectSpreadTargetsNum(main, skill, sel.num ?? 1);
        return this.map.selectTargetsShape(main, sel.shape)
            .filter(target => target !== main && skill.canTarget(target));
    }
    // ***map end

    randomEnemyAlive(side: number) {
        const list = this.getSideUnitsBySkill(EnemySide(side), getDefaultSkill());
        if (!list.length) return;
        return this.randArray(list);
    }

    getDefaultEnemy(unit: FightUnit) {
        const taunt = this.getTauntTarget(unit, getDefaultSkill());
        if (taunt) return taunt;
        const skill = getDefaultSkill({ target: this.xls.duiwei ? TargetSelectEnum.duiwei : TargetSelectEnum.enmey });
        return this.selectMainTarget(unit, skill);
    }

    // 目标资格由技能判断，阵营和对位规则由战斗判断。
    isLegalTarget(unit: FightUnit, target: FightUnit, skill: FightSkill): boolean {
        if (!target || !skill.canTarget(target)) return false;
        const sel = skill.getSel();
        if (sel.target === TargetSelectEnum.self) return target === unit;
        const side = sel.target === TargetSelectEnum.friend ? unit.side : EnemySide(unit.side);
        if (target.side !== side) return false;
        if (sel.target === TargetSelectEnum.duiwei) return this.map?.findDuiwei(unit, skill) === target;
        return true;
    }

    getTauntTarget(unit: FightUnit, skill: FightSkill): FightUnit | undefined {
        return this.getTauntBuff(unit, skill)?.getTauntTarget();
    }

    // 返回实际生效的实例，计次时不会同时消耗其他嘲讽。查询本身没有副作用。
    getTauntBuff(unit: FightUnit, skill: FightSkill): FightBuff | undefined {
        const sel = skill.getSel();
        if ((sel.num ?? 1) > 1) return undefined;
        if (sel.target !== TargetSelectEnum.enmey && sel.target !== TargetSelectEnum.duiwei) return undefined;
        // Map 保持添加顺序，稳定排序使同优先级按 Buff 实例注册顺序处理。
        const buffs = [...unit.buffs.values()].sort((a, b) => (a.getXls().prior ?? 0) - (b.getXls().prior ?? 0));
        for (const buff of buffs) {
            const target = buff.getTauntTarget();
            if (target && !target.isDied() && target.fight === this && this.getAllUnits().includes(target) &&
                this.isLegalTarget(unit, target, skill)) return buff;
        }
        return undefined;
    }

    // 网游先收指令再行动：允许死亡单位输入、普攻守尸，目标与资源留到执行时复验。
    checkOnline(unit: FightUnit, input: FightInput): boolean {
        return this.validateInput(unit, input);
    }

    // PC 立即行动：自身可行动、费用足够、目标能接受效果；检查不抽样、不扣费。
    checkPC(unit: FightUnit, input: FightInput, ultimate = false): boolean {
        if (unit.isDied()) { unit.hintClient("自身已死亡，无法行动"); return false; }
        if (unit.isForbid("action")) { unit.hintClient("当前无法行动"); return false; }
        if (!this.validateInput(unit, input, ultimate)) return false;
        const skill = input.cmd === FightCmdEnum.skill ? unit.findSkill(input.skill) : undefined;
        const cost = skill?.getCost();
        if (cost && !unit.canCost(cost)) return false;
        if (skill?.getFunc() === "normal" && unit.isForbid("attack")) {
            unit.hintClient("当前无法普通攻击");
            return false;
        }
        if (input.cmd !== FightCmdEnum.attack && input.cmd !== FightCmdEnum.none && !skill) return true;
        return this.getPCTargets(unit, input) !== undefined;
    }

    // checkPC 通过后再选一次主目标，保存副本；检查失败不会消耗选目标的随机数。
    preparePCInput(unit: FightUnit, input: FightInput): FightInput | undefined {
        const attack = input.cmd === FightCmdEnum.attack || input.cmd === FightCmdEnum.none;
        const skill = input.cmd === FightCmdEnum.skill ? unit.findSkill(input.skill) : undefined;
        if (!attack && !skill) return { ...input };
        const targets = this.getPCTargets(unit, input);
        if (!targets) return undefined;
        if ((skill ?? (attack ? unit.getAttackSkill() : undefined))?.isMulti()) return { ...input };
        const sel = skill ? skill.getSel() : { target: this.xls.duiwei ? TargetSelectEnum.duiwei : TargetSelectEnum.enmey };
        const taunt = this.getTauntTarget(unit, skill ?? getDefaultSkill(sel));
        if (sel.sortAttr) sortByAttr(targets, sel.sortAttr, sel.sortDescend);
        const fixed = input.target !== undefined || !!taunt || sel.target === TargetSelectEnum.self ||
            sel.target === TargetSelectEnum.duiwei || !!sel.sortAttr;
        const target = taunt ?? (fixed ? targets[0] : this.randArray(targets));
        return { ...input, target: target.uid };
    }

    private getPCTargets(unit: FightUnit, input: FightInput): FightUnit[] | undefined {
        const attack = input.cmd === FightCmdEnum.attack || input.cmd === FightCmdEnum.none;
        const equipped = attack ? unit.getAttackSkill() : undefined;
        const skill = (input.cmd === FightCmdEnum.skill ? unit.findSkill(input.skill) : equipped?.isMulti() ? equipped : undefined)
            ?? getDefaultSkill({ target: input.target === undefined && this.xls.duiwei ? TargetSelectEnum.duiwei : TargetSelectEnum.enmey });
        const explicit = input.target !== undefined ? this.getUnitById(input.target) : undefined;
        if (input.target !== undefined && !explicit) { unit.hintClient("目标不存在"); return undefined; }
        if (attack && explicit?.isDied()) { unit.hintClient("目标已死亡"); return undefined; }
        const candidates = explicit && !skill.isMulti() ? [explicit] : this.getAllUnits();
        let hint: string | undefined;
        const targets = candidates.filter(target => {
            if (!skill.canTarget(target)) {
                hint ??= skill.getTargetHint(target);
                return false;
            }
            return this.isLegalTarget(unit, target, skill);
        });
        if (!targets.length) { unit.hintClient(hint ?? "没有可用目标"); return undefined; }
        return targets;
    }

    // 两种输入共用的基础合法性检查，保留原接口供本地调用及执行复验使用。
    validateInput(unit: FightUnit, input: FightInput, ultimate = false): boolean {
        if (!input || this.isEnd() || !this.getAllUnits().includes(unit)) return false;
        if (![FightCmdEnum.none, FightCmdEnum.attack, FightCmdEnum.defend, FightCmdEnum.skill, FightCmdEnum.cancel, FightCmdEnum.protect].includes(input.cmd)) return false;
        // 普攻可以显式指定死亡敌人守尸；自动选目标仍只选存活敌人。
        let skill = getDefaultSkill();
        let guardCorpse = input.cmd === FightCmdEnum.attack || input.cmd === FightCmdEnum.none;
        if (input.cmd === FightCmdEnum.protect) {
            if (input.target === undefined || input.target === unit.uid || getBuffData(this.xls.protectBuff)?.class !== "protect") return false;
            skill = getDefaultSkill({ target: TargetSelectEnum.friend });
        } else if (input.cmd === FightCmdEnum.skill) {
            skill = unit.findSkill(input.skill);
            if (!skill) {
                unit.hintClient("未学会该技能");
                return false;
            }
            if (input.skill === unit.ultimateSkill && !ultimate) {
                unit.hintClient("大招需要通过独立大招输入施放");
                return false;
            }
            if (unit.isForbid("skill")) {
                unit.hintClient("当前无法施放技能");
                return false;
            }
            const cd = unit.getSkillCd(input.skill);
            if (cd > 0) {
                unit.hintClient(`[${skill.getName()}]冷却中，还需 ${cd} 回合`);
                return false;
            }
            if (!skill.getSel()) return false;
        } else if ((input.cmd === FightCmdEnum.attack || input.cmd === FightCmdEnum.none) && unit.isForbid("attack")) {
            unit.hintClient("当前无法普通攻击");
            return false;
        }
        if ((input.cmd === FightCmdEnum.attack || input.cmd === FightCmdEnum.none) && unit.getAttackSkill()?.isMulti()) {
            skill = unit.getAttackSkill();
            guardCorpse = false;
        }
        if (input.target !== undefined) {
            const target = this.getUnitById(input.target);
            if (!Number.isSafeInteger(input.target) || !target) {
                unit.hintClient("目标不存在");
                return false;
            }
            // 普攻手动守尸只检查敌方身份，自动选择和技能仍由 canTarget 过滤。
            if (!(guardCorpse && target.isDied() && target.side === EnemySide(unit.side)) &&
                !this.isLegalTarget(unit, target, skill)) {
                unit.hintClient(skill.getTargetHint(target) ?? "目标不符合要求");
                return false;
            }
        }
        return true;
    }

    // 提交后阵营、生命状态和封印都可能变化，执行时重新校验。
    processUnit(unit: FightUnit, input: FightInput) : FightContex{
        // 收指令时允许死亡，真正轮到行动时必须已经复活。
        if (this.isEnd() || !this.getAllUnits().includes(unit)) return;
        if (unit.isDied()) {
            unit.hintClient("自身已死亡，无法行动");
            return;
        }
        if (unit.isForbid("action")) {
            const block = unit.getActionBlockBuff();
            unit.hintClient("当前无法行动");
            return { fight: this, attack: unit, defend: null, effects: [],
                msgs: [block ? ["skipAction", unit.uid, block.getId()] :
                    ["skipAction", unit.uid, null, unit.getActionBlockStatus()]] };
        }
        if (!this.validateInput(unit, input, this.ultimateCaster === unit)) return;
        return this.resolveAction(() => this.executeUnit(unit, input));
    }

    private executeUnit(unit: FightUnit, input: FightInput): FightContex {
        let cmd = input.cmd;
        let tid = input.target;

        let des = tid !== undefined ? this.getUnitById(tid) : undefined;
        // 预处理,没有来得及发指令的单位.
        if (cmd == FightCmdEnum.none){
            cmd = FightCmdEnum.attack;
            // des = this.getDefaultEnemy(unit)
        }

        if (cmd === FightCmdEnum.defend){
            unit.doDefend();
            return;
        }

        const actionSkill = cmd === FightCmdEnum.skill ? unit.findSkill(input.skill) :
            cmd === FightCmdEnum.attack ? unit.getAttackSkill() : undefined;
        if (actionSkill?.isMulti()) {
            const ctx: FightContex = { fight: this, attack: unit, defend: null, msgs: [], effects: [] };
            if (cmd === FightCmdEnum.skill) skillFunc(unit, null, input.skill, ctx);
            else attackFunc(unit, null, ctx);
            return ctx;
        }

        // 不改写提交的 input，只在实际执行时按当前有效嘲讽覆盖主目标。
        if (cmd === FightCmdEnum.attack || cmd === FightCmdEnum.skill) {
            const skill = cmd === FightCmdEnum.skill ? unit.findSkill(input.skill) : getDefaultSkill();
            des = this.getTauntTarget(unit, skill) ?? des;
        }

        if (!des) {
            if (cmd == FightCmdEnum.attack){
                des = this.getDefaultEnemy(unit);
            }
            else if (cmd == FightCmdEnum.skill){
                const skill = unit.findSkill(input.skill);
                if (skill){
                    des = this.selectMainTarget(unit, skill);
                }
            }
        }
        if (!des) {
            unit.hintClient("没有可用目标");
            return;
        }

        const ctx: FightContex = { fight: this, attack: unit, defend: des, msgs: [], effects: []};

        if (cmd === FightCmdEnum.protect) {
            ctx.msgs.push(["protect", unit.uid, des.uid]);
            des.addBuff(unit, "protect", this.xls.protectBuff, 1, ctx);
            return ctx;
        }

        if (cmd == FightCmdEnum.attack){
            if (des.isDied()) {
                unit.hintClient("目标已死亡");
                return;
            }
            if (unit.isForbid("attack")) {
                unit.hintClient("当前无法普通攻击");
                return;
            }
            attackFunc(unit,des,ctx);
            return ctx;
        }

        if (cmd == FightCmdEnum.skill){
            if (unit.isForbid("skill")) return;              
            skillFunc(unit,des,input.skill,ctx);
            return ctx;
        }
    }


    // 保持随机数, 以便重建战斗保持一致~
    randArray<T>(items: T[]) : T {
        return items[Math.floor(this.random() * items.length)];
    }

    // 洗牌打乱
    shuffleArray<T>(items: T[]) : T[] {
        for (let i = items.length - 1; i > 0; i--) {
            const j = Math.floor(this.random() * (i + 1));
            [items[i], items[j]] = [items[j], items[i]];
        }
        return items;
    }

    private randomState: number;
    // Mulberry32 v1；包括零种子，固定使用 uint32 状态。
    random() {
        this.randomState = (this.randomState + 0x6D2B79F5) >>> 0;
        let value = this.randomState;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 0x100000000;
    }
    randomGreat(g: number){
        if (g >= 1) return false;
        if (g <= 0) return true;
        return this.random() >= g;
    }
    randomLess(g: number){
        if (g >= 1) return true;
        if (g <= 0) return false;
        return this.random() <= g;
    }

    // ***event start
    private emitUnit = new EventEmitter();
    emitUnitEvent(event: FightUnitEvent,unit: FightUnit, ...args: any[]){
        this.emitUnit.emit(event, unit, ...args);
    }
    onUnitEvent(event: FightUnitEvent, func: UnitEventFunc){
        this.emitUnit.on(event, func);
    }
    offUnitEvent(event: FightUnitEvent, func: UnitEventFunc){
        this.emitUnit.off(event, func);
    }
    
}
