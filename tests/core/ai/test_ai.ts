import { strict as assert } from "node:assert";
import { test } from "node:test";
import { FightAI, FightRuleHp, FightRuleTurn, FightRuleHurt, FightCmdEnum, FightInput, FightUnit,
    initFightContex, initSkills, initPassives, HurtOptions, FightLoopPC, FightLoopWest, FightLoopYanYu,
    fightMsg } from "../../../src";
import { setupChain, chainIds } from "../../fixtures/skill_chain";

const counter = 1001100, cycle = 1001101;
function setup() {
    const s = setupChain({ rootSelfBuff: false, finalReactions: false, change: skills => {
        skills[0].combo = undefined; for (const skill of skills) skill.damageRate = 1;
    } });
    initSkills([{ id: counter, name: "计次攻击", magic: true, rand: 1, attack: {}, final: {},
        nofback: true, nodback: true, nosupport: true, sel: s.skills[0].sel },
    { id: cycle, name: "周期大招", magic: true, rand: 1, attack: { attack: 100 }, final: {},
        nofback: true, nodback: true, nosupport: true, sel: s.skills[0].sel }]);
    s.target.addSkill(counter, 1); s.target.addSkill(cycle, 1);
    s.target.attrOri.magic.fback.attack = 20; s.target.calcAttr();
    const hurt = (damage: number, options: HurtOptions = { source: "skill" }) => {
        const ctx = initFightContex(s.fight);
        s.fight.resolveAction(() => s.target.onHurt(s.actor, "test", damage, ctx, options)); s.flush(ctx); return ctx;
    };
    const heal = (amount: number) => {
        const ctx = initFightContex(s.fight); s.target.onHeal(s.actor, "test", amount, ctx); s.flush(ctx);
    };
    return { ...s, hurt, heal };
}

// 测试：没有 AI 时仍使用 inputSkill、技能列表首项和无技能普攻的原有选择顺序。
test("AI: no configured AI preserves legacy monster input", () => {
    const s = setup(), ctx = initFightContex(s.fight);
    s.target.inputSkill = cycle; s.target.inputStart(1, ctx); assert.equal(s.target.input.skill, cycle);
    s.target.inputSkill = 0; s.target.inputStart(2, ctx); assert.equal(s.target.input.skill, counter);
    s.target.skills.clear(); s.target.inputStart(3, ctx); assert.equal(s.target.input.cmd, FightCmdEnum.none);
});

// 测试：有 AI 时由 waitInput 提供指令，每次只推进一次输入边界，切回无 AI 后恢复旧行为。
test("AI: waitInput owns command choice without duplicating the input boundary", () => {
    const s = setup(); let calls = 0;
    class TestAI extends FightAI {
        override waitInput(unit: FightUnit, turn: number): FightInput {
            assert.equal(unit, s.target); assert.equal(turn, 3); calls++; return { cmd: FightCmdEnum.defend };
        }
    }
    s.target.ai = new TestAI(); s.target.inputSkill = cycle;
    s.target.inputStart(3, initFightContex(s.fight));
    assert.equal(s.target.input.cmd, FightCmdEnum.defend); assert.equal(s.target.myInputTurn, 1); assert.equal(calls, 1);
    s.target.ai = undefined; s.target.inputStart(4, initFightContex(s.fight)); assert.equal(s.target.input.skill, cycle);
});

// 测试：血轴在跨线时增攻，各比例相加且每条只触发一次，回血后再次跨线不重复触发。
test("Rule HP: thresholds stack once and do not retrigger after healing", () => {
    const s = setup(); s.target.addRule(new FightRuleHp({ type: "hp", lines: [{ hp: 0.7, attackRate: 0.2 }, { hp: 0.4, attackRate: 0.3 }] }));
    const first = s.hurt(350); assert.equal(s.target.attr.magic.base.attack, 120);
    assert.equal(first.msgs.filter(msg => msg[0] === "aiHp").length, 1);
    s.heal(500); const again = s.hurt(350); assert.equal(s.target.attr.magic.base.attack, 120);
    assert.ok(!again.msgs.some(msg => msg[0] === "aiHp"));
    s.hurt(300); assert.equal(s.target.attr.magic.base.attack, 150); assert.equal(s.target.attr.physic.base.attack, 150);
    assert.equal(s.target.attr.magic.fback.attack, 30); assert.equal(s.target.attrOri.magic.base.attack, 100);
    assert.doesNotMatch(s.report.toString(), /未识别消息/);
});

