import { strict as assert } from "node:assert";
import { test } from "node:test";
import { Fight, FightSide, FightUnit, UnitContextEventFunc, initFightContex,
    BuffData, initBuffs, OverlapEnum, OrderedEventEmitter } from "../../src";

function setup() {
    const fight = new Fight(97500, { maxTurn: 1, waitInputSec: 1, duiwei: false }, 0);
    const a = new FightSide(), b = new FightSide();
    a.createSimpleMonster(fight, [{ id: 0, name: "A", pos: 0 }]);
    b.createSimpleMonster(fight, [{ id: 1, name: "B", pos: 0 }]);
    fight.createSide(a, b);
    return { fight, unit: a.units[0], ctx: initFightContex(fight) };
}

function listen(unit: FightUnit, listener: UnitContextEventFunc, prior = 0) {
    unit.onContex("hurt", listener, prior);
}

test("context events: smaller priorities run first and ties keep registration order", () => {
    const { fight, unit, ctx } = setup();
    const calls: string[] = [];
    const pending = { damage: 80 };
    listen(unit, (_u, received, _attacker, damage) => {
        assert.equal(received, ctx);
        damage.damage = Math.min(damage.damage, 49);
        calls.push("last");
    }, 1000);
    listen(unit, (_u, _ctx, _attacker, damage) => { damage.damage /= 2; calls.push("first"); }, -10);
    listen(unit, () => calls.push("zero-first"));
    listen(unit, () => calls.push("zero-second"), 0);
    listen(unit, () => calls.push("negative-second"), -10);
    unit.on("hurt", (receivedUnit, receivedCtx, attacker, damage) => {
        assert.equal(receivedUnit, unit);
        assert.equal(receivedCtx, ctx);
        assert.equal(attacker, unit);
        assert.equal(damage.damage, 40);
        calls.push("unit-observer");
    });
    fight.onUnitEvent("hurt", () => calls.push("fight-observer"));
    unit.emitContext("hurt", ctx, unit, pending);
    assert.deepEqual(calls, ["first", "negative-second", "zero-first", "zero-second", "last", "unit-observer", "fight-observer"]);
    assert.equal(pending.damage, 40);
});

test("context events: removed and re-added listeners wait for the next emission", () => {
    const { unit, ctx } = setup();
    const calls: string[] = [];
    const later = () => calls.push("later");
    let changed = false;
    listen(unit, () => {
        calls.push("first");
        if (!changed) {
            changed = true;
            unit.offContex("hurt", later);
            listen(unit, later);
            listen(unit, () => calls.push("new"));
        }
    });
    listen(unit, later);
    unit.emitContext("hurt", ctx);
    assert.deepEqual(calls, ["first"]);
    unit.emitContext("hurt", ctx);
    assert.deepEqual(calls, ["first", "first", "later", "new"]);
});

test("context events: exceptions stop the chain and ordinary events keep their signature", () => {
    const { fight, unit, ctx } = setup();
    const failure = new Error("effect failed");
    let after = false, global = false;
    listen(unit, () => { throw failure; });
    listen(unit, () => { after = true; });
    fight.onUnitEvent("hurt", () => { global = true; });
    assert.throws(() => unit.emitContext("hurt", ctx), error => error === failure);
    assert.equal(after, false);
    assert.equal(global, false);
    const args: unknown[][] = [];
    unit.on("speed", (...received) => args.push(received));
    unit.emit("speed", 123);
    assert.deepEqual(args, [[unit, 123]]);
});

test("buffs: configured priorities order counted events and removals", () => {
    const { unit, ctx } = setup();
    const buff = (id: number, prior?: number): BuffData => ({
        id, name: `优先级${prior}`, desc: "", status: [], tags: [],
        magic: false, attackType: "base", attack: {}, final: {}, overlap: OverlapEnum.NOT,
        useInputTurn: false, lastTurn: 0, times: 1, event: "hurt", skill: 0, skillLevel: 1, prior,
    });
    initBuffs([buff(97501, 1000), buff(97502, 0), buff(97503, -10), buff(97504)]);
    for (const id of [97501, 97502, 97503, 97504]) unit.addBuff(unit, "test", id, 1, ctx);
    ctx.msgs.length = 0;
    unit.emitContext("hurt", ctx, unit, 0);
    assert.deepEqual(ctx.msgs.filter(msg => msg[0] === "removeBuff").map(msg => msg[4]),
        [97503, 97502, 97504, 97501]);
    assert.equal(unit.buffs.size, 0);
    assert.equal(unit.contextEmitter.listenerCount("hurt"), 0);
});

test("ordered emitter: off removes the latest registration and keeps other events intact", () => {
    const emitter = new OrderedEventEmitter();
    const calls: string[] = [];
    const shared = () => calls.push("shared");
    emitter.on("hurt", shared, 100);
    emitter.on("hurt", () => calls.push("middle"), 0);
    emitter.on("hurt", shared, -100);
    emitter.on("heal", shared);
    emitter.off("hurt", shared);
    assert.equal(emitter.listenerCount("hurt"), 2);
    emitter.emit("hurt");
    assert.deepEqual(calls, ["middle", "shared"]);
    assert.equal(emitter.emit("heal"), true);
    assert.equal(emitter.emit("missing"), false);
    emitter.off("heal", shared).off("heal", shared);
    assert.equal(emitter.listenerCount("heal"), 0);
});

test("ordered emitter: nested emissions use their own current listener snapshot", () => {
    const emitter = new OrderedEventEmitter();
    const calls: string[] = [];
    let nested = false;
    emitter.on("hurt", () => {
        calls.push("first");
        if (!nested) {
            nested = true;
            emitter.on("hurt", () => calls.push("new"), -1);
            emitter.emit("hurt");
        }
    });
    emitter.on("hurt", () => calls.push("later"));
    emitter.emit("hurt");
    assert.deepEqual(calls, ["first", "new", "first", "later", "later"]);
});

test("ordered emitter: invalid priorities cannot corrupt execution order", () => {
    const emitter = new OrderedEventEmitter();
    for (const prior of [NaN, Infinity, -Infinity]) {
        assert.throws(() => emitter.on("hurt", () => {}, prior), /prior must be a finite number/);
    }
    assert.equal(emitter.listenerCount("hurt"), 0);
});
