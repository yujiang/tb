import { strict as assert } from "node:assert";
import { test } from "node:test";
import { initSkills, initBuffs, getBuffData, initFightContex, FightCmdEnum, TargetSelectEnum } from "../../../src";
import { setupChain, chainIds as ids } from "../../fixtures/skill_chain";

test("skill chain: three inherited hits deal 0.4/0.7/1.0 and charge only the root cost", () => {
    const { actor, target, other, cast, report } = setupChain();
    const ctx = cast();
    assert.deepEqual(ctx.msgs.filter(msg => typeof msg[1] === "number" && msg[2] === actor.uid && msg.length >= 6)
        .map(msg => msg[1]), [ids.first, ids.second, ids.third]);
    assert.deepEqual(ctx.msgs.filter(msg => msg[0] === "hurt" && msg[2] === target.uid).map(msg => msg[4]), [40, 70, 100]);
    assert.equal(target.getHp(), 790);
    assert.equal(other.getHp(), 1000);
    assert.equal(actor.getHp(), 970); // 只有终式允许 20 反伤、10 反击。
    assert.equal(actor.attr.point.mp, 90);
    assert.equal(ctx.msgs.filter(msg => msg[0] === "costMp").length, 1);
    assert.equal(ctx.nextNum, 2);
    assert.equal(ctx.reactionSteps, 4);
    assert.ok(actor.findBuff(ids.rest));
    assert.match(report.toString(), /三连斩·一式[\s\S]*三连斩·二式[\s\S]*三连斩·终式[\s\S]*\[休息\]/);
});

test("skill chain: inherited target death stops the chain without hitting another enemy", () => {
    const { target, other, actor, cast } = setupChain({ targetHp: 80 });
    const ctx = cast();
    assert.deepEqual(ctx.msgs.filter(msg => msg[0] === "hurt").map(msg => msg[4]), [40, 40]);
    assert.equal(target.isDied(), true);
    assert.equal(other.getHp(), 1000);
    assert.ok(!ctx.msgs.some(msg => msg[1] === ids.third));
    assert.ok(actor.findBuff(ids.rest));
});

test("skill chain: final step may pursue a kill using its own configuration", () => {
    const { other, cast } = setupChain({ targetHp: 180, finalKill: true });
    const ctx = cast();
    assert.deepEqual(ctx.msgs.filter(msg => msg[0] === "hurt").map(msg => msg[4]), [40, 70, 70, 14, 100]);
    assert.equal(other.getHp(), 900);
    assert.equal(ctx.killNum, 1);
});

test("skill chain: an untriggered child stops and its probability is sampled once", () => {
    const { fight, target, cast } = setupChain({ finalReactions: false, change: skills => { skills[1].rand = 0.5; } });
    let samples = 0;
    fight.random = () => { samples++; return 0.99; };
    const ctx = cast();
    assert.equal(target.getHp(), 960);
    assert.equal(samples, 1);
    assert.ok(!ctx.msgs.some(msg => msg[1] === ids.third));
});

test("skill chain: without target inheritance the child follows its configured selection", () => {
    const { target, other, cast } = setupChain({ otherHp: 50, change: skills => {
        skills[1].sel = { ...skills[1].sel, inheritTarget: false, sortAttr: "hp" };
    } });
    const ctx = cast();
    assert.equal(target.getHp(), 960);
    assert.equal(other.isDied(), true);
    assert.deepEqual(ctx.msgs.filter(msg => msg[0] === "hurt").map(msg => msg[2]), [target.uid, other.uid]);
});

test("skill chain: terminal miss still applies that step's afterSelfBuff", () => {
    const { actor, target, cast } = setupChain({ rootSelfBuff: false, change: skills => {
        skills[2].magic = false;
        skills[2].attack = { hit: -100 };
        skills[2].afterSelfBuff = [[ids.rest, 1, 1]];
    } });
    const ctx = cast();
    assert.equal(target.getHp(), 890);
    assert.ok(ctx.msgs.some(msg => msg[1] === "miss"));
    assert.ok(actor.findBuff(ids.rest));
});

test("skill chain: configured cycles share the existing reaction limit", () => {
    const { fight, actor, target, skills } = setupChain({ rootSelfBuff: false, finalReactions: false,
        change: data => { data[0].damageRate = 0; data[0].next = ids.first; } });
    skills[0].sel.inheritTarget = true;
    initSkills(skills);
    assert.throws(() => fight.processUnit(actor, { cmd: FightCmdEnum.skill, skill: ids.first, target: target.uid }), /Reaction limit/);
});

test("skill chain: configuration can add a fourth step without a fixed combo count", () => {
    const { target, cast } = setupChain({ finalReactions: false, change: skills => {
        skills[2].next = ids.kill;
        skills[3].damageRate = 0.5;
        skills[3].sel.inheritTarget = true;
    } });
    const ctx = cast();
    assert.equal(target.getHp(), 740);
    assert.equal(ctx.nextNum, 3);
    assert.equal(ctx.msgs.filter(msg => msg[0] === "costMp").length, 1);
    assert.equal(ctx.msgs.filter(msg => msg[0] === "addBuff" && msg[4] === ids.rest).length, 1);
});

test("skill chain: inheritance follows the actual taunt-redirected target", () => {
    const { fight, actor, target, other, flush, cast } = setupChain({ finalReactions: false });
    initBuffs([{ ...getBuffData(ids.rest), id: 98006, name: "嘲讽", class: "taunt", notRemove: false }]);
    const ctx = initFightContex(fight);
    actor.addBuff(other, "test", 98006, 1, ctx); flush(ctx);
    const result = cast();
    assert.equal(target.getHp(), 1000);
    assert.equal(other.getHp(), 790);
    assert.deepEqual(result.msgs.filter(msg => msg[0] === "hurt").map(msg => msg[2]), [other.uid, other.uid, other.uid]);
});

test("skill chain: a source killed by reaction stops the remaining steps and does not gain self buffs", () => {
    const { fight, actor, target } = setupChain({ actorHp: 30 });
    target.onContex("hurt", (_u, ctx) => actor.onHurt(target, "reaction", 1000, ctx));
    const ctx = fight.processUnit(actor, { cmd: FightCmdEnum.skill, skill: ids.first, target: target.uid });
    assert.ok(ctx);
    assert.equal(actor.isDied(), true);
    assert.ok(!ctx.msgs.some(msg => msg[1] === ids.second || msg[1] === ids.third));
    assert.equal(actor.findBuff(ids.rest), undefined);
});

test("skill chain: afterSelfBuff also works for a configured healing skill", () => {
    const { fight, actor, flush } = setupChain();
    initSkills([{ id: 98007, name: "治疗后休息", magic: true, rand: 1, attack: {}, final: {},
        func: "heal", sel: { target: TargetSelectEnum.self }, cost: { mp: 5 }, afterSelfBuff: [[ids.rest, 1, 1]] }]);
    actor.addSkill(98007, 1);
    const ctx = fight.processUnit(actor, { cmd: FightCmdEnum.skill, skill: 98007, target: actor.uid });
    assert.ok(ctx); flush(ctx);
    assert.ok(actor.findBuff(ids.rest));
    assert.equal(actor.attr.point.mp, 95);
    assert.equal(ctx.msgs.filter(msg => msg[0] === "addBuff").length, 1);
});
