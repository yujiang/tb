import { strict as assert } from "node:assert";
import { test } from "node:test";
import { Fight, FightAttr, BaseAttack, FightSide, FightUnitMonster, FightLoopWest,
    FightClient, FightReport, BuffData, initBuffs, initPassives, initSkills, OverlapEnum,
    FightCmdEnum, TargetSelectEnum, initFightContex, FightResultEnum } from "../../../src";

const reflectId = 97901, passiveId = 97902;
const magicId = 97910, physicalId = 97911, healId = 97912, poisonId = 97913;

function attr(hp: number): FightAttr {
    const base = (attack = 30, rand = 0): BaseAttack => ({ property: 0, rand, hit: 100, dodge: 0,
        attack, defend: 0, hurt: 0, hurtP: 0, hurtAnti: 0, hurtPAnti: 0,
        critP: 0, critPAnit: 0, critDeep: 0, critDeepAnit: 0 });
    const a = new FightAttr();
    a.point = { hp, hpMax: 200, mp: 100, mpMax: 100 }; a.speed = 100;
    const group = () => ({ base: base(30, 1), next: base(), kill: base(), spread: base(), fback: base(),
        final: { bloodP: 0, dbackP: 0, immunity: 0, immunityP: 0 } });
    a.physic = group(); a.magic = group(); a.heal = base(20); a.poison = base(10);
    return a;
}

function setup(extra: Partial<BuffData> = {}, configure?:
    (holder: FightUnitMonster, caster: FightUnitMonster, enemy: FightUnitMonster, fight: Fight) => void) {
    const data: BuffData = { id: reflectId, name: "反射", desc: "反射魔法伤害和治疗", class: "reflect",
        overlap: OverlapEnum.REPLACE, status: [], tags: [], magic: false, attackType: "base",
        attack: {}, final: {}, lastTurn: 0, times: 0, event: "hurt", prior: 0,
        useInputTurn: false, skill: 0, skillLevel: 1, ...extra };
    initBuffs([data]);
    initPassives([{ id: passiveId, name: "镜面被动", desc: "", status: [], tags: [], magic: false,
        attackType: "base", attack: {}, final: {}, addbuff: [[reflectId, 1]] }]);
    const common = { name: "测试攻击", rand: 1, attack: {}, final: {}, sel: { target: TargetSelectEnum.enmey } };
    initSkills([{ ...common, id: magicId, magic: true, blood: true, dback: true },
        { ...common, id: physicalId, magic: false },
        { ...common, id: poisonId, name: "魔法毒", magic: true, func: "poison", attack: { attack: 10 } },
        { ...common, id: healId, name: "治疗", magic: true, func: "heal", sel: { target: TargetSelectEnum.friend } }]);
    const fight = new Fight(97900, { maxTurn: 10, waitInputSec: 1, duiwei: false }, 0);
    const caster = new FightUnitMonster(0, attr(100), { name: "施法者" }); caster.setPos(0);
    const enemy = new FightUnitMonster(3, attr(50), { name: "另一敌人" }); enemy.setPos(1);
    const holder = new FightUnitMonster(1, attr(150), { name: "镜面者" }, [[passiveId, 1]]); holder.setPos(0);
    const healer = new FightUnitMonster(2, attr(100), { name: "治疗者" }); healer.setPos(1);
    for (const id of [magicId, physicalId]) caster.addSkill(id, 1);
    healer.addSkill(healId, 1);
    const a = new FightSide(), b = new FightSide();
    a.units.push(caster, enemy); b.units.push(holder, healer);
    fight.createSide(a, b);
    configure?.(holder, caster, enemy, fight);
    const loop = new FightLoopWest(fight), client = new FightClient(), report = new FightReport(() => {}, false);
    loop.onMsg(msgs => {
        const wire = JSON.parse(JSON.stringify(msgs));
        const batch = typeof wire[0] === "string" ? [wire] : wire;
        assert.ok(batch.every((msg: unknown[]) => msg[0] !== "sync"));
        client.onMsg(wire); report.onMsg(wire);
    });
    loop.start();
    const flush = (ctx: ReturnType<typeof initFightContex>) => {
        loop.bcMsg(ctx.msgs);
        assert.equal(client.checkSame(fight), true);
    };
    const cast = (skill = magicId) => {
        const ctx = fight.processUnit(caster, { cmd: FightCmdEnum.skill, skill, target: holder.uid });
        assert.ok(ctx); flush(ctx); return ctx;
    };
    const heal = () => {
        const ctx = fight.processUnit(healer, { cmd: FightCmdEnum.skill, skill: healId, target: holder.uid });
        assert.ok(ctx); flush(ctx); return ctx;
    };
    return { fight, caster, enemy, holder, healer, loop, client, report, data, flush, cast, heal };
}

