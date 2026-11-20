import { BuffTurnEnum } from "../../src/fight/Buffs/BuffDatas";
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { Fight } from "../../src/fight/Fight";
import { FightSide } from "../../src/fight/FightSide";
import { FightLoopWest } from "../../src/fight/Online/FightLoopWest";
import { FightClient } from "../../src/fight/Client/FightClient";
import { FightReport } from "../../src/fight/Client/FightReport";
import { initFightContex } from "../../src/fight/Fight";
import { initBuffs, BuffData, OverlapEnum } from "../../src/fight/Buffs/BuffDatas";
import { initPassives } from "../../src/fight/Passives/PassiveDatas";
import { initSkills } from "../../src/fight/Skills/SkillDatas";
import { FightUnitMonster } from "../../src/fight/Unit/FightUnitMonster";
import { FightCmdEnum, FightResultEnum, FightSideEnum, TargetSelectEnum } from "../../src/fight/struct";

function setup() {
    const fight = new Fight(0, { maxTurn: 2, waitInputSec: 0.01, duiwei: false }, 0);
    const sides = [new FightSide(), new FightSide()];
    sides[0].createSimpleMonster(fight, [{ id: 0, name: "A", pos: 2 }]);
    sides[1].createSimpleMonster(fight, [{ id: 1, name: "B", pos: 1 }]);
    fight.createSide(sides[0], sides[1]);
    const loop = new FightLoopWest(fight);
    const client = new FightClient();
    // 网络传输后的客户端不能通过对象引用读取服务端状态。
    loop.onMsg(msgs => {
        const batch = typeof msgs[0] === "string" ? [msgs] : msgs;
        // 只允许初始化与逐步动作消息参与验证，禁止全量状态覆盖掩盖遗漏。
        assert.ok(batch.every(msg => msg[0] !== "sync"));
        client.onMsg(JSON.parse(JSON.stringify(batch)));
    });
    return { fight, loop, client, unit: sides[0].units[0], enemy: sides[1].units[0] };
}

// 测试：初始化消息重建客户端状态，独立修改服务端状态后 checkSame 能发现差异。
test("client: initial messages reconstruct units and checkSame detects independent changes", () => {
    const { fight, loop, client, unit } = setup();
    assert.equal(client.checkSame(fight), false);
    loop.start();
    assert.equal(client.checkSame(fight), true);
    const original = unit.getUnitMsg();
    const mutations = [
        () => unit.setPos(3),
        () => { unit.display.name = "changed"; },
        () => { unit.attr.point.mp--; },
    ];
    for (const mutate of mutations) {
        mutate();
        assert.equal(client.checkSame(fight), false);
        loop.bcMsg([]);
        // 没有对应变化消息时，空批次不能修正差异。
        assert.equal(client.checkSame(fight), false);
        unit.setPos(original.pos);
        unit.display = structuredClone(original.display);
        unit.attr.point = {...original.point};
        assert.equal(client.checkSame(fight), true);
    }
});

// 测试：客户端仅靠增量消息保持治疗、Buff 增删、死亡与复活状态一致。
test("client: healing, Buff changes, death and revival stay synchronized without local configs", () => {
    const { fight, loop, client, unit, enemy } = setup();
    const data: BuffData = {
        id: 97001, name: "visible", desc: "", status: [], tags: [],
        magic: false, attackType: "base", attack: { attack: 30 }, final: {},
        overlap: OverlapEnum.REPLACE, turnType: BuffTurnEnum.thisTurn, lastTurn: 2,
        times: 0, event: "hurt", skill: 0, skillLevel: 1,
    };
    initBuffs([data, { ...data, id: 97002, notDisplay: true }]);
    loop.start();
    const flush = (run: (ctx: ReturnType<typeof initFightContex>) => void) => {
        const ctx = initFightContex(fight);
        run(ctx);
        loop.bcMsg(ctx.msgs);
        assert.equal(client.checkSame(fight), true);
    };
    flush(ctx => unit.onHurt(enemy, "test", 60, ctx));
    flush(ctx => unit.onHeal(unit, "test", 200, ctx));
    flush(ctx => { unit.addBuff(unit, "test", 97001, 2, ctx); unit.addBuff(unit, "test", 97002, 1, ctx); });
    flush(ctx => unit.addBuff(unit, "replace", 97001, 3, ctx));
    flush(ctx => unit.onHurt(enemy, "test", 10000, ctx));
    flush(ctx => { unit.onRelife(unit, "test", ctx); unit.onHeal(unit, "test", 50, ctx); });
});

