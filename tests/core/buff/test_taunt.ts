import { BuffTurnEnum } from "../../../src/fight/Buffs/BuffDatas";
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { Fight, FightAttr, BaseAttack, FightSide, FightUnitUser, FightUnitMonster,
    FightLoopWest, FightClient, initFightContex, BuffData, initBuffs, OverlapEnum,
    initSkills, FightCmdEnum, TargetSelectEnum, DiedSelectEnum } from "../../../src";

const tauntId = 97801, secondTauntId = 97802;
const attackId = 97810, healId = 97811, selfId = 97812, positionId = 97813, areaId = 97814, spreadId = 97815;

function attr(hp = 1000): FightAttr {
    const base = (rand = 0): BaseAttack => ({ rand, hit: 100, dodge: 0,
        attack: 10, defend: 0, hurt: 0, hurtP: 0, hurtAnti: 0, hurtPAnti: 0,
        critP: 0, critPAnit: 0, critDeep: 0, critDeepAnit: 0 });
    const a = new FightAttr();
    a.point = { hp, hpMax: 1000, mp: 100, mpMax: 100 }; a.speed = 100;
    const group = () => ({ base: base(1), next: base(), kill: base(), spread: base(), fback: base(),
        final: { bloodP: 0, dbackP: 0, immunity: 0, immunityP: 0 } });
    a.physic = group(); a.magic = group(); a.heal = base(); a.poison = base();
    return a;
}

function setup(extra: Partial<BuffData> = {}) {
    const buff: BuffData = { id: tauntId, name: "嘲讽", desc: "强制选择施加者", class: "taunt",
        overlap: OverlapEnum.REPLACE, status: [], tags: [], magic: false, attackType: "base",
        attack: {}, final: {}, lastTurn: 2, times: 0, event: "hurt", turnType: BuffTurnEnum.thisTurn,
        skill: 0, skillLevel: 1, ...extra };
    initBuffs([buff, { ...buff, id: secondTauntId }]);
    const common = { name: "测试技能", magic: true, rand: 1, attack: {}, final: {} };
    initSkills([
        { ...common, id: attackId, sel: { target: TargetSelectEnum.enmey, sortAttr: "hp" } },
        { ...common, id: healId, func: "heal", sel: { target: TargetSelectEnum.friend, sortAttr: "hp" } },
        { ...common, id: selfId, func: "heal", sel: { target: TargetSelectEnum.self } },
        { ...common, id: positionId, sel: { target: TargetSelectEnum.duiwei } },
        { ...common, id: areaId, spread: spreadId, sel: { target: TargetSelectEnum.enmey, num: 2, sortAttr: "hp" } },
        { ...common, id: spreadId, sel: { target: TargetSelectEnum.enmey } },
    ]);
    const fight = new Fight(97800, { maxTurn: 10, waitInputSec: 1, duiwei: false }, 0);
    fight.createMap(3, 2);
    const actor = new FightUnitUser(10, attr(), { name: "被嘲讽者" }); actor.setPos(0);
    const friend = new FightUnitMonster(11, attr(), { name: "友方" }); friend.setPos(1);
    const source = new FightUnitMonster(0, attr(), { name: "嘲讽来源零号" }); source.setPos(0);
    const other = new FightUnitMonster(1, attr(50), { name: "低血敌人" }); other.setPos(2);
    const second = new FightUnitMonster(2, attr(), { name: "另一嘲讽来源" }); second.setPos(1);
    const a = new FightSide(), b = new FightSide();
    a.units.push(actor, friend); b.units.push(source, other, second);
    fight.createSide(a, b);
    for (const id of [attackId, healId, selfId, positionId, areaId]) actor.addSkill(id, 1);
    const ctx = initFightContex(fight);
    const add = (from = source, id = tauntId) => actor.addBuff(from, "test", id, 1, ctx);
    return { fight, actor, friend, source, other, second, ctx, add };
}