// 测试：单次跨过多条血线全部生效，属性重算不累计叠乘，正常属性修正后再应用血轴比例。
test("Rule HP: large hits and attribute recalculation preserve additive threshold bonuses", () => {
    const s = setup(); s.target.addRule(new FightRuleHp({ type: "hp", lines: [{ hp: 0.8, attackRate: 0.2 }, { hp: 0.5, attackRate: 0.3 }] }));
    const ctx = s.hurt(600); assert.equal(ctx.msgs.filter(msg => msg[0] === "aiHp").length, 2);
    s.target.calcAttr(); s.target.calcAttr(); assert.equal(s.target.attr.physic.base.attack, 150);
    initPassives([{ id: 1001102, name: "攻击被动", desc: "", magic: false, attackType: "base", attack: { attack: 10 },
        final: {}, status: [], tags: [] }]);
    s.target.setPassiveSkills([[1001102, 1]]); assert.equal(s.target.attr.physic.base.attack, 165);
    assert.equal(s.target.attrOri.physic.base.attack, 100);
    s.target.removeRule(s.target.rules[0]); assert.equal(s.target.attr.physic.base.attack, 110);
});

// 测试：保护分担扣血也触发血轴，但仍不发普通 hurt 反应事件。
test("Rule HP: shared damage changes health phases without ordinary hurt reactions", () => {
    const s = setup(); s.target.addRule(new FightRuleHp({ type: "hp", lines: [{ hp: 0.7, attackRate: 0.5 }] }));
    let hurts = 0; s.target.onContex("hurt", () => { hurts++; });
    s.hurt(400, { source: "share" });
    assert.equal(s.target.attr.magic.base.attack, 150); assert.equal(hurts, 0);
});

// 测试：死亡复活不刷新血轴阶段，新战斗重置阶段且不重复注册监听，结束后解绑。
test("Rule HP: revival preserves phases while a new fight resets and rebinds once", () => {
    const s = setup(); s.target.addRule(new FightRuleHp({ type: "hp", lines: [{ hp: 0.7, attackRate: 0.5 }] }));
    s.hurt(1000); const ctx = initFightContex(s.fight); s.target.onRelife(s.actor, "test", ctx);
    s.target.onHeal(s.actor, "test", 1000, ctx); s.flush(ctx);
    assert.equal(s.target.attr.magic.base.attack, 150);
    s.loop.end(); assert.equal(s.target.contextEmitter.listenerCount("hp"), 0);
    s.loop.start(); assert.equal(s.target.attr.magic.base.attack, 100);
    assert.equal(s.target.contextEmitter.listenerCount("hp"), 1);
    s.loop.start(); assert.equal(s.target.contextEmitter.listenerCount("hp"), 1);
});

