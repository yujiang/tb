import { strict as assert } from "node:assert";
import { test } from "node:test";
import { FightResultEnum } from "../../src";
import { runAIReport } from "./fixtures/ai_report";

// 测试：模板与阵型生成的 Boss 同时运行三个 AI，简报展示血线增攻、周期大招及不更新行动条的新攻击。
test("report demo: generated boss shows all three AI axes in a real battle", async () => {
    console.log("示例：山贼首领同时具有三个 AI：70%/40% 血线累计增攻 20%/50%，每三回合裂地斩，每两次有效受伤追加普攻。\n");
    const s = await runAIReport();
    assert.equal(s.result, FightResultEnum.attack); assert.equal(s.fight.turn, 3);
    assert.equal(s.hero.getHp(), 704); assert.equal(s.boss.isDied(), true);
    assert.equal(s.boss.attr.magic.base.attack, 120); assert.equal(s.boss.attrOri.magic.base.attack, 80);
    assert.deepEqual(s.messages.filter(msg => msg[0] === "aiHp").map(msg => msg.slice(2)), [[0.7, 0.2], [0.4, 0.5]]);
    assert.equal(s.messages.filter(msg => msg[0] === "aiAttack").length, 1);
    assert.equal(s.messages.filter(msg => msg[0] === "actor").length, 6);
    assert.deepEqual(s.extraAttackBars, [[]]);
    assert.equal(s.hero.myInputTurn, 3); assert.equal(s.boss.myInputTurn, 3);
    assert.match(s.report.toString(), /触发 70% 血线/); assert.match(s.report.toString(), /触发 40% 血线/);
    assert.match(s.report.toString(), /\[裂地斩\]/); assert.match(s.report.toString(), /触发受伤计次攻击/);
    assert.doesNotMatch(s.report.toString(), /未识别消息/); assert.ok(s.checked > 10);
    assert.ok(s.messages.every(msg => msg[0] !== "sync")); assert.ok(s.client.checkSame(s.fight));
});

// 测试：相同模板、阵型、UID 分配与种子的多 AI 战斗产生相同协议和简报。
test("report demo: AI report is deterministic for the same templates and seed", async () => {
    const first = await runAIReport(() => {}, false), second = await runAIReport(() => {}, false);
    assert.deepEqual(first.messages, second.messages); assert.equal(first.report.toString(), second.report.toString());
});
