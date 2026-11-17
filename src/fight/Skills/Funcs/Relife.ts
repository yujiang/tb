import { FightUnit } from "../../Unit/FightUnit";
import { FightSkill } from "../FightSkill";
import { FightContex } from "../../Fight";

export function relifeFunc(attacker: FightUnit, defender: FightUnit, skill:FightSkill, ctx: FightContex) {
    if (!defender.isDied()) {
        ctx.msgs.push(["无效", defender.uid])
        return false;
    }

    if (defender.inStatus("禁复活")) {
        ctx.msgs.push(["无法复活", defender.uid])
        return false;
    }

    const heal = Math.floor(skill.getHealRate() * defender.getHpMax());
    if (heal <= 0) {
        ctx.msgs.push(["无法复活", defender.uid]);
        return false;
    }
    defender.onRelife(attacker, "relife", ctx);
    defender.onHeal(attacker, "relife", heal, ctx, { revive: true });
    return true;
}
