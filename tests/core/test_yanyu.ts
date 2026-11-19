import { strict as assert } from "node:assert";
import { test } from "node:test";
import { Fight, FightAttr, FightSide, FightUnitUser, FightUnitMonster, FightClient, FightReport,
    FightCmdEnum, FightInput, TargetSelectEnum, initSkills, initFightContex, fightMsg, FightResultEnum } from "../../src";
import { FightLoopYanYu } from "../../src/fight/Online/FightLoopYanYu";

const skillId = 99960;
function attr(speed: number): FightAttr {
    const base = (attack = 10, rand = 0) => ({ attack, rand, hit: 100, dodge: 0, defend: 0,
        hurt: 0, hurtP: 0, hurtAnti: 0, hurtPAnti: 0, critP: 0, critPAnit: 0, critDeep: 0, critDeepAnit: 0 });
    const attr = new FightAttr(); attr.speed = speed;
    attr.point = { hp: 1000, hpMax: 1000, mp: 100, mpMax: 100 };
    const group = () => ({ base: base(10, 1), next: base(), kill: base(), spread: base(), fback: base(),
        final: { bloodP: 0, dbackP: 0, immunity: 0, immunityP: 0 } });
    attr.physic = group(); attr.magic = group(); attr.heal = base(); attr.poison = base(); return attr;
}
async function setup(cd?: number) {
    initSkills([{ id: skillId, name: "即时技能", magic: true, rand: 1, attack: { attack: 40 }, final: {},
        cost: { mp: 10 }, cd, nofback: true, nodback: true, nosupport: true,
        sel: { target: TargetSelectEnum.enmey } }]);
    const fight = new Fight(99960, { maxTurn: 1, waitInputSec: 1, duiwei: true }, 0);
    fight.createMap(5, 2);
    const a = new FightUnitUser(0, attr(200), { name: "甲" }); a.setPos(0);
    const b = new FightUnitUser(1, attr(150), { name: "乙" }); b.setPos(1);
    const c = new FightUnitMonster(2, attr(100), { name: "丙" }); c.setPos(4);
    const d = new FightUnitMonster(3, attr(50), { name: "丁" }); d.setPos(3);
    a.addSkill(skillId, 1); b.addSkill(skillId, 1); c.addSkill(skillId, 1); c.inputSkill = skillId;
    const left = new FightSide(), right = new FightSide(); left.units.push(a, b); right.units.push(c, d);
    fight.createSide(left, right);
    const loop = new FightLoopYanYu(fight), client = new FightClient(), report = new FightReport(() => {}, false);
    const messages: fightMsg[] = [];
    loop.onMsg(msgs => {
        const wire = structuredClone(msgs), batch = typeof wire[0] === "string" ? [wire as fightMsg] : wire as fightMsg[];
        messages.push(...batch); client.onMsg(wire); report.onMsg(wire);
        if (client.sides[0].length && client.sides[1].length) assert.ok(client.checkSame(fight));
    });
    loop.start(); for (const u of [a, b, c, d]) u.speedRand = 0;
    loop.nextTurn();
    const ctx = initFightContex(fight); await loop.waitInput(fight.turn, ctx); loop.bcMsg(ctx.msgs);
    const input = (id = a.uid, extra: Partial<FightInput> = {}) => loop.onInput(id,
        { cmd: FightCmdEnum.skill, skill: skillId, target: c.uid, turn: fight.turn, ...extra });
    return { fight, loop, client, report, messages, a, b, c, d, input };
}

// 测试：有冷却的即时技能同回合不能重复施放，其他单位的同名技能不受影响。
test("yanyu: cooldown prevents repeated casting and belongs to each caster", async () => {
    const s = await setup(2);
    const hints: string[] = []; s.a.hintClient = msg => hints.push(msg);
    assert.equal(await s.input(), true);
    assert.deepEqual(hints, []);
    assert.equal(await s.input(), false);
    assert.deepEqual(hints, ["[即时技能]冷却中，还需 2 回合"]);
    assert.equal(s.a.attr.point.mp, 90);
    assert.equal(await s.input(s.b.uid), true);
    assert.ok(s.client.checkSame(s.fight));
});

