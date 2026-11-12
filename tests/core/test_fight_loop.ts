import { strict as assert } from "node:assert";
import { test, TestContext } from "node:test";
import { Fight } from "../../src/fight/Fight";
import { FightAttr } from "../../src/fight/FightAttr";
import { FightContex } from "../../src/fight/FightAttack";
import { FightLoop } from "../../src/fight/FightLoop";
import { FightLoopWest } from "../../src/fight/Online/FightLoopOnline";
import { FightSide } from "../../src/fight/FightSide";
import { FightUnitMonster, FightUnitSummon, FightUnitUser } from "../../src/fight/FightUnit";
import { FightCmdEnum, FightInput, FightSideEnum } from "../../src/fight/struct";

// 固定属性和随机值，避免反击、追击让测试结果不稳定。
function createFight(t: TestContext) {
    t.mock.method(console, "log", () => {});
    const fight = new Fight(100);
    fight.random = () => 0;
    fight.createMap(5, 5);
    const attack = new FightSide();
    const defend = new FightSide();
    const attr = () => Object.assign(new FightAttr(), {
        hp: 100, hpMax: 100, attack: 30, defend: 10, speed: 10,
    });
    const user = new FightUnitUser(1, attr(), { name: "user" });
    const summon = new FightUnitSummon(2, attr(), { name: "summon" });
    const monster = new FightUnitMonster(11, attr(), { name: "monster" });
    attack.units.push(user, summon);
    defend.units.push(monster);
    fight.createSide(attack, defend);
    const loop = new FightLoopWest(fight);
    return { fight, loop, user, summon, monster };
}

const attackInput = (target = 11): FightInput => ({ cmd: FightCmdEnum.attack, target });

// 只隔离具体战斗规则，保留 run() 本身的异步调度和结束判断。
class RecordingLoop extends FightLoop {
    events: string[] = [];

    override processBeforeTurn() { this.events.push("before"); }
    override async waitInput() { this.events.push("input"); return 1; }
    override async processOneTurn() { this.events.push("action"); }
    override async waitDrawOver() { this.events.push("draw"); }
    override processAfterTurn() { this.events.push("after"); this.fight.end = true; }
    override onInput(_id: number, _input: FightInput) {}
}

test("run awaits each phase in order and returns the winner", async t => {
    const { fight } = createFight(t);
    const loop = new RecordingLoop(fight);
    t.mock.method(loop, "waitInput", async () => {
        loop.events.push("input:start");
        await Promise.resolve();
        loop.events.push("input:end");
        return 1;
    });
    t.mock.method(loop, "processOneTurn", async () => {
        loop.events.push("action:start");
        await Promise.resolve();
        loop.events.push("action:end");
    });
    t.mock.method(loop, "waitDrawOver", async () => {
        loop.events.push("draw:start");
        await Promise.resolve();
        loop.events.push("draw:end");
    });
    fight.win = FightSideEnum.attack;

    assert.equal(await loop.run(), FightSideEnum.attack);
    assert.equal(fight.turn, 1);
    assert.deepEqual(loop.events, [
        "before", "input:start", "input:end", "action:start", "action:end",
        "draw:start", "draw:end", "after",
    ]);
});

test("run skips all phases if the fight has already ended", async t => {
    const { fight } = createFight(t);
    const loop = new RecordingLoop(fight);
    fight.end = true;
    fight.win = FightSideEnum.defend;
    assert.equal(await loop.run(), FightSideEnum.defend);
    assert.equal(fight.turn, 0);
    assert.deepEqual(loop.events, []);
});

test("run stops at the turn limit before processing another turn", async t => {
    const { fight } = createFight(t);
    const loop = new RecordingLoop(fight);
    fight.turn = 99;
    assert.equal(await loop.run(), -1);
    assert.equal(fight.turn, 100);
    assert.equal(fight.isEnd(), true);
    assert.deepEqual(loop.events, []);
});

test("run stops if a before-turn effect ends the fight", async t => {
    const { fight } = createFight(t);
    const loop = new RecordingLoop(fight);
    t.mock.method(loop, "processBeforeTurn", () => {
        loop.events.push("before");
        fight.end = true;
        fight.win = FightSideEnum.defend;
    });
    assert.equal(await loop.run(), FightSideEnum.defend);
    assert.deepEqual(loop.events, ["before"]);
});

