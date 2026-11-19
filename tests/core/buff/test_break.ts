import { strict as assert } from "node:assert";
import { test } from "node:test";
import { FightUnitEvent, PropEnum, initBuffs, getBuffData, initFightContex } from "../../../src";
import { setupChain, chainIds } from "../../fixtures/skill_chain";

const event: FightUnitEvent = "break";
function setup(shield = 1) {
    const s = setupChain({ rootSelfBuff: false, finalReactions: false, change: skills => {
        skills[0].combo = undefined; skills[0].damageRate = 1;
    } });
    s.target.attrOri.shield = shield; s.target.attrOri.weakProp = [PropEnum.金];
    s.actor.attrOri.weaponProp = PropEnum.金; s.actor.calcAttr(); s.target.calcAttr();
    s.client.onMsg(["side", 1, s.fight.getSide(1).units.map(unit => unit.getUnitMsg())]);
    return s;
}

// 测试：破盾向上下文、普通和全局监听发送同一单位、上下文及攻击者，优先级按既有规则执行。
test("break: context, unit and fight listeners receive the shield break", () => {
    const s = setup(2), calls: string[] = []; let received: unknown;
    s.target.onContex(event, (unit, ctx, attacker, allBroken) => {
        assert.equal(unit, s.target); assert.equal(attacker, s.actor); assert.equal(unit.attr.shield, 0);
        assert.equal(allBroken, false); // 另一存活敌人未配盾，此时不算全体破盾。
        assert.deepEqual(ctx.msgs[ctx.msgs.length - 1], ["shield", s.target.uid, 0]);
        received = ctx; calls.push("first");
    }, -1);
    s.target.onContex(event, () => calls.push("second"));
    s.target.on(event, (unit, ctx, attacker) => {
        assert.equal(unit, s.target); assert.equal(ctx, received); assert.equal(attacker, s.actor); calls.push("unit");
    });
    s.fight.onUnitEvent(event, (unit, ctx, attacker) => {
        assert.equal(unit, s.target); assert.equal(ctx, received); assert.equal(attacker, s.actor); calls.push("fight");
    });
    s.cast(); assert.deepEqual(calls, []);
    const ctx = s.cast(); assert.equal(received, ctx); assert.deepEqual(calls, ["first", "second", "unit", "fight"]);
    s.cast(); assert.equal(calls.length, 4);
    s.loop.nextTurn(); const before = initFightContex(s.fight); s.loop.processBeforeTurn(2, before); s.flush(before);
    assert.equal(calls.length, 4); s.cast(); s.cast(); assert.equal(calls.length, 8);
});

// 测试：普通次数 Buff 可使用 break 事件，破盾后消耗次数、发移除消息并解绑，回盾后不残留旧监听。
test("break: a count-limited buff expires through the existing event lifecycle", () => {
    const s = setup(), buffId = 1001080;
    initBuffs([{ ...getBuffData(chainIds.rest), id: buffId, class: undefined, name: "破盾次数", event,
        times: 1, lastTurn: 0, notRemove: false }]);
    const added = initFightContex(s.fight); s.target.addBuff(s.actor, "test", buffId, 1, added); s.flush(added);
    assert.equal(s.target.contextEmitter.listenerCount(event), 1);
    const ctx = s.cast();
    assert.equal(s.target.findBuff(buffId), undefined); assert.equal(s.target.contextEmitter.listenerCount(event), 0);
    assert.ok(ctx.msgs.some(msg => msg[0] === "removeBuff" && msg[1] === "times" && msg[4] === buffId));
    assert.equal(s.target.attr.shield, 0); assert.ok(s.client.checkSame(s.fight));
});

// 测试：未发动、未命中和取消的伤害不破盾，不发 break 事件。
test("break: failed, missed and cancelled attacks do not emit", () => {
    const s = setup(); let calls = 0; s.target.onContex(event, () => { calls++; });
    s.skills[0].rand = 0; s.cast();
    s.skills[0].rand = 1; s.skills[0].magic = false; s.actor.attr.physic.base.hit = 0; s.cast();
    s.skills[0].magic = true;
    s.target.onContex("beforeHurt", (_unit, _ctx, _attacker, pending) => { pending.cancelled = true; }); s.cast();
    assert.equal(calls, 0); assert.equal(s.target.attr.shield, 1);
});

// 测试：最后一面盾破碎的事件已发生，即使 break 监听者立刻回盾，也不取消全体破盾的大招触发。
test("break: buff reactions cannot erase the last-shield-break event", () => {
    const s = setup(); s.fight.xls.allShieldBreak = true;
    const initial = initFightContex(s.fight); s.other.onHurt(s.actor, "test", 1000, initial); s.flush(initial);
    s.target.onContex(event, (unit, ctx) => { unit.attr.shield = 1; ctx.msgs.push(["shield", unit.uid, 1, "recover"]); });
    s.cast();
    assert.equal(s.target.attr.shield, 1); assert.equal(s.fight.hasUltimateChance(0), true);
    assert.ok(s.client.checkSame(s.fight));
});
