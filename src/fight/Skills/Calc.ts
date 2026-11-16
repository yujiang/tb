import { Fight } from "../Fight";
import { FinalAttack, BaseAttack } from "../FightAttr";
import { FightContex } from "./NormalAttack";

function calcFinal(a: FinalAttack, d: FinalAttack, d1: number) {
    if (d.immunity > 0){
        d1 -= (d.immunity );
    }
    if (d.immunityP && d.immunityP > 0){
        d1 -= d1 * (d.immunityP );
    }
    //const damage = Math.max(Math.floor(d1),1);
    return d1;
}

export function calcHurt(f: Fight, a: BaseAttack, d: BaseAttack, af: FinalAttack, df: FinalAttack, ctx: FightContex) {
    const d1 = calcHeal(f, a, d, ctx);
    const damage = calcFinal(af, df, d1);
    return Math.max(damage,1);
}

export function calcHeal(f: Fight, a: BaseAttack, d: BaseAttack, ctx: FightContex) : number {
    let d1 = a.attack - d.defend;    
    if (f.randomLess(a.crit - d.critAnit)) {
        d1 *= 1.5 + Math.max(a.critDeep, 1);
        ctx.effects.push("crit");
    }
    return d1;
}

// _a _b的字段必须匹配！
export function mergeTable(_a: Object , _b: Object) : any{
    const a = _a as Record<string, number>;
    const b = _b as Record<string, number>;
    const c: any = {}
    for (const k in b) {
        c[k] = (a[k] || 0) + b[k];
    }
    return c;
};