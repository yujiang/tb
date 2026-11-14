import { strict as assert } from "node:assert";
import { test } from "node:test";
import { Fight } from "../../src/fight/Fight";
import { BaseAttack } from "../../src/fight/FightAttr";
import { FightSide } from "../../src/fight/FightSide";
import { FightSkill, SkillData, calcHurt } from "../../src/fight/Skills/FightSkill";
import { DamageLost, FightContex } from "../../src/fight/Skills/NormalAttack";
import { getRelativeSkill, getSkillData, initSkills, skillFunc } from "../../src/fight/Skills/SkillDatas";
import { FightUnit } from "../../src/fight/Unit/FightUnit";
import { FightUnitUser } from "../../src/fight/Unit/FightUnitUser";
import { DiedSelectEnum, MapShapeEnum, TargetSelectEnum } from "../../src/fight/struct";

const skillData: SkillData[] = [
    {
        id: 101, name: "magic", magic: true,
        sel: { target: TargetSelectEnum.enmey, die: DiedSelectEnum.alive },
        rand: 1, notFbackRand: 1, attack: 10, attackPercent: 0.2,
        damage: 5, damagePercent: 0.5,
    },
    {
        id: 102, name: "miss", magic: true,
        sel: { target: TargetSelectEnum.enmey, die: DiedSelectEnum.alive },
        rand: 0.2, notFbackRand: 1,
    },
    {
        id: 103, name: "heal", magic: true, func: "heal",
        sel: { target: TargetSelectEnum.friend, die: DiedSelectEnum.alive, num: 2 },
        rand: 1, notFbackRand: 1, attack: 10,
    },
    {
        id: 104, name: "spread", magic: true, func: "spread",
        sel: { target: TargetSelectEnum.enmey, die: DiedSelectEnum.alive, shape: MapShapeEnum.y_line },
        rand: 1, notFbackRand: 1, attack: 10,
    },
    {
        id: 105, name: "spread child", magic: true,
        sel: { target: TargetSelectEnum.enmey, die: DiedSelectEnum.alive },
        rand: 1, notFbackRand: 1, attack: 30,
    },
    {
        id: 106, name: "combo", magic: true,
        sel: { target: TargetSelectEnum.enmey, die: DiedSelectEnum.alive },
        rand: 1, notFbackRand: 1, next: 105, kill: 105,
    },
    {
        id: 107, name: "cost", magic: true,
        sel: { target: TargetSelectEnum.enmey, die: DiedSelectEnum.alive },
        rand: 1, notFbackRand: 1, cost: { hp: 5, mp: 10 },
    },
    {
        id: 108, name: "custom spread", magic: true, func: "spread",
        sel: { target: TargetSelectEnum.enmey, die: DiedSelectEnum.alive, shape: MapShapeEnum.y_line },
        rand: 1, notFbackRand: 1, spread: 105,
    },
    {
        id: 109, name: "physical", magic: false,
        sel: { target: TargetSelectEnum.enmey, die: DiedSelectEnum.alive },
        rand: 1, notFbackRand: 1, attack: 5,
    },
    {
        id: 110, name: "unknown effect", magic: true, func: "missing",
        sel: { target: TargetSelectEnum.enmey, die: DiedSelectEnum.alive },
        rand: 1, notFbackRand: 1,
    },
    {
        id: 111, name: "critical", magic: true,
        sel: { target: TargetSelectEnum.enmey, die: DiedSelectEnum.alive },
        rand: 1, notFbackRand: 1, crit: 1, critDeep: 0.5, attack: 0,
    },
    {
        id: 112, name: "counterable", magic: true,
        sel: { target: TargetSelectEnum.enmey, die: DiedSelectEnum.alive },
        rand: 1, notFbackRand: 0,
    },
];

initSkills(skillData);

function baseAttack(overrides: Partial<BaseAttack> = {}): BaseAttack {
    return {
        property: 0, hit: 100, dodge: 0, crit: 0, critDefend: 0, critDeep: 0,
        attack: 10, defend: 0, randNext: 0, randKill: 0, randFightBack: 0,
        blood: 0, damageBack: 0, hurtDec: 0, hurtDecPercent: 0,
        ...overrides,
    };
}

