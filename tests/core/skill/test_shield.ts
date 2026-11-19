import { strict as assert } from "node:assert";
import { test } from "node:test";
import { FightCmdEnum, PropEnum as P, WeaponEnum as W, initFightContex, initSkills,
    initBuffs, getBuffData } from "../../../src";
import { setupChain, chainIds } from "../../fixtures/skill_chain";

function setup(shield?: number, combo = false) {
    const s = setupChain({ rootSelfBuff: false, finalReactions: false, change: skills => {
        if (!combo) skills[0].combo = undefined;
        for (const skill of skills) skill.damageRate = 1;
    } });
    s.target.attrOri.shield = shield;
    s.target.attrOri.weakProp = [P.金]; s.target.attrOri.weakWeapon = [W.刀];
    s.actor.attrOri.weaponProp = P.金; s.actor.attrOri.weapon = W.刀;
    s.target.calcAttr(); s.actor.calcAttr();
    // 模拟宿主在单位初始化后提供包含盾状态的初始展示数据。
    s.client.onMsg(["side", 1, s.fight.getSide(1).units.map(unit => unit.getUnitMsg())]);
    return s;
}

// 测试：一次命中多个弱点也只扣一格盾，未破时伤害减半，破盾这一击全伤并立即眩晕。
test("shield: one hit consumes one point and breaking immediately stuns", () => {
    const s = setup(2);
    s.cast(); assert.equal(s.target.attr.shield, 1); assert.equal(s.target.getHp(), 925);
    assert.equal(s.target.inStatus("眩晕"), false);
    s.cast(); assert.equal(s.target.attr.shield, 0); assert.equal(s.target.getHp(), 775);
    assert.equal(s.target.inStatus("眩晕"), true); assert.equal(s.target.isForbid("attack"), true);
    assert.equal(s.target.isForbid("skill"), true);
    assert.equal(s.fight.processUnit(s.target, { cmd: FightCmdEnum.attack, target: s.actor.uid }), undefined);
    s.cast(); assert.equal(s.target.attr.shield, 0); assert.equal(s.target.getHp(), 625);
    assert.ok(s.client.checkSame(s.fight));
    assert.doesNotMatch(s.report.toString(), /未识别消息/);
});

// 测试：非弱点攻击只受到半伤，不扣盾；shield 未配置时完全保持旧行为。
test("shield: nonweak hits preserve shield and undefined shields bypass the mechanic", () => {
    for (const [shield, hp] of [[2, 950], [undefined, 900]] as const) {
        const s = setup(shield); s.actor.attr.weaponProp = P.火; s.actor.attr.weapon = W.拳;
        s.cast(); assert.equal(s.target.getHp(), hp); assert.equal(s.target.attr.shield, shield);
        assert.equal(s.target.inStatus("眩晕"), false);
    }
});

// 测试：盾只在破盾后的下个全局回合回满，重复回合前处理不再恢复，未破盾保留剩余值。
test("shield: only broken shields refill on the next global turn", () => {
    const s = setup(2); s.cast();
    s.loop.nextTurn();
    let ctx = initFightContex(s.fight); s.loop.processBeforeTurn(2, ctx); s.flush(ctx);
    assert.equal(s.target.attr.shield, 1);
    s.cast(); assert.equal(s.target.attr.shield, 0);
    ctx = initFightContex(s.fight); s.loop.processBeforeTurn(2, ctx); s.flush(ctx);
    assert.equal(s.target.attr.shield, 0);
    s.loop.nextTurn(); ctx = initFightContex(s.fight); s.loop.processBeforeTurn(3, ctx); s.flush(ctx);
    assert.equal(s.target.attr.shield, 2); assert.equal(s.target.inStatus("眩晕"), false);
    s.cast(); ctx = initFightContex(s.fight); s.loop.processBeforeTurn(3, ctx); s.flush(ctx);
    assert.equal(s.target.attr.shield, 1); assert.ok(s.client.checkSame(s.fight));
});

// 测试：属性重算不恢复当前盾值，也不修改配置的最大盾值。
test("shield: attribute recalculation preserves current shield", () => {
    const s = setup(2); s.cast(); s.target.calcAttr();
    assert.equal(s.target.attr.shield, 1); assert.equal(s.target.attrOri.shield, 2);
    assert.ok(s.client.checkSame(s.fight));
});