// 测试：被嘲讽者攻击编号为零的施加者，不再按随机或最低生命选敌人。
test("taunt: bearer attacks source ID zero instead of random or lowest-HP enemy", () => {
    const { fight, actor, source, ctx, add } = setup();
    add();
    assert.ok(actor.findBuff(tauntId));
    assert.equal(source.findBuff(tauntId), undefined);
    assert.equal(fight.selectMainTarget(actor, { target: TargetSelectEnum.enmey, sortAttr: "hp" }), source);
    let samples = 0;
    fight.random = () => { samples++; return 0.99; };
    assert.equal(fight.getDefaultEnemy(actor), source);
    assert.equal(samples, 0);
    fight.xls.duiwei = true;
    assert.equal(fight.getDefaultEnemy(actor), source);
    assert.equal(fight.processUnit(actor, { cmd: FightCmdEnum.attack })?.defend, source);
    assert.equal(fight.processUnit(actor, { cmd: FightCmdEnum.skill, skill: attackId })?.defend, source);
    assert.ok(ctx.msgs.every(msg => msg[0] !== "sync"));
});

// 测试：合法的显式敌方目标照常接受，执行时重定向且不修改已提交指令。
test("taunt: explicit legal enemy targets are accepted and redirected without mutating input", () => {
    const { fight, actor, source, other, add } = setup();
    add();
    let samples = 0;
    fight.random = () => { samples++; return 0.99; };
    for (const input of [{ cmd: FightCmdEnum.attack, target: other.uid },
        { cmd: FightCmdEnum.none, target: other.uid },
        { cmd: FightCmdEnum.skill, skill: attackId, target: other.uid }]) {
        Object.freeze(input);
        assert.equal(actor.onInput(input), true);
        const submitted = { ...actor.input };
        assert.equal(fight.processUnit(actor, actor.input)?.defend.uid, source.uid);
        assert.deepEqual(actor.input, submitted);
        assert.equal(input.target, other.uid);
    }
    assert.equal(samples, 0);
    assert.equal(other.getHp(), 50);
    assert.equal(source.getHp(), 970);
    assert.equal(actor.onInput({ cmd: FightCmdEnum.attack, target: source.uid }), true);
    assert.equal(actor.onInput({ cmd: FightCmdEnum.defend }), true);
    assert.equal(actor.onInput({ cmd: FightCmdEnum.cancel }), true);
});

// 测试：提交后新增嘲讽会改变执行目标，驱散后恢复原始目标意图。
test("taunt: execution redirects after a new taunt and restores original intent after dispel", () => {
    const { fight, actor, source, other, ctx, add } = setup();
    assert.equal(actor.onInput({ cmd: FightCmdEnum.attack, target: other.uid }), true);
    const intent = actor.input;
    add();
    assert.equal(fight.processUnit(actor, intent)?.defend.uid, source.uid);
    assert.equal(intent.target, other.uid);
    assert.equal(other.getHp(), 50);
    actor.removeBuff(source, "dispel", tauntId, 99, ctx);
    assert.equal(fight.processUnit(actor, intent)?.defend, other);
    assert.equal(other.getHp(), 40);
});

// 测试：嘲讽不影响友方、自身技能和范围技能副目标的正常选择规则。
test("taunt: friendly/self skills and secondary area targets keep their normal rules", () => {
    const { fight, actor, friend, source, other, second, add } = setup();
    add();
    assert.equal(actor.onInput({ cmd: FightCmdEnum.skill, skill: healId, target: friend.uid }), true);
    assert.equal(actor.onInput({ cmd: FightCmdEnum.skill, skill: selfId, target: actor.uid }), true);
    assert.equal(fight.processUnit(actor, { cmd: FightCmdEnum.skill, skill: healId, target: friend.uid })?.defend, friend);
    const ctx = fight.processUnit(actor, { cmd: FightCmdEnum.skill, skill: areaId, target: other.uid });
    assert.ok(ctx);
    assert.equal(ctx.defend, source);
    assert.deepEqual(ctx.msgs.filter(msg => msg[0] === "hurt").map(msg => msg[2]), [source.uid, other.uid, second.uid]);
});

// 测试：多个嘲讽按优先级和注册顺序选择第一个有效来源。
test("taunt: priorities and registration order select the first valid source", () => {
    const { fight, actor, source, second, ctx, add } = setup();
    add(); add(second, secondTauntId);
    const sel = { target: TargetSelectEnum.enmey, sortAttr: "hp" };
    assert.equal(fight.selectMainTarget(actor, sel), source);
    actor.removeBuff(source, "test", tauntId, 99, ctx);
    assert.equal(fight.selectMainTarget(actor, sel), second);
    // 同优先级替换后的实例按新的注册顺序排在后面。
    add();
    assert.equal(fight.selectMainTarget(actor, sel), second);
    initBuffs([{ ...actor.findBuff(tauntId).getXls(), prior: -10 }]);
    add();
    assert.equal(fight.selectMainTarget(actor, sel), source);
    source.die();
    assert.equal(fight.selectMainTarget(actor, sel), second);
});