// 测试：冷却按全局回合推进，第一个回合施放 cd=2 的技能在第三回合恢复，重复准备输入不缩短冷却。
test("yanyu: cooldown expires at its global ready turn", async () => {
    const s = await setup(2);
    assert.equal(await s.input(), true);
    for (let turn = 2; turn <= 3; turn++) {
        s.loop.nextTurn();
        const ctx = initFightContex(s.fight);
        await s.loop.waitInput(turn, ctx); await s.loop.waitInput(turn, ctx); s.loop.bcMsg(ctx.msgs);
        assert.equal(await s.input(), turn === 3);
        assert.ok(s.client.checkSame(s.fight));
    }
    assert.equal(s.a.attr.point.mp, 80);
});

// 测试：动画期间同一技能可先后入队，执行第一条后第二条因冷却失效，只扣一次费用。
test("yanyu: queued duplicate skills recheck cooldown before execution", async () => {
    const s = await setup(2), gate = barrier(), entered = barrier();
    const hints: string[] = []; s.b.hintClient = msg => hints.push(msg);
    let first = true;
    s.loop.waitDrawOver = async () => { if (first) { first = false; entered.release(); await gate.promise; } };
    const running = s.loop.processOneTurn(1); await entered.promise;
    const one = s.input(s.b.uid), two = s.input(s.b.uid);
    gate.release(); await running;
    assert.deepEqual(await Promise.all([one, two]), [true, true]);
    assert.equal(s.b.attr.point.mp, 90);
    assert.equal(s.messages.filter(msg => msg[0] === "actor" && msg[3] === "skill").length, 1);
    assert.deepEqual(hints, ["[即时技能]冷却中，还需 2 回合"]);
    assert.ok(s.client.checkSame(s.fight));
});

// 测试：未填写和显式零冷却保留原来的连续施放行为。
test("yanyu: omitted and zero cooldown allow repeated casting", async () => {
    for (const cd of [undefined, 0]) {
        const s = await setup(cd);
        assert.equal(await s.input(), true); assert.equal(await s.input(), true);
        assert.equal(s.a.attr.point.mp, 80);
    }
});

// 测试：费用不足的提交不启动冷却，恢复资源后仍可立即施放。
test("yanyu: rejected resource checks do not start cooldown", async () => {
    const s = await setup(2);
    const ctx = initFightContex(s.fight); s.a.costSkill({ mp: 100 }, ctx); s.loop.bcMsg(ctx.msgs);
    assert.equal(await s.input(), false);
    s.a.attr.point.mp = 100;
    s.loop.bcMsg(["costMp", s.a.uid, 0, 100]);
    assert.equal(await s.input(), true);
    assert.equal(await s.input(), false);
    assert.ok(s.client.checkSame(s.fight));
});

// 测试：公共执行入口同样拒绝冷却中的技能，其他技能及装配普攻不受该技能主动冷却影响。
test("yanyu: active cooldown is enforced by shared execution without blocking other skills or attacks", async () => {
    const s = await setup(2);
    assert.equal(await s.input(), true);
    assert.equal(s.a.getSkillCd(skillId), 2);
    assert.equal(s.fight.processUnit(s.a, { cmd: FightCmdEnum.skill, skill: skillId, target: s.c.uid }), undefined);
    const otherId = 99961;
    initSkills([{ ...s.a.findSkill(skillId).getXls(), id: otherId }]); s.a.addSkill(otherId, 1);
    assert.equal(await s.input(s.a.uid, { skill: otherId }), true);
    s.a.setAttackSkill(skillId);
    const ctx = s.fight.processUnit(s.a, { cmd: FightCmdEnum.attack, target: s.c.uid });
    assert.ok(ctx.msgs.some(msg => msg[0] === "skill" && msg[1] === skillId)); s.loop.bcMsg(ctx.msgs);
    assert.equal(s.a.attr.point.mp, 80);
    assert.equal(s.a.getSkillCd(skillId), 2);
    assert.ok(!ctx.msgs.some(msg => msg[0] === "skillCd"));
    assert.ok(s.client.checkSame(s.fight));
    assert.doesNotMatch(s.report.toString(), /未识别消息/);
});

