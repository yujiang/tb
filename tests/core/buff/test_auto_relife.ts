import { strict as assert } from "node:assert";
import { test } from "node:test";
import { Fight, FightSide, FightLoopWest, FightUnitMonster, FightClient, FightReport,
    BuffData, initBuffs, getBuffData, initPassives, OverlapEnum, initFightContex, FightCmdEnum, FightResultEnum } from "../../../src";

const reviveId = 97701, ordinaryId = 97702, passiveId = 97703;

function setup(extra: Partial<BuffData> = {}, forbidden = false,
    configure?: (attacker: FightUnitMonster, unit: FightUnitMonster) => void) {
    const data: BuffData = {
        id: reviveId, name: "涅槃", desc: "死亡自动复活", class: "relife", classParam: 0.3,
        overlap: OverlapEnum.REPLACE, status: [], tags: [], magic: false, attackType: "base",
        attack: {}, final: {}, lastTurn: 0, times: 1, event: "die", prior: 1000,
        useInputTurn: false, skill: 0, skillLevel: 1, notRemove: true, dieNotRemove: true, ...extra,
    };
    initBuffs([data, { ...data, id: ordinaryId, class: undefined, name: "普通增益", event: "hurt",
        dieNotRemove: false, times: 2, attack: { attack: 10 } }]);
    initPassives([{
        id: passiveId, name: "自复活被动", desc: "", status: forbidden ? ["禁复活"] : [], tags: [],
        magic: false, attackType: "base", attack: {}, final: {}, addbuff: [[reviveId, 1], [ordinaryId, 1]],
    }]);
    const fight = new Fight(97700, { maxTurn: 10, waitInputSec: 1, duiwei: false }, 0);
    const a = new FightSide(), b = new FightSide();
    a.createSimpleMonster(fight, [{ id: 0, name: "攻击者", pos: 0 }]);
    b.createSimpleMonster(fight, [{ id: 1, name: "准备单位", pos: 0 }]);
    const unit = new FightUnitMonster(1, b.units[0].attrOri, { name: "涅槃者" }, [[passiveId, 1]]);
    unit.setPos(0); b.units[0] = unit;
    if (forbidden) {
        const ally = new FightUnitMonster(2, unit.attrOri, { name: "存活队友" });
        ally.setPos(1); b.units.push(ally);
    }
    fight.createSide(a, b);
    const attacker = a.units[0];
    configure?.(attacker as FightUnitMonster, unit);
    const loop = new FightLoopWest(fight), client = new FightClient(), report = new FightReport(() => {}, false);
    loop.onMsg(msgs => {
        const wire = JSON.parse(JSON.stringify(msgs));
        client.onMsg(wire); report.onMsg(wire);
    });
    loop.start();
    const hurt = (hp: number) => {
        const ctx = initFightContex(fight);
        const damage = fight.resolveAction(() => unit.onHurt(attacker, "test", hp, ctx));
        loop.bcMsg(ctx.msgs);
        assert.equal(client.checkSame(fight), true);
        return { ctx, damage };
    };
    return { fight, unit, attacker, loop, client, report, hurt };
}

test("auto relife: actual death clears normal buffs then revives before outcome checking", () => {
    const { fight, unit, report, hurt } = setup();
    const deadStates: boolean[] = [];
    unit.onContex("die", u => deadStates.push(u.isDied()), 0);
    const result = hurt(1000);
    assert.equal(result.damage, 100);
    assert.deepEqual(deadStates, [true]);
    assert.equal(unit.isDied(), false);
    assert.equal(unit.getHp(), 30);
    assert.equal(fight.win, FightResultEnum.ongoing);
    assert.equal(unit.findBuff(ordinaryId), undefined);
    assert.equal(unit.findBuff(reviveId), undefined);
    assert.equal(unit.contextEmitter.listenerCount("hurt"), 0);
    assert.equal(unit.contextEmitter.listenerCount("die"), 1); // 仅保留测试观察者
    const kinds = result.ctx.msgs.map(msg => msg[0]);
    assert.ok(kinds.indexOf("die") < kinds.indexOf("buffTrigger"));
    assert.ok(kinds.indexOf("buffTrigger") < kinds.indexOf("relife"));
    assert.ok(kinds.indexOf("relife") < kinds.indexOf("heal"));
    assert.match(report.toString(), /死亡[\s\S]*\[涅槃\]触发[\s\S]*复活[\s\S]*恢复 30 点生命/);
    assert.doesNotMatch(report.toString(), /未识别消息/);
    hurt(1000);
    assert.equal(unit.isDied(), true);
    assert.equal(fight.win, FightResultEnum.attack);
});