test("run repeats the phases until the fight ends", async t => {
    const { fight } = createFight(t);
    const loop = new RecordingLoop(fight);
    t.mock.method(loop, "processAfterTurn", () => {
        loop.events.push("after");
        fight.end = fight.turn === 3;
    });
    await loop.run();
    assert.equal(fight.turn, 3);
    assert.deepEqual(loop.events, Array(3).fill(["before", "input", "action", "draw", "after"]).flat());
});

test("online loops invoke before/after hooks on every unit", t => {
    const { fight, loop } = createFight(t);
    const events: string[] = [];
    for (const unit of fight.getAllUnits()) {
        t.mock.method(unit, "processBeforeTurn", () => events.push(`before:${unit.uid}`));
        t.mock.method(unit, "processAfterTurn", () => events.push(`after:${unit.uid}`));
    }
    loop.processBeforeTurn();
    loop.processAfterTurn();
    assert.deepEqual(events, ["before:1", "before:2", "before:11", "after:1", "after:2", "after:11"]);
});

test("waitInput resets commands and waits for both user and summon, excluding monsters", async t => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const { loop, user, summon, monster } = createFight(t);
    user.input = attackInput();
    summon.input = attackInput();
    const waiting = loop.waitInput();
    assert.equal(loop.input, 2);
    assert.equal(loop.inputed, 0);
    assert.equal(user.input, null);
    assert.equal(summon.input, null);
    assert.deepEqual(monster.input, { cmd: FightCmdEnum.none });

    let settled = false;
    void waiting.then(() => { settled = true; });
    loop.onInput(user.uid, attackInput());
    await Promise.resolve();
    assert.equal(settled, false);
    assert.equal(loop.inputed, 1);
    loop.onInput(summon.uid, attackInput());
    assert.equal(await waiting, 1);
    assert.equal(loop.input, 0);
    assert.equal(loop.inputed, 2);
});

test("duplicate commands and cancellation keep the ready count accurate", async t => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const { loop, user, summon } = createFight(t);
    const waiting = loop.waitInput();
    loop.onInput(user.uid, attackInput());
    loop.onInput(user.uid, { cmd: FightCmdEnum.skill });
    assert.equal(loop.inputed, 1);
    assert.deepEqual(user.input, { cmd: FightCmdEnum.skill });
    loop.onInput(user.uid, { cmd: FightCmdEnum.cancel });
    assert.equal(loop.inputed, 0);
    assert.equal(user.input, null);
    loop.onInput(user.uid, { cmd: FightCmdEnum.cancel });
    assert.equal(loop.inputed, 0);
    loop.onInput(summon.uid, attackInput());
    assert.equal(loop.inputed, 1);
    loop.onInput(user.uid, attackInput());
    assert.equal(await waiting, 1);
});

test("unknown IDs and rejected commands do not count as ready", async t => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const { loop, user, summon } = createFight(t);
    const waiting = loop.waitInput();
    loop.onInput(999, attackInput());
    const reject = t.mock.method(user, "onInput", () => false);
    loop.onInput(user.uid, attackInput());
    assert.equal(loop.inputed, 0);
    assert.equal(user.input, null);
    reject.mock.restore();
    loop.onInput(user.uid, attackInput());
    loop.onInput(summon.uid, attackInput());
    assert.equal(await waiting, 1);
});

test("commands outside an active input round are ignored", async t => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const { loop, user, summon } = createFight(t);
    loop.onInput(user.uid, attackInput());
    assert.equal(user.input, undefined);
    const waiting = loop.waitInput();
    loop.onInput(user.uid, attackInput());
    loop.onInput(summon.uid, attackInput());
    assert.equal(await waiting, 1);
    loop.onInput(user.uid, { cmd: FightCmdEnum.cancel });
    assert.deepEqual(user.input, attackInput());
    assert.equal(loop.inputed, 2);
});

