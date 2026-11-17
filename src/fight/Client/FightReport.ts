// 因为没有画面，根据战斗消息来生成一份人可以阅读的简报
// 暂时用中文简报
// 用一点小小的标注来改善阅读，
// 1. 技能用[技能名] #1 => [黑虎掏心]，bufff也一样
// 2. 数字：加血用绿色，伤害用红色，暴击伤害用橙色，未命中三个字用蓝色
// 3. 死亡整句用暗红色，复活用亮绿色
// 4. 每个 行动 前多一个换行

import { FightLoop } from "../FightLoop"
import { fightMsg } from "../struct";
import { FightClient } from "./FightClient"
import { FightResultEnum } from "../struct"


export class FightReport{
    readonly lines: string[] = [];
    private client = new FightClient();
    private buffNames = new Map<number, string>();

    // 默认直接打印，也可传入自己的输出函数；lines 始终保存当前战斗的简报。
    constructor(private output: (line: string) => void = line => console.log(line), private color = true) {}

    toString(): string {
        return this.lines.join("\n");
    }

    private name(id: number): string {
        const unit = this.client.getUnitById(id);
        return unit ? `${unit.display.name}（#${id}）` : `单位 #${id}`;
    }

    private buffName(id: number, suppliedName?: string): string {
        if (suppliedName) this.buffNames.set(id, suppliedName);
        const name = this.buffNames.get(id);
        return name ? `[${name}]` : `Buff #${id}`;
    }

    private write(line: string, color?: "red" | "orange" | "green" | "darkRed" | "brightGreen" | "blue",
        highlight?: { start: number; length: number }) {
        this.lines.push(line);
        const colors = { red: "\x1b[31m", orange: "\x1b[38;5;208m", green: "\x1b[32m",
            darkRed: "\x1b[38;5;88m", brightGreen: "\x1b[92m", blue: "\x1b[34m" };
        if (this.color && color) {
            const start = highlight?.start ?? 0;
            const end = highlight ? start + highlight.length : line.length;
            this.output(`${line.slice(0, start)}${colors[color]}${line.slice(start, end)}\x1b[0m${line.slice(end)}`);
        } else {
            this.output(line);
        }
    }

    bindFightLoop(fl: FightLoop){
        // 跳过网络，直接导入消息
        fl.onMsg((msgs: fightMsg | fightMsg[])=>{
            this.onMsg(msgs);
        });
    }