test("reflect: magic damage returns to the attacker, physical damage stays on the holder", () => {
    const { caster, holder, cast, report } = setup();
    const reflected = cast();
    assert.equal(holder.getHp(), 150);
    assert.equal(caster.getHp(), 70);
    assert.deepEqual(reflected.msgs.filter(msg => msg[0] === "hurt").map(msg => [msg[2], msg[3], msg[4]]), [[0, 1, 30]]);
    assert.equal(holder.enemyHurt.has(caster.uid), false);
    assert.equal(caster.enemyHurt.get(holder.uid), 30);
    assert.match(report.toString(), /\[反射\]触发/);
    assert.match(report.toString(), /造成 30 点反射伤害/);
    cast(physicalId);
    assert.equal(holder.getHp(), 120);
    assert.equal(caster.getHp(), 70);
});

test("reflect: healing transfers its offered amount to one random living enemy", () => {
    const { fight, holder, enemy, healer, heal, report } = setup();
    let samples = 0;
    fight.random = () => { samples++; return 0.99; };
    let holderHeals = 0;
    holder.onContex("heal", () => { holderHeals++; });
    const ctx = heal();
    assert.equal(holder.getHp(), 150);
    assert.equal(enemy.getHp(), 70);
    assert.equal(holderHeals, 0);
    assert.equal(samples, 1);
    assert.equal(enemy.friendHeal.get(holder.uid), 20);
    assert.equal(enemy.friendHeal.has(healer.uid), false);
    assert.deepEqual(ctx.msgs.filter(msg => msg[0] === "heal").map(msg => msg[2]), [enemy.uid]);
    assert.match(report.toString(), /恢复 20 点生命（反射治疗）/);
});

test("reflect: both sides reflecting cannot bounce damage or healing indefinitely", () => {
    const { fight, caster, holder, flush, cast, heal } = setup();
    const ctx = initFightContex(fight);
    caster.addBuff(caster, "test", reflectId, 1, ctx); flush(ctx);
    cast();
    assert.equal(caster.getHp(), 70);
    assert.equal(holder.getHp(), 150);
    let samples = 0;
    fight.random = () => { samples++; return 0; };
    heal();
    assert.equal(caster.getHp(), 90);
    assert.equal(holder.getHp(), 150);
    assert.equal(samples, 1);
});

test("reflect: reflected attacks do not grant the original attacker lifesteal or ordinary reflection", () => {
    const { caster, holder, cast } = setup();
    caster.attrOri.magic.final.bloodP = 0.5; caster.calcAttr();
    holder.attrOri.magic.final.dbackP = 0.5; holder.calcAttr();
    cast();
    assert.equal(caster.getHp(), 70);
    assert.equal(holder.getHp(), 150);
});