function createBattle(userAttacker = false) {
    const fight = new Fight(1, { maxTurn: 100, waitInputSec: 1, duiwei: false });
    fight.createMap(2, 2);

    const attackSide = new FightSide();
    const defendSide = new FightSide();
    attackSide.createSimpleMonster(fight, [
        { name: "a0", id: 1, pos: 0 },
        { name: "a1", id: 2, pos: 1 },
    ]);
    defendSide.createSimpleMonster(fight, [
        { name: "d0", id: 3, pos: 2 },
        { name: "d1", id: 4, pos: 3 },
    ]);

    for (const unit of [...attackSide.units, ...defendSide.units]) {
        unit.attr.hp = 100;
        unit.attr.hpMax = 100;
        unit.attr.mp = 100;
        unit.attr.mpMax = 100;
        unit.attr.physic = baseAttack();
        unit.attr.magic = baseAttack();
        unit.attr.heal = baseAttack();
    }

    if (userAttacker) {
        const attr = attackSide.units[0].attr;
        const user = new FightUnitUser(1, attr, { name: "a0" });
        user.setPos(0);
        attackSide.units[0] = user;
    }

    fight.createSide(attackSide, defendSide);
    fight.random = () => 0;
    return {
        fight,
        attacker: attackSide.units[0],
        ally: attackSide.units[1],
        defender: defendSide.units[0],
        otherDefender: defendSide.units[1],
    };
}

function context(fight: Fight, attack: FightUnit, defend: FightUnit): FightContex {
    return { fight, attack, defend, msgs: [] };
}

// 验证技能注册、字段访问、关联技能继承等级以及攻击和伤害加成公式。
test("skill registry, accessors, relative skills, and attack/damage formulas", () => {
    const data = getSkillData(101);
    assert.equal(data?.name, "magic");
    assert.equal(getSkillData(999), undefined);

    const skill = new FightSkill(data, 7);
    assert.equal(skill.getId(), 101);
    assert.equal(skill.level, 7);
    assert.equal(skill.getRand(), 1);
    assert.equal(skill.getNobackRand(), 1);
    assert.equal(skill.isMagic(), true);
    assert.equal(skill.getFunc(), "normal");
    assert.equal(skill.getSel(), data.sel);
    assert.equal(skill.calcAttack(20), 36);
    assert.equal(skill.calcDamage(20), 37.5);

    const parent = new FightSkill(skillData[5], 4);
    assert.equal(parent.getKill(), 105);
    assert.equal(parent.getNext(), 105);
    assert.equal(parent.getKillSkill().getId(), 105);
    assert.equal(parent.getNextSkill().getId(), 105);
    assert.equal(getRelativeSkill(parent, 105).level, 4);
    assert.equal(getRelativeSkill(parent, 999), undefined);
    assert.equal(parent.getSpread(), undefined);
    assert.equal(parent.getCost(), undefined);

    const spreadParent = new FightSkill(skillData[7], 3);
    assert.equal(spreadParent.getSpread(), 105);
    assert.equal(spreadParent.getSpreadSkill().level, 3);

    const defaults = new FightSkill({
        id: 200, name: "defaults", magic: false,
        sel: { target: TargetSelectEnum.self }, rand: 0, notFbackRand: 0,
    }, 1);
    assert.equal(defaults.getRand(), 1);
    assert.equal(defaults.getNobackRand(), 0);
    assert.equal(defaults.getFunc(), "normal");
});

// 验证伤害会依次应用固定减伤和百分比减伤，并且最低为 1。
test("damage reduction floors damage at one and applies flat and percentage reductions", () => {
    const defender = baseAttack({ hurtDec: 10, hurtDecPercent: 0.1 });
    assert.equal(calcHurt(baseAttack(), defender, 100), 81);
    assert.equal(calcHurt(baseAttack(), defender, 1), 1);
    assert.equal(calcHurt(baseAttack(), baseAttack(), -10), 1);
});

// 验证技能伤害计算会考虑攻防、伤害倍率、暴击率和暴击加深。
test("skill value uses the selected attack, defense, damage scaling, and critical multiplier", () => {
    const { fight } = createBattle();
    const skill = new FightSkill(skillData[10], 1);
    const attack = baseAttack({ attack: 20, crit: 1, critDeep: 0.5 });
    const defend = baseAttack({ defend: 4 });

    const [damage, critical] = skill.calcValue(fight, attack, defend, 0);
    assert.equal(damage, 40);
    assert.equal(critical, true);

    fight.random = () => 0.5;
    const [normalDamage, normalCritical] = new FightSkill(skillData[0], 1)
        .calcValue(fight, baseAttack({ attack: 20 }), defend, 0.5);
    assert.equal(normalDamage, 16);
    assert.equal(normalCritical, false);
});