// 测试：周期按全局回合 N、2N 插入大招，普通输入不被替换，同一回合不重复插入。
test("rule turn: periodic skills insert once without replacing ordinary input", () => {
    const s = setup(); s.target.addRule(new FightRuleTurn({ type: "turn", every: 3, skill: cycle }));
    s.fight.turn = 0;
    for (let turn = 1; turn <= 6; turn++) {
        s.loop.nextTurn();
        const before = initFightContex(s.fight); s.loop.processBeforeTurn(turn, before); s.flush(before);
        s.target.inputStart(turn, initFightContex(s.fight));
        assert.equal(s.target.input.cmd, FightCmdEnum.attack);
        assert.equal(s.loop.actions.filter(action => action.inserted).length, turn % 3 === 0 ? 1 : 0);
        if (turn % 3 === 0) {
            const ctx = s.fight.processUnit(s.target, { cmd: FightCmdEnum.skill, skill: cycle, target: s.actor.uid }); s.flush(ctx);
            assert.ok(ctx.msgs.some(msg => msg[0] === "skill" && msg[1] === cycle));
            const again = initFightContex(s.fight); s.loop.processBeforeTurn(turn, again); s.flush(again);
            assert.equal(s.loop.actions.filter(action => action.inserted).length, 1);
            s.target.inputStart(turn, initFightContex(s.fight)); assert.equal(s.target.input.cmd, FightCmdEnum.attack);
        }
    }
    assert.equal(s.actor.getHp(), 600); assert.equal(s.target.attr.point.mp, 100);
});

// 测试：周期大招处于冷却或技能封印时回退普攻，技能的 CD 仍通过公共技能流程处理。
test("rule turn: cooldown and skill prohibition prevent insertion", () => {
    const s = setup(); s.target.findSkill(cycle).getXls().cd = 2; s.target.addRule(new FightRuleTurn({ type: "turn", every: 1, skill: cycle }));
    s.flush(s.fight.processUnit(s.target, { cmd: FightCmdEnum.skill, skill: cycle, target: s.actor.uid }));
    s.loop.nextTurn();
    const before = initFightContex(s.fight); s.loop.processBeforeTurn(2, before); s.flush(before);
    assert.ok(!s.loop.actions.some(action => action.inserted));
    s.loop.nextTurn(); s.target.isForbid = action => action === "skill";
    const sealed = initFightContex(s.fight); s.loop.processBeforeTurn(3, sealed); s.flush(sealed);
    assert.ok(!s.loop.actions.some(action => action.inserted));
    s.target.isForbid = () => false;
    const ready = initFightContex(s.fight); s.loop.processBeforeTurn(3, ready); s.flush(ready);
    assert.ok(s.loop.actions.some(action => action.input?.skill === cycle));
});

// 测试：每两次直接攻击扣血后发动新攻击，使用普通攻击属性、不受 nofback 限制、不改变行动条。
test("Rule hurt: every N hits trigger a new normal attack without changing the action bar", () => {
    const s = setup(); s.target.addRule(new FightRuleHurt({ type: "hurt", every: 2, skill: counter }));
    s.cast(); assert.equal(s.actor.getHp(), 1000);
    const bar = [...s.client.sort], turn = s.target.myInputTurn;
    const ctx = s.cast(); assert.equal(s.actor.getHp(), 900);
    assert.ok(ctx.msgs.some(msg => msg[0] === "aiAttack" && msg[1] === s.target.uid && msg[2] === s.actor.uid));
    assert.ok(!ctx.msgs.some(msg => msg[4] === "fback"));
    assert.deepEqual(s.client.sort, bar); assert.equal(s.target.myInputTurn, turn);
    s.cast(); s.cast(); assert.equal(s.actor.getHp(), 800); assert.equal(s.target.fbackSkill, 0);
});

// 测试：Buff、反伤、反射、分担和零伤害不累计直接攻击次数。
test("Rule hurt: nonattack sources and zero damage do not count", () => {
    const s = setup(); s.target.addRule(new FightRuleHurt({ type: "hurt", every: 2, skill: counter }));
    for (const source of ["buff", "dback", "reflect", "share"] as const) s.hurt(1, { source });
    s.hurt(0);
    s.cast(); assert.equal(s.actor.getHp(), 1000); s.cast(); assert.equal(s.actor.getHp(), 900);
});

