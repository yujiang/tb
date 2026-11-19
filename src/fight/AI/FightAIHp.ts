import { strict as assert } from "node:assert";
import { FightAI } from "./FightAI";
import type { FightContex } from "../Fight";
import type { FightAttr } from "../FightAttr";
import type { FightUnit } from "../Unit/FightUnit";

export interface HpAxisLine {
    hp: number;         // 当前生命比例 <= hp 时触发，例如 0.7
    attackRate: number; // 攻击力增量比例，例如 0.2 表示增加 20%，各条相加
}

export class FightAIHp extends FightAI {
    private lines: HpAxisLine[];
    private reached = new Set<number>();
    private attackBonus = 0;

    constructor(lines: HpAxisLine[]) {
        super();
        for (const line of lines) {
            assert.ok(Number.isFinite(line.hp) && line.hp > 0 && line.hp <= 1, "hp must be in (0, 1]");
            assert.ok(Number.isFinite(line.attackRate) && line.attackRate >= 0, "attackRate must be finite and nonnegative");
        }
        this.lines = lines.map(line => ({ ...line }));
    }

    protected override onAdded(unit: FightUnit) {
        this.startFight(unit);
        this.listen(unit, "hp", (owner, ctx) => {
            if (this.checkLines(owner, ctx)) owner.calcAttr();
        });
    }

    override startFight(unit: FightUnit) {
        this.reached.clear(); this.attackBonus = 0;
        this.checkLines(unit);
    }

    private checkLines(unit: FightUnit, ctx?: FightContex): boolean {
        if (unit.getHpMax() <= 0) return false;
        let changed = false;
        this.lines.forEach((line, index) => {
            if (!this.reached.has(index) && unit.getHp() / unit.getHpMax() <= line.hp) {
                this.reached.add(index); this.attackBonus += line.attackRate; changed = true;
                ctx?.msgs.push(["aiHp", unit.uid, line.hp, this.attackBonus]);
            }
        });
        return changed;
    }

    override modifyAttr(unit: FightUnit, attr: FightAttr) {
        for (const group of [attr.physic, attr.magic]) {
            for (const name of ["base", "next", "kill", "spread", "fback"] as const) {
                group[name].attack *= 1 + this.attackBonus;
            }
        }
    }
}
