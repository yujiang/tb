import { strict as assert } from "node:assert";
import type { FightContex } from "../Fight";
import type { FightAttr } from "../FightAttr";
import type { FightUnit, UnitContextEventFunc } from "../Unit/FightUnit";
import type { FightUnitEvent } from "../Buffs/BuffDatas";

// 一个单位可绑定多条规则，彼此不抢占普通行动的输入决策。
export class FightRule {
    private owner: FightUnit | undefined;
    private listeners: { event: FightUnitEvent; listener: UnitContextEventFunc }[] = [];
    bind(unit: FightUnit) {
        assert.ok(!this.owner || this.owner === unit, "FightRule cannot be shared by different units");
        if (this.owner) return false;
        this.owner = unit;
        try { this.onAdded(unit); }
        catch (error) { this.unbind(unit); throw error; }
        return true;
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
    beforeTurn(unit: FightUnit, turn: number, ctx: FightContex) {}
}
