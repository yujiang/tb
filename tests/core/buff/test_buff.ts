import { BuffTurnEnum } from "../../../src/fight/Buffs/BuffDatas";
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { Fight } from "../../../src/fight/Fight";
import { FightSide } from "../../../src/fight/FightSide";
import { OverlapEnum, BuffData, initBuffs } from "../../../src/fight/Buffs/BuffDatas";
import { FightBuff, MAX_POWER } from "../../../src/fight/Buffs/FightBuff";
import { PassiveData } from "../../../src/fight/Passives/PassiveDatas";
import { PassiveSkill } from "../../../src/fight/Passives/PassiveSkill";
import { FightContex } from "../../../src/fight/Fight";
import { initSkills, SkillData } from "../../../src/fight/Skills/SkillDatas";
import { skillFunc } from "../../../src/fight/Skills/SkillFuncType";
import { TargetSelectEnum } from "../../../src/fight/struct";
import { attackFunc } from "../../../src/fight/Skills/Funcs/NormalAttack";
import { FightLoopWest } from "../../../src/fight/Online/FightLoopWest";

function createFightPair(random = () => 0) {
    const fight = new Fight(1, { maxTurn: 10, waitInputSec: 1, duiwei: false });
    fight.random = random;

    const attackSide = new FightSide();
    const defendSide = new FightSide();
    attackSide.createSimpleMonster(fight, [{ name: "attacker", id: 1, pos: 0 }]);
    defendSide.createSimpleMonster(fight, [{ name: "defender", id: 2, pos: 0 }]);
    fight.createSide(attackSide, defendSide);

    const attacker = attackSide.units[0];
    const defender = defendSide.units[0];
    const ctx: FightContex = { fight, attack: attacker, defend: defender, msgs: [], effects: [] };
    return { fight, attacker, defender, ctx };
}

function buffData(
    id: number,
    overlap = OverlapEnum.NOT,
    status: string[] = [],
    tags: string[] = [],
): BuffData {
    return {
        id,
        name: `buff-${id}`,
        desc: "",
        overlap,
        turnType: BuffTurnEnum.thisTurn, lastTurn: 0, times: 0, event: "hurt", skill: 0, skillLevel: 1,
        status,
        tags,
        magic: false,
        attackType: "base",
        attack: {},
        final: {},
    };
}

function passiveData(id: number, status: string[]): PassiveData {
    return {
        addbuff: [],
        id,
        name: `passive-${id}`,
        desc: "",
        status,
        tags: [],
        magic: false,
        attackType: "base",
        attack: {},
        final: {},
    };
}

function skillData(id: number, func: string, extra: Partial<SkillData> = {}): SkillData {
    return {
        id,
        name: `skill-${id}`,
        magic: false,
        sel: { target: TargetSelectEnum.enmey },
        func,
        rand: 1,
        attack: {
            rand: 1,
            hit: 100,
            dodge: 0,
            attack: 0,
            defend: 0,
            hurt: 0,
            hurtP: 0,
            hurtAnti: 0,
            hurtPAnti: 0,
            critP: 0,
            critDeep: 0,
            critPAnit: 0,
            critDeepAnit: 0,
        },
        final: { dbackP: 0, bloodP: 0, immunity: 0, immunityP: 0 },
        ...extra,
    };
}

// 测试：Buff 和被动状态影响状态查询及动作禁止判断。
test("buff statuses affect status queries and forbidden actions", () => {
    const { attacker, defender, ctx } = createFightPair();
    initBuffs([buffData(901, OverlapEnum.NOT, ["封印"], ["debuff"])]);

    assert.ok(defender.addBuff(attacker, "test", 901, 2, ctx));

    assert.equal(defender.inStatus("封印"), true);
    assert.equal(defender.isForbid("attack"), true);
    assert.equal(defender.isForbid("skill"), true);
    assert.equal(defender.isForbid("item"), false);
    assert.equal(defender.isForbid("unknown"), false);
    assert.deepEqual(defender.findBuffsByTag("debuff").map(buff => buff.getId()), [901]);

    const passive = passiveData(918, ["眩晕"]);
    defender.passiveSkills.push(new PassiveSkill(passive, 1));
    assert.equal(defender.inStatus("眩晕"), true);
    assert.equal(defender.isForbid("item"), true);
    assert.equal(defender.isForbid("escapse"), true);
});

