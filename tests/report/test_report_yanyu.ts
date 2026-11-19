import { strict as assert } from "node:assert";
import { test } from "node:test";
import { FightResultEnum } from "../../src";
import { runYanYuReport } from "./fixtures/yanyu_report";

// 测试：完整两回合烟雨简报展示替代普攻、动画中 FIFO 技能插队、保留普攻机会和最终胜负。
test("report demo: yanyu automatic attacks resume after queued instant skills", async () => {
    console.log("烟雨示例：剑客自动使用[流云剑]；动画期间先按女侠[寒梅指]、再按剑客[破阵掌]，技能按提交顺序插入。\n");
    const s = await runYanYuReport();
    const actors = s.messages.filter(msg => msg[0] === "actor").map(msg => [msg[1], msg[3]]);
    assert.deepEqual(actors, [[0, undefined], [1, "skill"], [0, "skill"], [11, undefined],
        [1, undefined], [12, undefined], [0, undefined], [1, "skill"], [0, "skill"]]);
    assert.deepEqual(s.accepted, [true, true, true, true]);
    assert.deepEqual(s.immediateBars.slice(0, 2), [[11, 1, 12], [11, 1, 12]]);
    assert.equal(s.fight.turn, 2); assert.equal(s.result, FightResultEnum.attack);
    assert.equal(s.swordsman.getHp(), 160); assert.equal(s.heroine.getHp(), 125);
    assert.equal(s.swordsman.attr.point.mp, 80); assert.equal(s.heroine.attr.point.mp, 80);
    assert.ok(s.blade.isDied()); assert.ok(s.spear.isDied());
    assert.equal(s.report.lines.filter(line => line.includes("施放即时技能")).length, 4);
    assert.match(s.report.toString(), /女侠（#1） 施放即时技能[\s\S]*寒梅指[\s\S]*剑客（#0） 施放即时技能[\s\S]*破阵掌/);
    assert.match(s.report.toString(), /战斗结束：攻击方获胜/);
    assert.ok(s.checkedBatches >= 12); assert.ok(s.client.checkSame(s.fight));
});

// 测试：相同种子与同一动画间隙提交的指令产生相同协议和纯文本简报，不依赖真实时间。
test("report demo: yanyu report is deterministic for the same input schedule", async () => {
    const first = await runYanYuReport(() => {}, false), second = await runYanYuReport(() => {}, false);
    assert.deepEqual(first.messages, second.messages);
    assert.equal(first.report.toString(), second.report.toString());
});