// 测试：技能已尝试施放但未发动时仍消耗费用并进入冷却。
test("yanyu: failed skill probability still consumes active cooldown", async () => {
    const s = await setup(2); s.a.findSkill(skillId).getXls().rand = 0;
    assert.equal(await s.input(), true);
    assert.equal(s.c.getHp(), 1000);
    assert.equal(s.a.attr.point.mp, 90); assert.equal(s.a.getSkillCd(skillId), 2);
    assert.equal(await s.input(), false);
    assert.ok(s.client.checkSame(s.fight));
});

// 测试：同编号技能重新装配与死亡复活不绕过冷却，新战斗开始才重置。
test("yanyu: cooldown survives relearning and revival and resets on a new fight start", async () => {
    const s = await setup(2); await s.input();
    s.a.addSkill(skillId, 2); assert.equal(await s.input(), false);
    const ctx = initFightContex(s.fight);
    s.a.onHurt(s.c, "test", 1000, ctx);
    s.a.onRelife(s.b, "test", ctx); s.a.onHeal(s.b, "test", 1000, ctx);
    s.loop.bcMsg(ctx.msgs);
    assert.equal(await s.input(), false); assert.equal(s.a.getSkillCd(skillId), 2);
    s.loop.start();
    assert.equal(s.a.getSkillCd(skillId), 0); assert.ok(s.client.checkSame(s.fight));
});

// 测试：烟雨循环初始化单位和客户端，不等待玩家收齐指令，每轮输入边界只推进一次。
test("yanyu: initialize display and prepare input without waiting for player commands", async () => {
    const s = await setup();
    assert.equal(s.client.fid, s.fight.fid);
    assert.equal(s.client.turn, 1);
    assert.equal(s.a.myInputTurn, 1);
    assert.deepEqual(s.client.sort, [0, 1, 2, 3]);
    assert.ok(s.client.checkSame(s.fight));
});

// 测试：合法技能立即结算并收费，技能输入不改写单位已保存的自动输入。
test("yanyu: an immediate skill executes through the normal validated skill pipeline", async () => {
    const s = await setup();
    assert.equal(await s.input(), true);
    assert.equal(s.c.getHp(), 950); assert.equal(s.a.attr.point.mp, 90);
    assert.equal(s.a.myInputTurn, 1);
    assert.deepEqual(s.client.sort, [0, 1, 2, 3]);
    assert.match(s.report.toString(), /\[即时技能\]/);
    assert.ok(s.client.checkSame(s.fight));
});

// 测试：网络技能拒绝过期、缺回合、错误命令、非控制单位、未知技能和非法显式目标，拒绝不扣资源。
test("yanyu: reject invalid network skill inputs before queueing", async () => {
    const s = await setup();
    for (const extra of [{ turn: undefined }, { turn: 0 }, { turn: 2 }, { cmd: FightCmdEnum.attack },
        { cmd: FightCmdEnum.cancel }, { skill: 123456 }, { target: s.a.uid }, { target: 123456 }] as Partial<FightInput>[]) {
        assert.equal(await s.input(s.a.uid, extra), false);
    }
    assert.equal(await s.input(s.c.uid), false);
    assert.equal(await s.input(123456), false);
    assert.equal(s.a.attr.point.mp, 100); assert.equal(s.c.getHp(), 1000);
});

