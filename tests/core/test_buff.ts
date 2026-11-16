import { strict as assert } from "node:assert";
import { test } from "node:test";
import { Fight } from "../../src/fight/Fight";
import { FightSide } from "../../src/fight/FightSide";
import { OverlapEnum, BuffData, initBuffs } from "../../src/fight/Buffs/BuffDatas";
import { FightBuff } from "../../src/fight/Buffs/FightBuff";
import { initPassives, PassiveData } from "../../src/fight/Buffs/PassiveDatas";
import { PassiveSkill } from "../../src/fight/Buffs/PassiveSkill";
import { FightContex } from "../../src/fight/Skills/NormalAttack";
import { initSkills, SkillData } from "../../src/fight/Skills/SkillDatas";
import { skillFunc } from "../../src/fight/Skills/SkillFuncType";
import { TargetSelectEnum } from "../../src/fight/struct";

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
            property: 0,
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
    initPassives([passive]);
    defender.passiveSkills.set(passive.id, new PassiveSkill(passive, 1));
    assert.equal(defender.inStatus("眩晕"), true);
    assert.equal(defender.isForbid("item"), true);
    assert.equal(defender.isForbid("escapse"), true);
});

test("buff addition observes overlap rules and emits add events", () => {
    const { fight, attacker, defender, ctx } = createFightPair();
    initBuffs([
        buffData(902, OverlapEnum.NOT),
        buffData(903, OverlapEnum.REPLACE),
    ]);

    const added: FightBuff[] = [];
    fight.onUnitEvent("addBuff", (_unit, _attacker, _why, buff) => added.push(buff));

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

test("buff removal reports missing ids, removes by tag, and death clears remaining buffs", () => {
    const { fight, attacker, defender, ctx } = createFightPair();
    initBuffs([
        buffData(904, OverlapEnum.NOT, [], ["debuff"]),
        buffData(905, OverlapEnum.NOT, [], ["debuff"]),
        buffData(906, OverlapEnum.NOT, [], ["debuff"]),
        buffData(907, OverlapEnum.NOT, [], ["positive"]),
    ]);

    const removed: number[] = [];
    fight.onUnitEvent("removeBuff", (_unit, _attacker, _why, buff: FightBuff) => removed.push(buff.getId()));

    for (const id of [904, 905, 906, 907]) {
        defender.addBuff(attacker, "test", id, 1, ctx);
    }
    assert.equal(defender.removeBuff(attacker, "test", 999, ctx), false);

    defender.removeBuffByTag(attacker, "cleanse", "debuff", 2, ctx);
    assert.equal(defender.findBuffsByTag("debuff").length, 1);
    assert.ok(defender.findBuff(907));
    assert.equal(removed.length, 2);

    defender.die();
    assert.equal(defender.buffs.size, 0);
    assert.equal(defender.isDied(), true);
});

test("buff skills add only buffs whose chance succeeds and remove configured ids and tags", () => {
    const { attacker, defender, ctx } = createFightPair(() => 0.75);
    initBuffs([
        buffData(908, OverlapEnum.NOT, ["禁疗"], ["debuff"]),
        buffData(909, OverlapEnum.NOT, [], ["debuff"]),
        buffData(912, OverlapEnum.NOT, [], ["debuff"]),
    ]);

    const addSkill = skillData(910, "addBuff", {
        addBuff: [[908, 4, 1], [909, 1, 1], [912, 1, 0.5]],
    });
    const removeSkill = skillData(911, "removeBuff", {
        rmeoveBuff: [[908, 1]],
        removeBuffTag: "debuff",
        removeBuffNum: 0,
    });
    initSkills([addSkill, removeSkill]);
    attacker.addSkill(addSkill.id, 1);
    attacker.addSkill(removeSkill.id, 1);

    assert.equal(skillFunc(attacker, defender, addSkill.id, ctx), true);
    assert.equal(defender.findBuff(908)?.level, 4);
    assert.ok(defender.findBuff(909));
    assert.equal(defender.findBuff(912), undefined);
    assert.equal(defender.inStatus("禁疗"), true);

    assert.equal(skillFunc(attacker, defender, removeSkill.id, ctx), true);
    assert.equal(defender.buffs.size, 0);
    assert.equal(defender.inStatus("禁疗"), false);
    assert.deepEqual(ctx.msgs.map(msg => msg[0]), [
        "addBuff",
        "addBuff",
        "removeBuff",
        "removeBuff",
    ]);
});

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
