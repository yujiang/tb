import { strict as assert } from "node:assert";
import { test } from "node:test";
import { FightLoopPC, FightLoopWest, FightLoopYanYu, FightCmdEnum, FightResultEnum, FightRuleHp,
    initFightContex, fightMsg, FightErrorContext } from "../../src";
import { setupChain, chainIds } from "../fixtures/skill_chain";

for (const Loop of [FightLoopPC, FightLoopWest, FightLoopYanYu]) {
    // 战斗执行抛出异常后统一记录错误并判攻击方失败，停止后续行动、清空队列并解绑规则监听。
    test(`fight errors: ${Loop.name} logs and ends with an attacker loss`, async t => {
        const logged = t.mock.method(console, "error", () => {});
        const s = setupChain({ rootSelfBuff: false, finalReactions: false, change: data => {
            data[0].combo = undefined; data[0].damageRate = 1;
        } });
        s.loop.end(); s.fight.turn = 0; s.fight.xls.maxTurn = 1;
        s.actor.attrOri.speed = 500; s.target.attrOri.speed = 100; s.other.attrOri.speed = 50;
        s.actor.setAttackSkill(chainIds.first);
        s.fight.getDefaultEnemy = () => s.target;
        s.target.addRule(new FightRuleHp({ type: "hp", lines: [{ hp: 0.7, attackRate: 0.2 }] }));
        for (const unit of s.fight.getAllUnits()) unit.calcAttr();
        const failure = new Error("skill execution failed");
        s.target.onContex("beforeHurt", () => { throw failure; });
        let later = 0; s.other.processOneTurn = () => { later++; return undefined; };
        const loop = new Loop(s.fight), messages: fightMsg[] = [];
        loop.onMsg(msgs => { messages.push(...(typeof msgs[0] === "string" ? [msgs as fightMsg] : msgs as fightMsg[])); s.loop.bcMsg(msgs); });
        loop.on("input", unit => loop.onInput(unit.uid, { cmd: FightCmdEnum.skill, skill: chainIds.first, target: s.target.uid }));
        if (loop instanceof FightLoopWest) loop.waitInput = async (_turn, ctx) => {
            for (const unit of s.fight.getAllUnits()) unit.inputStart(s.fight.turn, ctx);
            s.actor.input = { cmd: FightCmdEnum.skill, skill: chainIds.first, target: s.target.uid }; return 1;
        };
        assert.equal(await loop.run(), FightResultEnum.defend);
        assert.equal(s.fight.win, FightResultEnum.defend); assert.equal(s.client.win, FightResultEnum.defend);
        assert.equal(later, 0); assert.deepEqual(loop.actions, []); assert.deepEqual(s.client.sort, []);
        assert.equal(s.target.contextEmitter.listenerCount("hp"), 0);
        assert.equal(messages.filter(msg => msg[0] === "end").length, 1);
        assert.equal(logged.mock.callCount(), 1);
        assert.ok((logged.mock.calls[0].arguments as unknown[]).includes(failure));
    });
}

// 西游等待输入期间校验代码抛错时，立即关闭窗口并结束等待，不能留住输入定时器。
test("fight errors: online input exceptions release the waiting round", { timeout: 2000 }, async t => {
    const logged = t.mock.method(console, "error", () => {});
    const s = setupChain(); s.fight.xls.waitInputSec = 60;
    const ctx = initFightContex(s.fight), waiting = s.loop.waitInput(1, ctx);
    s.actor.onInput = () => { throw new Error("online input failed"); };
    s.loop.onInput(s.actor.uid, { cmd: FightCmdEnum.attack, turn: 1 });
    assert.equal(await waiting, 0);
    assert.equal(s.fight.win, FightResultEnum.defend);
    assert.equal(s.loop.input, 0); assert.equal(s.loop.inputResolve, null);
    assert.equal(logged.mock.callCount(), 1); assert.deepEqual(s.loop.actions, []);
});

// 烟雨即时技能失败时日志能定位这次施法者及指令，而不是误用上一个自动行动的信息。
test("fight errors: instant skill failures retain their actor and input in logs", async () => {
    const s = setupChain({ rootSelfBuff: false, finalReactions: false }); s.loop.end();
    const loop = new FightLoopYanYu(s.fight), errors: { error: unknown; context: FightErrorContext }[] = [];
    loop.onMsg(msgs => s.loop.bcMsg(msgs));
    loop.onError = (error, context) => errors.push({ error, context });
    loop.start(); s.fight.turn = 0; loop.nextTurn();
    const before = initFightContex(s.fight); await loop.waitInput(1, before); loop.bcMsg(before.msgs);
    const failure = new Error("instant skill failed");
    s.target.onContex("beforeHurt", () => { throw failure; });
    const input = { cmd: FightCmdEnum.skill, skill: chainIds.first, target: s.target.uid, turn: 1 };
    assert.equal(await loop.onInput(s.actor.uid, input), false);
    assert.equal(errors.length, 1); assert.equal(errors[0].error, failure);
    assert.equal(errors[0].context.actor, s.actor.uid);
    assert.deepEqual(errors[0].context.input, input);
    assert.equal(s.fight.win, FightResultEnum.defend);
});

for (const phase of ["start", "beforeTurn", "afterTurn"] as const) {
    // 初始化和全局回合边界的异常也由运行入口收口，不能进入下一回合。
    test(`fight errors: ${phase} failures stop the full run`, async t => {
        const logged = t.mock.method(console, "error", () => {});
        const s = setupChain({ rootSelfBuff: false }); s.loop.end(); s.fight.turn = 0; s.fight.xls.maxTurn = 3;
        const loop = new FightLoopPC(s.fight), failure = new Error(`${phase} failed`);
        loop.onMsg(msgs => s.loop.bcMsg(msgs));
        loop.on("input", unit => loop.onInput(unit.uid, { cmd: FightCmdEnum.defend }));
        if (phase === "start") loop.on("start", () => { throw failure; });
        else if (phase === "beforeTurn") s.actor.processBeforeTurn = () => { throw failure; };
        else s.actor.processAfterTurn = () => { throw failure; };
        assert.equal(await loop.run(), FightResultEnum.defend);
        assert.ok(s.fight.turn <= 1); assert.equal(loop.inputUnit, undefined);
        assert.deepEqual(loop.actions, []); assert.equal(logged.mock.callCount(), 1);
    });
}

// 一名单位的结束清理抛错也要继续清理其他单位，并以防守方胜结束。
test("fight errors: one cleanup failure does not skip other units", t => {
    const logged = t.mock.method(console, "error", () => {});
    const s = setupChain(); let cleaned = false;
    s.target.endFight = () => { throw new Error("cleanup failed"); };
    s.other.endFight = () => { cleaned = true; };
    s.fight.win = FightResultEnum.attack;
    s.loop.end();
    assert.equal(cleaned, true); assert.equal(s.fight.win, FightResultEnum.defend);
    assert.equal(s.client.win, FightResultEnum.defend); assert.equal(logged.mock.callCount(), 1);
});

// 结束回调抛错时最终协议仍应是攻击方失败，不能让客户端保留先前的胜利结果。
test("fight errors: end callback failures are reflected in the final client result", t => {
    const logged = t.mock.method(console, "error", () => {});
    const s = setupChain(); s.fight.win = FightResultEnum.attack;
    s.loop.on("end", () => { throw new Error("end callback failed"); });
    s.loop.end();
    assert.equal(s.fight.win, FightResultEnum.defend);
    assert.equal(s.client.win, FightResultEnum.defend);
    assert.equal(logged.mock.callCount(), 1);
});
