import "../../../src/fight/Buffs/BuffDatas";
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { FightAILowHpHeal, FightClient, FightCmdEnum, FightLoopPC, FightLoopWest, FightLoopYanYu,
    createAI, initSkills, initBuffs, getBuffData, initFightContex, SkillData, TargetSelectEnum } from "../../../src";
import { setupChain, chainIds as ids } from "../../fixtures/skill_chain";

const healId = 10012101, statusId = 10012102;
function setup(hp = 400, extra: Partial<SkillData> = {}) {
    const s = setupChain({ rootSelfBuff: false, finalReactions: false, targetHp: hp });
    initSkills([{ id: healId, name: "低血自疗", magic: true, rand: 1, func: "heal", attack: {}, final: {},
        sel: { target: TargetSelectEnum.self }, ...extra }]);
    s.target.addSkill(healId, 1); s.target.setAI({ type: "lowHpHeal", skill: healId });
    const decide = () => s.target.getActionInput(s.fight.turn, initFightContex(s.fight));
    return { ...s, decide };
}

for (const [hp, heal] of [[1, true], [499, true], [500, false], [501, false], [1000, false]] as const) {
    // 测试：严格低于50%才自疗，等于或高于50%时AI不干预，怪物沿用默认普攻回退。
    test(`low HP heal AI: HP ${hp}/1000 chooses healing=${heal}`, () => {
        const s = setup(hp);
        const expected = heal ? { cmd: FightCmdEnum.skill, skill: healId, target: s.target.uid } : undefined;
        assert.deepEqual(s.target.ai.waitInput(s.target, s.fight.turn, initFightContex(s.fight)), expected);
        assert.deepEqual(s.decide(), expected ?? { cmd: FightCmdEnum.attack });
        assert.equal(s.target.getHp(), hp);
    });
}

for (const target of [TargetSelectEnum.self, TargetSelectEnum.friend]) {
    // 测试：self与friend单体治疗均可指定自己，完成实际回血后达到50%就恢复默认普攻，客户端一致。
    test(`low HP heal AI: legal target rule ${target} heals self then resumes the default action`, () => {
        const s = setup(400, { sel: { target } });
        const ctx = s.fight.processUnit(s.target, s.decide()); assert.ok(ctx); s.flush(ctx);
        assert.equal(s.target.getHp(), 500);
        assert.deepEqual(s.decide(), { cmd: FightCmdEnum.attack });
        assert.equal(s.fight.getSide(s.target.side).heal.get(s.target.uid), 100);
    });
}

for (const status of ["禁疗", "封印", "休息", "石化"]) {
    // 测试：禁疗、封印、休息或石化使自疗不可用时不提交治疗指令，不扣费也不抽样。
    test(`low HP heal AI: ${status} prevents an unusable self-heal decision`, () => {
        const s = setup();
        initBuffs([{ ...getBuffData(ids.rest), id: statusId, class: undefined, status: [status], lastTurn: 0 }]);
        s.target.addBuff(s.target, "test", statusId, 1, initFightContex(s.fight));
        s.fight.random = () => { throw new Error("自疗预检不应抽样"); };
        assert.deepEqual(s.decide(), { cmd: FightCmdEnum.attack });
        assert.equal(s.target.getHp(), 400);
        assert.equal(s.target.attr.point.mp, 100);
    });
}

// 测试：死亡、未学会技能或冷却期间不提交自疗，冷却恢复后再次按低血量决定。
test("low HP heal AI: death, unknown skills and cooldown preserve the default fallback", () => {
    const s = setup(400, { cd: 2 });
    const ctx = s.fight.processUnit(s.target, s.decide()); assert.ok(ctx); s.flush(ctx);
    s.target.onHurt(s.actor, "test", 100, initFightContex(s.fight));
    assert.deepEqual(s.decide(), { cmd: FightCmdEnum.attack });
    s.fight.nextTurn(); s.fight.nextTurn();
    assert.equal(s.decide().skill, healId);
    s.target.die();
    assert.deepEqual(s.decide(), { cmd: FightCmdEnum.attack });
    s.target.relife(); s.target.setAI({ type: "lowHpHeal", skill: 10012199 });
    assert.deepEqual(s.decide(), { cmd: FightCmdEnum.attack });
});

for (const extra of [{ func: "normal" }, { sel: { target: TargetSelectEnum.enmey } },
    { sel: { target: TargetSelectEnum.friend, num: 3 } }] as Partial<SkillData>[]) {
    // 测试：配置为攻击、敌方治疗或群体治疗时不误用为单体自疗。
    test(`low HP heal AI: incompatible skill ${JSON.stringify(extra)} is ignored`, () => {
        const s = setup(400, extra);
        assert.deepEqual(s.decide(), { cmd: FightCmdEnum.attack });
    });
}

// 测试：工厂创建独立的低血自疗AI，非法技能ID在构造时拒绝，不自动学习技能。
test("low HP heal AI: factory creates independent instances and validates skill IDs", () => {
    const first = createAI({ type: "lowHpHeal", skill: healId });
    assert.ok(first instanceof FightAILowHpHeal);
    assert.notEqual(first, createAI({ type: "lowHpHeal", skill: healId }));
    for (const id of [0, -1, 1.5, NaN]) assert.throws(() => new FightAILowHpHeal({ type: "lowHpHeal", skill: id }), /positive safe integer/);
    assert.throws(() => createAI({ type: "lowHpHeal" }), /positive safe integer/);
    assert.throws(() => createAI({ type: "unregistered", typeParam: { custom: true } }), /Unknown AI type/);
});

for (const Loop of [FightLoopPC, FightLoopWest, FightLoopYanYu]) {
    // 测试：同回合两次行动时先自疗到50%，第二次重新决策并普攻，不重复沿用第一次治疗指令。
    test(`low HP heal AI: ${Loop.name} reconsiders healing on its extra action`, async () => {
        const s = setup(); s.loop.end(); s.fight.turn = 0;
        s.target.setExtraActions([[0.5, 0]]);
        const loop = new Loop(s.fight), client = new FightClient();
        loop.onMsg(msgs => client.onMsg(JSON.parse(JSON.stringify(msgs))));
        loop.on("input", unit => loop.onInput(unit.uid, { cmd: FightCmdEnum.defend }));
        loop.start();
        const initial = initFightContex(s.fight);
        s.actor.addBuff(s.actor, "test", ids.rest, 1, initial);
        s.other.addBuff(s.other, "test", ids.rest, 1, initial); // 其他单位不出手，隔离Boss两次行动。
        loop.bcMsg(initial.msgs);
        s.target.attr.speed = 200; s.actor.attr.speed = 150; s.other.attr.speed = 50;
        for (const unit of s.fight.getAllUnits()) unit.speedRand = 0;
        loop.nextTurn();
        const before = initFightContex(s.fight), wait = loop.waitInput(1, before);
        if (loop instanceof FightLoopWest) loop.onInput(s.actor.uid, { turn: 1, cmd: FightCmdEnum.defend });
        await wait; loop.bcMsg(before.msgs);
        await loop.processOneTurn(1);
        assert.equal(s.target.getHp(), 500);
        assert.equal(s.actor.getHp(), 900); // 第二次已恢复普攻，而不是再次治疗到600。
        assert.equal(s.target.myInputTurn, 1);
        assert.equal(client.checkSame(s.fight), true);
        assert.equal(client.actions.length, 0);
        loop.end();
    });
}