test("auto relife: reapplying the buff does not refresh the battle opportunity", () => {
    const { fight, unit, loop, hurt } = setup();
    hurt(1000);
    assert.equal(unit.isDied(), false);
    assert.equal(unit.getHp(), 30);
    const ctx = initFightContex(fight);
    unit.addBuff(unit, "reapply", reviveId, 1, ctx);
    loop.bcMsg(ctx.msgs);
    const next = hurt(1000);
    assert.equal(unit.isDied(), true);
    assert.ok(!next.ctx.msgs.some(msg => msg[0] === "relife" || msg[0] === "buffTrigger"));
});

test("auto relife: forbidden revival does not trigger or consume the opportunity", () => {
    const { fight, unit, attacker, loop, hurt } = setup({}, true);
    const blocked = hurt(1000);
    assert.equal(unit.isDied(), true);
    assert.equal(unit.findBuff(reviveId)?.times, 1);
    assert.equal(fight.win, FightResultEnum.ongoing);
    assert.ok(blocked.ctx.msgs.some(msg => msg[0] === "无法复活"));
    assert.ok(!blocked.ctx.msgs.some(msg => msg[0] === "relife" || msg[0] === "buffTrigger"));
    // 队友维持战斗，外部复活并解除禁止后，自动复活机会应仍未消耗。
    unit.setPassiveSkills([]);
    const ctx = initFightContex(fight);
    unit.onRelife(attacker, "test", ctx);
    unit.onHeal(attacker, "test", 100, ctx);
    loop.bcMsg(ctx.msgs);
    assert.equal(hurt(1000).ctx.msgs.filter(msg => msg[0] === "relife").length, 1);
});

test("auto relife: default ratio is one fifth and small positive ratios restore at least 1 HP", () => {
    for (const [ratio, hp] of [[undefined, 20], [0.001, 1], [1, 100]] as const) {
        const { unit, hurt } = setup({ classParam: ratio });
        hurt(1000);
        assert.equal(unit.getHp(), hp);
        assert.equal(unit.isDied(), false);
    }
});

test("auto relife: death removal is respected when dieNotRemove is false", () => {
    const { unit, hurt } = setup({ dieNotRemove: false });
    const result = hurt(1000);
    assert.equal(unit.isDied(), true);
    assert.equal(unit.contextEmitter.listenerCount("die"), 0);
    assert.ok(!result.ctx.msgs.some(msg => msg[0] === "relife"));
});