// 测试：即时技能在提交时检查死亡、禁止技能、休息与费用，结束后不再接受输入。
test("yanyu: reject unavailable actors and insufficient resources without side effects", async () => {
    const s = await setup();
    s.a.isForbid = action => action === "skill";
    assert.equal(await s.input(), false);
    s.a.isForbid = () => false;
    const spent = initFightContex(s.fight); s.a.costSkill({ mp: 100 }, spent); s.loop.bcMsg(spent.msgs);
    assert.equal(await s.input(), false);
    s.loop.end();
    assert.equal(await s.input(), false);
});

// 测试：自动队列按速度普攻和对位选人，怪物保存的主动输入不会替代自动普攻。
test("yanyu: automatic turns use speed-ordered normal attacks rather than stored monster skills", async () => {
    const s = await setup();
    await s.loop.processOneTurn(s.fight.turn);
    assert.deepEqual(s.messages.filter(msg => msg[0] === "actor").map(msg => msg[1]), [0, 1, 2, 3]);
    assert.deepEqual(s.messages.filter(msg => msg[0] === "skill").map(msg => [msg[1], msg[2], msg[3]]),
        [[0, 0, 2], [0, 1, 3], [0, 2, 0], [0, 3, 1]]);
    for (const unit of [s.a, s.b, s.c, s.d]) assert.equal(unit.getHp(), 990);
    assert.deepEqual(s.client.sort, []);
    assert.equal(await s.input(), false);
});

function barrier() {
    let release: () => void;
    const promise = new Promise<void>(resolve => { release = resolve; });
    return { promise, release: () => release() };
}

// 测试：动画中技能按提交顺序排队，优先于后续普攻；输入保存副本，即时技能不移除待普攻行动条。
test("yanyu: animation serializes FIFO skills before remaining attacks without consuming their slots", async () => {
    const s = await setup(), gate = barrier(), entered = barrier();
    let first = true;
    s.loop.waitDrawOver = async () => { if (first) { first = false; entered.release(); await gate.promise; } };
    const snapshots: number[][] = [];
    s.loop.onMsg(msgs => {
        const batch = typeof msgs[0] === "string" ? [msgs as fightMsg] : msgs as fightMsg[];
        if (batch.some(msg => msg[0] === "actor" && msg[3] === "skill")) snapshots.push([...s.client.sort]);
    });
    const running = s.loop.processOneTurn(1); await entered.promise;
    const input: FightInput = { turn: 1, cmd: FightCmdEnum.skill, skill: skillId, target: s.c.uid };
    const firstSkill = s.loop.onInput(s.b.uid, input);
    input.target = s.b.uid; input.skill = 123456;
    const secondSkill = s.input(s.a.uid);
    assert.equal(s.c.getHp(), 990);
    gate.release(); await running;
    assert.deepEqual(await Promise.all([firstSkill, secondSkill]), [true, true]);
    assert.deepEqual(s.messages.filter(msg => msg[0] === "actor").map(msg => [msg[1], msg[3]]),
        [[0, undefined], [1, "skill"], [0, "skill"], [1, undefined], [2, undefined], [3, undefined]]);
    assert.deepEqual(snapshots, [[1, 2, 3], [1, 2, 3]]);
    assert.equal(s.c.getHp(), 890);
    assert.equal(s.a.myInputTurn, 1); assert.equal(s.b.myInputTurn, 1);
});

// 测试：多次技能入队不预扣费用，执行前资源不足的后续技能丢弃，只结算可支付的一次。
test("yanyu: recheck queued skill costs immediately before execution", async () => {
    const s = await setup(), gate = barrier(), entered = barrier();
    const hints: string[] = []; s.b.hintClient = msg => hints.push(msg);
    let first = true;
    s.loop.waitDrawOver = async () => { if (first) { first = false; entered.release(); await gate.promise; } };
    const running = s.loop.processOneTurn(1); await entered.promise;
    const firstSkill = s.input(s.b.uid), secondSkill = s.input(s.b.uid);
    const spent = initFightContex(s.fight); s.b.costSkill({ mp: 85 }, spent); s.loop.bcMsg(spent.msgs);
    gate.release(); await running; await Promise.all([firstSkill, secondSkill]);
    assert.equal(s.b.attr.point.mp, 5);
    assert.equal(s.messages.filter(msg => msg[0] === "actor" && msg[3] === "skill").length, 1);
    assert.deepEqual(hints, ["法力不足，无法支付技能消耗"]);
});

