import { strict as assert } from "node:assert";
import { test } from "node:test";
import { FightRule, FightUnit, FightAI, FightAIRearDoctor, FightRuleHp, FightRuleHurt, FightRuleTurn,
    FightCmdEnum, InsertActionPos, RuleData, initFightContex, initSkills, fightMsg } from "../../../src";
import { setupChain, chainIds } from "../../fixtures/skill_chain";

function setup() {
    const s = setupChain({ rootSelfBuff: false, finalReactions: false, change: data => {
        data[0].combo = undefined; data[0].damageRate = 1;
    } });
    s.target.addSkill(chainIds.first, 1);
    const hurt = (amount: number) => {
        const ctx = initFightContex(s.fight);
        s.fight.resolveAction(() => s.target.onHurt(s.actor, "test", amount, ctx, { source: "skill" }));
        s.flush(ctx); return ctx;
    };
    return { ...s, hurt };
}

// 规则初始化抛错时必须解绑刚注册的监听，不能留下没有加入列表却仍生效的旧行为。
test("rule replacement: a failed bind cleans up its partial listeners", () => {
    const s = setupChain();
    class BrokenRule extends FightRule {
        protected override onAdded(unit: FightUnit) {
            this.listen(unit, "hp", () => {});
            throw new Error("broken rule setup");
        }
    }
    const before = s.target.contextEmitter.listenerCount("hp");
    const rule = new BrokenRule();
    assert.throws(() => s.target.addRule(rule), /broken rule setup/);
    assert.equal(s.target.rules.length, 0);
    assert.equal(s.target.contextEmitter.listenerCount("hp"), before);
});

// 狂暴时从数据整体切换规则，旧增攻消失、新增攻立即重算，旧监听不再残留且 AI 不变。
test("rule replacement: a new phase replaces all rules and recalculates attributes", () => {
    const s = setup(), ai = new FightAI(); s.target.setAI(ai);
    s.target.setRules([{ type: "hp", lines: [{ hp: 0.7, attackRate: 0.2 }] }, { type: "hurt", every: 5 }]);
    const old = s.target.rules;
    s.hurt(400); assert.equal(s.target.attr.magic.base.attack, 120);
    const phase: RuleData[] = [
        { type: "hp", lines: [{ hp: 0.8, attackRate: 0.5 }], prior: 10 },
        { type: "hurt", every: 3, prior: -1 },
    ];
    const original = structuredClone(phase);
    s.target.setRules(phase);
    assert.ok(s.target.rules[0] instanceof FightRuleHurt);
    assert.ok(s.target.rules[1] instanceof FightRuleHp);
    assert.ok(s.target.rules.every(rule => !old.includes(rule)));
    assert.equal(s.target.attr.magic.base.attack, 150); assert.equal(s.target.attrOri.magic.base.attack, 100);
    assert.equal(s.target.contextEmitter.listenerCount("hp"), 1);
    assert.equal(s.target.contextEmitter.listenerCount("hurt"), 1);
    assert.equal(s.target.ai, ai); assert.deepEqual(phase, original);
    s.target.clearRules();
    assert.equal(s.target.rules.length, 0); assert.equal(s.target.attr.magic.base.attack, 100);
    assert.equal(s.target.contextEmitter.listenerCount("hp"), 0);
    assert.equal(s.target.contextEmitter.listenerCount("hurt"), 0); assert.equal(s.target.ai, ai);
});

// 重用规则实例时保留计数与血线阶段，不因整组设置而重复绑定或重置。
test("rule replacement: retained instances preserve phase and listeners", () => {
    const s = setup(), hp = new FightRuleHp([{ hp: 0.7, attackRate: 0.3 }]);
    s.target.setRules([hp]); s.hurt(400);
    const healed = initFightContex(s.fight); s.target.onHeal(s.actor, "test", 400, healed); s.flush(healed);
    assert.equal(s.target.getHp(), 1000);
    s.target.setRules([hp]);
    assert.equal(s.target.attr.magic.base.attack, 130);
    assert.equal(s.target.contextEmitter.listenerCount("hp"), 1);
    assert.deepEqual(s.target.rules, [hp]);
});

// 新配置非法或包含重复实例时不拆掉旧规则，也不泄漏新监听。
test("rule replacement: invalid definitions leave the original rules intact", () => {
    const s = setup(), hp = new FightRuleHp([{ hp: 0.8, attackRate: 0.2 }]); s.target.setRules([hp]);
    assert.throws(() => s.target.setRules([{ type: "hurt", every: 0 }]), /positive/);
    assert.throws(() => s.target.setRules([{ type: "hurt", every: 2, prior: NaN }]), /finite/);
    assert.throws(() => s.target.setRules([hp, hp]), /duplicate/);
    assert.throws(() => s.target.setRules([new FightAI()]), /AI/);
    assert.deepEqual(s.target.rules, [hp]);
    assert.equal(s.target.contextEmitter.listenerCount("hp"), 1);
    assert.equal(s.target.contextEmitter.listenerCount("hurt"), 0);
});

