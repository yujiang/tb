import { strict as assert } from "node:assert";
import { test } from "node:test";
import { Fight } from "../../src/fight/Fight";
import { BaseAttack, FightAttr } from "../../src/fight/FightAttr";
import { FightSide } from "../../src/fight/FightSide";
import { BuffData, initBuffs, OverlapEnum } from "../../src/fight/Buffs/BuffDatas";
import { initFightContex } from "../../src/fight/Skills/NormalAttack";
import { initSkills, SkillData } from "../../src/fight/Skills/SkillDatas";
import { FightUnitMonster } from "../../src/fight/Unit/FightUnitMonster";
import { FightCmdEnum, TargetSelectEnum } from "../../src/fight/struct";

function attackData(attack = 0): BaseAttack {
    return {
        property: 0, rand: 0, hit: 100, dodge: 0, attack, defend: 0,
        hurt: 0, hurtP: 0, hurtAnti: 0, hurtPAnti: 0,
        critP: 0, critPAnit: 0, critDeep: 0, critDeepAnit: 0,
    };
}

function attributes(): FightAttr {
    const attr = new FightAttr();
    attr.point = {hp: 100, hpMax: 100, mp: 100, mpMax: 100};
    attr.speed = 100;
    const group = () => ({
        base: {...attackData(20), rand: 1},
        next: attackData(), kill: attackData(), spread: attackData(), fback: attackData(),
        final: {bloodP: 0, dbackP: 0, immunity: 0, immunityP: 0},
    });
    attr.physic = group();
    attr.magic = group();
    attr.heal = attackData();
    attr.poison = attackData();
    return attr;
}

function setup() {
    const fight = new Fight(1, {maxTurn: 10, waitInputSec: 1, duiwei: false}, 123);
    const attacker = new FightUnitMonster(1, attributes(), {name: "攻击方"});
    const defender = new FightUnitMonster(2, attributes(), {name: "防守方"});
    attacker.setPos(0); defender.setPos(0);
    const attackSide = new FightSide(), defendSide = new FightSide();
    attackSide.units.push(attacker); defendSide.units.push(defender);
    fight.createSide(attackSide, defendSide);
    const ctx = initFightContex(fight);
    const attack = () => fight.processUnit(attacker, {cmd: FightCmdEnum.attack, target: defender.uid});
    return {fight, attacker, defender, ctx, attack};
}

function buff(id: number, extra: Partial<BuffData>): BuffData {
    return {
        id, name: `Buff-${id}`, desc: "", overlap: OverlapEnum.NOT,
        status: [], tags: [], magic: false, attackType: "base", attack: {}, final: {},
        useInputTurn: false, lastTurn: 0, times: 0, event: "hurt", skill: 0, skillLevel: 1,
        ...extra,
    };
}

// 测试：类型1状态 Buff 封印时禁止普攻和技能，移除后普攻恢复正常伤害。
test("type 1: status buff forbids actions until removed", () => {
    const {attacker, defender, ctx, attack} = setup();
    initBuffs([buff(9301, {status: ["封印"]})]);
    attacker.addBuff(defender, "封印", 9301, 1, ctx);

    assert.equal(attacker.inStatus("封印"), true);
    assert.equal(attacker.isForbid("skill"), true);
    assert.equal(attack(), undefined);
    assert.equal(defender.getHp(), 100);

    attacker.removeBuff(defender, "解除封印", 9301, ctx);
    assert.equal(attacker.inStatus("封印"), false);
    assert.equal(attacker.isForbid("skill"), false);
    attack();
    assert.equal(defender.getHp(), 80);
});

// 测试：类型2属性 Buff 增加攻击并提高实际伤害，移除后恢复基础攻击和伤害。
test("type 2: attribute buff increases damage and removal restores it", () => {
    const {attacker, defender, ctx, attack} = setup();
    initBuffs([buff(9302, {attack: {attack: 10}})]);
    attacker.addBuff(attacker, "攻击提升", 9302, 1, ctx);

    assert.equal(attacker.attr.physic.base.attack, 30);
    assert.equal(attacker.attrOri.physic.base.attack, 20);
    attack();
    assert.equal(defender.getHp(), 70);

    attacker.removeBuff(attacker, "移除增益", 9302, ctx);
    assert.equal(attacker.attr.physic.base.attack, 20);
    attack();
    assert.equal(defender.getHp(), 50);
});

// 测试：类型3周期 Buff 分别每回合回血和扣血，持续两回合后移除且不再生效。
test("type 3: periodic healing and poison tick each turn until expiration", () => {
    for (const [index, func] of ["heal", "poison"].entries()) {
        const {fight, attacker, defender, ctx} = setup();
        const skillId = 9310 + index, buffId = 9320 + index;
        const skill: SkillData = {
            id: skillId, name: func, magic: true, func, rand: 1,
            sel: {target: func === "heal" ? TargetSelectEnum.friend : TargetSelectEnum.enmey},
            attack: attackData(10),
            final: {bloodP: 0, dbackP: 0, immunity: 0, immunityP: 0},
        };
        initSkills([skill]);
        initBuffs([buff(buffId, {func, skill: skillId, lastTurn: 2})]);
        defender.attr.point.hp = 50;
        defender.addBuff(attacker, func, buffId, 1, ctx);

        for (let turn = 1; turn <= 3; turn++) {
            fight.turn = turn;
            defender.processBeforeTurn(turn, ctx);
            const delta = Math.min(turn, 2) * 10;
            assert.equal(defender.getHp(), func === "heal" ? 50 + delta : 50 - delta, `${func}, turn ${turn}`);
            assert.equal(!!defender.findBuff(buffId), turn < 2);
        }
        const effects = ctx.msgs.filter(msg => msg[0] === (func === "heal" ? "heal" : "hurt"));
        assert.equal(effects.length, 2);
    }
});

// 测试：类型4次数 Buff 在前三次受伤时减伤一半，第三次后消失，第四次恢复完整伤害。
test("type 4: damage reduction protects three hits then disappears", () => {
    const {attacker, defender, ctx, attack} = setup();
    initBuffs([buff(9304, {times: 3, event: "hurt", final: {immunityP: 0.5}})]);
    const protection = defender.addBuff(attacker, "三次减伤", 9304, 1, ctx);

    for (let hit = 1; hit <= 3; hit++) {
        attack();
        assert.equal(defender.getHp(), 100 - hit * 10);
        assert.equal(protection.times, 3 - hit);
        assert.equal(!!defender.findBuff(9304), hit < 3);
    }
    assert.equal(defender.attr.physic.final.immunityP, 0);
    assert.equal(defender.emitter.listenerCount("hurt"), 0);
    attack();
    assert.equal(defender.getHp(), 50);
});
