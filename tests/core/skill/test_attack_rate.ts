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

// 测试：攻击倍率只缩放单位攻击力后再加固定值和等级成长，重复合并不累计也不修改原数据。
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

// 测试：攻击倍率默认一且保留显式零，零级保留固定加成并支持只有成长的字段。
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

// 测试：攻击倍率在防御前生效，最终伤害倍率在防御结算后生效。
test("attackRate: attack scaling and final damage scaling operate on opposite sides of defense", () => {
    const { fight, actor, target, cast } = setupChain({ rootSelfBuff: false, finalReactions: false, change: skills => {
        Object.assign(skills[0], { attackRate: 0.5, damageRate: 0.4, attack: { attack: 20 },
            attackLevel: { attack: 5 }, combo: undefined });
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

// 测试：三段配置子技能分别使用自己的攻击倍率，费用仅在主技能收取。
test("attackRate: three configured next skills use their own attack coefficients", () => {
    const { cast, target, actor } = setupChain({ rootSelfBuff: false, finalReactions: false, change: skills => {
        for (const [index, rate] of [0.4, 0.7, 1].entries()) Object.assign(skills[index], { attackRate: rate, damageRate: 1 });
    } });
    const ctx = cast();
    assert.deepEqual(ctx.msgs.filter(msg => msg[0] === "hurt").map(msg => msg[4]), [40, 70, 100]);
    assert.equal(target.getHp(), 790);
    assert.equal(actor.attr.point.mp, 90);
});

// 测试：攻击倍率使用包含 Buff 加成的当前攻击力，不修改原始基础属性。
test("attackRate: current Buff-enhanced attack is used while base attributes stay intact", () => {
    const { fight, actor, target, flush, cast } = setupChain({ rootSelfBuff: false, finalReactions: false, change: skills => {
        Object.assign(skills[0], { attackRate: 0.5, damageRate: 1, combo: undefined });
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

// 测试：治疗与毒伤合并单位属性时复用同一攻击倍率规则。
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

// 测试：技能反击按反击属性应用攻击倍率，不误用普通攻击属性。
test("attackRate: counterattack scales counterattack attributes instead of ordinary attack", () => {
    const { actor, target, cast } = setupChain({ rootSelfBuff: false, change: skills => {
        skills[0].combo = undefined; skills[0].fback = true; skills[0].damageRate = 1;
    } });
    initSkills([data(0.5, { id: 98103, name: "倍率反击", attack: { attack: 5 }, attackLevel: {} })]);
    target.addSkill(98103, 1); target.fbackSkill = 98103;
    target.attrOri.magic.fback.attack = 40; target.calcAttr();
    const ctx = cast();
    assert.equal(actor.getHp(), 975);
    assert.deepEqual(ctx.msgs.filter(msg => msg[0] === "hurt" && msg[2] === actor.uid).map(msg => msg[4]), [25]);
});

// 测试：负数和非有限攻击倍率被拒绝，避免产生非法伤害。
test("attackRate: nonfinite and negative coefficients are rejected", () => {
    for (const rate of [NaN, Infinity, -Infinity, -1]) {
        assert.throws(() => new FightSkill(data(rate), 1), /attackRate must be finite and nonnegative/);
    }
});
