import { strict as assert } from "node:assert";
import { test } from "node:test";
import { SkillData, FightSkill, initSkills, initBuffs, getBuffData, initFightContex } from "../../../src";
import { magicAttackFunc } from "../../../src/fight/Skills/Funcs/NomalSkill";
import { setupChain, chainIds as ids } from "../../fixtures/skill_chain";

function useCombo(skills: SkillData[]) {
    skills[0].next = undefined; skills[0].combo = ids.second;
    skills[1].next = undefined; skills[1].combo = ids.third;
    skills[1].sel = { target: skills[1].sel.target };
    skills[2].sel = { target: skills[2].sel.target };
}

// 测试：连招继承主目标并复用连击属性与计数，但动作消息明确标记为 combo。
test("combo: reuse next attack attributes and counters with distinct combo messages", () => {
    const { actor, target, other, cast } = setupChain({ finalReactions: false, change: useCombo });
    actor.attrOri.magic.next.attack = 20; actor.calcAttr();
    const ctx = cast();
    assert.deepEqual(ctx.msgs.filter(msg => msg[0] === "hurt").map(msg => msg[4]), [40, 14, 20]);
    assert.deepEqual(ctx.msgs.filter(msg => msg[0] === "skill"), [
        ["skill", ids.first, actor.uid, target.uid],
        ["skill", ids.second, actor.uid, target.uid, "combo"],
        ["skill", ids.third, actor.uid, target.uid, "combo"],
    ]);
    assert.equal(target.getHp(), 926);
    assert.equal(other.getHp(), 1000);
    assert.equal(ctx.nextNum, 2);
    assert.equal(actor.attr.point.mp, 90);
});

// 测试：连招继承的主目标优先于后续段自己的目标排序配置。
test("combo: inherited main target takes precedence over child target sorting", () => {
    const { target, other, cast } = setupChain({ otherHp: 50, finalReactions: false, change: skills => {
        useCombo(skills); skills[1].sel.sortAttr = "hp";
    } });
    cast();
    assert.equal(target.getHp(), 790);
    assert.equal(other.getHp(), 50);
});

// 测试：连招中间段不触发反应，末段按累计实际伤害统一反伤并反击一次。
test("combo: intermediate stages suppress reactions and the last stage reflects total actual damage once", () => {
    const { actor, target, cast } = setupChain({ finalReactions: false, change: skills => {
        useCombo(skills);
        for (const skill of skills.slice(0, 3)) { skill.nofback = false; skill.nodback = false; }
    } });
    const ctx = cast();
    assert.equal(actor.getHp(), 948);
    assert.equal(target.getHp(), 790);
    assert.equal(ctx.nextNum, 2);
    assert.deepEqual(ctx.msgs.filter(msg => msg[0] === "hurt").map(msg => msg[4]), [40, 70, 100, 42, 10]);
    assert.equal(ctx.msgs.filter(msg => msg[0] === "hurt" && msg[1] === "dback").length, 1);
    assert.equal(ctx.msgs.filter(msg => msg[0] === "skill" && msg[4] === "fback").length, 1);
});

for (const stop of ["probability", "miss", "death"] as const) {
    // 测试：连招因未发动、未命中或死亡中断时，不补算延迟的反伤和反击。
    test(`combo: ${stop} interruption never settles deferred reflection or counterattack`, () => {
        const { actor, target, cast } = setupChain({ targetHp: stop === "death" ? 180 : 1000,
            change: skills => {
                useCombo(skills);
                for (const skill of skills.slice(0, 3)) { skill.nofback = false; skill.nodback = false; }
                if (stop === "probability") skills[2].rand = 0;
                if (stop === "miss") { skills[2].magic = false; skills[2].attack = { hit: -100 }; }
            } });
        const ctx = cast();
        assert.equal(actor.getHp(), 1000);
        assert.equal(target.getHp(), stop === "death" ? 0 : 890);
        assert.equal(ctx.msgs.some(msg => msg[0] === "hurt" && msg[1] === "dback"), false);
        assert.equal(ctx.msgs.some(msg => msg[0] === "skill" && msg[4] === "fback"), false);
    });
}

// 测试：事件中的嵌套动作即使攻击同一个目标，也不计入本条连招伤害。
test("combo: nested actions against the same target do not contaminate accumulated damage", () => {
    const { actor, target, cast, skills } = setupChain({ change: useCombo });
    let nested = false;
    const extra = new FightSkill({ ...skills[3], id: 98421, attack: { attack: 7 }, final: {} }, 1);
    target.onContex("hurt", (_unit, ctx) => {
        if (nested) return;
        nested = true;
        magicAttackFunc(actor, target, extra, ctx);
    });
    const ctx = cast();
    assert.equal(target.getHp(), 783);
    assert.equal(actor.getHp(), 948);
    assert.deepEqual(ctx.msgs.filter(msg => msg[0] === "hurt" && msg[1] === "dback").map(msg => msg[4]), [42]);
});