test("reflect: limited charges count actual transfers and unregister both listeners", () => {
    const { holder, caster, cast } = setup({ times: 1 });
    cast(physicalId);
    assert.equal(holder.findBuff(reflectId)?.times, 1);
    cast();
    assert.equal(holder.findBuff(reflectId), undefined);
    assert.equal(holder.contextEmitter.listenerCount("beforeHurt"), 0);
    assert.equal(holder.contextEmitter.listenerCount("beforeHeal"), 0);
    assert.equal(caster.getHp(), 70);
    cast();
    assert.equal(holder.getHp(), 90);
});

test("reflect: receiving a heal at full HP still transfers the heal before capping", () => {
    const { fight, holder, caster, heal } = setup({}, u => { u.attr.point.hp = 200; });
    fight.random = () => 0;
    heal();
    assert.equal(holder.getHp(), 200);
    assert.equal(caster.getHp(), 120);
});

test("reflect: magic-only can be disabled explicitly for physical damage", () => {
    const { caster, holder, cast } = setup({ classParam: { magicOnly: false } });
    cast(physicalId);
    assert.equal(holder.getHp(), 150);
    assert.equal(caster.getHp(), 70);
});

test("reflect: an overkill hit returns its full offered damage and resolves the attacker's death", () => {
    const { fight, caster, holder, cast } = setup({}, (u, a, _enemy, f) => {
        u.attr.point.hp = 5; a.attr.point.hp = 20;
        f.getSide(a.side).units.splice(1, 1);
    });
    const ctx = cast();
    assert.equal(holder.getHp(), 5);
    assert.equal(holder.isDied(), false);
    assert.equal(caster.getHp(), 0);
    assert.equal(caster.isDied(), true);
    assert.equal(fight.win, FightResultEnum.defend);
    assert.deepEqual(ctx.msgs.filter(msg => msg[0] === "hurt").map(msg => msg[4]), [20]);
});

test("reflect: holder unyielding is not consumed and attacker unyielding can prevent reflected death", () => {
    const { fight, caster, holder, data, flush, cast } = setup({}, (u, a) => {
        u.attr.point.hp = 5;
        a.attrOri.magic.base.attack = 300; a.calcAttr();
    });
    initBuffs([{ ...data, id: 97903, name: "不屈", class: "buqu", event: "beforeHurt", prior: 1000, times: 1 }]);
    const ctx = initFightContex(fight);
    holder.addBuff(holder, "test", 97903, 1, ctx);
    caster.addBuff(caster, "test", 97903, 1, ctx);
    flush(ctx);
    cast();
    assert.equal(holder.getHp(), 5);
    assert.equal(holder.findBuff(97903)?.times, 1);
    assert.equal(caster.getHp(), 1);
    assert.equal(caster.findBuff(97903), undefined);
});

test("reflect: retained reflection does not transfer automatic revival's HP restoration", () => {
    const { fight, caster, holder, data, flush, cast } = setup({ dieNotRemove: true }, (_u, a) => {
        a.attrOri.physic.base.attack = 300; a.calcAttr();
    });
    initBuffs([{ ...data, id: 97904, name: "自动复活", class: "relife", classParam: 0.5,
        event: "die", times: 1, prior: 1000, dieNotRemove: true }]);
    const ctx = initFightContex(fight);
    holder.addBuff(holder, "test", 97904, 1, ctx); flush(ctx);
    const result = cast(physicalId);
    assert.equal(holder.getHp(), 100);
    assert.equal(holder.isDied(), false);
    assert.ok(holder.findBuff(reflectId));
    assert.equal(caster.getHp(), 100);
    assert.deepEqual(result.msgs.filter(msg => msg[0] === "heal").map(msg => msg[2]), [holder.uid]);
});

test("reflect: transferred healing respects the recipient's healing prohibition", () => {
    const { fight, holder, enemy, data, flush, heal } = setup();
    initBuffs([{ ...data, id: 97906, name: "禁疗", class: undefined, status: ["禁疗"] }]);
    const ctx = initFightContex(fight);
    enemy.addBuff(enemy, "test", 97906, 1, ctx); flush(ctx);
    fight.random = () => 0.99;
    const result = heal();
    assert.equal(holder.getHp(), 150);
    assert.equal(enemy.getHp(), 50);
    assert.ok(result.msgs.some(msg => msg[0] === "禁疗" && msg[1] === enemy.uid));
    assert.ok(!result.msgs.some(msg => msg[0] === "heal"));
});

