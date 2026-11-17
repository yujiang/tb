import { strict as assert } from "node:assert";
import { test } from "node:test";
import { FightReport } from "../../src/fight/Client/FightReport";
import { FightClient } from "../../src/fight/Client/FightClient";
import { Fight } from "../../src/fight/Fight";
import { FightSide } from "../../src/fight/FightSide";
import { FightLoopWest } from "../../src/fight/Online/FightLoopOnline";
import { fightMsg } from "../../src/fight/struct";

function initial(): fightMsg[] {
    const unit = (uid: number, name: string) => ({ uid, pos: 0, dead: false,
        display: { name }, point: { hp: 100, hpMax: 100, mp: 100, mpMax: 100 },
        buffs: [[97101, 3, 0, 0], [97102, 2, 0, 0]] });
    return [["start", 0], ["side", 0, [unit(0, "甲")]], ["side", 1, [unit(1, "乙")]]];
}

test("report: message names use brackets and healing, damage and critical damage use distinct colors", () => {
    const output: string[] = [];
    const report = new FightReport(line => output.push(line));
    const init = initial();
    init[1][2][0].buffNames = { 97101: "护体", 97102: "坚守" };
    const messages: fightMsg[] = [...init,
        ["甲", 97301, 0, 1, null, "黑虎掏心"],
        ["hurt", "甲", 1, 0, 20, 80, []],
        ["hurt", "甲", 1, 0, 30, 50, ["crit"]],
        ["heal", "heal", 1, 1, 10, 50, []],
        ["addBuff", "test", 1, 0, 97302, 2, [97302, 2, 0, 3], "回春"],
        ["removeBuff", "turn", 1, 1, 97302],
        ["removeBuff", "die", 0, 0, 97102],
        ["die", 1], ["relife", 1],
        ["甲", "miss", 0, 1, null, "黑虎掏心"],
    ];
    report.onMsg(JSON.parse(JSON.stringify(messages)));
    const text = report.toString();
    assert.match(text, /使用\[黑虎掏心\]/);
    assert.match(text, /初始携带 \[护体\]/);
    assert.match(text, /添加 \[回春\]/);
    assert.match(text, /移除 \[回春\]/);
    assert.match(text, /移除 \[坚守\]/);
    assert.ok(output.includes("甲（#0） 对 乙（#1） 造成 \x1b[31m20\x1b[0m 点伤害，剩余生命 80"));
    assert.ok(output.includes("甲（#0） 对 乙（#1） 造成 \x1b[38;5;208m30\x1b[0m 点伤害（暴击），剩余生命 50"));
    assert.ok(output.includes("乙（#1） 为 乙（#1） 恢复 \x1b[32m10\x1b[0m 点生命（治疗），当前生命 60/100"));
    assert.ok(output.includes("\x1b[38;5;88m乙（#1）死亡\x1b[0m"));
    assert.ok(output.includes("\x1b[92m乙（#1）复活\x1b[0m"));
    assert.ok(output.includes("甲（#0） 使用[黑虎掏心]攻击 乙（#1），\x1b[34m未命中\x1b[0m"));
    assert.ok(!text.includes("\x1b["), "保存的纯文本不应混入终端控制码");
    const plain: string[] = [];
    const uncolored = new FightReport(line => plain.push(line), false);
    uncolored.onMsg(messages);
    assert.deepEqual(plain, report.lines);
});

