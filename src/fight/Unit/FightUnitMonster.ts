import { FightContex } from "../Fight";
import { FightCmdEnum, SkillCost } from "../struct";
import { FightUnit } from "./FightUnit";
import { FightAI } from "../AI/FightAI";
import { FightAttr } from "../FightAttr";
import { Fight } from "../Fight";
import { strict as assert } from "node:assert";


export class FightUnitMonster extends FightUnit {
    monsterId?: number; // 查表生成时保留模板 ID，与战斗 uid 分开
    private aiEntries: { ai: FightAI; prior: number; order: number }[] = [];
    private nextAIOrder = 0;
    get ais(): readonly FightAI[] { return this.aiEntries.map(entry => entry.ai); }
    // 兼容单 AI：读取优先级最前者，赋值时替换整个 AI 列表。
    get ai(): FightAI | undefined { return this.aiEntries?.[0]?.ai; }
    set ai(value: FightAI | undefined) {
        if ((!value && !this.aiEntries.length) || (this.aiEntries.length === 1 && this.ai === value)) return;
        value?.bind(this);
        for (const entry of this.aiEntries) if (entry.ai !== value) entry.ai.unbind(this);
        this.aiEntries = value ? [{ ai: value, prior: 0, order: this.nextAIOrder++ }] : [];
        this.calcAttr();
    }
    addAI(ai: FightAI, prior = 0): boolean {
        assert.ok(Number.isFinite(prior), "AI prior must be finite");
        if (this.aiEntries.some(entry => entry.ai === ai)) return false;
        ai.bind(this);
        this.aiEntries.push({ ai, prior, order: this.nextAIOrder++ });
        this.aiEntries.sort((a, b) => a.prior - b.prior || a.order - b.order);
        this.calcAttr();
        return true;
    }
    removeAI(ai: FightAI): boolean {
        const index = this.aiEntries.findIndex(entry => entry.ai === ai);
        if (index < 0) return false;
        this.aiEntries.splice(index, 1); ai.unbind(this); this.calcAttr(); return true;
    }
    override startFight(fight: Fight) {
        super.startFight(fight);
        for (const entry of [...this.aiEntries]) { entry.ai.bind(this); entry.ai.startFight(this); }
        if (this.aiEntries.length) this.calcAttr();
    }
    override endFight() { for (const entry of this.aiEntries) entry.ai.unbind(this); }
    protected override modifyAttr(attr: FightAttr) {
        for (const entry of [...(this.aiEntries ?? [])]) {
            if (this.aiEntries.includes(entry)) entry.ai.modifyAttr(this, attr);
        }
    }
    override isMonster() { return true; }

    inputSkill = 0;
    override inputStart(turn: number, ctx: FightContex) {
        super.inputStart(turn,ctx);
        if (this.aiEntries.length) {
            for (const entry of [...this.aiEntries]) {
                if (!this.aiEntries.includes(entry)) continue;
                const input = entry.ai.waitInput(this, turn, ctx);
                if (input) { this.input = { ...input }; return; }
            }
            this.input = { cmd: FightCmdEnum.attack };
            return;
        }
        // ai来做选择
        if (this.inputSkill) {
            this.input = { cmd: FightCmdEnum.skill, skill: this.inputSkill };
        }
        else if (this.skills.size > 0) {
            // 没有配置 AI 时保留原行为：选择已学技能中的首项。
            this.input = { cmd: FightCmdEnum.skill, skill: this.skills.keys().next().value };
        }
        else {
            this.input = { cmd: FightCmdEnum.none };
        }
    }

    // monster不消耗
    costSkill(cost: SkillCost) {
        return true;
    }
}