test("waitInput returns timeout only when its deadline is reached", async t => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const { loop, user } = createFight(t);
    loop.waitInputSec = 2;
    const waiting = loop.waitInput();
    loop.onInput(user.uid, attackInput());
    let settled = false;
    void waiting.then(() => { settled = true; });
    t.mock.timers.tick(1999);
    await Promise.resolve();
    assert.equal(settled, false);
    t.mock.timers.tick(1);
    assert.equal(await waiting, 0);
});

test("a new input round clears the previous round's commands and count", async t => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const { loop, user, summon } = createFight(t);
    const first = loop.waitInput();
    loop.onInput(user.uid, attackInput());
    loop.onInput(summon.uid, attackInput());
    assert.equal(await first, 1);
    const second = loop.waitInput();
    assert.equal(loop.input, 2);
    assert.equal(loop.inputed, 0);
    assert.equal(user.input, null);
    assert.equal(summon.input, null);
    loop.onInput(summon.uid, attackInput());
    loop.onInput(user.uid, attackInput());
    assert.equal(await second, 1);
});

test("processOneTurn broadcasts real attack messages without reordering side rosters", async t => {
    const { fight, loop, user, summon, monster } = createFight(t);
    user.input = attackInput();
    summon.input = attackInput();
    monster.input = { cmd: FightCmdEnum.skill }; // 当前未实现的技能不会产生攻击消息。
    const rosters = fight.AllUnits.map(units => [...units]);
    const broadcast = t.mock.method(loop, "bcMsg", () => {});
    await loop.processOneTurn();
    assert.equal(monster.attr.hp, 60);
    assert.deepEqual(broadcast.mock.calls.map(call => call.arguments), [
        [0, [["attack", 1, 11], ["onHurt", 11, 20, 100]]],
        [1, [["attack", 2, 11], ["onHurt", 11, 20, 80]]],
    ]);
    assert.deepEqual(fight.AllUnits, rosters);
});

test("run resolves with the winner after a lethal attack and completes after-turn hooks", async t => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const { fight, loop, user, summon, monster } = createFight(t);
    user.attr.attack = 110;
    t.mock.method(loop, "bcMsg", () => {});
    const after = t.mock.method(monster, "processAfterTurn", () => {});
    const running = loop.run();
    loop.onInput(user.uid, attackInput());
    loop.onInput(summon.uid, { cmd: FightCmdEnum.skill });
    assert.equal(await running, FightSideEnum.attack);
    assert.equal(fight.turn, 1);
    assert.equal(monster.isDied(), true);
    assert.equal(monster.attr.hp, 0);
    assert.equal(after.mock.callCount(), 1);
});

// 已知实现缺口：保留可执行的回归断言，修复后应移除 todo。
test("faster units act before slower units", { todo: "sortByAttr 的降序分支目前仍按升序排列" }, async t => {
    const { loop, user, summon, monster } = createFight(t);
    user.attr.speed = 20;
    summon.attr.speed = 30;
    monster.attr.speed = 10;
    const order: number[] = [];
    for (const unit of [user, summon, monster]) {
        t.mock.method(unit, "processOneTurn", (): FightContex => { order.push(unit.uid); return undefined; });
    }
    await loop.processOneTurn();
    assert.deepEqual(order, [2, 1, 11]);
});

test("dead units do not act", { todo: "processOneTurn 尚未跳过死亡单位" }, async t => {
    const { loop, user, summon, monster } = createFight(t);
    user.die();
    const order: number[] = [];
    for (const unit of [user, summon, monster]) {
        t.mock.method(unit, "processOneTurn", (): FightContex => { order.push(unit.uid); return undefined; });
    }
    await loop.processOneTurn();
    assert.deepEqual(order, [2, 11]);
});

test("monster-only fights need no input wait", { todo: "waitInput 在 input 为 0 时仍等待超时" }, async t => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const { fight, loop, monster } = createFight(t);
    fight.Sides[FightSideEnum.attack].units.splice(0);
    fight.Sides[FightSideEnum.attack].units.push(new FightUnitMonster(3, monster.attr, { name: "other" }));
    const waiting = loop.waitInput();
    t.mock.timers.tick(loop.waitInputSec * 1000);
    assert.equal(await waiting, 1);
});