test("reflect: no living enemy leaves healing on the original recipient without sampling", () => {
    const { fight, holder, heal } = setup({}, (_u, a, _enemy, f) => { f.getSide(a.side).units.length = 0; });
    let samples = 0;
    fight.random = () => { samples++; return 0; };
    heal();
    assert.equal(holder.getHp(), 170);
    assert.equal(samples, 0);
});

test("reflect: replacement, dispel, expiry and death remove both context listeners", () => {
    const { fight, caster, holder, flush } = setup({ lastTurn: 1 });
    const ctx = initFightContex(fight);
    const old = holder.findBuff(reflectId);
    holder.addBuff(caster, "replace", reflectId, 2, ctx);
    assert.notEqual(holder.findBuff(reflectId), old);
    assert.equal(holder.contextEmitter.listenerCount("beforeHurt"), 1);
    assert.equal(holder.contextEmitter.listenerCount("beforeHeal"), 1);
    holder.removeBuff(caster, "dispel", reflectId, 99, ctx);
    assert.equal(holder.contextEmitter.listenerCount("beforeHurt"), 0);
    assert.equal(holder.contextEmitter.listenerCount("beforeHeal"), 0);
    holder.addBuff(caster, "test", reflectId, 1, ctx);
    holder.processBeforeTurn(1, ctx);
    assert.equal(holder.findBuff(reflectId), undefined);
    assert.equal(holder.contextEmitter.listenerCount("beforeHurt"), 0);
    assert.equal(holder.contextEmitter.listenerCount("beforeHeal"), 0);
    holder.addBuff(caster, "test", reflectId, 1, ctx);
    fight.resolveAction(() => holder.onHurt(caster, "physical", 10000, ctx));
    assert.equal(holder.findBuff(reflectId), undefined);
    assert.equal(holder.contextEmitter.listenerCount("beforeHurt"), 0);
    assert.equal(holder.contextEmitter.listenerCount("beforeHeal"), 0);
    flush(ctx);
});

test("reflect: periodic magic poison passes damage type through the shared hurt pipeline", () => {
    const { fight, caster, holder, data, flush } = setup();
    initBuffs([{ ...data, id: 97907, name: "魔法毒", class: undefined, func: "poison", skill: poisonId,
        skillLevel: 1, lastTurn: 1 }]);
    const ctx = initFightContex(fight);
    holder.addBuff(caster, "test", 97907, 1, ctx);
    fight.resolveAction(() => holder.processBeforeTurn(1, ctx));
    flush(ctx);
    assert.equal(holder.getHp(), 150);
    assert.equal(caster.getHp(), 90);
});

test("reflect: fresh contexts in nested callbacks cannot bypass the global reaction limit", () => {
    const { fight, holder, caster, cast } = setup();
    caster.onContex("beforeHurt", () => {
        const fresh = initFightContex(fight);
        holder.onHurt(caster, "nested magic", 30, fresh, { magic: true });
    });
    assert.throws(() => cast(), /Reaction limit/);
});

test("reflect: healing transfers consume charges and fixed seeds reproduce the same recipient", () => {
    const first = setup({ times: 1 });
    const second = setup({ times: 1 });
    const a = first.heal(), b = second.heal();
    assert.deepEqual(a.msgs, b.msgs);
    assert.equal(first.holder.findBuff(reflectId), undefined);
    assert.equal(first.holder.contextEmitter.listenerCount("beforeHurt"), 0);
    assert.equal(first.holder.contextEmitter.listenerCount("beforeHeal"), 0);
    first.heal();
    assert.equal(first.holder.getHp(), 170);
});