// 测试：三段连招的受伤计次新攻击在整条 action 结束后执行，不插到连招中间。
test("Rule hurt: the new attack runs only after the complete combo action", () => {
    const s = setup(); s.target.addRule(new FightRuleHurt({ type: "hurt", every: 2, skill: counter })); s.skills[0].combo = chainIds.second;
    const during: number[] = []; s.target.onContex("hurt", () => during.push(s.actor.getHp()));
    const ctx = s.cast(); assert.deepEqual(during, [1000, 1000, 1000]); assert.equal(s.actor.getHp(), 900);
    const skills = ctx.msgs.filter(msg => msg[0] === "skill");
    assert.deepEqual(skills.map(msg => msg[1]), [chainIds.first, chainIds.second, chainIds.third, counter]);
});

// 测试：禁止攻击时不出手，解除后按有效受伤计次出手，致死伤害不产生死者攻击。
test("Rule hurt: attack prohibition and death prevent the deferred new attack", () => {
    const s = setup(); s.target.addRule(new FightRuleHurt({ type: "hurt", every: 2, skill: counter })); s.target.isForbid = action => action === "attack";
    s.cast(); s.cast(); assert.equal(s.actor.getHp(), 1000);
    s.target.isForbid = () => false; s.cast(); s.cast(); assert.equal(s.actor.getHp(), 900);
    s.hurt(1); s.hurt(1000); assert.equal(s.target.isDied(), true); assert.equal(s.actor.getHp(), 900);
});

// 测试：AI 新攻击仍属于直接攻击，可以累计对方受伤轴，任一方死亡后停止后续攻击。
test("Rule hurt: new attacks can trigger the opposing axis and stop when a unit dies", () => {
    const s = setup(); s.target.addRule(new FightRuleHurt({ type: "hurt", every: 1, skill: counter }));
    s.actor.addSkill(counter, 1); const otherAI = new FightRuleHurt({ type: "hurt", every: 1, skill: counter }); otherAI.bind(s.actor);
    const ctx = s.cast(); assert.equal(ctx.msgs.filter(msg => msg[0] === "aiAttack").length, 18);
    assert.ok(!ctx.msgs.some(msg => msg[4] === "fback"));
    assert.equal(s.actor.getHp(), 100); assert.equal(s.target.isDied(), true); otherAI.unbind(s.actor);
});

// 测试：移除规则会解绑监听并取消旧规则已登记的新攻击，不在动作结束后继续执行旧行为。
test("Rule: removing a rule cancels its listeners and deferred reactions", () => {
    const s = setup(); s.target.addRule(new FightRuleHurt({ type: "hurt", every: 1, skill: counter }));
    s.target.onContex("hurt", () => { s.target.removeRule(s.target.rules[0]); }, 1);
    s.cast(); assert.equal(s.actor.getHp(), 1000); assert.equal(s.target.ai, undefined);
    assert.equal(s.target.contextEmitter.listenerCount("hurt"), 1);
});

for (const Loop of [FightLoopPC, FightLoopWest, FightLoopYanYu]) {
    // 测试：三种真实循环都执行周期规则插入的技能，普通行动仍然保留。
    test(`Rule integration: ${Loop.name} executes the inserted rule action`, async () => {
        const s = setup(), loop = new Loop(s.fight), messages: fightMsg[] = [];
        s.target.addRule(new FightRuleTurn({ type: "turn", every: 1, skill: cycle }));
        loop.onMsg(msgs => {
            const batch = typeof msgs[0] === "string" ? [msgs as fightMsg] : msgs as fightMsg[];
            messages.push(...batch); s.loop.bcMsg(msgs);
        });
        if (loop instanceof FightLoopPC) loop.on("input", unit => loop.onInput(unit.uid, { cmd: FightCmdEnum.defend }));
        loop.start(); s.fight.turn = 0; loop.nextTurn();
        const ctx = initFightContex(s.fight);
        loop.processBeforeTurn(1, ctx);
        if (loop instanceof FightLoopWest) {
            const waiting = loop.waitInput(1, ctx);
            loop.onInput(s.actor.uid, { cmd: FightCmdEnum.defend, turn: 1 }); await waiting;
        } else await loop.waitInput(1, ctx);
        loop.bcMsg(ctx.msgs); await loop.processOneTurn(1);
        assert.equal(messages.filter(msg => msg[0] === "skill" && msg[1] === cycle && msg[2] === s.target.uid).length, 1);
        assert.equal(s.target.myInputTurn, 1); assert.ok(s.client.checkSame(s.fight)); loop.end();
    });
}

