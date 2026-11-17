import { strict as assert } from "node:assert";
import { test } from "node:test";
import { FightSkill, SkillData, BaseAttack, TargetSelectEnum, initSkills, initBuffs,
    getBuffData, initFightContex, FightCmdEnum } from "../../../src";
import { setupChain, chainIds } from "../../fixtures/skill_chain";

function data(rate?: number, extra: Partial<SkillData> = {}): SkillData {
    return { id: 98100, name: "攻击力倍率", magic: true, rand: 1,
        sel: { target: TargetSelectEnum.enmey }, attack: { attack: 20 }, attackLevel: { attack: 5 },
        final: {}, attackRate: rate, ...extra };
}

function base(attack = 100): BaseAttack {
    return { attack, property: 0, rand: 1, hit: 90, dodge: 5, defend: 30,
        critP: 0.2, critPAnit: 0, critDeep: 0, critDeepAnit: 0,
        hurt: 10, hurtP: 0.1, hurtAnti: 0, hurtPAnti: 0 };
}

const final = { bloodP: 0, dbackP: 0, immunity: 0, immunityP: 0 };

test("attackRate: scale only unit attack before adding fixed and level bonuses, without mutation or accumulation", () => {
    const config = data(0.5), unitAttack = base();
    const configBefore = structuredClone(config), baseBefore = structuredClone(unitAttack);
    const skill = new FightSkill(config, 2);
    assert.equal(skill.getAttack().attack, 30); // 未合并单位时，只有固定与等级成长。
    skill.mergeAttack(unitAttack, final);
    skill.mergeAttack(unitAttack, final);
    assert.equal(skill.getAttack().attack, 80); // 100 * 0.5 + 20 + 5 * 2
    assert.equal(skill.getAttack().hit, 90);
    assert.equal(skill.getAttack().defend, 30);
    assert.equal(skill.getAttack().critP, 0.2);
    assert.equal(skill.getAttack().hurtP, 0.1);
    assert.deepEqual(unitAttack, baseBefore);
    assert.deepEqual(config, configBefore);
});

test("attackRate: omitted means one, zero excludes unit attack, level zero retains fixed additions", () => {
    for (const [rate, level, expected] of [[undefined, 2, 130], [0, 2, 30], [0.5, 0, 70]] as const) {
        const skill = new FightSkill(data(rate), level);
        skill.mergeAttack(base(), final);
        assert.equal(skill.getAttack().attack, expected);
    }
    const growthOnly = new FightSkill(data(0.5, { attack: {}, attackLevel: { attack: 7 } }), 2);
    growthOnly.mergeAttack(base(), final);
    assert.equal(growthOnly.getAttack().attack, 64);
});

test("attackRate: attack scaling and final damage scaling operate on opposite sides of defense", () => {
    const { fight, actor, target, cast } = setupChain({ rootSelfBuff: false, finalReactions: false, change: skills => {
        Object.assign(skills[0], { attackRate: 0.5, damageRate: 0.4, attack: { attack: 20 },
            attackLevel: { attack: 5 }, next: undefined });
    } });
    target.attrOri.magic.base.defend = 30; target.calcAttr();
    const before = actor.attrOri.magic.base.attack;
    const ctx = cast();
    assert.deepEqual(ctx.msgs.filter(msg => msg[0] === "hurt").map(msg => msg[4]), [18]);
    assert.equal(target.getHp(), 982); // (100 * 0.5 + 20 + 5 * 1 - 30) * 0.4
    assert.equal(actor.attrOri.magic.base.attack, before);
    assert.equal(actor.attr.magic.base.attack, 100);
    assert.equal(fight.isEnd(), false);
});

test("attackRate: three configured next skills use their own attack coefficients", () => {
    const { cast, target, actor } = setupChain({ rootSelfBuff: false, finalReactions: false, change: skills => {
        for (const [index, rate] of [0.4, 0.7, 1].entries()) Object.assign(skills[index], { attackRate: rate, damageRate: 1 });
    } });
    const ctx = cast();
    assert.deepEqual(ctx.msgs.filter(msg => msg[0] === "hurt").map(msg => msg[4]), [40, 70, 100]);
    assert.equal(target.getHp(), 790);
    assert.equal(actor.attr.point.mp, 90);
});

test("attackRate: current Buff-enhanced attack is used while base attributes stay intact", () => {
    const { fight, actor, target, flush, cast } = setupChain({ rootSelfBuff: false, finalReactions: false, change: skills => {
        Object.assign(skills[0], { attackRate: 0.5, damageRate: 1, next: undefined });
    } });
    initBuffs([{ ...getBuffData(chainIds.rest), id: 98101, name: "攻击提升", class: undefined,
        magic: true, attack: { attack: 50 } }]);
    const ctx = initFightContex(fight);
    actor.addBuff(actor, "test", 98101, 1, ctx); flush(ctx);
    cast();
    assert.equal(target.getHp(), 925);
    assert.equal(actor.attr.magic.base.attack, 150);
    assert.equal(actor.attrOri.magic.base.attack, 100);
});

test("attackRate: healing and poison reuse the same unit attack merge rule", () => {
    for (const func of ["heal", "poison"] as const) {
        const { fight, actor, target, flush } = setupChain({ actorHp: 100 });
        initSkills([data(0.5, { id: 98102, func,
            sel: { target: func === "heal" ? TargetSelectEnum.self : TargetSelectEnum.enmey } })]);
        actor.addSkill(98102, 2);
        const ctx = fight.processUnit(actor, { cmd: FightCmdEnum.skill, skill: 98102,
            target: func === "heal" ? actor.uid : target.uid });
        assert.ok(ctx); flush(ctx);
        assert.equal(func === "heal" ? actor.getHp() : target.getHp(), func === "heal" ? 180 : 920);
    }
});

test("attackRate: counterattack scales counterattack attributes instead of ordinary attack", () => {
    const { actor, target, cast } = setupChain({ rootSelfBuff: false, change: skills => {
        skills[0].next = undefined; skills[0].fback = true; skills[0].damageRate = 1;
    } });
    initSkills([data(0.5, { id: 98103, name: "倍率反击", attack: { attack: 5 }, attackLevel: {} })]);
    target.addSkill(98103, 1); target.backSkill = 98103;
    target.attrOri.magic.fback.attack = 40; target.calcAttr();
    const ctx = cast();
    assert.equal(actor.getHp(), 975);
    assert.deepEqual(ctx.msgs.filter(msg => msg[0] === "hurt" && msg[2] === actor.uid).map(msg => msg[4]), [25]);
});

test("attackRate: nonfinite and negative coefficients are rejected", () => {
    for (const rate of [NaN, Infinity, -Infinity, -1]) {
        assert.throws(() => new FightSkill(data(rate), 1), /attackRate must be finite and nonnegative/);
    }
});