// 测试：添加 Buff 遵守叠加规则，并发出对应添加事件。
test("buff addition observes overlap rules and emits add events", () => {
    const { fight, attacker, defender, ctx } = createFightPair();
    initBuffs([
        buffData(902, OverlapEnum.NOT),
        buffData(903, OverlapEnum.REPLACE),
    ]);

    const added: FightBuff[] = [];
    fight.onUnitEvent("addBuff", (_unit, _ctx, _attacker, _why, buff) => added.push(buff));

    const initial = defender.addBuff(attacker, "test", 902, 1, ctx);
    assert.ok(initial);
    assert.equal(defender.addBuff(attacker, "test", 902, 5, ctx), undefined);
    assert.equal(defender.findBuff(902), initial);
    assert.equal(defender.addBuff(attacker, "test", 999, 1, ctx), undefined);

    const replaced = defender.addBuff(attacker, "test", 903, 1, ctx);
    const replacement = defender.addBuff(attacker, "test", 903, 3, ctx);
    assert.ok(replaced);
    assert.ok(replacement);
    assert.notEqual(replacement, replaced);
    assert.equal(replacement.level, 3);
    assert.equal(defender.buffs.size, 2);
    assert.equal(added.length, 3);
    assert.deepEqual(ctx.msgs.map(msg => msg[0]), ["addBuff", "addBuff", "addBuff"]);
});

// 测试：移除 Buff 处理缺失编号和标签筛选，死亡清空剩余 Buff。
test("buff removal reports missing ids, removes by tag, and death clears remaining buffs", () => {
    const { fight, attacker, defender, ctx } = createFightPair();
    initBuffs([
        buffData(904, OverlapEnum.NOT, [], ["debuff"]),
        buffData(905, OverlapEnum.NOT, [], ["debuff"]),
        buffData(906, OverlapEnum.NOT, [], ["debuff"]),
        buffData(907, OverlapEnum.NOT, [], ["positive"]),
    ]);

    const removed: number[] = [];
    fight.onUnitEvent("removeBuff", (_unit, _ctx, _attacker, _why, buff: FightBuff) => removed.push(buff.getId()));

    for (const id of [904, 905, 906, 907]) {
        defender.addBuff(attacker, "test", id, 1, ctx);
    }
    assert.equal(defender.removeBuff(attacker, "test", 999, MAX_POWER, ctx), undefined);

    defender.removeBuffByTag(attacker, "cleanse", "debuff", 2, MAX_POWER, ctx);
    assert.equal(defender.findBuffsByTag("debuff").length, 1);
    assert.ok(defender.findBuff(907));
    assert.equal(removed.length, 2);
    assert.deepEqual(ctx.msgs.filter(msg => msg[0] === "removeBuff"),
        removed.map(id => ["removeBuff", "cleanse", defender.uid, attacker.uid, id]));

    defender.die();
    assert.equal(defender.buffs.size, 0);
    assert.equal(defender.isDied(), true);
});

// 测试：覆盖先比较 power，power 相同时再比较 level；两者相同保留旧实例。
test("buff overlap compares power first and level only when powers match", () => {
    const cases = [
        { power: 1, level: 999, nextPower: 2, nextLevel: 1, replace: true },
        { power: 2, level: 1, nextPower: 1, nextLevel: 999, replace: false },
        { power: 2, level: 5, nextPower: 2, nextLevel: 4, replace: false },
        { power: 2, level: 5, nextPower: 2, nextLevel: 5, replace: false },
        { power: 2, level: 5, nextPower: 2, nextLevel: 6, replace: true },
        { power: undefined, level: 5, nextPower: undefined, nextLevel: 4, replace: false },
        { power: undefined, level: 5, nextPower: undefined, nextLevel: 6, replace: true },
    ];
    for (const [i, sample] of cases.entries()) {
        const { attacker, defender, ctx } = createFightPair();
        const data = buffData(98600 + i, OverlapEnum.RELPACE_BYPOWER);
        initBuffs([{ ...data, power: sample.power }]);
        const original = defender.addBuff(attacker, "test", data.id, sample.level, ctx);
        initBuffs([{ ...data, power: sample.nextPower }]);
        const replacement = defender.addBuff(attacker, "test", data.id, sample.nextLevel, ctx);
        if (sample.replace) {
            assert.ok(replacement, `case ${i}: stronger Buff should replace`);
            assert.notEqual(replacement, original);
            assert.equal(defender.findBuff(data.id), replacement);
        } else {
            assert.equal(replacement, undefined, `case ${i}: weaker or equal Buff should be rejected`);
            assert.equal(defender.findBuff(data.id), original);
        }
    }
});

