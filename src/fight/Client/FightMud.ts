// 像mud一样输出战斗表现，主要是文字描绘
// 张三丰鹤发童颜宛若出尘仙人，一招破空而出。
// 李虎叫一声来的好，反掌欲接，却被结结实实一掌打中胸口，哇的一口血吐了出来，李虎受了轻伤。

import { FightReport } from "./FightReport";
import { fightMsg } from "../struct";
import { getSkillData } from "../Skills/SkillDatas";
import { FightMudTables, MudCharacter, MudTexts, resolveMudText } from "./FightMudDatas";

interface MudContext {
    actor?: number;
    target: number;
    subject: number;
    skill?: number;
    damage?: number;
    heal?: number;
    hp?: number;
    critical?: boolean;
}

export class FightMud extends FightReport{
    private pending: MudContext[] = [];
    private fatal = new Map<number, MudContext>();

    constructor(output: (line: string) => void = line => console.log(line), color = true,
        private readonly tables: FightMudTables = {}) {
        super(output, color);
    }

    private profile(id?: number): MudCharacter {
        const character = id === undefined ? undefined : this.client.getUnitById(id)?.display.character;
        return character === undefined ? {} : this.tables.xlsCharacter?.[character] ?? {};
    }

    private template(field: keyof MudTexts, ctx: MudContext, prefix = ""): boolean {
        const character = this.client.getUnitById(ctx.subject)?.display.character;
        const text = resolveMudText(this.tables, field, character, ctx.skill);
        if (!text) return false;
        const unit = this.client.getUnitById(ctx.target);
        const values: Record<string, string> = {
            人物: this.name(ctx.subject), 施放者: ctx.actor === undefined ? "" : this.name(ctx.actor),
            目标: this.name(ctx.target), 技能: ctx.skill === undefined ? "" : this.skillName(ctx.skill),
            伤害: this.paint(String(ctx.damage ?? 0), ctx.critical ? "orange" : "red"),
            治疗: this.paint(String(ctx.heal ?? 0), "green"),
            生命: String(ctx.hp ?? unit?.point.hp ?? "未知"), 最大生命: String(unit?.point.hpMax ?? "未知"),
            未命中: this.paint("未命中", "blue"),
        };
        for (const [label, id] of [["", ctx.subject], ["施放者", ctx.actor], ["目标", ctx.target]] as const) {
            const profile = this.profile(id);
            for (const key of ["武功", "sex", "年纪", "相貌", "兵器", "门派"] as const)
                values[label + key] = profile[key] ?? "";
            values[label + "性别"] = profile.sex ?? "";
        }
        const line = prefix + text.replace(/\{([^{}]+)\}/g, (placeholder, key: string) => values[key] ?? placeholder);
        this.write(line, field === "死亡文本" ? "darkRed" : field === "复活文本" ? "brightGreen" : undefined);
        return true;
    }

