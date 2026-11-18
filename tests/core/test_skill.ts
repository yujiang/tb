import { strict as assert } from "node:assert";
import { test } from "node:test";
import { Fight } from "../../src/fight/Fight";
import { BaseAttack, FinalAttack, FightAttr, FightTypeAttr } from "../../src/fight/FightAttr";
import { FightSide } from "../../src/fight/FightSide";
import { FightStatic } from "../../src/fight/Buffs/StaticData";
import { calcAttack, calcAttr, calcHurt, calcPoison, mergeTable } from "../../src/fight/Skills/Calc";
import { FightSkill } from "../../src/fight/Skills/FightSkill";
import { healFunc } from "../../src/fight/Skills/Funcs/Heal";
import { skillAttackFunc } from "../../src/fight/Skills/Funcs/NomalSkill";
import { attackFunc } from "../../src/fight/Skills/Funcs/NormalAttack";
import { FightContex } from "../../src/fight/Fight";
import { getSkillData, initSkills, SkillData } from "../../src/fight/Skills/SkillDatas";
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
        critP: 0,
        critDeep: 1,
        critPAnit: 0,
        critDeepAnit: 0,
        hurt: 0,
        hurtP: 0,
        hurtAnti: 0,
        hurtPAnti: 0,
        ...overrides,
    };
}

// 测试：简单怪物的默认暴击率使用比例数值，不能导致每次攻击必然暴击。
test("simple monsters: default critical chances are fractional and do not force critical hits", () => {
    const fight = new Fight(97401, { maxTurn: 1, waitInputSec: 1, duiwei: false }, 0);
    fight.random = () => 0.5;
    const side = new FightSide();
    side.createSimpleMonster(fight, [{ id: 0, name: "默认暴击", pos: 0 }]);
    const unit = side.units[0];
    for (const [group, expected] of [[unit.attr.physic, 0.25], [unit.attr.magic, 0.125]] as const) {
        assert.equal(group.base.critP, expected);
        for (const sample of [0.1, 0.9]) {
            fight.random = () => sample;
            const ctx = contextFor(fight, unit, unit);
            calcAttack(fight, group.base, baseAttack({ defend: 0 }), ctx);
            assert.equal(ctx.effects.includes("crit"), sample < expected);
        }
    }
});

// 测试：简单怪物显式配置零暴击率时保持为零，不被默认值覆盖。
test("simple monsters: explicit zero critical chances stay zero", () => {
    const fight = new Fight(97402, { maxTurn: 1, waitInputSec: 1, duiwei: false }, 0);
    const side = new FightSide();
    side.createSimpleMonster(fight, [{ id: 0, name: "不暴击", pos: 0,
        physic: baseAttack({ critP: 0 }), magic: baseAttack({ critP: 0 }) }]);
    const unit = side.units[0];
    assert.equal(unit.attr.physic.base.critP, 0);
    assert.equal(unit.attr.magic.base.critP, 0);
});

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

function staticModifier(
    id: number,
    attackType: string,
    magic: boolean,
    attack: Partial<BaseAttack> = {},
    final: Partial<FinalAttack> = {},
): FightStatic {
    return new FightStatic({
        id,
        name: `modifier-${id}`,
        desc: "",
        status: [],
        tags: [],
        magic,
        attackType,
        attack,
        final,
    }, 1);
}

// 测试：技能表按编号注册，并以相同等级创建关联子技能。
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

// 测试：伤害计算应用暴击和防守方的固定及比例减伤。
test("damage calculation applies critical hits and defender damage reduction", () => {
    const { fight, attacker, defender } = createFightPair();
    const ctx = contextFor(fight, attacker, defender);

    const damage = calcHurt(
        fight,
        baseAttack({ attack: 24, critP: 1 }),
        baseAttack({ defend: 4 }),
        finalAttack(),
        finalAttack({ immunity: 4, immunityP: 0.25 }),
        ctx,
    );

    assert.equal(damage, 34.5);
    assert.deepEqual(ctx.effects, ["crit"]);
});