// 测试：绑定战斗循环后，在回合边界和战斗结束时自动检查客户端状态。
test("client: bound loop checks round boundaries and final state", async () => {
    const { fight, loop, client } = setup();
    let checks = 0;
    const check = client.checkSame.bind(client);
    client.checkSame = f => { checks++; return check(f); };
    client.bindFightLoop(loop);
    await loop.run();
    assert.ok(checks >= 2);
    assert.equal(client.checkSame(fight), true);
});

// 被动附加两个可见 Buff，死亡只清除普通 Buff；复活不恢复已清除的 Buff。
test("client: passive-granted dieNotRemove buff stays synchronized through death and revival", () => {
    const buffId = 97003, passiveId = 97004, reviveId = 97005, clearedBuffId = 97006;
    const retainedData: BuffData = {
        id: buffId, name: "死亡保留", desc: "", status: [], tags: [],
        magic: false, attackType: "base", attack: { attack: 30 }, final: {},
        overlap: OverlapEnum.NOT, turnType: BuffTurnEnum.thisTurn, lastTurn: 0,
        times: 0, event: "hurt", skill: 0, skillLevel: 1, dieNotRemove: true,
    };
    initBuffs([retainedData, {
        ...retainedData, id: clearedBuffId, name: "死亡清除", dieNotRemove: false,
        attack: { attack: 20 },
    }]);
    initPassives([{
        id: passiveId, name: "附加两个 Buff", desc: "", status: [], tags: [],
        magic: false, attackType: "base", attack: {}, final: {}, addbuff: [[buffId, 3], [clearedBuffId, 2]],
    }]);
    initSkills([{
        id: reviveId, name: "复活", magic: true, rand: 1, func: "relife",
        sel: { target: TargetSelectEnum.friend },
        attack: {}, final: {}, healRate: 0.5,
    }]);
    const { fight, loop, client, unit: healer, enemy } = setup();
    const report = new FightReport(() => {});
    report.bindFightLoop(loop);
    const victim = new FightUnitMonster(2, healer.attrOri, { name: "携带被动的单位" }, [[passiveId, 1]]);
    victim.setPos(3);
    fight.getSide(FightSideEnum.attack).units.push(victim);
    victim.setFight(fight, FightSideEnum.attack);
    healer.addSkill(reviveId, 1);

    const retainedBuff = victim.findBuff(buffId);
    assert.ok(retainedBuff);
    assert.equal(retainedBuff.getLevel(), 3);
    const clearedBuff = victim.findBuff(clearedBuffId);
    assert.ok(clearedBuff);
    assert.equal(clearedBuff.getLevel(), 2);
    const check = (dead: boolean, hp: number, hasOrdinaryBuff: boolean) => {
        const expectedBuffs = hasOrdinaryBuff
            ? [[buffId, 3, 0, 0, 0], [clearedBuffId, 2, 0, 0, 0]]
            : [[buffId, 3, 0, 0, 0]];
        assert.equal(victim.isDied(), dead);
        assert.equal(victim.getHp(), hp);
        assert.equal(victim.findBuff(buffId), retainedBuff);
        assert.equal(victim.findBuff(clearedBuffId), hasOrdinaryBuff ? clearedBuff : undefined);
        assert.equal(victim.buffs.size, hasOrdinaryBuff ? 2 : 1);
        assert.equal(victim.attr.physic.base.attack, victim.attrOri.physic.base.attack + (hasOrdinaryBuff ? 50 : 30));
        assert.deepEqual(victim.getUnitMsg().buffs, expectedBuffs);
        const mirrored = client.getUnitById(victim.uid);
        assert.ok(mirrored);
        assert.equal(mirrored.dead, dead);
        assert.equal(mirrored.point.hp, hp);
        assert.deepEqual(mirrored.buffs, expectedBuffs);
        assert.equal(client.checkSame(fight), true);
    };

    loop.start();
    check(false, 100, true);
    // 第二个客户端故意漏收关键消息，证明一致性依赖完整的消息链。
    const missingMessageClient = new FightClient();
    missingMessageClient.onMsg(["start", fight.fid]);
    for (const side of [FightSideEnum.attack, FightSideEnum.defend]) {
        missingMessageClient.onMsg(["side", side, fight.getSide(side).units.map(u => u.getUnitMsg())]);
    }
    assert.equal(missingMessageClient.checkSame(fight), true);

    const death = initFightContex(fight);
    fight.resolveAction(() => victim.onHurt(enemy, "test", 10000, death));
    assert.ok(death.msgs.some(msg => msg[0] === "die" && msg[1] === victim.uid));
    loop.bcMsg(death.msgs);
    check(true, 0, false);
    assert.ok(death.msgs.every(msg => msg[0] !== "sync" && msg[0] !== "side"));
    const removals = death.msgs.filter(msg => msg[0] === "removeBuff");
    assert.deepEqual(removals, [["removeBuff", "die", victim.uid, victim.uid, clearedBuffId]]);
    missingMessageClient.onMsg(death.msgs.filter(msg => msg[0] !== "removeBuff"));
    assert.equal(missingMessageClient.checkSame(fight), false);
    missingMessageClient.onMsg(removals);
    assert.equal(missingMessageClient.checkSame(fight), true);
    // 同阵营还有复活者存活，战斗不会在这里结束。
    assert.equal(fight.win, FightResultEnum.ongoing);

    const revival = fight.processUnit(healer, { cmd: FightCmdEnum.skill, skill: reviveId, target: victim.uid });
    assert.ok(revival);
    assert.ok(revival.msgs.some(msg => msg[0] === "heal" && msg[2] === victim.uid));
    loop.bcMsg(revival.msgs);
    check(false, 50, false);
    assert.ok(revival.msgs.every(msg => msg[0] !== "sync" && msg[0] !== "side"));
    assert.deepEqual(revival.msgs.filter(msg => msg[0] === "relife"), [["relife", victim.uid]]);
    missingMessageClient.onMsg(revival.msgs.filter(msg => msg[0] !== "relife"));
    assert.equal(missingMessageClient.checkSame(fight), false);
    missingMessageClient.onMsg(["relife", victim.uid]);
    assert.equal(missingMessageClient.checkSame(fight), true);
    const text = report.toString();
    assert.match(text, /初始携带 \[死亡保留\]/);
    assert.match(text, /初始携带 \[死亡清除\]/);
    assert.match(text, /死亡[\s\S]*移除 \[死亡清除\]（死亡清除）[\s\S]*复活[\s\S]*恢复 50 点生命/);
    assert.doesNotMatch(text, /移除 \[死亡保留\]/);
});