// 测试：目标死亡后立即复活仍视为连招中断，并清理临时死亡监听。
test("combo: death interrupts the chain even if the target immediately revives", () => {
    for (const hp of [30, 180]) {
        const { actor, target, cast, fight, flush } = setupChain({ targetHp: hp, change: skills => {
            useCombo(skills);
            for (const skill of skills.slice(0, 3)) { skill.nofback = false; skill.nodback = false; }
        } });
        initBuffs([{ ...getBuffData(ids.rest), id: 98422, name: "连招死亡复活", class: "relife",
            classParam: 0.5, dieNotRemove: true, lastTurn: 0 }]);
        const add = initFightContex(fight);
        target.addBuff(target, "test", 98422, 1, add); flush(add);
        const actorListeners = actor.contextEmitter.listenerCount("die");
        const targetListeners = target.contextEmitter.listenerCount("die");
        const ctx = cast();
        assert.equal(target.isDied(), false);
        assert.equal(target.getHp(), 500);
        assert.equal(actor.getHp(), 1000);
        assert.equal(ctx.msgs.some(msg => msg[0] === "hurt" && msg[1] === "dback"), false);
        assert.equal(ctx.msgs.some(msg => msg[0] === "skill" && msg[4] === "fback"), false);
        if (hp === 30) assert.equal(ctx.msgs.some(msg => msg[1] === ids.second), false);
        assert.equal(actor.contextEmitter.listenerCount("die"), actorListeners);
        // 自动复活 Buff 自身已消耗并解绑，连招不应额外残留监听。
        assert.equal(target.contextEmitter.listenerCount("die"), targetListeners - 1);
    }
});

// 测试：连招反伤使用减伤后的实际扣血累计值，不使用各段名义伤害。
test("combo: reflection uses actual damage after modifiers rather than nominal stage damage", () => {
    const { actor, target, cast } = setupChain({ change: useCombo });
    target.onContex("beforeHurt", (_unit, _ctx, _attacker, pending) => { pending.damage *= 0.5; });
    const ctx = cast();
    assert.equal(target.getHp(), 895);
    assert.equal(actor.getHp(), 969);
    assert.deepEqual(ctx.msgs.filter(msg => msg[0] === "hurt").map(msg => msg[4]), [20, 35, 50, 21, 10]);
});

// 测试：溅射伤害不计入主目标的连招反伤累计，也不提前触发普通反伤。
test("combo: splash damage is not added to the main target's reflection total", () => {
    const { actor, other, skills, cast } = setupChain({ change: data => {
        useCombo(data); data[0].spread = 98423; data[0].sel.num = 2;
    } });
    initSkills([{ ...skills[3], id: 98423, name: "连招溅射", nodback: false }]);
    other.attrOri.magic.final.dbackP = 0.2; other.calcAttr();
    const ctx = cast();
    assert.equal(other.getHp(), 900);
    assert.equal(actor.getHp(), 948);
    assert.deepEqual(ctx.msgs.filter(msg => msg[0] === "hurt" && msg[1] === "dback").map(msg => msg[4]), [42]);
});

// 测试：完整连招仍由最后一段的反伤和反击开关决定是否触发对应反应。
test("combo: the last stage's reaction switches still control the completed chain", () => {
    for (const dback of [false, true]) {
        const { actor, cast } = setupChain({ change: skills => {
            useCombo(skills);
            for (const skill of skills.slice(0, 2)) { skill.nofback = false; skill.nodback = false; }
            skills[2].nodback = !dback; skills[2].nofback = dback;
        } });
        const ctx = cast();
        assert.equal(actor.getHp(), dback ? 958 : 990);
        assert.equal(ctx.msgs.filter(msg => msg[0] === "hurt" && msg[1] === "dback").length, dback ? 1 : 0);
        assert.equal(ctx.msgs.filter(msg => msg[0] === "skill" && msg[4] === "fback").length, dback ? 0 : 1);
    }
});

// 测试：主目标死亡后停止剩余连招，不自动改为攻击其他敌人。
test("combo: target death stops remaining stages instead of selecting another enemy", () => {
    const { target, other, cast } = setupChain({ targetHp: 80, finalReactions: false, change: useCombo });
    const ctx = cast();
    assert.equal(target.isDied(), true);
    assert.equal(other.getHp(), 1000);
    assert.equal(ctx.msgs.some(msg => msg[1] === ids.third), false);
});

// 测试：第一段受击后新增的嘲讽不能改变连招继承的主目标。
test("combo: a taunt added after the first hit does not redirect the inherited target", () => {
    const { actor, target, other, cast } = setupChain({ finalReactions: false, change: useCombo });
    initBuffs([{ ...getBuffData(ids.rest), id: 98420, name: "中途嘲讽", class: "taunt", lastTurn: 0 }]);
    target.onContex("hurt", (_unit, ctx) => {
        if (!actor.findBuff(98420)) actor.addBuff(other, "test", 98420, 1, ctx);
    });
    cast();
    assert.equal(target.getHp(), 790);
    assert.equal(other.getHp(), 1000);
});

// 测试：同时配置连击与连招字段时，显式 next 优先于 combo。
test("combo: explicit next retains priority when both fields are configured", () => {
    const { actor, target, other, cast } = setupChain({ otherHp: 50, finalReactions: false, change: skills => {
        useCombo(skills);
        skills[0].next = ids.kill;
        skills[3].sel = { ...skills[3].sel, sortAttr: "hp" };
    } });
    const ctx = cast();
    assert.deepEqual(ctx.msgs.filter(msg => msg[0] === "skill" && msg[2] === actor.uid).map(msg => msg[1]),
        [ids.first, ids.kill]);
    assert.equal(target.getHp(), 960);
    assert.equal(other.isDied(), true);
});