// 测试：攻击伤害计算结果最低为一点。
test("damage calculation always returns at least one damage", () => {
    const { fight, attacker, defender } = createFightPair();
    const ctx = contextFor(fight, attacker, defender);

    assert.equal(
        calcHurt(fight, baseAttack({ attack: 1 }), baseAttack({ defend: 10 }), finalAttack(), finalAttack(), ctx),
        1,
    );
    assert.deepEqual(ctx.effects, []);
});

// 测试：属性合并累加对应字段，且不修改任一输入对象。
test("attribute merging adds matching fields without mutating either input", () => {
    const base = { attack: 20, defend: 5 };
    const skill = { attack: 10, defend: 2 };

    assert.deepEqual(mergeTable(base, skill), { attack: 30, defend: 7 });
    assert.deepEqual(base, { attack: 20, defend: 5 });
    assert.deepEqual(skill, { attack: 10, defend: 2 });
});

// 测试：普通攻击和技能复用伤害流程，并应用技能属性加成。
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

// 测试：简单怪物的技能伤害、治疗和中毒计算均产生有限数值。
test("simple monsters have finite attributes for skill damage, healing, and poison", () => {
    const fight = new Fight(2, { maxTurn: 10, waitInputSec: 1, duiwei: false });
    fight.random = () => 0.99;
    const attackSide = new FightSide();
    const defendSide = new FightSide();
    attackSide.createSimpleMonster(fight, [{ name: "attacker", id: 11, pos: 0 }]);
    defendSide.createSimpleMonster(fight, [{ name: "defender", id: 12, pos: 1 }]);
    fight.createSide(attackSide, defendSide);

    const attacker = attackSide.units[0];
    const defender = defendSide.units[0];
    const ctx = contextFor(fight, attacker, defender);
    const damageSkill = new FightSkill({
        id: 202,
        name: "magic strike",
        magic: true,
        sel: { target: TargetSelectEnum.enmey },
        rand: 1,
        attack: baseAttack({ attack: 10 }),
        final: finalAttack(),
    }, 1);

    assert.equal(skillAttackFunc(attacker, defender, damageSkill, ctx), true);
    assert.ok(Number.isFinite(ctx.damage));
    assert.ok(Number.isFinite(defender.attr.point.hp));
    assert.ok(defender.attr.point.hp < defender.attr.point.hpMax);

    defender.attr.point.hp = 50;
    const healingSkill = new FightSkill({
        id: 203,
        name: "heal",
        magic: true,
        sel: { target: TargetSelectEnum.friend },
        func: "heal",
        rand: 1,
        attack: baseAttack({ attack: 20 }),
        final: finalAttack(),
    }, 1);
    healFunc(attacker, defender, healingSkill, ctx);

    assert.ok(Number.isFinite(defender.attr.point.hp));
    assert.ok(defender.attr.point.hp > 50);
    assert.ok(Number.isFinite(calcPoison(
        fight,
        attacker.attr.poison,
        defender.attr.poison,
        defender.getHp(),
        ctx,
    )));
});

// 测试：伤害或属性计算出现非有限数值时触发断言。
test("damage and attribute calculations assert when their result is non-finite", () => {
    const { fight, attacker, defender } = createFightPair();
    const ctx = contextFor(fight, attacker, defender);

    assert.throws(
        () => calcAttack(fight, baseAttack({ hurt: Number.NaN }), baseAttack(), ctx),
        /damage must be finite/,
    );
    assert.throws(
        () => mergeTable({ attack: 10 }, { attack: Number.NaN }),
        /merged attributes must be finite/,
    );
});