// 测试：移除技能的 power 不足时保留 Buff，达到 Buff power 时可移除。
test("buff removal requires sufficient power by id, list, and tag", () => {
    const { attacker, defender, ctx } = createFightPair();
    initBuffs([
        {...buffData(9221, OverlapEnum.NOT, [], ["power-test"]), power: 5},
        {...buffData(9222, OverlapEnum.NOT, [], ["power-test"]), power: 5},
        {...buffData(9223, OverlapEnum.NOT, [], ["power-test"]), power: 2},
        {...buffData(9224, OverlapEnum.NOT, [], ["power-test"]), power: 5},
        {...buffData(9226, OverlapEnum.NOT, [], ["skill-power"]), power: 5},
    ]);

    const byId = defender.addBuff(attacker, "test", 9221, 99, ctx);
    assert.equal(defender.removeBuff(attacker, "test", 9221, 4, ctx), undefined);
    assert.equal(defender.findBuff(9221), byId);
    assert.equal(defender.removeBuff(attacker, "test", 9221, 5, ctx), byId);

    const byList = defender.addBuff(attacker, "test", 9222, 1, ctx);
    assert.deepEqual(defender.removeBuffs(attacker, "test", [[9222, 1]], 4, ctx), []);
    assert.equal(defender.findBuff(9222), byList);
    assert.deepEqual(defender.removeBuffs(attacker, "test", [[9222, 1]], 5, ctx), [byList]);

    const weak = defender.addBuff(attacker, "test", 9223, 99, ctx);
    const strong = defender.addBuff(attacker, "test", 9224, 1, ctx);
    assert.deepEqual(defender.removeBuffByTag(attacker, "test", "power-test", 0, 4, ctx), [weak]);
    assert.equal(defender.findBuff(9224), strong);
    assert.deepEqual(defender.removeBuffByTag(attacker, "test", "power-test", 0, 5, ctx), [strong]);

    const addSkill = skillData(9225, "nohurt", {
        power: 5,
        addBuff: [[9226, 1, 1]],
    });
    const weakRemoveSkill = skillData(9227, "nohurt", {
        power: 4,
        removeBuffTag: "skill-power",
        removeBuffNum: 0,
    });
    const equalRemoveSkill = skillData(9228, "nohurt", {
        power: 5,
        removeBuffTag: "skill-power",
        removeBuffNum: 0,
    });
    initSkills([addSkill, weakRemoveSkill, equalRemoveSkill]);
    attacker.addSkill(addSkill.id, 1);
    attacker.addSkill(weakRemoveSkill.id, 1);
    attacker.addSkill(equalRemoveSkill.id, 1);

    assert.equal(skillFunc(attacker, defender, addSkill.id, ctx), true);
    assert.equal(defender.findBuff(9226)?.getPower(), 5);
    assert.equal(skillFunc(attacker, defender, weakRemoveSkill.id, ctx), true);
    assert.ok(defender.findBuff(9226));
    assert.equal(skillFunc(attacker, defender, equalRemoveSkill.id, ctx), true);
    assert.equal(defender.findBuff(9226), undefined);
});

// 测试：Buff 技能按概率添加效果，并按编号或标签移除效果。
test("buff skills add only buffs whose chance succeeds and remove configured ids and tags", () => {
    const { attacker, defender, ctx } = createFightPair(() => 0.75);
    initBuffs([
        buffData(908, OverlapEnum.NOT, ["禁疗"], ["debuff"]),
        buffData(909, OverlapEnum.NOT, [], ["debuff"]),
        buffData(912, OverlapEnum.NOT, [], ["debuff"]),
    ]);

    const addSkill = skillData(910, "nohurt", {
        addBuff: [[908, 4, 1], [909, 1, 1], [912, 1, 0.5]],
    });
    const removeSkill = skillData(911, "nohurt", {
        rmeoveBuff: [[908, 1]], power: 4,
    });
    const removeTagSkill = skillData(913, "nohurt", {
        removeBuffTag: "debuff",
        removeBuffNum: 0,
    });
    initSkills([addSkill, removeSkill, removeTagSkill]);
    attacker.addSkill(addSkill.id, 1);
    attacker.addSkill(removeSkill.id, 1);
    attacker.addSkill(removeTagSkill.id, 1);

    assert.equal(skillFunc(attacker, defender, addSkill.id, ctx), true);
    assert.equal(defender.findBuff(908)?.level, 4);
    assert.ok(defender.findBuff(909));
    assert.equal(defender.findBuff(912), undefined);
    assert.equal(defender.inStatus("禁疗"), true);

    assert.equal(skillFunc(attacker, defender, removeSkill.id, ctx), true);
    assert.equal(defender.buffs.size, 1);
    assert.equal(defender.inStatus("禁疗"), false);
    assert.equal(skillFunc(attacker, defender, removeTagSkill.id, ctx), true);
    assert.equal(defender.buffs.size, 0);
    assert.deepEqual(ctx.msgs.map(msg => msg[0]), [
        "addBuff",
        "addBuff",
        "removeBuff",
        "removeBuff",
    ]);
});