    // 接收消息
    onMsg(msgs: fightMsg | fightMsg[]){
        if (!msgs?.length) return;
        const batch: fightMsg[] = typeof msgs[0] === "string" ? [msgs as fightMsg] : msgs as fightMsg[];
        for (const msg of batch) {
            if (msg[0] === "start") {
                this.lines.length = 0;
                this.buffNames.clear();
            }
            // 复用客户端的消息处理，仅从消息累计展示状态，不读取服务端战斗。
            this.client.onMsg(msg);
            const name = (id: number) => this.name(id);
            switch (msg[0]) {
                case "start":
                    this.write(`战斗 #${msg[1]} 开始`);
                    break;
                case "side": {
                    const side = msg[1] === 0 ? "攻击方" : "防守方";
                    const units = this.client.sides[msg[1] as 0 | 1];
                    this.write(`${side}：${units.map(u => `${name(u.uid)}，位置 ${u.pos ?? "未设置"}，生命 ${u.point.hp}/${u.point.hpMax}，法力 ${u.point.mp}/${u.point.mpMax}${u.dead ? "，已死亡" : ""}`).join("；") || "无单位"}`);
                    for (const unit of units) {
                        for (const buff of unit.buffs) {
                            this.write(`${name(unit.uid)} 初始携带 ${this.buffName(buff[0], unit.buffNames?.[buff[0]])}（等级 ${buff[1]}）`);
                        }
                    }
                    break;
                }
                case "turn":
                    this.write("");
                    this.write(`第 ${msg[1]} 回合`);
                    break;
                case "sort":
                    this.write(`剩余行动顺序：${(msg[1] as number[]).map(name).join(" → ") || "无"}`);
                    break;
                case "actor":
                    this.write("");
                    this.write(`${name(msg[1])} 行动（速度 ${msg[2]}）`);
                    break;
                case "skillFailed":
                    this.write(`${name(msg[1])} 的${msg[4] ? `[${msg[4]}]` : `技能 #${msg[3]}`}未发动（发动概率判定失败）`);
                    break;
                case "skipAction":
                    this.write(`${name(msg[1])} 因${this.buffName(msg[2], msg[3])}跳过行动`);
                    break;
                case "hurt": {
                    const reason = msg[1] === "dback" ? "反伤" : msg[1] === "reflect" ? "反射伤害" : msg[1] === "poison" ? "中毒" : "伤害";
                    const effects = (msg[6] ?? []).map((effect: string) => effect === "crit" ? "暴击" : effect);
                    const prefix = `${name(msg[3])} 对 ${name(msg[2])} 造成 `;
                    const amount = String(msg[4]);
                    this.write(`${prefix}${amount} 点${reason}${effects.length ? `（${effects.join("、")}）` : ""}，剩余生命 ${msg[5]}`,
                        (msg[6] ?? []).includes("crit") ? "orange" : "red", { start: prefix.length, length: amount.length });
                    break;
                }
                case "heal": {
                    const unit = this.client.getUnitById(msg[2]);
                    const after = unit?.point.hp ?? msg[5] + msg[4];
                    const reason = msg[1] === "blood" ? "吸血" : msg[1] === "relife" ? "复活治疗" : msg[1] === "reflect" ? "反射治疗" : "治疗";
                    const prefix = `${name(msg[3])} 为 ${name(msg[2])} 恢复 `;
                    const amount = String(after - msg[5]);
                    this.write(`${prefix}${amount} 点生命（${reason}），当前生命 ${after}/${unit?.point.hpMax ?? "未知"}`,
                        "green", { start: prefix.length, length: amount.length });
                    break;
                }
                case "costHp":
                case "costMp": {
                    const resource = msg[0] === "costHp" ? "生命" : "法力";
                    this.write(`${name(msg[1])} 消耗 ${msg[2]} 点${resource}，剩余${resource} ${msg[3]}`);
                    break;
                }
                case "addBuff":
                    if (msg[6]) this.write(`${name(msg[3])} 为 ${name(msg[2])} 添加 ${this.buffName(msg[4], msg[7])}（等级 ${msg[5]}）`);
                    break;
                case "removeBuff":
                    this.write(`${name(msg[2])} 移除 ${this.buffName(msg[4], msg[5])}${msg[1] === "die" ? "（死亡清除）" : msg[1] === "turn" ? "（持续时间结束）" : msg[1] === "times" ? "（次数耗尽）" : ""}`);
                    break;
                case "buffTrigger":
                    this.write(`${name(msg[1])} 的${this.buffName(msg[2], msg[3])}触发${msg[4] ? `（${msg[4]}）` : ""}`);
                    break;
                case "die":
                    this.write(`${name(msg[1])}死亡`, "darkRed");
                    break;
                case "relife":
                    this.write(`${name(msg[1])}复活`, "brightGreen");
                    break;
                case "spread":
                    this.write(`溅射目标：${(msg[1] as number[]).map(name).join("、")}`);
                    break;
                case "禁疗":
                case "百毒不侵":
                case "无效":
                case "无法复活":
                    this.write(`${name(msg[1])}：${msg[0]}`);
                    break;
                case "end": {
                    const result = msg[1] === FightResultEnum.attack ? "攻击方获胜" :
                        msg[1] === FightResultEnum.defend ? "防守方获胜" :
                        msg[1] === FightResultEnum.draw ? "平局" : `结果 ${msg[1]}`;
                    this.write(`战斗结束：${result}`);
                    break;
                }
                default: {
                    const reaction = msg[4] === "next" ? "连击" : msg[4] === "kill" ? "追击" :
                        msg[4] === "fback" ? "反击" : "";
                    const prefix = reaction ? `【${reaction}】` : "";
                    const skill = msg[5] ? `[${msg[5]}]` : msg[1] === 0 ? "[普通攻击]" : `技能 #${msg[1]}`;
                    if (msg.length >= 4 && msg[1] === "miss") {
                        const beforeMiss = `${prefix}${name(msg[2])} ${msg[5] ? `使用${skill}攻击` : "攻击"} ${name(msg[3])}，`;
                        this.write(`${beforeMiss}未命中`, "blue", { start: beforeMiss.length, length: 3 });
                    } else if (msg.length >= 4 && typeof msg[1] === "number") {
                        this.write(`${prefix}${name(msg[2])} 对 ${name(msg[3])} 使用${skill}`);
                    } else {
                        this.write(`未识别消息：${JSON.stringify(msg)}`);
                    }
                    break;
                }
            }
        }
    }
}
