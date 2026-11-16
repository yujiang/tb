import { strict as assert } from "node:assert";
import { test } from "node:test";
import { Fight } from "../../src/fight/Fight";
import { BaseAttack, FinalAttack, FightTypeAttr } from "../../src/fight/FightAttr";
import { FightSide } from "../../src/fight/FightSide";
import { calcHurt, mergeTable } from "../../src/fight/Skills/Calc";
import { FightSkill, SkillData } from "../../src/fight/Skills/FightSkill";
import { skillAttackFunc } from "../../src/fight/Skills/NomalSkill";
import { attackFunc, FightContex } from "../../src/fight/Skills/NormalAttack";
import { getSkillData, initSkills } from "../../src/fight/Skills/SkillDatas";
import { TargetSelectEnum } from "../../src/fight/struct";
import { FightUnit } from "../../src/fight/Unit/FightUnit";

function baseAttack(overrides: Partial<BaseAttack> = {}): BaseAttack {
    return {
        property: 0,
        rand: 1,
        hit: 100,
        dodge: 0,
        attack: 20,
        defend: 0,
        crit: 0,
        critAnit: 0,
        critDeep: 1,
        ...overrides,
    };
}

function finalAttack(overrides: Partial<FinalAttack> = {}): FinalAttack {
    return {
        dbackP: 0,
        bloodP: 0,
        immunity: 0,
        immunityP: 0,
        ...overrides,
    };
}

function fightType(base: BaseAttack): FightTypeAttr {
    return {
        base,
        kill: { ...base, rand: 0.5 },
        next: { ...base, rand: 0.5 },
        spread: { ...base, rand: 0.5 },
        fback: { ...base, rand: 0.5 },
        final: finalAttack(),
    };
}

function createFightPair() {
    const fight = new Fight(1, { maxTurn: 10, waitInputSec: 1, duiwei: false });
    fight.random = () => 0.99;

    const attackSide = new FightSide();
    const defendSide = new FightSide();
    attackSide.createSimpleMonster(fight, [{ name: "attacker", id: 1, pos: 0 }]);
    defendSide.createSimpleMonster(fight, [{ name: "defender", id: 2, pos: 0 }]);
    fight.createSide(attackSide, defendSide);

    const attacker = attackSide.units[0];
    const defender = defendSide.units[0];
    attacker.attr.physic = fightType(baseAttack({ attack: 20 }));
    attacker.attr.magic = fightType(baseAttack({ attack: 20 }));
    defender.attr.physic = fightType(baseAttack({ defend: 5 }));
    defender.attr.magic = fightType(baseAttack({ defend: 5 }));

    return { fight, attacker, defender };
}

function contextFor(fight: Fight, attacker: FightUnit, defender: FightUnit): FightContex {
    return { fight, attack: attacker, defend: defender, msgs: [], effects: [] };
}

test("skill registry stores data by id and creates relative skills at the same level", () => {
    const childData: SkillData = {
        id: 102,
        name: "child",
        magic: true,
        sel: { target: TargetSelectEnum.enmey },
        rand: 1,
        attack: baseAttack(),
        final: finalAttack(),
    };
    const parentData: SkillData = {
        id: 101,
        name: "parent",
        magic: true,
        sel: { target: TargetSelectEnum.enmey },
        rand: 1,
        next: childData.id,
        kill: childData.id,
        attack: baseAttack(),
        final: finalAttack(),
    };

    initSkills([parentData, childData]);

    assert.equal(getSkillData(parentData.id), parentData);
    assert.equal(getSkillData(999), undefined);
    assert.equal(getSkillData(0), undefined);

    const parent = new FightSkill(parentData, 7);
    const relative = parent.getRelativeSkill(childData.id);
    assert.ok(relative);
    assert.equal(relative.getId(), childData.id);
    assert.equal(relative.level, parent.level);
    assert.equal(parent.getNextSkill().getId(), childData.id);
    assert.equal(parent.getKillSkill().getId(), childData.id);
    assert.equal(parent.getRelativeSkill(999), undefined);

    const replacement: SkillData = { ...parentData, name: "replacement" };
    initSkills([replacement]);
    assert.equal(getSkillData(parentData.id), replacement);
});

test("damage calculation applies critical hits and defender damage reduction", () => {
    const { fight, attacker, defender } = createFightPair();
    const ctx = contextFor(fight, attacker, defender);

    const damage = calcHurt(
        fight,
        baseAttack({ attack: 24, crit: 1 }),
        baseAttack({ defend: 4 }),
        finalAttack(),
        finalAttack({ immunity: 4, immunityP: 0.25 }),
        ctx,
    );

    assert.equal(damage, 34.5);
    assert.deepEqual(ctx.effects, ["crit"]);
});

test("damage calculation always returns at least one damage", () => {
    const { fight, attacker, defender } = createFightPair();
    const ctx = contextFor(fight, attacker, defender);

    assert.equal(
        calcHurt(fight, baseAttack({ attack: 1 }), baseAttack({ defend: 10 }), finalAttack(), finalAttack(), ctx),
        1,
    );
    assert.deepEqual(ctx.effects, []);
});

test("attribute merging adds matching fields without mutating either input", () => {
    const base = { attack: 20, defend: 5 };
    const skill = { attack: 10, defend: 2 };

    assert.deepEqual(mergeTable(base, skill), { attack: 30, defend: 7 });
    assert.deepEqual(base, { attack: 20, defend: 5 });
    assert.deepEqual(skill, { attack: 10, defend: 2 });
});

test("ordinary attacks and skills use the shared damage flow with skill attributes", () => {
    const ordinary = createFightPair();
    const ordinaryCtx = contextFor(ordinary.fight, ordinary.attacker, ordinary.defender);

    assert.equal(attackFunc(ordinary.attacker, ordinary.defender, ordinaryCtx), true);
    const ordinaryHit = ordinaryCtx.msgs.find(([type]) => type === "hurt");
    assert.ok(ordinaryHit);
    assert.equal(ordinaryHit[4], 15);
    assert.equal(ordinary.defender.attr.point.hp, 85);

    const skilled = createFightPair();
    const skillData: SkillData = {
        id: 201,
        name: "magic strike",
        magic: true,
        sel: { target: TargetSelectEnum.enmey },
        rand: 1,
        attack: baseAttack({ attack: 10 }),
        final: finalAttack(),
    };
    const skill = new FightSkill(skillData, 1);
    const skillCtx = contextFor(skilled.fight, skilled.attacker, skilled.defender);

    assert.equal(skillAttackFunc(skilled.attacker, skilled.defender, skill, skillCtx), true);
    assert.equal(skillCtx.damage, 25);
    assert.equal(skilled.defender.attr.point.hp, 75);
    assert.equal(skill.getAttack().attack, 10);
    assert.equal(skilled.attacker.attr.magic.base.attack, 20);
});
