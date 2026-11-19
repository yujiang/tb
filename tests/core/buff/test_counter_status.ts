import { strict as assert } from "node:assert";
import { test } from "node:test";
import { initBuffs, getBuffData, initSkills, initFightContex } from "../../../src";
import { skillFBack } from "../../../src/fight/Skills/FightBack";
import { setupChain, chainIds as ids } from "../../fixtures/skill_chain";

function setup(status: string, skillCounter: boolean) {
    const pair = setupChain({ rootSelfBuff: false, finalReactions: false, change: skills => {
        skills[0].combo = undefined; skills[0].nofback = false;
    } });
    const buffId = 98500;
    initBuffs([{ ...getBuffData(ids.rest), id: buffId, class: undefined, name: status,
        status: [status], lastTurn: 0, notRemove: false }]);
    if (skillCounter) {
        initSkills([{ ...pair.skills[3], id: 98501, name: "封印测试反击", attack: {}, final: {} }]);
        pair.target.addSkill(98501, 1); pair.target.fbackSkill = 98501;
    }
    const ctx = initFightContex(pair.fight);
    const buff = pair.target.addBuff(pair.actor, "test", buffId, 1, ctx);
    pair.flush(ctx);
    return { ...pair, buff };
}

for (const status of ["封印", "眩晕"]) {
    for (const skillCounter of [false, true]) {
        // 测试：封印和眩晕阻止普通及技能反击，解除状态后恢复反击。
        test(`counterattack: ${status} blocks ${skillCounter ? "skill" : "ordinary"} counters and removal restores them`, () => {
            const { actor, target, fight, cast, flush, buff } = setup(status, skillCounter);
            assert.equal(target.isForbid("attack"), true);
            const blocked = cast();
            assert.equal(actor.getHp(), 1000);
            assert.equal(target.getHp(), 960);
            assert.equal(blocked.msgs.some(msg => msg[0] === "skill" && msg[4] === "fback"), false);
            assert.equal(blocked.fbackNum, undefined);
            const remove = initFightContex(fight);
            target.expireBuff(buff, "test", remove); flush(remove);
            assert.equal(target.isForbid("attack"), false);
            const resumed = cast();
            assert.equal(actor.getHp(), 990);
            assert.ok(resumed.msgs.some(msg => msg[0] === "skill" && msg[4] === "fback"));
        });
    }
}

// 测试：直接调用技能反击入口也先检查禁止攻击，不计次数且不抽样。
test("counterattack: direct skill counter entry also checks attack prohibition before counting or sampling", () => {
    const { fight, actor, target } = setup("封印", true);
    const ctx = initFightContex(fight);
    let samples = 0;
    fight.random = () => { samples++; return 0; };
    assert.equal(skillFBack(target, actor, target.getFBackSkill(), ctx), false);
    assert.equal(ctx.fbackNum, undefined);
    assert.deepEqual(ctx.msgs, []);
    assert.equal(samples, 0);
    assert.equal(actor.getHp(), 1000);
});

for (const skillCounter of [false, true]) {
    // 测试：单独禁止 fback 也阻止反击，不要求同时禁止普通攻击，直接反击入口同样生效。
    test(`counterattack: configured fback prohibition blocks ${skillCounter ? "skill" : "ordinary"} counters`, () => {
        const s = setup("沉默", skillCounter);
        s.target.isForbid = action => action === "fback";
        const ctx = s.cast();
        assert.equal(s.actor.getHp(), 1000);
        assert.ok(!ctx.msgs.some(msg => msg[0] === "skill" && msg[4] === "fback"));
        if (skillCounter) {
            const direct = initFightContex(s.fight);
            assert.equal(skillFBack(s.target, s.actor, s.target.getFBackSkill(), direct), false);
            assert.equal(direct.fbackNum, undefined); assert.deepEqual(direct.msgs, []);
        }
    });
}

// 测试：触发受击后才附加的禁止攻击状态也能阻止反击，未触发反击时后续连击继续。
test("counterattack: attack prohibition is rechecked after taking the triggering hit", () => {
    const { actor, target, fight, skills, flush, cast, buff } = setup("封印", false);
    const remove = initFightContex(fight);
    target.expireBuff(buff, "test", remove); flush(remove);
    target.onContex("hurt", (_unit, ctx) => target.addBuff(actor, "hit", 98500, 1, ctx));
    // 被禁止的反击没有发动，原有 next 应继续执行。
    skills[0].next = ids.second;
    skills[1].sel = { ...skills[1].sel, sortAttr: "hp" };
    const ctx = cast();
    assert.equal(actor.getHp(), 1000);
    assert.equal(target.getHp(), 790);
    assert.equal(ctx.nextNum, 2);
    assert.equal(ctx.msgs.some(msg => msg[0] === "skill" && msg[4] === "fback"), false);
});

// 测试：被封印的目标不能在连招结束后反击，但被动反伤仍然生效。
test("counterattack: a sealed target cannot counter a completed combo but still deals passive reflection", () => {
    const { actor, target, skills, cast } = setup("封印", true);
    skills[0].combo = ids.second;
    skills[2].nofback = false; skills[2].nodback = false;
    const ctx = cast();
    assert.equal(target.getHp(), 790);
    assert.equal(actor.getHp(), 958);
    assert.deepEqual(ctx.msgs.filter(msg => msg[0] === "hurt" && msg[1] === "dback").map(msg => msg[4]), [42]);
    assert.equal(ctx.msgs.some(msg => msg[0] === "skill" && msg[4] === "fback"), false);
});