// 测试：禁止 attack 期间受伤完全不累计，解除后的第 N 次有效受伤才发动新攻击。
test("Rule hurt: damage received while attack is forbidden does not advance the axis", () => {
    const s = setup(); s.target.addRule(new FightRuleHurt({ type: "hurt", every: 3, skill: counter }));
    s.target.isForbid = action => action === "attack";
    s.hurt(1); s.hurt(1);
    s.target.isForbid = () => false;
    s.hurt(1); s.hurt(1); assert.equal(s.actor.getHp(), 1000);
    s.hurt(1); assert.equal(s.actor.getHp(), 900);
});

// 测试：不指定技能时复用装配普攻，使用基础攻击属性，禁止 fback 不限制这次新攻击。
test("Rule hurt: default response uses the equipped normal attack rather than counter attributes", () => {
    const s = setup(); s.target.setAttackSkill(cycle); s.target.addRule(new FightRuleHurt({ type: "hurt", every: 1 }));
    s.target.isForbid = action => action === "fback";
    const ctx = s.cast(); assert.equal(s.actor.getHp(), 800);
    assert.ok(ctx.msgs.some(msg => msg[0] === "skill" && msg[1] === cycle && msg[2] === s.target.uid));
    assert.equal(s.target.myInputTurn, 0); assert.equal(s.target.attr.point.mp, 100);
    assert.ok(!ctx.msgs.some(msg => msg[4] === "fback"));
});

// 测试：HP 事件覆盖真实扣血和截断后的回血，零伤害与满血治疗不产生虚假的生命变化事件。
test("Rule events: hp reports actual life changes only", () => {
    const s = setup(), changes: number[][] = [];
    s.target.onContex("hp", (_unit, _ctx, _attacker, previous, current) => changes.push([previous, current]));
    s.hurt(300); s.heal(1000); s.hurt(0); s.heal(100);
    assert.deepEqual(changes, [[1000, 700], [700, 1000]]);
});

// 测试：受伤轴新增攻击共用原反应预算，高血量双方互相触发也不能通过新上下文绕过动作上限。
test("Rule hurt: repeated new attacks share the existing reaction limit", () => {
    const s = setup();
    for (const unit of [s.actor, s.target]) {
        unit.attrOri.point.hpMax = 100000; unit.attr.point.hp = 100000; unit.calcAttr();
    }
    s.loop.start();
    s.target.addRule(new FightRuleHurt({ type: "hurt", every: 1, skill: counter })); s.actor.addSkill(counter, 1);
    const attackerAI = new FightRuleHurt({ type: "hurt", every: 1, skill: counter }); attackerAI.bind(s.actor);
    assert.throws(() => s.cast(), /Reaction limit/);
    attackerAI.unbind(s.actor); s.target.ai = undefined;
});

// 测试：血轴、回合轴和受伤轴同时存在，周期规则插入独立行动，其他事件和属性修正仍然生效。
test("Rule coexistence: all three axes contribute without replacing each other", () => {
    const s = setup(), hp = new FightRuleHp({ type: "hp", lines: [{ hp: 0.7, attackRate: 0.5 }] }),
        turn = new FightRuleTurn({ type: "turn", every: 3, skill: cycle }), hurt = new FightRuleHurt({ type: "hurt", every: 2, skill: counter });
    s.target.addRule(hp, 10); s.target.addRule(hurt, 5); s.target.addRule(turn);
    assert.deepEqual(s.target.rules, [turn, hurt, hp]);
    s.hurt(400, { source: "buff" }); assert.equal(s.target.attr.magic.base.attack, 150);
    s.fight.turn = 2; s.loop.nextTurn(); const before = initFightContex(s.fight); s.loop.processBeforeTurn(3, before); s.flush(before);
    s.target.inputStart(3, initFightContex(s.fight)); assert.equal(s.target.input.cmd, FightCmdEnum.attack); assert.ok(s.loop.actions.some(action => action.input?.skill === cycle));
    s.cast(); s.cast(); assert.equal(s.actor.getHp(), 850);
    assert.equal(s.target.contextEmitter.listenerCount("hp"), 1); assert.equal(s.target.contextEmitter.listenerCount("hurt"), 1);
    assert.equal(s.target.removeRule(hp), true); assert.equal(s.target.attr.magic.base.attack, 100);
    assert.equal(s.target.contextEmitter.listenerCount("hp"), 0); assert.equal(s.target.contextEmitter.listenerCount("hurt"), 1);
});