    protected override describe(msg: fightMsg): boolean {
        switch (msg[0]) {
            case "start":
                this.pending.length = 0;
                this.fatal.clear();
                return false;
            case "turn":
            case "end":
                this.pending.length = 0;
                this.fatal.clear();
                return false;
            case "side": {
                const side = msg[1] === 0 ? "攻击方" : "防守方";
                const units = this.client.sides[msg[1] as 0 | 1];
                this.write(`${side}：${units.map(unit => this.name(unit.uid)).join("、") || "无人应战"}。`);
                for (const unit of units) {
                    for (const buff of unit.buffs) this.write(`${this.name(unit.uid)}身上带着${this.buffName(buff[0])}。`);
                }
                return true;
            }
            case "sort":
                // 行动条状态仍由父类更新，文字叙述按实际行动顺序展开。
                return true;
            case "actor":
                this.pending.length = 0;
                this.write("");
                this.write(`${this.name(msg[1])}凝神应战，准备出手。`);
                return true;
            case "skill": {
                const ctx: MudContext = { actor: msg[2], target: msg[3], subject: msg[2], skill: msg[1] };
                this.pending.push(ctx);
                if (this.template("出手文本", ctx, this.reaction(msg[4]))) return true;
                const move = msg[4] === "combo" ? "招式未收，紧接着使出" :
                    msg[4] === "next" ? "攻势不歇，追加一式" :
                    msg[4] === "kill" ? "乘胜追击，使出" :
                    msg[4] === "fback" ? "窥见破绽，反手使出" : msg[4] === "support" ? "应声相助，使出" : "凝神蓄势，使出";
                const force = getSkillData(msg[1])?.magic ? "劲气破空，直取" : "攻向";
                this.write(`${this.reaction(msg[4])}${this.name(msg[2])}${move}${this.skillName(msg[1])}，${force}${this.name(msg[3])}！`);
                return true;
            }
            case "miss": {
                if (this.template("未命中文本", { actor: msg[2], target: msg[3], subject: msg[2], skill: msg[1] },
                    this.reaction(msg[4]))) return true;
                const prefix = `${this.reaction(msg[4])}${this.name(msg[2])}使出${this.skillName(msg[1])}，${this.name(msg[3])}闪身避开，`;
                this.write(`${prefix}未命中。`, "blue", { start: prefix.length, length: 3 });
                return true;
            }
            case "skillFailed":
                this.write(`${this.name(msg[1])}欲使出${this.skillName(msg[3])}，却气机一滞，这一式未能发动。`);
                return true;
            case "skipAction":
                this.write(`${this.name(msg[1])}受${this.buffName(msg[2])}影响，只能按兵不动，这一回合未能行动。`);
                return true;
            case "protect":
                this.write(`${this.name(msg[1])}挺身护在${this.name(msg[2])}身前，准备替其挡下攻势。`);
                return true;
            case "addBuff":
                if (msg[6]) this.write(`${this.name(msg[3])}将${this.buffName(msg[4])}施于${this.name(msg[2])}身上。`);
                return true;
            case "removeBuff": {
                const reason = msg[1] === "die" ? "（死亡清除）" : msg[1] === "turn" ? "（持续时间结束）" :
                    msg[1] === "times" ? "（次数耗尽）" : "";
                this.write(`${this.name(msg[2])}身上的${this.buffName(msg[4])}消散了。${reason}`);
                return true;
            }
            case "hurt":
                this.hurt(msg);
                return true;
            case "heal":
                this.heal(msg);
                return true;
            case "die": {
                const ctx = this.fatal.get(msg[1]) ?? { target: msg[1], subject: msg[1] };
                this.fatal.delete(msg[1]);
                if (this.template("死亡文本", ctx)) return true;
                this.write(`${this.name(msg[1])}身形一晃，终于支撑不住，倒地不起。`, "darkRed");
                return true;
            }
            case "relife":
                this.fatal.delete(msg[1]);
                if (this.template("复活文本", { target: msg[1], subject: msg[1] })) return true;
                this.write(`一线生机重新凝聚，${this.name(msg[1])}缓缓睁开双眼，重新站起。`, "brightGreen");
                return true;
            default:
                return false;
        }
    }

    private reaction(type: string): string {
        const label = type === "combo" ? "连招" : type === "next" ? "连击" :
            type === "kill" ? "追击" : type === "fback" ? "反击" : type === "support" ? "协战" : "";
        return label ? `【${label}】` : "";
    }

    private injury(id: number, hp: number): string {
        const max = this.client.getUnitById(id)?.point.hpMax;
        if (!(max > 0)) return `（剩余生命 ${hp}）`;
        const ratio = hp / max;
        const description = hp <= 0 ? "气息将绝，已到了生死边缘" :
            ratio >= 0.8 ? "受了轻伤" : ratio >= 0.5 ? "伤势渐重" :
            ratio >= 0.2 ? "身受重伤" : "气若游丝";
        return `${this.name(id)}${description}。（生命 ${hp}/${max}）`;
    }