// 测试：属性修正只作用于指定攻击类型，且不修改原始属性。
test("calcAttr applies modifiers to the selected attack type without mutating original attributes", () => {
    const original = new FightAttr();
    original.point = { hp: 100, hpMax: 100, mp: 50, mpMax: 50 };
    original.speed = 100;
    original.physic = fightType(baseAttack({ attack: 10 }));
    original.magic = fightType(baseAttack({ attack: 20 }));
    original.heal = baseAttack({ attack: 30 });
    original.poison = baseAttack({ attack: 40 });

    const result = calcAttr(original, [
        staticModifier(301, "base", false, { attack: 5, hurtP: 0.1 }, { immunity: 2 }),
        staticModifier(302, "base", false, { attack: 3 }),
        staticModifier(303, "next", true, { attack: 7 }),
        staticModifier(304, "heal", false, { attack: 4 }),
        staticModifier(305, "poison", false, { hurt: 0.2 }),
    ]);

    assert.ok(result instanceof FightAttr);
    assert.notEqual(result, original);
    assert.notEqual(result.physic, original.physic);
    assert.equal(result.physic.base.attack, 18);
    assert.equal(result.physic.base.hurtP, 0.1);
    assert.equal(result.physic.final.immunity, 2);
    assert.equal(result.magic.next.attack, 27);
    assert.equal(result.heal.attack, 34);
    assert.equal(result.poison.hurt, 0.2);
    assert.equal(original.physic.base.attack, 10);
    assert.equal(original.magic.next.attack, 20);
});

// 测试：属性修正按实例等级应用成长，等级为 0 时只应用基础加成。
test("calcAttr applies level-based attack and final bonuses", () => {
    const original = new FightAttr();
    original.point = { hp: 100, hpMax: 100, mp: 50, mpMax: 50 };
    original.speed = 100;
    original.physic = fightType(baseAttack({ attack: 10 }));
    original.magic = fightType(baseAttack({ attack: 20 }));
    original.heal = baseAttack({ attack: 30 });
    original.poison = baseAttack({ attack: 40 });

    const levelTwoBuff = new FightStatic({
        id: 306,
        name: "level-two",
        desc: "",
        status: [],
        tags: [],
        magic: false,
        attackType: "base",
        attack: { attack: 2 },
        final: { immunity: 1 },
        attackLevel: { attack: 3 },
        finalLevel: { immunity: 0.5 },
    }, 2);
    const levelZeroBuff = new FightStatic({
        id: 307,
        name: "level-zero",
        desc: "",
        status: [],
        tags: [],
        magic: false,
        attackType: "base",
        attack: { defend: 1 },
        final: {},
        attackLevel: { defend: 5 },
        finalLevel: {},
    }, 0);
    const levelThreeHeal = new FightStatic({
        id: 308,
        name: "level-three-heal",
        desc: "",
        status: [],
        tags: [],
        magic: false,
        attackType: "heal",
        attack: { attack: 2 },
        final: {},
        attackLevel: { attack: 4 },
    }, 3);

    const result = calcAttr(original, [levelTwoBuff, levelZeroBuff, levelThreeHeal]);

    assert.equal(result.physic.base.attack, 18);
    assert.equal(result.physic.base.defend, 1);
    assert.equal(result.physic.final.immunity, 2);
    assert.equal(result.heal.attack, 44);
    assert.equal(original.physic.base.attack, 10);
    assert.equal(original.heal.attack, 30);
});

// 测试：单位深拷贝嵌套属性，同时保留 FightAttr 的方法。
test("fight units clone nested attributes while preserving FightAttr methods", () => {
    const fight = new Fight(3, { maxTurn: 10, waitInputSec: 1, duiwei: false });
    const side = new FightSide();
    side.createSimpleMonster(fight, [{ name: "clone target", id: 21, pos: 0 }]);
    const unit = side.units[0];
    const originalHp = unit.attrOri.point.hp;
    const originalAttack = unit.attrOri.magic.base.attack;

    assert.ok(unit.attr instanceof FightAttr);
    assert.notEqual(unit.attr, unit.attrOri);
    assert.notEqual(unit.attr.point, unit.attrOri.point);
    assert.notEqual(unit.attr.magic.base, unit.attrOri.magic.base);
    assert.equal(Number.isFinite(unit.attr.getSpeed()), true);

    unit.attr.point.hp -= 10;
    unit.attr.magic.base.attack += 10;
    assert.equal(unit.attrOri.point.hp, originalHp);
    assert.equal(unit.attrOri.magic.base.attack, originalAttack);
});