// 验证未习得技能不执行、无效目标会重选，未知效果会回退为普通技能。
test("skill dispatch rejects unknown skills, retargets an invalid defender, and falls back for unknown effects", () => {
    const { fight, attacker, defender, otherDefender } = createBattle();
    attacker.addSkill(101, 1);
    attacker.addSkill(110, 1);
    const ctx = context(fight, attacker, defender);

    assert.equal(skillFunc(attacker, defender, 999, ctx), undefined);
    assert.equal(defender.attr.hp, 100);

    defender.die();
    const result = skillFunc(attacker, defender, 101, ctx);
    assert.equal(result, ctx);
    assert.equal(defender.attr.hp, 100);
    assert.equal(otherDefender.attr.hp, 76);

    const fallbackCtx = context(fight, attacker, otherDefender);
    skillFunc(attacker, otherDefender, 110, fallbackCtx);
    assert.equal(otherDefender.attr.hp, 66);
});

// 验证普通技能未命中时不造成伤害，并分别使用物理或魔法属性结算。
test("normal skill misses without damage and chooses physical or magical attributes", () => {
    const { fight, attacker, defender } = createBattle();
    attacker.addSkill(102, 1);
    fight.random = () => 0.5;
    const missCtx = context(fight, attacker, defender);

    skillFunc(attacker, defender, 102, missCtx);
    assert.equal(defender.attr.hp, 100);
    assert.deepEqual(missCtx.msgs, [["skillmiss", 102, attacker.uid, defender.uid]]);

    attacker.addSkill(109, 1);
    attacker.attr.physic.attack = 20;
    attacker.attr.magic.attack = 70;
    defender.attr.physic.defend = 3;
    const hitCtx = context(fight, attacker, defender);
    fight.random = () => 0;

    skillFunc(attacker, defender, 109, hitCtx);
    assert.equal(defender.attr.hp, 78);
    assert.equal(hitCtx.msgs[0][0], "skill");
});

// 验证生命或法力不足时技能不会扣除资源，也不会继续生效。
test("normal skill respects costs and aborts without enough HP or MP", () => {
    const { fight, attacker, defender } = createBattle(true);
    const user = attacker as FightUnitUser;
    user.addSkill(107, 1);
    user.attr.hp = 5;
    user.attr.mp = 100;
    const hpCtx = context(fight, user, defender);
    skillFunc(user, defender, 107, hpCtx);
    assert.equal(user.attr.hp, 5);
    assert.equal(user.attr.mp, 100);
    assert.deepEqual(hpCtx.msgs, []);
    assert.equal(defender.attr.hp, 100);

    user.attr.hp = 6;
    user.attr.mp = 9;
    const mpCtx = context(fight, user, defender);
    skillFunc(user, defender, 107, mpCtx);
    assert.equal(user.attr.hp, 6);
    assert.equal(user.attr.mp, 9);
    assert.deepEqual(mpCtx.msgs, []);
});

// 验证资源充足时技能先扣除生命和法力，再执行技能效果。
test("successful skill costs are deducted and reported before its effect", () => {
    const { fight, attacker, defender } = createBattle(true);
    const user = attacker as FightUnitUser;
    user.addSkill(107, 1);
    user.attr.hp = 6;
    user.attr.mp = 10;
    const ctx = context(fight, user, defender);

    skillFunc(user, defender, 107, ctx);
    assert.equal(user.attr.hp, 1);
    assert.equal(user.attr.mp, 0);
    assert.equal(defender.attr.hp, 90);
    assert.deepEqual(ctx.msgs.slice(0, 2), [
        ["costHp", user.uid, 5, 1],
        ["costMp", user.uid, 10, 0],
    ]);
});

// 验证治疗主目标及范围内队友、应用范围治疗倍率，并将生命值限制在上限内。
test("healing applies to the primary and selected allies, respects spread scaling, and caps HP", () => {
    const { fight, attacker, ally } = createBattle();
    attacker.addSkill(103, 1);
    attacker.attr.hp = 98;
    ally.attr.hp = 98;
    const ctx = context(fight, attacker, ally);

    skillFunc(attacker, ally, 103, ctx);
    assert.equal(ally.attr.hp, 100);
    assert.equal(attacker.attr.hp, 100);
    assert.ok(ctx.msgs.some(msg => msg[0] === "spread" && msg[1].includes(attacker.uid)));
    assert.deepEqual(ctx.msgs.filter(msg => msg[0] === "heal").map(msg => msg[2]), [20, 15]);
});