// 测试：动作消息更新资源和行动顺序，新战斗清空上一场的客户端状态。
test("client: action messages update resources and order, and start resets previous battle", () => {
    const { fight, loop, client, unit } = setup();
    loop.start();
    client.onMsg(["turn", 3]);
    client.onMsg([
        ["sort", [0, 1]], ["actor", 0, 100],
        ["hurt", "test", 0, 1, 50, 50, []],
        ["heal", "test", 0, 0, 200, 50, []],
        ["costHp", 0, 10, 90], ["costMp", 0, 20, 80],
    ]);
    assert.equal(client.turn, 3);
    assert.equal(client.actor, 0);
    assert.deepEqual(client.sort, [1]);
    assert.deepEqual(client.getUnitById(0)?.point, { hp: 90, hpMax: 100, mp: 80, mpMax: 100 });
    // 本地直连也不能共享引用。
    client.getUnitById(0)!.display.name = "client only";
    assert.equal(unit.display.name, "A");
    assert.equal(client.checkSame(fight), false);
    client.onMsg(["end", 2]);
    assert.equal(client.win, 2);
    assert.equal(client.actor, undefined);
    assert.deepEqual(client.sort, []);
    client.onMsg(["start", 7]);
    assert.equal(client.fid, 7);
    assert.equal(client.turn, 0);
    assert.equal(client.win, -1);
    assert.equal(client.getUnitById(0), undefined);
    client.onMsg([]);
});

// 测试：自动一致性检查能报告差异，并可通过配置关闭。
test("client: automatic checks report differences and can be disabled", () => {
    const { loop, client } = setup();
    client.checkSame = () => false;
    client.bindFightLoop(loop);
    loop.start();
    assert.throws(() => loop.nextTurn(), /FightClient state differs/);
    client.bindFightLoop(loop, false);
    assert.doesNotThrow(() => loop.nextTurn());
});