test("report: each actor starts after a blank line in printed and saved reports", () => {
    const output: string[] = [];
    const report = new FightReport(line => output.push(line), false);
    report.onMsg([...initial(), ["turn", 1], ["actor", 0, 100],
        ["hurt", "甲", 1, 0, 20, 80, []], ["actor", 1, 90], ["乙", "miss", 1, 0]]);
    const actorIndexes = report.lines.flatMap((line, index) => line.includes(" 行动（") ? [index] : []);
    assert.equal(actorIndexes.length, 2);
    for (const index of actorIndexes) assert.equal(report.lines[index - 1], "");
    assert.equal(report.lines.filter(line => line === "").length, 3);
    assert.deepEqual(output, report.lines);
    assert.match(report.toString(), /第 1 回合\n\n甲（#0） 行动/);
    assert.match(report.toString(), /剩余生命 80\n\n乙（#1） 行动/);
});

test("report: every turn heading starts after a blank line", () => {
    const output: string[] = [];
    const report = new FightReport(line => output.push(line), false);
    report.onMsg([...initial(), ["turn", 1], ["actor", 0, 100], ["turn", 8]]);
    for (const turn of [1, 8]) {
        const index = report.lines.indexOf(`第 ${turn} 回合`);
        assert.ok(index > 0);
        assert.equal(report.lines[index - 1], "");
    }
    assert.deepEqual(output, report.lines);
    assert.ok(report.toString().includes("\n\n第 8 回合"));
});

test("report: Chinese text follows incremental death, Buff removal and revival messages", () => {
    const report = new FightReport(() => {});
    const messages: fightMsg[] = [...initial(),
        ["turn", 1], ["sort", [1, 0]], ["actor", 1, 100],
        ["乙", 0, 1, 0], ["hurt", "乙", 0, 1, 100, 0, ["crit"]],
        ["die", 0], ["removeBuff", "die", 0, 0, 97102],
        ["relife", 0], ["heal", "relife", 0, 0, 200, 0, []], ["end", 2],
    ];
    // 模拟网络，仅有消息，没有服务端 Fight 或技能/Buff 配置。
    for (const msg of JSON.parse(JSON.stringify(messages))) report.onMsg(msg);
    const text = report.toString();
    assert.match(text, /战斗 #0 开始/);
    assert.match(text, /第 1 回合/);
    assert.match(text, /乙.*甲.*普通攻击/);
    assert.match(text, /甲.*100.*暴击/);
    const death = text.indexOf("甲（#0）死亡");
    const removal = text.indexOf("移除 Buff #97102");
    const revival = text.indexOf("甲（#0）复活");
    assert.ok(death >= 0 && removal > death && revival > removal);
    assert.doesNotMatch(text, /移除 Buff #97101/);
    assert.match(text, /恢复 100 点生命.*100\/100/);
    assert.match(text, /平局/);
});

test("report: empty messages do nothing and start clears previous names and text", () => {
    const report = new FightReport(() => {});
    report.onMsg(initial());
    const before = report.toString();
    report.onMsg([]);
    assert.equal(report.toString(), before);
    report.onMsg([["start", 9], ["die", 0], ["end", 1]]);
    assert.doesNotMatch(report.toString(), /甲|战斗 #0/);
    assert.match(report.toString(), /单位 #0.*死亡/);
    assert.match(report.toString(), /防守方获胜/);
});

test("report: binding coexists with FightClient and reports a full battle", async () => {
    const fight = new Fight(97103, { maxTurn: 1, waitInputSec: 0.01, duiwei: false }, 0);
    const a = new FightSide(), b = new FightSide();
    a.createSimpleMonster(fight, [{ id: 0, name: "甲", pos: 0 }]);
    b.createSimpleMonster(fight, [{ id: 1, name: "乙", pos: 0 }]);
    fight.createSide(a, b);
    const loop = new FightLoopWest(fight);
    const client = new FightClient();
    client.bindFightLoop(loop);
    const report = new FightReport(() => {});
    report.bindFightLoop(loop);
    await loop.run();
    assert.equal(client.checkSame(fight), true);
    assert.match(report.toString(), /战斗 #97103 开始/);
    assert.match(report.toString(), /第 1 回合/);
    assert.match(report.toString(), /战斗结束/);
});

test("report: batches preserve input and output while explaining costs and reactions", () => {
    const output: string[] = [];
    const report = new FightReport(line => output.push(line), false);
    const messages: fightMsg[] = [...initial(),
        ["costHp", 0, 10, 90], ["costMp", 0, 20, 80],
        ["甲", 97104, 0, 1], ["甲", "miss", 0, 1],
        ["hurt", "dback", 0, 1, 5, 85, []],
        ["heal", "blood", 0, 0, 5, 85, []],
        ["addBuff", "test", 0, 1, 97105, 2, [97105, 2, 1, 3]],
        ["removeBuff", "times", 0, 0, 97105],
        ["新扩展事件", { value: 1 }], ["end", 0],
    ];
    const before = structuredClone(messages);
    report.onMsg(messages);
    assert.deepEqual(messages, before);
    assert.deepEqual(output, report.lines);
    const singles = new FightReport(() => {});
    for (const msg of messages) singles.onMsg(msg);
    assert.equal(report.toString(), singles.toString());
    assert.match(report.toString(), /消耗 10 点生命/);
    assert.match(report.toString(), /消耗 20 点法力/);
    assert.match(report.toString(), /技能 #97104/);
    assert.match(report.toString(), /未命中/);
    assert.match(report.toString(), /5 点反伤/);
    assert.match(report.toString(), /恢复 5 点生命（吸血）/);
    assert.match(report.toString(), /添加 Buff #97105（等级 2）/);
    assert.match(report.toString(), /移除 Buff #97105（次数耗尽）/);
    assert.match(report.toString(), /未识别消息.*新扩展事件/);
    assert.match(report.toString(), /攻击方获胜/);
});