// 测试：死亡、离场、变为友方或不符合死亡过滤条件的嘲讽来源被忽略。
test("taunt: dead, departed, friendly and death-filter-ineligible sources are ignored", () => {
    const { fight, actor, friend, source, other, second, add } = setup();
    add();
    source.die();
    assert.equal(fight.validateInput(actor, { cmd: FightCmdEnum.attack, target: other.uid }), true);
    source.relife();
    assert.equal(fight.getDefaultEnemy(actor)?.uid, source.uid);
    fight.getSide(source.side).units.splice(0, 1);
    assert.equal(fight.validateInput(actor, { cmd: FightCmdEnum.attack, target: other.uid }), true);
    add(friend);
    assert.equal(fight.validateInput(actor, { cmd: FightCmdEnum.attack, target: other.uid }), true);
    add(second);
    other.die();
    assert.equal(fight.selectMainTarget(actor, { target: TargetSelectEnum.enmey, die: DiedSelectEnum.die }), other);
});

// 测试：非正方形地图上的对位技能仍保留自身目标资格限制。
test("taunt: position skills preserve their own target qualification on a rectangular map", () => {
    const { fight, actor, source, other, add } = setup();
    add();
    // 来源不在技能要求的对位，不能强迫技能选择不合法站位。
    assert.equal(fight.processUnit(actor, { cmd: FightCmdEnum.skill, skill: positionId })?.defend, other);
    source.setPos(2); other.setPos(0);
    assert.equal(fight.processUnit(actor, { cmd: FightCmdEnum.skill, skill: positionId })?.defend, source);
});

// 测试：嘲讽到期或死亡清理后解除重定向，客户端通过增量消息保持一致。
test("taunt: duration and death cleanup release restriction, with incremental client consistency", () => {
    const { fight, actor, source, other, ctx, add } = setup({ lastTurn: 1 });
    const loop = new FightLoopWest(fight), client = new FightClient();
    loop.onMsg(msgs => client.onMsg(JSON.parse(JSON.stringify(msgs))));
    loop.start();
    add(); loop.bcMsg(ctx.msgs); ctx.msgs.length = 0;
    assert.equal(client.checkSame(fight), true);
    actor.processBeforeTurn(1, ctx);
    loop.bcMsg(ctx.msgs); ctx.msgs.length = 0;
    assert.equal(actor.findBuff(tauntId), undefined);
    assert.equal(fight.validateInput(actor, { cmd: FightCmdEnum.attack, target: other.uid }), true);
    add();
    fight.resolveAction(() => actor.onHurt(source, "test", 10000, ctx));
    loop.bcMsg(ctx.msgs);
    assert.equal(actor.findBuff(tauntId), undefined);
    assert.equal(client.checkSame(fight), true);
});

// 测试：网络指令保存原选择，执行时才将攻击重定向到嘲讽者。
test("taunt: network input preserves selected enemy and execution redirects to the taunter", async () => {
    const { fight, actor, source, other, add } = setup();
    add();
    const loop = new FightLoopWest(fight);
    fight.nextTurn();
    const wait = loop.waitInput(fight.turn, initFightContex(fight));
    loop.onInput(actor.uid, { turn: fight.turn, cmd: FightCmdEnum.attack, target: other.uid });
    assert.equal(loop.inputed, 1);
    assert.equal(await wait, 1);
    assert.equal(actor.input.target, other.uid);
    assert.equal(fight.processUnit(actor, actor.input)?.defend.uid, source.uid);
    assert.equal(actor.input.target, other.uid);
});

// 测试：普通分类标签不会产生程序中的嘲讽选目标行为。
test("taunt: ordinary classification tags do not impose targeting behavior", () => {
    const { fight, actor, other, add } = setup({ class: undefined, tags: ["taunt"] });
    add();
    assert.equal(fight.selectMainTarget(actor, { target: TargetSelectEnum.enmey, sortAttr: "hp" })?.uid, other.uid);
    assert.equal(actor.onInput({ cmd: FightCmdEnum.attack, target: other.uid }), true);
});