// 测试：仅当前单个 AI 选择普通行动，切换 AI 后旧决策不再调用，指令保存副本。
test("AI: only the currently assigned decision maker provides input", () => {
    const s = setup(), calls: string[] = [], decision: FightInput = { cmd: FightCmdEnum.defend };
    class DecisionAI extends FightAI {
        constructor(private label: string, private input?: FightInput) { super(); }
        override waitInput(): FightInput | undefined { calls.push(this.label); return this.input; }
    }
    const first = new DecisionAI("first", decision), second = new DecisionAI("second", { cmd: FightCmdEnum.attack });
    s.target.ai = first;
    s.target.inputStart(1, initFightContex(s.fight));
    assert.deepEqual(calls, ["first"]); assert.equal(s.target.input.cmd, FightCmdEnum.defend);
    decision.cmd = FightCmdEnum.attack; assert.equal(s.target.input.cmd, FightCmdEnum.defend);
    s.target.ai = second; calls.length = 0; s.target.inputStart(2, initFightContex(s.fight));
    assert.deepEqual(calls, ["second"]); assert.equal(s.target.myInputTurn, 2);
});

// 测试：只有规则时回退普攻；全部移除后恢复无 AI、无规则时的旧技能选择。
test("Rules: removing all rules restores legacy input", () => {
    const s = setup(), hp = new FightRuleHp({ type: "hp", lines: [{ hp: 0.5, attackRate: 0.2 }] }); s.target.inputSkill = cycle;
    s.target.addRule(hp); assert.equal(s.target.addRule(hp), false);
    s.target.inputStart(1, initFightContex(s.fight)); assert.equal(s.target.input.cmd, FightCmdEnum.attack);
    assert.equal(s.target.contextEmitter.listenerCount("hp"), 1);
    const list = [...s.target.rules]; list.length = 0; assert.equal(s.target.rules.length, 1);
    assert.equal(s.target.removeRule(hp), true); assert.equal(s.target.removeRule(hp), false);
    s.target.inputStart(2, initFightContex(s.fight)); assert.equal(s.target.input.skill, cycle);
});

// 测试：切换或清空唯一 AI 不影响共存规则，错误复用其他单位的 AI 时保留原实例。
test("AI: replacing the single AI preserves independent rules", () => {
    const s = setup(), hp = new FightRuleHp({ type: "hp", lines: [{ hp: 0.7, attackRate: 0.5 }] }), hurt = new FightRuleHurt({ type: "hurt", every: 2 });
    s.target.addRule(hp); s.target.addRule(hurt); const first = new FightAI(); s.target.ai = first;
    assert.deepEqual(s.target.rules, [hp, hurt]); assert.equal(s.target.contextEmitter.listenerCount("hurt"), 1);
    const other = new FightAI(); s.other.ai = other;
    assert.throws(() => { s.target.ai = other; }, /cannot be shared/);
    assert.equal(s.target.ai, first); assert.equal(s.target.contextEmitter.listenerCount("hp"), 1);
    s.target.ai = undefined; assert.equal(s.target.rules.length, 2); assert.equal(s.target.contextEmitter.listenerCount("hp"), 1);
});