// 测试：技能排队后施放者被封印时重新校验，不执行或收费，也不占用普攻机会。
test("yanyu: an actor sealed while waiting cannot cast the queued skill", async () => {
    const s = await setup(), gate = barrier(), entered = barrier();
    const hints: string[] = []; s.b.hintClient = msg => hints.push(msg);
    let first = true;
    s.loop.waitDrawOver = async () => { if (first) { first = false; entered.release(); await gate.promise; } };
    const running = s.loop.processOneTurn(1); await entered.promise;
    const queued = s.input(s.b.uid);
    s.b.isForbid = action => action === "skill";
    gate.release(); await running; assert.equal(await queued, true);
    assert.equal(s.b.attr.point.mp, 100);
    assert.equal(s.messages.filter(msg => msg[0] === "actor" && msg[3] === "skill").length, 0);
    assert.ok(s.messages.some(msg => msg[0] === "actor" && msg[1] === s.b.uid));
    assert.deepEqual(hints, ["当前无法施放技能"]);
});

// 测试：显式目标在排队期间死亡时丢弃技能，不扣费、不改选其他目标，自动普攻仍可转找敌人。
test("yanyu: an explicitly targeted corpse invalidates the queued skill without retargeting", async () => {
    const s = await setup(), gate = barrier(), entered = barrier();
    const hints: string[] = []; s.b.hintClient = msg => hints.push(msg);
    let first = true;
    s.loop.waitDrawOver = async () => { if (first) { first = false; entered.release(); await gate.promise; } };
    const running = s.loop.processOneTurn(1); await entered.promise;
    const queued = s.input(s.b.uid);
    const ctx = initFightContex(s.fight);
    s.fight.resolveAction(() => s.c.onHurt(s.a, "test", 1000, ctx)); s.loop.bcMsg(ctx.msgs);
    gate.release(); await running; assert.equal(await queued, true);
    assert.equal(s.b.attr.point.mp, 100);
    assert.ok(!s.messages.some(msg => msg[0] === "actor" && msg[3] === "skill"));
    assert.ok(s.messages.some(msg => msg[0] === "skill" && msg[2] === s.b.uid && msg[3] === s.d.uid));
    assert.deepEqual(hints, ["目标已死亡"]);
});

// 测试：技能输入费用不足时提示具体资源，拒绝不扣费、不启动冷却、不广播提示。
test("yanyu: insufficient input costs hint the caster without spending or broadcasting", async () => {
    const s = await setup(2), hints: string[] = []; s.a.hintClient = msg => hints.push(msg);
    const count = s.messages.length;
    const data = s.a.findSkill(skillId).getXls();
    data.cost = { mp: 101 };
    assert.equal(await s.input(), false);
    data.cost = { hp: 1000 };
    assert.equal(await s.input(), false);
    assert.deepEqual(hints, ["法力不足，无法支付技能消耗", "生命不足，无法支付技能消耗"]);
    assert.equal(s.a.getHp(), 1000); assert.equal(s.a.attr.point.mp, 100);
    assert.equal(s.a.getSkillCd(skillId), 0); assert.equal(s.messages.length, count);
});