// 测试：禁疗和禁毒状态阻止对应的治疗与中毒效果。
test("buff statuses block healing and poison effects", () => {
    const { attacker, defender, ctx } = createFightPair();
    defender.attr.point.hp = 50;
    attacker.attr.poison = { ...attacker.attr.heal };
    initBuffs([buffData(915, OverlapEnum.NOT, ["禁疗", "禁毒"])]);
    initSkills([
        skillData(916, "heal"),
        skillData(917, "poison"),
    ]);
    attacker.addSkill(916, 1);
    attacker.addSkill(917, 1);
    defender.addBuff(attacker, "test", 915, 1, ctx);

    skillFunc(attacker, defender, 916, ctx);
    skillFunc(attacker, defender, 917, ctx);

    assert.equal(defender.attr.point.hp, 50);
    assert.deepEqual(ctx.msgs.map(msg => msg[0]), ["addBuff", "禁疗", "百毒不侵"]);
});

// 测试：周期治疗恰好持续三个回合，同一边界重复调用不重复触发。
test("periodic healing lasts three turns and ticks once per boundary", () => {
    const {fight, attacker, defender, ctx} = createFightPair(() => 0.99);
    defender.attr.point.hp = 30;
    const data = skillData(9201, "heal"); data.attack.attack = 10;
    initSkills([data]);
    initBuffs([{...buffData(9202), func: "heal", skill: 9201, lastTurn: 3}]);
    defender.addBuff(attacker, "test", 9202, 1, ctx);
    defender.processBeforeTurn(0, ctx);
    assert.equal(defender.getHp(), 30);
    for (let turn = 1; turn <= 3; turn++) {
        fight.turn = turn;
        defender.processBeforeTurn(turn, ctx);
        defender.processBeforeTurn(turn, ctx);
        assert.equal(defender.getHp(), 30 + turn * 10);
        assert.equal(!!defender.findBuff(9202), turn < 3);
    }
    defender.processBeforeTurn(4, ctx);
    assert.equal(defender.getHp(), 60);
    assert.equal(ctx.msgs.filter(m => m[0] === "removeBuff").length, 1);
});

// 测试：单位自身计时的周期扣血不受全局回合推进影响。
test("input-clock poison ticks on each input boundary only", () => {
    const {attacker, defender, ctx} = createFightPair(() => 0.99);
    const data = skillData(9203, "poison"); data.attack.attack = 10;
    initSkills([data]);
    initBuffs([{...buffData(9204), func: "poison", skill: 9203, lastTurn: 2, turnType: BuffTurnEnum.inputTurn}]);
    defender.addBuff(attacker, "test", 9204, 1, ctx);
    defender.processBeforeTurn(100, ctx);
    assert.equal(defender.getHp(), 100);
    defender.inputStart(100, ctx);
    assert.equal(defender.getHp(), 90);
    defender.inputStart(100, ctx);
    assert.equal(defender.getHp(), 80);
    assert.equal(defender.findBuff(9204), undefined);
});

// 测试：减伤 Buff 在前三次命中生效，第三次后移除并恢复属性及监听数量。
test("three-hit damage reduction expires after the third protected hit", () => {
    const {attacker, defender, ctx} = createFightPair(() => 0.99);
    attacker.attr.physic.base = {...attacker.attr.physic.base, attack: 20, hit: 100, critP: 0};
    defender.attrOri.physic.base.defend = 0; defender.attrOri.physic.base.dodge = 0;
    initBuffs([{...buffData(9205), times: 3, final: {immunityP: 0.5}}]);
    defender.addBuff(attacker, "test", 9205, 1, ctx);
    for (let hit = 1; hit <= 4; hit++) {
        attackFunc(attacker, defender, {...ctx, msgs: [], effects: []});
        assert.equal(defender.getHp(), hit <= 3 ? 100 - hit * 10 : 50);
        assert.equal(!!defender.findBuff(9205), hit < 3);
    }
    assert.equal(defender.contextEmitter.listenerCount("hurt"), 0);
});

