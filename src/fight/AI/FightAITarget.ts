import { strict as assert } from "node:assert";
import { FightAI } from "./FightAI";
import type { AIData } from "./AIDatas";
import type { FightContex } from "../Fight";
import type { FightUnit } from "../Unit/FightUnit";
import { CarerrEnum } from "../FightAttr";
import { getDefaultSkill } from "../Skills/FightSkill";
import type { FightSkill } from "../Skills/FightSkill";
import { EnemySide, FightCmdEnum, FightInput } from "../struct";

// 选择方法与使用的技能独立配置；只决定普通行动，技能结算与嘲讽仍走公共流程。
export class FightAITarget extends FightAI {
    constructor(xls: AIData) {
        super(xls);
        if (xls.skill !== undefined) {
            assert.ok(Number.isSafeInteger(xls.skill) && xls.skill > 0, "AI skill must be a positive safe integer");
        }
    }

    override waitInput(unit: FightUnit, turn: number, ctx: FightContex): FightInput | undefined {
        const id = this.xls.skill;
        const skill = id !== undefined ? unit.findSkill(id) : unit.getAttackSkill() ?? getDefaultSkill();
        const cmd = id !== undefined ? FightCmdEnum.skill : FightCmdEnum.attack;
        if (!skill || skill.isMulti() || unit.isDied() || unit.isForbid("action") ||
            unit.isForbid(id !== undefined ? "skill" : "attack")) return undefined;
        if (id !== undefined && (id === unit.ultimateSkill || unit.getSkillCd(id) > 0)) return undefined;
        if (skill.getFunc() === "normal" && unit.isForbid("attack")) return undefined;
        if (id !== undefined && skill.getCost() && !unit.canCost(skill.getCost())) return undefined;

        const target = this.findTarget(unit, skill, ctx);
        if (!target) return undefined;
        const input: FightInput = id !== undefined ? { cmd, skill: id, target: target.uid } : { cmd, target: target.uid };
        return ctx.fight.checkPC(unit, input) ? input : undefined;
    }

    // 只选择符合本次技能资格的目标；不提交指令、不扣资源，派生AI可单独覆盖选人规则。
    protected findTarget(unit: FightUnit, skill: FightSkill, ctx: FightContex): FightUnit | undefined {
        const valid = (target: FightUnit) => target && target.side === EnemySide(unit.side) &&
            ctx.fight.isLegalTarget(unit, target, skill);
        let contributions: ReadonlyMap<number, number>;
        switch (this.xls.type) {
            case "rearDoctor": {
                const map = ctx.fight.map;
                if (!map) return undefined;
                const doctors = ctx.fight.getSideUnits(EnemySide(unit.side)).filter(candidate => valid(candidate) &&
                    candidate.attr.career === CarerrEnum.医生 && map.isBackRow(candidate.pos));
                if (!doctors.length) return undefined;
                return doctors.length === 1 ? doctors[0] : ctx.fight.randArray(doctors);
            }
            case "topThreat":
                contributions = unit.enemyHurt;
                break;
            case "topHealer":
                contributions = ctx.fight.getSide(EnemySide(unit.side)).heal;
                break;
            default:
                return undefined;
        }
        // 同分保留首次贡献的记录顺序，不抽样；先跳过无效者，再取最高有效贡献者。
        const ranked = [...contributions].filter(([, value]) => Number.isFinite(value) && value > 0)
            .sort((a, b) => b[1] - a[1]);
        for (const [uid] of ranked) {
            const candidate = ctx.fight.getUnitById(uid);
            if (valid(candidate)) return candidate;
        }
        return undefined;
    }
}
