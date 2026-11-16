import { strict as assert } from "node:assert";
import { Fight } from "../Fight";
import { FinalAttack, BaseAttack, FightAttr } from "../FightAttr";
import { FightUnit } from "../Unit/FightUnit";
import { FightContex } from "./NormalAttack";
import { FightStatic } from "../Buffs/StaticData";

const critBase = 1.5;

function finite(value: number, name: string): number {
    assert.ok(Number.isFinite(value), `${name} must be finite; received ${value}`);
    return value;
}

function calcFinal(a: FinalAttack, d: FinalAttack, d1: number) {
    if (d.immunity > 0){
        d1 -= d.immunity;
    }
    if (d.immunityP && d.immunityP > 0){
        d1 -= d1 * d.immunityP;
    }
    //const damage = Math.max(Math.floor(d1),1);
    return d1;
}

export function calcHurt(f: Fight, a: BaseAttack, d: BaseAttack, af: FinalAttack, df: FinalAttack, ctx: FightContex) {
    const d1 = calcAttack(f, a, d, ctx);
    return finite(Math.max(calcFinal(af, df, d1), 1), "damage");
}

export function clamp(v: number, min: number, max: number) {
    return Math.min(Math.max(v, min), max);
}

export function calcPoison(f: Fight, a: BaseAttack, d: BaseAttack, hp: number, ctx: FightContex) : number {
    const d1 = a.attack - d.defend;
    const d2 = clamp(a.hurt - d.hurtAnti, 0, 0.5);
    return finite(Math.max(d2 * hp + d1, 1), "poison damage");
}

export function calcAttack(f: Fight, a: BaseAttack, d: BaseAttack, ctx: FightContex) : number {
    let d1 = a.attack - d.defend;
    d1 += a.hurt - d.hurtAnti;
    d1 *= 1 + Math.max(a.hurtP - d.hurtPAnti, 0);

    if (d1 > 1 && f.randomLess(a.critP - d.critPAnit)) {
        d1 *= critBase + clamp(a.critDeep - d.critDeepAnit, 0, 1);
        ctx.effects.push("crit");
    }

    return finite(Math.max(d1, 1), "damage");
}

// _a _b的字段必须匹配！
export function mergeTable(_a: Object , _b: Object) : any{
    const a = _a as Record<string, number>;
    const b = _b as Record<string, number>;
    const c: any = {}
    for (const k in b) {
        c[k] = (a[k] || 0) + b[k];
    }
    assert.ok(Object.values(c).every(value => Number.isFinite(value)), "merged attributes must be finite");
    return c;
};

export function calcAttr(ori: FightAttr , objs: FightStatic[]) : FightAttr{
    // ???
}