// 测试：按回合过期的次数 Buff 同时移除属性加成和事件监听。
test("turn expiration unregisters counted buff listeners", () => {
    const {attacker, defender, ctx} = createFightPair();
    initBuffs([{...buffData(9206), times: 3, lastTurn: 1, final: {immunityP: 0.5}}]);
    defender.addBuff(attacker, "test", 9206, 1, ctx);
    defender.processBeforeTurn(1, ctx);
    assert.equal(defender.findBuff(9206), undefined);
    assert.equal(defender.contextEmitter.listenerCount("hurt"), 0);
    assert.equal(defender.attr.physic.final.immunityP, 0);
});

// 测试：替换次数 Buff 后旧实例不再接收事件，新实例从完整次数开始。
test("replacement resets counts and death unregisters listeners", () => {
    const {attacker, defender, ctx} = createFightPair();
    initBuffs([{...buffData(9207, OverlapEnum.REPLACE), times: 3}]);
    const old = defender.addBuff(attacker, "test", 9207, 1, ctx);
    defender.onHurt(attacker, "test", 1, ctx);
    const current = defender.addBuff(attacker, "test", 9207, 1, ctx);
    defender.onHurt(attacker, "test", 1, ctx);
    assert.equal(old.times, 2); assert.equal(current.times, 2);
    assert.equal(defender.contextEmitter.listenerCount("hurt"), 1);
    defender.die();
    assert.equal(defender.contextEmitter.listenerCount("hurt"), 0);
});

// 测试：前一个周期效果移除后续 Buff 后，后续 Buff 不再继续触发。
test("removed periodic buffs are skipped within the same boundary", () => {
    const {fight, attacker, defender, ctx} = createFightPair(() => 0.99);
    const data = skillData(9208, "heal"); data.attack.attack = 10;
    initSkills([data]);
    initBuffs([9209, 9210].map(id => ({...buffData(id), func: "heal", skill: 9208, lastTurn: 3})));
    defender.attr.point.hp = 30;
    for (const id of [9209, 9210]) defender.addBuff(attacker, "test", id, 1, ctx);
    fight.onUnitEvent("heal", () => defender.removeBuff(attacker, "test", 9210, MAX_POWER, ctx));
    defender.processBeforeTurn(1, ctx);
    assert.equal(defender.getHp(), 40);
});

// 测试：周期效果回调中新加的 Buff 从下一个边界起生效。
test("periodic buffs added during a tick wait until the next boundary", () => {
    const {fight, attacker, defender, ctx} = createFightPair(() => 0.99);
    const data = skillData(9211, "heal"); data.attack.attack = 10;
    initSkills([data]);
    initBuffs([9212, 9213].map(id => ({...buffData(id), func: "heal", skill: 9211, lastTurn: 3})));
    defender.attr.point.hp = 30;
    defender.addBuff(attacker, "test", 9212, 1, ctx);
    fight.onUnitEvent("heal", () => defender.addBuff(attacker, "test", 9213, 1, ctx));
    fight.turn = 1;
    defender.processBeforeTurn(1, ctx);
    assert.equal(defender.getHp(), 40);
    fight.turn = 2;
    defender.processBeforeTurn(2, ctx);
    assert.equal(defender.getHp(), 60);
});

// 测试：输入边界中毒致战斗结束后，不再执行原有行动队列。
test("lethal input-clock poison stops the fight before normal actions", async () => {
    const {fight, attacker, defender, ctx} = createFightPair(() => 0.99);
    const data = skillData(9214, "poison"); data.attack.attack = 200;
    initSkills([data]);
    initBuffs([{...buffData(9215), func: "poison", skill: 9214, turnType: BuffTurnEnum.inputTurn, lastTurn: 1}]);
    defender.addBuff(attacker, "test", 9215, 1, ctx);
    const loop = new FightLoopWest(fight); loop.bcMsg = () => {};
    let acted = false;
    loop.processOneTurn = async () => {acted = true;};
    await loop.run();
    assert.equal(acted, false);
    assert.equal(defender.isDied(), true);
});
