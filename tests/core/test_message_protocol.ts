import { strict as assert } from "node:assert";
import { test } from "node:test";
import { initBuffs, getBuffData, initFightContex, FightCmdEnum } from "../../src";
import { setupChain, chainIds } from "../fixtures/skill_chain";

// 测试：初始化、技能动作和 Buff 添加消息省略静态名称及重复字段，简报仍能显示名称。
test("messages: initial state, skill actions and Buff additions omit static names and duplicate fields", () => {
    const { actor, cast, report } = setupChain();
    assert.equal(Object.prototype.hasOwnProperty.call(actor.getUnitMsg(), "buffNames"), false);
    const ctx = cast();
    assert.deepEqual(ctx.msgs.filter(msg => msg[0] === "skill" && msg[2] === actor.uid), [
        ["skill", chainIds.first, 0, 1],
        ["skill", chainIds.second, 0, 1, "combo"],
        ["skill", chainIds.third, 0, 1, "combo"],
    ]);
    assert.deepEqual(ctx.msgs.find(msg => msg[0] === "addBuff"),
        ["addBuff", "skill", 0, 0, chainIds.rest, 1, [0, 2]]);
    assert.match(report.toString(), /\[三连斩·一式\]/);
    assert.match(report.toString(), /添加 \[休息\]/);
});

// 测试：跳过行动消息只携带单位和 Buff 编号，简报从本地配置还原原因。
test("messages: skipAction carries only unit and Buff IDs", () => {
    const { fight, actor, target, cast, flush, report } = setupChain();
    cast();
    const ctx = fight.processUnit(actor, { cmd: FightCmdEnum.attack, target: target.uid });
    assert.deepEqual(ctx.msgs, [["skipAction", actor.uid, chainIds.rest]]);
    flush(ctx);
    assert.match(report.toString(), /\[休息\]跳过行动/);
});

// 测试：Buff 触发消息使用效果代码代替显示文字，并正确生成不屈简报。
test("messages: Buff triggers carry effect codes and target IDs instead of display text", () => {
    const { fight, actor, target, flush, report } = setupChain({ rootSelfBuff: false });
    initBuffs([{ ...getBuffData(chainIds.rest), id: 98210, name: "协议不屈", class: "buqu",
        lastTurn: 0, times: 0, notRemove: false }]);
    const ctx = initFightContex(fight);
    actor.addBuff(actor, "test", 98210, 1, ctx);
    actor.onHurt(target, "test", 10000, ctx);
    assert.deepEqual(ctx.msgs.find(msg => msg[0] === "buffTrigger"), ["buffTrigger", actor.uid, 98210, "buqu"]);
    flush(ctx);
    assert.match(report.toString(), /\[协议不屈\]触发（保留 1 点生命）/);
});

// 测试：反射消息只传效果代码和目标编号，简报还原伤害及治疗的转移去向。
test("messages: reflection descriptions are reconstructed from effect codes and target IDs", () => {
    const { fight, actor, target, flush, report } = setupChain({ actorHp: 100, rootSelfBuff: false });
    initBuffs([{ ...getBuffData(chainIds.rest), id: 98211, name: "协议反射", class: "reflect",
        lastTurn: 0, times: 0, notRemove: false }]);
    const ctx = initFightContex(fight);
    actor.addBuff(actor, "test", 98211, 1, ctx);
    actor.onHurt(target, "test", 20, ctx, { magic: true });
    fight.random = () => 0;
    actor.onHeal(actor, "test", 10, ctx);
    assert.deepEqual(ctx.msgs.filter(msg => msg[0] === "buffTrigger"), [
        ["buffTrigger", actor.uid, 98211, "reflectHurt", target.uid],
        ["buffTrigger", actor.uid, 98211, "reflectHeal", target.uid],
    ]);
    flush(ctx);
    assert.equal(actor.getHp(), 100);
    assert.equal(target.getHp(), 990);
    assert.match(report.toString(), /\[协议反射\]触发（向 卫士（#1）反射伤害）/);
    assert.match(report.toString(), /\[协议反射\]触发（将治疗转移给 卫士（#1））/);
});