// 测试：错误目标、未知技能与技能封印在输入时提示，不改变普攻允许手动守尸的规则。
test("yanyu: invalid skill inputs hint reasons while corpse guarding stays legal", async () => {
    const s = await setup(), hints: string[] = []; s.a.hintClient = msg => hints.push(msg);
    assert.equal(await s.input(s.a.uid, { target: 123456 }), false);
    assert.equal(await s.input(s.a.uid, { target: s.b.uid }), false);
    assert.equal(await s.input(s.a.uid, { skill: 123456 }), false);
    s.a.isForbid = action => action === "skill";
    assert.equal(await s.input(), false); s.a.isForbid = () => false;
    const ctx = initFightContex(s.fight); s.c.onHurt(s.a, "test", 1000, ctx); s.loop.bcMsg(ctx.msgs);
    assert.equal(await s.input(), false);
    assert.deepEqual(hints, ["目标不存在", "目标不符合要求", "未学会该技能", "当前无法施放技能", "目标已死亡"]);
    hints.length = 0;
    assert.equal(s.a.onInput({ cmd: FightCmdEnum.attack, target: s.c.uid }), true);
    assert.deepEqual(hints, []);
    const skipped = s.fight.processUnit(s.a, s.a.input);
    assert.equal(skipped, undefined); assert.deepEqual(hints, ["目标已死亡"]);
});

// 测试：公共主动技能执行时费用不足也提示，避免仅烟雨输入预检有提示。
test("yanyu: shared skill execution hints insufficient costs", async () => {
    const s = await setup(2), hints: string[] = []; s.a.hintClient = msg => hints.push(msg);
    s.a.findSkill(skillId).getXls().cost = { mp: 101 };
    const ctx = s.fight.processUnit(s.a, { cmd: FightCmdEnum.skill, skill: skillId, target: s.c.uid });
    assert.deepEqual(hints, ["法力不足，无法支付技能消耗"]);
    assert.deepEqual(ctx.msgs, []); assert.equal(s.a.getSkillCd(skillId), 0);
    assert.equal(s.a.attr.point.mp, 100);
});

// 测试：技能执行时速度变化只重排剩余自动队列，不让已经行动的单位再次普攻。
test("yanyu: speed changes reorder only the remaining automatic attacks", async () => {
    const s = await setup(); let first = true;
    s.loop.waitDrawOver = async () => {
        if (first) { first = false; s.d.attr.speed = 500; s.loop.onChangeSpeed(s.d); }
    };
    await s.loop.processOneTurn(1);
    assert.deepEqual(s.messages.filter(msg => msg[0] === "actor").map(msg => msg[1]), [0, 3, 1, 2]);
});

// 测试：完整 run 不等待玩家输入，maxTurn=1 允许全轮自动普攻，结束广播后拒绝技能输入。
test("yanyu: full run completes a whole automatic round before its round limit", async () => {
    const s = await setup();
    const fresh = new FightLoopYanYu(s.fight);
    fresh.onMsg(msgs => { s.client.onMsg(msgs); });
    let animations = 0; fresh.waitDrawOver = async () => { animations++; };
    s.fight.turn = 0;
    assert.equal(await fresh.run(), FightResultEnum.defend);
    assert.equal(s.fight.turn, 1);
    assert.equal(animations, 4, "每次普攻等待一次，回合末不重复等待不存在的动画");
    assert.equal(s.client.win, FightResultEnum.defend);
    assert.equal(await fresh.onInput(s.a.uid, { turn: 1, cmd: FightCmdEnum.skill, skill: skillId, target: s.c.uid }), false);
    assert.ok(s.client.checkSame(s.fight));
    s.loop.end();
});