// 测试：连招逐段扣盾，破盾立即阻止目标反击，后续段按已破盾的全伤结算。
test("shield: combo segments observe the shield broken by an earlier segment", () => {
    const s = setup(2, true);
    s.skills[2].nofback = false; s.target.setFBackSkill(chainIds.third); s.target.addSkill(chainIds.third, 1);
    const ctx = s.cast();
    assert.deepEqual(ctx.msgs.filter(msg => msg[0] === "hurt").map(msg => msg[4]), [75, 150, 150]);
    assert.equal(s.target.attr.shield, 0); assert.equal(s.target.getHp(), 625);
    assert.ok(!ctx.msgs.some(msg => msg[0] === "skill" && msg[4] === "fback"));
});

// 测试：未命中和未发动不扣盾，取消的伤害也不破盾。
test("shield: misses and cancelled hits do not consume shield", () => {
    const s = setup(1);
    s.skills[0].rand = 0; s.cast(); assert.equal(s.target.attr.shield, 1);
    s.skills[0].rand = 1; s.skills[0].magic = false; s.actor.attr.physic.base.hit = 0;
    s.cast(); assert.equal(s.target.attr.shield, 1);
    s.skills[0].magic = true;
    s.target.onContex("beforeHurt", (_unit, _ctx, _attacker, pending) => { pending.cancelled = true; });
    s.cast(); assert.equal(s.target.attr.shield, 1); assert.equal(s.target.inStatus("眩晕"), false);
});

// 测试：主动毒伤使用弱点扣盾，恢复盾不能解除 Buff 自己产生的眩晕。
test("shield: poison uses weakness and refill preserves unrelated stuns", () => {
    const s = setup(1);
    initSkills([{ id: 1001020, name: "破盾毒", magic: true, rand: 1, attack: {}, final: {}, func: "poison",
        sel: s.skills[0].sel }]); s.actor.addSkill(1001020, 1);
    const ctx = s.fight.processUnit(s.actor, { cmd: FightCmdEnum.skill, skill: 1001020, target: s.target.uid });
    s.flush(ctx); assert.equal(s.target.attr.shield, 0); assert.equal(s.target.getHp(), 850);
    initBuffs([{ ...getBuffData(chainIds.rest), id: 1001021, name: "额外眩晕", class: undefined,
        status: ["眩晕"], lastTurn: 0 }]);
    const added = initFightContex(s.fight); s.target.addBuff(s.actor, "test", 1001021, 1, added); s.flush(added);
    s.loop.nextTurn(); const turn = initFightContex(s.fight); s.loop.processBeforeTurn(2, turn); s.flush(turn);
    assert.equal(s.target.attr.shield, 1); assert.equal(s.target.inStatus("眩晕"), true);
});

// 测试：吸血和反伤按护盾减半后的实际伤害计算，不能使用减半前的数值。
test("shield: lifesteal and reflection use shield-reduced actual damage", () => {
    const s = setup(2);
    const initial = initFightContex(s.fight); s.actor.onHurt(s.target, "test", 500, initial); s.flush(initial);
    s.actor.attr.magic.final.bloodP = 0.5;
    s.skills[0].nodback = false;
    const ctx = s.cast();
    assert.equal(s.target.getHp(), 925); assert.equal(s.actor.getHp(), 522);
    assert.equal(ctx.msgs.find(msg => msg[0] === "heal")[4], 37);
    assert.equal(ctx.msgs.find(msg => msg[0] === "hurt" && msg[1] === "dback")[4], 15);
    assert.ok(s.client.checkSame(s.fight));
});

// 测试：盾为零表示已破盾，仍有弱点加伤但没有半伤，未配盾的 NPC 不因此眩晕。
test("shield: explicit zero is broken rather than disabled", () => {
    const s = setup(0); s.cast();
    assert.equal(s.target.getHp(), 850); assert.equal(s.target.attr.shield, 0);
    assert.equal(s.target.inStatus("眩晕"), true);
    const disabled = setup(); disabled.cast();
    assert.equal(disabled.target.getHp(), 850); assert.equal(disabled.target.inStatus("眩晕"), false);
});