// 测试：同编号的新单位实例不能冒充原来的嘲讽施加者。
test("taunt: a replacement unit with the same ID does not replace the original source reference", () => {
    const { fight, actor, source, other, add } = setup();
    add();
    const replacement = new FightUnitMonster(source.uid, attr(), { name: "同 ID 新单位" });
    replacement.setFight(fight, source.side); replacement.setPos(source.pos);
    fight.getSide(source.side).units[0] = replacement;
    assert.equal(fight.validateInput(actor, { cmd: FightCmdEnum.attack, target: other.uid }), true);
});

// 测试：守尸指令在嘲讽者有效时重定向，来源死亡后仍按原守尸规则处理。
test("taunt: corpse guarding redirects while taunter is valid and skips corpse when taunter dies", () => {
    const { fight, actor, source, other, add } = setup();
    add(); other.die();
    const guard = { cmd: FightCmdEnum.attack, target: other.uid };
    assert.equal(actor.onInput(guard), true);
    assert.equal(fight.processUnit(actor, actor.input)?.defend.uid, source.uid);
    source.die();
    assert.equal(actor.onInput(guard), true);
    assert.equal(fight.processUnit(actor, actor.input), undefined);
    assert.equal(other.getHp(), 50); // 仍死亡则跳过，不对尸体伤害或自动换人。
});

// 测试：非法显式目标仍被拒绝，不能通过嘲讽重定向变为合法指令。
test("taunt: invalid explicit targets remain invalid rather than being rescued by redirection", () => {
    const { fight, actor, friend, add } = setup();
    add();
    let samples = 0;
    fight.random = () => { samples++; return 0.99; };
    for (const target of [friend.uid, actor.uid, 99999, NaN, 1.5]) {
        for (const input of [{ cmd: FightCmdEnum.attack, target },
            { cmd: FightCmdEnum.skill, skill: attackId, target }]) {
            assert.equal(actor.onInput(input), false);
            assert.ok(fight.processUnit(actor, input) === undefined);
        }
    }
    assert.equal(samples, 0);
});

// 测试：嘲讽者死亡和复活改变实际攻击目标，客户端同步对应的真实伤害。
test("taunt: execution follows source death and revival while client mirrors actual damage targets", () => {
    const { fight, actor, source, other, ctx, add } = setup();
    const loop = new FightLoopWest(fight), client = new FightClient();
    loop.onMsg(msgs => client.onMsg(JSON.parse(JSON.stringify(msgs))));
    loop.start(); add(); loop.bcMsg(ctx.msgs); ctx.msgs.length = 0;
    assert.equal(actor.onInput({ cmd: FightCmdEnum.skill, skill: attackId, target: other.uid }), true);
    fight.resolveAction(() => source.onHurt(actor, "test", 10000, ctx));
    loop.bcMsg(ctx.msgs); ctx.msgs.length = 0;
    const original = fight.processUnit(actor, actor.input);
    assert.ok(original);
    assert.equal(original.defend.uid, other.uid);
    loop.bcMsg(original.msgs);
    assert.equal(client.checkSame(fight), true);

    source.onRelife(actor, "test", ctx);
    source.onHeal(actor, "test", 500, ctx);
    loop.bcMsg(ctx.msgs);
    const redirected = fight.processUnit(actor, actor.input);
    assert.ok(redirected);
    assert.equal(redirected.defend.uid, source.uid);
    assert.equal(actor.input.target, other.uid);
    loop.bcMsg(redirected.msgs);
    assert.equal(client.checkSame(fight), true);
});

// 测试：死亡的受控单位仍能提交指令，复活后按照当前嘲讽规则执行。
test("taunt: a dead controlled unit can submit and execute after revival", () => {
    const { fight, actor, source, friend, ctx, add } = setup({ dieNotRemove: true });
    add();
    fight.resolveAction(() => actor.onHurt(source, "test", 10000, ctx));
    assert.equal(actor.isDied(), true);
    assert.equal(actor.onInput({ cmd: FightCmdEnum.attack, target: source.uid }), true);
    actor.onRelife(friend, "test", ctx);
    actor.onHeal(friend, "test", 100, ctx);
    assert.equal(fight.processUnit(actor, actor.input)?.defend.uid, source.uid);
});