// 新列表中后面的实例属于别的单位时，回滚前面已绑定的新规则，旧规则继续生效。
test("rule replacement: a foreign instance rolls back newly bound rules", () => {
    const s = setup(), old = new FightRuleHp([{ hp: 0.8, attackRate: 0.2 }]); s.target.setRules([old]);
    const foreign = new FightRuleHurt(2); s.other.addRule(foreign);
    const next = new FightRuleHurt(3);
    assert.throws(() => s.target.setRules([next, foreign]), /cannot be shared/);
    assert.deepEqual(s.target.rules, [old]);
    assert.equal(s.target.contextEmitter.listenerCount("hp"), 1);
    assert.equal(s.target.contextEmitter.listenerCount("hurt"), 0);
    assert.equal(s.other.contextEmitter.listenerCount("hurt"), 1);
    assert.equal(next.bind(s.actor), true); next.unbind(s.actor);
});

// 新规则初始化中抛错时整组替换失败，清理本次新监听并保持原列表。
test("rule replacement: initialization failures roll back the entire new set", () => {
    const s = setup(), old = new FightRuleHp([{ hp: 0.7, attackRate: 0.2 }]); s.target.setRules([old]);
    class Broken extends FightRule {
        protected override onAdded(unit: FightUnit) { this.listen(unit, "die", () => {}); throw new Error("phase setup failed"); }
    }
    assert.throws(() => s.target.setRules([new FightRuleHurt(2), new Broken()]), /phase setup failed/);
    assert.deepEqual(s.target.rules, [old]);
    assert.equal(s.target.contextEmitter.listenerCount("hurt"), 0);
    assert.equal(s.target.contextEmitter.listenerCount("die"), 0);
    s.hurt(400); assert.equal(s.target.attr.magic.base.attack, 120);
});

// AI 支持实例、数据和清空，替换失败时旧 AI 与独立规则均保留。
test("AI replacement: configure replace and clear without changing rules", () => {
    const s = setup(); s.target.setRules([{ type: "hurt", every: 2 }]);
    s.target.setAI({ type: "rearDoctor" }); assert.ok(s.target.ai instanceof FightAIRearDoctor);
    class DefendAI extends FightAI { override waitInput() { return { cmd: FightCmdEnum.defend }; } }
    const ai = new DefendAI(); s.target.setAI(ai);
    s.target.inputStart(1, initFightContex(s.fight)); assert.equal(s.target.input.cmd, FightCmdEnum.defend);
    class BrokenAI extends FightAI {
        protected override onAdded(unit: FightUnit) { this.listen(unit, "hp", () => {}); throw new Error("AI setup failed"); }
    }
    assert.throws(() => s.target.setAI(new BrokenAI()), /AI setup failed/);
    assert.equal(s.target.ai, ai); assert.equal(s.target.contextEmitter.listenerCount("hp"), 0);
    s.target.setAI(); assert.equal(s.target.ai, undefined);
    assert.equal(s.target.rules.length, 1); assert.equal(s.target.contextEmitter.listenerCount("hurt"), 1);
});

// 切换规则仍保留已插入的旧行动，旧行动照常执行；下一回合由新规则安排新技能。
test("rule replacement: already inserted actions survive a phase switch", async () => {
    const s = setup(), rage = 1001600;
    initSkills([{ ...s.skills[0], id: rage, name: "狂暴攻击", attack: { attack: 50 } }]);
    s.target.addSkill(rage, 1);
    s.target.setRules([new FightRuleTurn(1, chainIds.first, InsertActionPos.first)]);
    const before = initFightContex(s.fight); s.loop.processBeforeTurn(1, before); s.flush(before);
    const old = s.loop.actions.find(action => action.inserted);
    const bar = structuredClone(s.client.actions);
    s.target.setRules([{ type: "turn", every: 1, skill: rage }]);
    assert.ok(s.loop.actions.includes(old)); assert.deepEqual(s.client.actions, bar);
    const messages: fightMsg[] = [];
    s.loop.onMsg(msgs => messages.push(...(typeof msgs[0] === "string" ? [msgs as fightMsg] : msgs as fightMsg[])));
    for (const unit of s.fight.getAllUnits()) unit.input = { cmd: FightCmdEnum.defend };
    await s.loop.processOneTurn(1);
    assert.equal(messages.filter(msg => msg[0] === "skill" && msg[1] === chainIds.first).length, 1);
    assert.ok(!messages.some(msg => msg[0] === "skill" && msg[1] === rage));
    s.loop.nextTurn();
    const next = initFightContex(s.fight); s.loop.processBeforeTurn(2, next); s.flush(next);
    assert.equal(s.loop.actions.filter(action => action.inserted).length, 1);
    assert.equal(s.loop.actions.find(action => action.inserted).input.skill, rage);
    await s.loop.processOneTurn(2);
    assert.equal(messages.filter(msg => msg[0] === "skill" && msg[1] === rage).length, 1);
    assert.ok(s.client.checkSame(s.fight));
});

// 清空规则会终止旧受伤规则尚未执行的即时回调，不影响已经独立进入行动条的行动。
test("rule replacement: clearing rules cancels their deferred event callbacks", () => {
    const s = setup(); s.target.setRules([{ type: "hurt", every: 1, skill: chainIds.first }]);
    s.target.onContex("hurt", () => s.target.clearRules(), 1);
    const ctx = s.hurt(100);
    assert.ok(!ctx.msgs.some(msg => msg[0] === "aiAttack"));
    assert.equal(s.actor.getHp(), 1000); assert.deepEqual(s.target.rules, []);
});