test("auto relife: the attack pipeline counts full lethal damage and continues reactions", () => {
    const { fight, unit, attacker, loop, client } = setup({}, false, (a, u) => {
        a.attr.point.hp = 20;
        a.attrOri.physic.base.attack = 150;
        a.attrOri.physic.base.critP = 0;
        a.attrOri.physic.base.hit = 100;
        a.attrOri.physic.final.bloodP = 0.5;
        a.attrOri.physic.next.rand = 0;
        a.attrOri.physic.kill.rand = 0;
        a.attrOri.physic.spread.rand = 0;
        u.attrOri.physic.base.defend = 0;
        u.attrOri.physic.base.dodge = 0;
        u.attrOri.physic.final.dbackP = 0.2;
        u.attrOri.physic.fback.rand = 0;
        a.calcAttr(); u.calcAttr();
    });
    const ctx = fight.processUnit(attacker, { cmd: FightCmdEnum.attack, target: unit.uid });
    assert.ok(ctx);
    loop.bcMsg(ctx.msgs);
    assert.equal(unit.getHp(), 30);
    assert.equal(unit.enemyHurt.get(attacker.uid), 100);
    assert.equal(attacker.getHp(), 50); // 20 + 50 吸血 - 20 反伤
    assert.equal(fight.win, FightResultEnum.ongoing);
    assert.equal(client.checkSame(fight), true);
});

test("auto relife: invalid ratios are rejected instead of producing a living unit with zero HP", () => {
    for (const classParam of [0, -0.1, 1.1, NaN, Infinity, "0.5"]) {
        assert.throws(() => setup({ classParam }), /relife classParam must be a number in \(0, 1\]/);
    }
});

test("auto relife: replacement, dispel and expiration unregister death listeners", () => {
    const { unit, fight, loop, client, hurt } = setup({ notRemove: false, lastTurn: 1 });
    const ctx = initFightContex(fight);
    const old = unit.findBuff(reviveId);
    unit.addBuff(unit, "replace", reviveId, 1, ctx);
    assert.notEqual(unit.findBuff(reviveId), old);
    assert.equal(unit.contextEmitter.listenerCount("die"), 1);
    unit.removeBuff(unit, "dispel", reviveId, 99, ctx);
    assert.equal(unit.contextEmitter.listenerCount("die"), 0);
    unit.addBuff(unit, "test", reviveId, 1, ctx);
    unit.processBeforeTurn(1, ctx);
    assert.equal(unit.findBuff(reviveId), undefined);
    assert.equal(unit.contextEmitter.listenerCount("die"), 0);
    loop.bcMsg(ctx.msgs);
    assert.equal(client.checkSame(fight), true);
    hurt(1000);
    assert.equal(unit.isDied(), true);
});

test("auto relife: unyielding triggers first, then auto revival on the next lethal hit", () => {
    const { unit, fight, loop, hurt } = setup();
    initBuffs([{ ...getBuffData(reviveId), id: 97704, class: "buqu", name: "不屈", event: "beforeHurt" }]);
    const ctx = initFightContex(fight);
    unit.addBuff(unit, "test", 97704, 1, ctx);
    loop.bcMsg(ctx.msgs);
    const first = hurt(1000);
    assert.equal(unit.getHp(), 1);
    assert.equal(unit.findBuff(reviveId)?.times, 1);
    assert.ok(!first.ctx.msgs.some(msg => msg[0] === "die" || msg[0] === "relife"));
    const second = hurt(1000);
    assert.equal(unit.getHp(), 30);
    assert.ok(second.ctx.msgs.some(msg => msg[0] === "die"));
    assert.ok(second.ctx.msgs.some(msg => msg[0] === "relife"));
    hurt(1000);
    assert.equal(unit.isDied(), true);
});

test("auto relife: a new battle grants a reused unit another successful revival", () => {
    const { unit, attacker, hurt } = setup();
    hurt(1000);
    const nextFight = new Fight(97705, { maxTurn: 1, waitInputSec: 1, duiwei: false }, 0);
    const a = new FightSide(), b = new FightSide();
    a.units.push(attacker); b.units.push(unit);
    nextFight.createSide(a, b);
    const ctx = initFightContex(nextFight);
    unit.addBuff(unit, "new battle", reviveId, 1, ctx);
    nextFight.resolveAction(() => unit.onHurt(attacker, "test", 1000, ctx));
    assert.equal(unit.isDied(), false);
    assert.equal(unit.getHp(), 30);
    assert.equal(nextFight.win, FightResultEnum.ongoing);
});