    private hurt(msg: fightMsg) {
        // 消息只携带行动的技能 ID；按攻击者与目标配对，嵌套动作先结算后注册的一层。
        let skill: number | undefined;
        if (msg[1] === "skill") {
            for (let index = this.pending.length - 1; index >= 0; index--) {
                const action = this.pending[index];
                if (action.actor !== msg[3] || action.target !== msg[2]) continue;
                skill = this.pending.splice(index, 1)[0].skill;
                break;
            }
        }
        const ctx: MudContext = { actor: msg[3], target: msg[2], subject: msg[2], skill,
            damage: msg[4], hp: msg[5], critical: (msg[6] ?? []).includes("crit") };
        if (msg[4] > 0) {
            this.fatal.delete(msg[2]);
            if (msg[5] <= 0) this.fatal.set(msg[2], ctx);
            if (this.template("受伤文本", ctx)) return;
        }
        const target = this.name(msg[2]), attacker = this.name(msg[3]);
        const amount = String(msg[4]);
        if (msg[4] === 0) {
            const prefix = `${attacker}这一击未能伤及${target}，造成 `;
            this.write(`${prefix}${amount} 点伤害。`, "red", { start: prefix.length, length: amount.length });
            return;
        }
        const critical = (msg[6] ?? []).includes("crit");
        let prefix: string, resource = "伤害";
        if (msg[1] === "dback") {
            prefix = `${target}被${attacker}的劲力反震，损失 `;
            resource = "生命";
        } else if (msg[1] === "share") {
            prefix = `${target}挺身挡下一击，分担 `;
        } else if (msg[1] === "reflect") {
            prefix = `${attacker}将攻势原路反射，${target}遭到反噬，受到 `;
        } else if (msg[1] === "poison" || msg[1] === "buff") {
            prefix = `${target}${msg[1] === "poison" ? "体内毒性发作" : "遭到持续侵蚀"}，损失 `;
            resource = "生命";
        } else {
            prefix = critical ? `这一击直中${target}要害，造成 ` : `${target}躲闪不及，被结结实实击中，受到 `;
        }
        const effects = (msg[6] ?? []).map((effect: string) => effect === "crit" ? "暴击" : effect);
        this.write(`${prefix}${amount} 点${resource}${effects.length ? `（${effects.join("、")}）` : ""}。${this.injury(msg[2], msg[5])}`,
            critical ? "orange" : "red", { start: prefix.length, length: amount.length });
    }

    private heal(msg: fightMsg) {
        const unit = this.client.getUnitById(msg[2]);
        const hp = unit?.point.hp ?? msg[5] + msg[4];
        if (this.template("治疗文本", { actor: msg[3], target: msg[2], subject: msg[2],
            heal: hp - msg[5], hp })) return;
        const amount = String(hp - msg[5]);
        const target = this.name(msg[2]), healer = this.name(msg[3]);
        const prefix = msg[1] === "blood" ? `${target}借着攻势汲回血气（吸血），恢复 ` :
            msg[1] === "relife" ? `${target}重新凝聚生机，恢复 ` :
            msg[1] === "reflect" ? `${healer}转来的生机落在${target}身上，恢复 ` :
            msg[2] === msg[3] ? `${target}运气调息，恢复 ` : `${healer}为${target}渡入一股生机，恢复 `;
        const feeling = hp === msg[5] ? "气血未有变化。" : "气息稍稍平复。";
        const effects = (msg[6] ?? []).map((effect: string) => effect === "crit" ? "暴击" : effect);
        this.write(`${prefix}${amount} 点生命${effects.length ? `（${effects.join("、")}）` : ""}，${feeling}（生命 ${hp}/${unit?.point.hpMax ?? "未知"}）`,
            "green", { start: prefix.length, length: amount.length });
    }
}
