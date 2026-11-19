import { strict as assert } from "node:assert";
import type { FightContex } from "../Fight";
import type { FightAttr } from "../FightAttr";
import type { FightInput } from "../struct";
import type { FightUnit, UnitContextEventFunc } from "../Unit/FightUnit";
import type { FightUnitEvent } from "../Buffs/BuffDatas";

// AI 实例属于一个单位；负责输入决策、事件反应与自身临时属性，不执行回合调度。
export class FightAI {
    private owner: FightUnit | undefined;
    private listeners: { event: FightUnitEvent; listener: UnitContextEventFunc }[] = [];

    bind(unit: FightUnit) {
        assert.ok(!this.owner || this.owner === unit, "FightAI cannot be shared by different units");
        if (this.owner) return;
        this.owner = unit;
        this.onAdded(unit);
    }

    unbind(unit: FightUnit) {
        if (this.owner !== unit) return;
        for (const entry of this.listeners) unit.offContex(entry.event, entry.listener);
        this.listeners.length = 0;
        this.owner = undefined;
    }

    protected isBoundTo(unit: FightUnit) { return this.owner === unit; }
    protected listen(unit: FightUnit, event: FightUnitEvent, listener: UnitContextEventFunc, prior = 0) {
        unit.onContex(event, listener, prior);
        this.listeners.push({ event, listener });
    }
    protected onAdded(unit: FightUnit) {}
    startFight(unit: FightUnit) {}
    modifyAttr(unit: FightUnit, attr: FightAttr) {}

    // 在单位输入边界调用，不重复推进 inputTurn；派生 AI 可以返回技能、攻击或防御指令。
    waitInput(unit: FightUnit, turn: number, ctx: FightContex): FightInput | undefined {
        return undefined;
    }
}