// 测试：开始前、输入准备前、死亡及休息中的即时施放者均不能提交技能。
test("yanyu: input is closed before preparation and rejects dead or resting casters", async () => {
    const s = await setup();
    const hints: string[] = []; s.a.hintClient = msg => hints.push(msg);
    const fresh = new FightLoopYanYu(s.fight); fresh.onMsg(() => {});
    const input: FightInput = { turn: 1, cmd: FightCmdEnum.skill, skill: skillId, target: s.c.uid };
    assert.equal(await fresh.onInput(s.a.uid, input), false);
    fresh.start(); assert.equal(await fresh.onInput(s.a.uid, input), false); fresh.end();
    const block = s.a.getActionBlockBuff.bind(s.a);
    s.a.getActionBlockBuff = () => ({}) as ReturnType<typeof s.a.getActionBlockBuff>;
    assert.equal(await s.input(), false); s.a.getActionBlockBuff = block;
    assert.deepEqual(hints, ["当前无法行动"]);
    const ctx = initFightContex(s.fight);
    s.fight.resolveAction(() => s.a.onHurt(s.c, "test", 1000, ctx)); s.loop.bcMsg(ctx.msgs);
    assert.equal(await s.input(), false);
    assert.deepEqual(hints, ["当前无法行动", "自身已死亡，无法行动"]);
});

// 测试：即时技能可明确指定 ID 为零的合法友方目标，输入拒绝阶段不误判为未指定。
test("yanyu: skill target zero is preserved", async () => {
    const s = await setup();
    const initial = initFightContex(s.fight); s.a.onHurt(s.c, "test", 50, initial); s.loop.bcMsg(initial.msgs);
    initSkills([{ id: 99961, name: "治疗", magic: true, rand: 1, attack: { attack: 40 }, final: {},
        func: "heal", sel: { target: TargetSelectEnum.friend } }]);
    s.b.addSkill(99961, 1);
    assert.equal(await s.input(s.b.uid, { skill: 99961, target: 0 }), true);
    assert.equal(s.a.getHp(), 1000);
});

// 测试：消息回调中重入提交技能不会产生并行结算，先完成当前动作再执行队列中的技能。
test("yanyu: reentrant message input is serialized by the same drain", async () => {
    const s = await setup(); let queued: Promise<boolean>;
    s.loop.onMsg(msgs => {
        const batch = typeof msgs[0] === "string" ? [msgs as fightMsg] : msgs as fightMsg[];
        if (!queued && batch.some(msg => msg[0] === "actor" && msg[3] === "skill")) queued = s.input(s.b.uid);
    });
    assert.equal(await s.input(), true); assert.equal(await queued, true);
    assert.deepEqual(s.messages.filter(msg => msg[0] === "actor").map(msg => msg[1]), [0, 1]);
});

// 测试：动画等待抛错时记录错误并判攻击方失败，关闭输入窗口且不能执行残留队列。
test("yanyu: failed animation ends the fight and closes further input", async t => {
    const logged = t.mock.method(console, "error", () => {});
    const s = await setup();
    s.loop.waitDrawOver = async () => { throw new Error("draw failed"); };
    assert.equal(await s.input(), false);
    assert.equal(s.fight.win, FightResultEnum.defend); assert.equal(logged.mock.callCount(), 1);
    assert.equal(await s.input(), false);
});

// 测试：即时技能的完整死亡反应链导致胜负后，停止剩余技能和自动队列，不执行后续费用。
test("yanyu: a winning immediate action stops both pending queues", async () => {
    const s = await setup(), gate = barrier(), entered = barrier();
    let first = true;
    s.loop.waitDrawOver = async () => { if (first) { first = false; entered.release(); await gate.promise; } };
    const running = s.loop.processOneTurn(1); await entered.promise;
    s.a.attr.magic.base.attack = 2000;
    s.c.onContex("die", (_unit, ctx) => s.d.onHurt(s.a, "test", 1000, ctx));
    const winning = s.input(), following = s.input(s.b.uid);
    gate.release(); await running; await Promise.all([winning, following]);
    assert.equal(s.fight.win, FightResultEnum.attack);
    assert.equal(s.b.attr.point.mp, 100);
    assert.equal(s.messages.filter(msg => msg[0] === "actor" && msg[3] === "skill").length, 1);
    s.loop.end(); assert.equal(s.client.win, FightResultEnum.attack);
    assert.equal(await s.input(), false);
});