// 验证目标治疗防御超过治疗量时会触发禁疗且不恢复生命。
test("healing is blocked when defense exceeds the skill's healing amount", () => {
    const { fight, attacker, ally } = createBattle();
    attacker.addSkill(103, 1);
    ally.attr.hp = 50;
    ally.attr.heal.defend = 21;
    attacker.attr.heal.defend = 21;
    const ctx = context(fight, attacker, ally);

    skillFunc(attacker, ally, 103, ctx);
    assert.equal(ally.attr.hp, 50);
    assert.ok(ctx.msgs.some(msg => msg[0] === "禁疗" && msg[1] === ally.uid));
    assert.equal(ctx.msgs.some(msg => msg[0] === "heal"), false);
});

// 验证普通溅射技能会命中主目标和范围内目标，且副目标伤害降低。
test("spread skills hit the main target and secondary targets with the standard reduction", () => {
    const { fight, attacker, defender, otherDefender } = createBattle();
    attacker.addSkill(104, 1);
    const ctx = context(fight, attacker, defender);

    skillFunc(attacker, defender, 104, ctx);
    assert.equal(defender.attr.hp, 80);
    assert.equal(otherDefender.attr.hp, 86);
    assert.ok(ctx.msgs.some(msg => msg[0] === "spread" && msg[1].includes(otherDefender.uid)));
});

// 验证配置专属溅射子技能后，副目标改用该技能而非默认减伤伤害。
test("a configured spread skill replaces the default reduced secondary attack", () => {
    const { fight, attacker, defender, otherDefender } = createBattle();
    attacker.addSkill(108, 1);
    const ctx = context(fight, attacker, defender);

    skillFunc(attacker, defender, 108, ctx);
    assert.equal(defender.attr.hp, 90);
    assert.equal(otherDefender.attr.hp, 60);
});

// 验证技能击杀主目标后会对另一名存活敌人发动追击技能。
test("a killing blow triggers its configured kill skill against another living enemy", () => {
    const { fight, attacker, defender, otherDefender } = createBattle();
    attacker.addSkill(106, 1);
    attacker.attr.magic.attack = 50;
    attacker.attr.magic.randKill = 1;
    defender.attr.hp = 10;
    const ctx = context(fight, attacker, defender);

    skillFunc(attacker, defender, 106, ctx);
    assert.equal(defender.isDied(), true);
    assert.equal(otherDefender.attr.hp, 20);
    assert.equal(ctx.killNum, 1);
    assert.ok(ctx.msgs.some(msg => msg[0] === "skillKill"));
});

// 验证主目标存活且触发概率满足时，会追加连击技能。
test("a surviving target can trigger the configured follow-up skill", () => {
    const { fight, attacker, defender, otherDefender } = createBattle();
    attacker.addSkill(106, 1);
    attacker.attr.magic.randNext = 1;
    attacker.attr.physic.randFightBack = 2;
    defender.attr.physic.randFightBack = 1;
    fight.random = () => 0.99;
    const ctx = context(fight, attacker, defender);

    skillFunc(attacker, defender, 106, ctx);
    assert.equal(defender.attr.hp + otherDefender.attr.hp, 150);
    assert.equal(ctx.nextNum, 1);
    assert.ok(ctx.msgs.some(msg => msg[0] === "skillNext"));
});

// 验证目标装备的反击技能触发后会计数并使用自身攻击属性造成伤害。
test("a successful counter skill is counted and deals its own attack", () => {
    const { fight, attacker, defender } = createBattle();
    attacker.addSkill(112, 1);
    defender.addSkill(109, 1);
    defender.backSkill = 109;
    attacker.attr.physic.randFightBack = 1;
    defender.attr.physic.randFightBack = 1;
    const ctx = context(fight, attacker, defender);

    skillFunc(attacker, defender, 112, ctx);
    assert.equal(defender.attr.hp, 90);
    assert.equal(attacker.attr.hp, 85);
    assert.equal(ctx.fbackNum, 1);
    assert.ok(ctx.msgs.some(msg => msg[0] === "skillBack"));
});

// 验证反伤会伤害原攻击者、记录反伤次数，并阻止后续连击。
test("damage reflection prevents a follow-up and records the reflected damage", () => {
    const { fight, attacker, defender } = createBattle();
    attacker.addSkill(106, 1);
    defender.attr.magic.damageBack = 7;
    attacker.attr.physic.randFightBack = 1;
    defender.attr.physic.randFightBack = 1;
    const ctx = context(fight, attacker, defender);

    skillFunc(attacker, defender, 106, ctx);
    assert.equal(attacker.attr.hp, 93);
    assert.equal(ctx.dbackNum, 1);
    assert.ok(ctx.msgs.some(msg => msg[0] === "hurt" && msg[1] === "skilldb"));
    assert.equal(ctx.nextNum, undefined);
});
