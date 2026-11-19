import { strict as assert } from "node:assert";
import { test } from "node:test";
import { BaseAttack, Fight, FightAIHp, FightAITurn, FightAIHurt, FightAttr, FightClient, FightCmdEnum,
    FightLoopPC, FightReport, MonsterData, MonsterSide, CreateMonsterSide, initMonsters, getMonsterData,
    initZhens, getZhenPos, getZhenData, initSkills, initPassives, initBuffs, TargetSelectEnum,
    OverlapEnum, BuffTurnEnum, initFightContex, WeaponEnum } from "../../src";

const monsterId = 1001200, skillId = 1001201, cycleId = 1001202, ultimateId = 1001203,
    passiveId = 1001204, buffId = 1001205, zhenId = 1001206;
function attributes(): FightAttr {
    const base = (attack = 0, rand = 0): BaseAttack => ({ attack, rand, hit: 100, dodge: 0, defend: 0,
        hurt: 0, hurtP: 0, hurtAnti: 0, hurtPAnti: 0, critP: 0, critPAnit: 0, critDeep: 0, critDeepAnit: 0 });
    const attr = new FightAttr(); attr.speed = 100;
    attr.point = { hp: 1000, hpMax: 1000, mp: 100, mpMax: 100 };
    const group = () => ({ base: base(100, 1), next: base(), kill: base(), spread: base(), fback: base(),
        final: { bloodP: 0, dbackP: 0, immunity: 0, immunityP: 0 } });
    attr.physic = group(); attr.magic = group(); attr.heal = base(); attr.poison = base();
    attr.weapon = WeaponEnum.刀; return attr;
}
function setup() {
    const common = { magic: true, rand: 1, final: {}, nofback: true, nodback: true, nosupport: true,
        sel: { target: TargetSelectEnum.enmey } };
    initSkills([{ ...common, id: skillId, name: "怪物普攻", attack: { attack: 10 }, attackLevel: { attack: 5 } },
        { ...common, id: cycleId, name: "周期技能", attack: { attack: 100 } },
        { ...common, id: ultimateId, name: "独立大招", attack: { attack: 200 } }]);
    initBuffs([{ id: buffId, name: "被动附加", desc: "", magic: true, attackType: "base", attack: { attack: 5 }, final: {},
        status: [], tags: [], overlap: OverlapEnum.REPLACE, lastTurn: 0, times: 0, event: "hurt", turnType: BuffTurnEnum.thisTurn }]);
    initPassives([{ id: passiveId, name: "怪物被动", desc: "", magic: true, attackType: "base", attack: { attack: 15 }, final: {},
        status: [], tags: [], attackSkill: skillId, ultimateSkill: ultimateId, addbuff: [[buffId, 1]] }]);
    const data: MonsterData = { id: monsterId, name: "山贼", character: 0, attr: attributes(),
        skills: [[skillId, 2], [cycleId, 1], [ultimateId, 1]], passiveSkills: [[passiveId, 1]],
        supportSkill: skillId, fbackSkill: 0,
        ais: [{ type: "hp", lines: [{ hp: 0.7, attackRate: 0.2 }], prior: 10 },
            { type: "hurt", every: 2, prior: 5 }, { type: "turn", every: 3, skill: cycleId }] };
    initMonsters([data]); initZhens([{ id: zhenId, pos: [4, 0, 2, 6] }]);
    let nextUid = 0; const allocateUid = () => nextUid++;
    return { data, allocateUid };
}

// 测试：阵型通过 ID 查位置，重复模板生成不同战斗 UID，位置零及人物描述 ID 零均有效。
test("monster side: lookup template IDs and formation IDs to create distinct units", () => {
    const { allocateUid } = setup(); const side = CreateMonsterSide([monsterId, monsterId], zhenId, allocateUid);
    assert.ok(side instanceof MonsterSide); assert.equal(side.zhen, zhenId);
    assert.deepEqual(side.ids, [monsterId, monsterId]);
    assert.deepEqual(side.units.map(unit => [unit.uid, unit.monsterId, unit.pos]), [[0, monsterId, 4], [1, monsterId, 0]]);
    assert.deepEqual(side.units[0].display, { name: "山贼", character: 0 });
    assert.equal(side.units[0].findSkill(skillId).level, 2); assert.equal(side.units[0].attackSkill, skillId);
    assert.equal(side.units[0].ultimateSkill, ultimateId); assert.equal(side.units[0].supportSkill, skillId);
    assert.equal(side.units[0].attr.magic.base.attack, 120); assert.equal(side.units[0].attrOri.magic.base.attack, 100);
    assert.ok(side.units[0].ais[0] instanceof FightAITurn); assert.ok(side.units[0].ais[1] instanceof FightAIHurt);
    assert.ok(side.units[0].ais[2] instanceof FightAIHp);
});

// 测试：同模板的属性、被动 Buff 和 AI 实例互相独立，运行中的变化不回写模板。
test("monster side: attributes, passive buffs and AI state are independent for repeated IDs", () => {
    const { data, allocateUid } = setup(), before = JSON.stringify(data);
    const side = CreateMonsterSide([monsterId, monsterId], zhenId, allocateUid), [a, b] = side.units;
    assert.notEqual(a.attrOri, b.attrOri); assert.notEqual(a.attrOri.point, b.attrOri.point);
    assert.notEqual(a.findBuff(buffId), b.findBuff(buffId)); assert.notEqual(a.ais[0], b.ais[0]);
    const enemy = CreateMonsterSide([monsterId], zhenId, allocateUid);
    const fight = new Fight(1001200, { maxTurn: 1, waitInputSec: 1, duiwei: false }, 0); fight.createSide(side, enemy);
    const ctx = initFightContex(fight); fight.resolveAction(() => a.onHurt(enemy.units[0], "test", 400, ctx, { source: "buff" }));
    assert.equal(a.attr.magic.base.attack, 144); assert.equal(b.attr.magic.base.attack, 120);
    a.attrOri.physic.base.attack = 1;
    assert.equal(b.attrOri.physic.base.attack, 100); assert.equal(JSON.stringify(data), before);
});

// 测试：JSON 表对象恢复 FightAttr 方法，未配置技能或 AI 时保持原始怪物普攻路径。
test("monster side: plain JSON attributes become FightAttr instances without optional configuration", () => {
    const { data, allocateUid } = setup();
    initMonsters([JSON.parse(JSON.stringify({ id: 0, name: "普通怪", attr: data.attr }))]);
    initZhens([{ id: 0, pos: [0] }]);
    const unit = CreateMonsterSide([0], 0, allocateUid).units[0];
    assert.equal(unit.monsterId, 0); assert.ok(unit.attrOri instanceof FightAttr); assert.ok(unit.attr instanceof FightAttr);
    assert.equal(unit.getAttr("hp"), 1000); assert.equal(unit.ais.length, 0);
    unit.inputStart(1, { fight: undefined, attack: null, defend: null, msgs: [], effects: [] });
    assert.equal(unit.input.cmd, FightCmdEnum.none);
});

// 测试：显式零装配覆盖被动，省略装配保留被动，零级技能保留固定加成。
test("monster side: zero equipment overrides passives and level zero remains meaningful", () => {
    const { data, allocateUid } = setup();
    initMonsters([{ ...data, id: monsterId + 20, attackSkill: 0, ultimateSkill: 0, ais: [], skills: [[skillId, 0], [ultimateId, 0]] }]);
    const unit = CreateMonsterSide([monsterId + 20], zhenId, allocateUid).units[0];
    assert.equal(unit.attackSkill, 0); assert.equal(unit.ultimateSkill, 0); assert.equal(unit.ais.length, 0);
    assert.equal(unit.findSkill(skillId).level, 0); assert.equal(unit.findSkill(skillId).getAttack().attack, 10);
});

// 测试：阵型查询返回位置副本，额外预留位置不生成怪物，两边共用宿主 UID 分配器避免冲突。
test("monster side: formation lookup is independent and side IDs use the host allocator", () => {
    const { allocateUid } = setup(), positions = getZhenPos(zhenId); positions[0] = 999;
    assert.deepEqual(getZhenData(zhenId).pos, [4, 0, 2, 6]);
    const left = CreateMonsterSide([monsterId], zhenId, allocateUid), right = CreateMonsterSide([monsterId], zhenId, allocateUid);
    assert.equal(left.units[0].pos, 4); assert.equal(right.units[0].pos, 4);
    assert.notEqual(left.units[0].uid, right.units[0].uid);
    assert.equal(CreateMonsterSide([], zhenId, allocateUid).units.length, 0);
});

// 测试：未知模板和阵型、站位不足或重复、无效 UID 都明确报错，不静默漏生成或产生碰撞。
test("monster side: invalid references, formations and UIDs fail explicitly", () => {
    const { allocateUid } = setup(); let calls = 0;
    assert.throws(() => CreateMonsterSide([123456789], zhenId, () => { calls++; return 0; }), /Unknown monster/);
    assert.equal(calls, 0); assert.throws(() => CreateMonsterSide([monsterId], 123456789, allocateUid), /Unknown formation/);
    assert.throws(() => CreateMonsterSide(Array(5).fill(monsterId), zhenId, allocateUid), /too few positions/);
    initZhens([{ id: zhenId + 1, pos: [0, 0] }, { id: zhenId + 2, pos: [-1] }]);
    assert.throws(() => CreateMonsterSide([monsterId, monsterId], zhenId + 1, allocateUid), /must not repeat/);
    assert.throws(() => CreateMonsterSide([monsterId], zhenId + 2, allocateUid), /nonnegative/);
    assert.throws(() => CreateMonsterSide([monsterId, monsterId], zhenId, () => 0), /UIDs must not repeat/);
    assert.throws(() => CreateMonsterSide([monsterId], zhenId, () => NaN), /UIDs must be safe integers/);
});

// 测试：技能和被动缺表明确报错，怪物数据表不会因错误生成而被修改。
test("monster side: missing learned skills and passives are configuration errors", () => {
    const { data, allocateUid } = setup();
    initMonsters([{ ...data, id: monsterId + 21, skills: [[123456789, 1]] },
        { ...data, id: monsterId + 22, passiveSkills: [[123456789, 1]] }]);
    assert.throws(() => CreateMonsterSide([monsterId + 21], zhenId, allocateUid), /unknown skill/);
    assert.throws(() => CreateMonsterSide([monsterId + 22], zhenId, allocateUid), /unknown passive/);
    assert.equal(getMonsterData(monsterId).name, "山贼");
});

// 测试：查表生成的双方能直接运行单机战斗，多个 AI 同时工作并逐批通过客户端一致性校验。
test("monster side: generated units run together with all three AI axes", async () => {
    const { allocateUid } = setup(); const left = CreateMonsterSide([monsterId], zhenId, allocateUid);
    const right = CreateMonsterSide([monsterId], zhenId, allocateUid);
    const fight = new Fight(1001200, { maxTurn: 3, waitInputSec: 1, duiwei: false }, 0); fight.createSide(left, right);
    const loop = new FightLoopPC(fight), client = new FightClient(), report = new FightReport(() => {}, false);
    loop.onMsg(msgs => {
        const wire = JSON.parse(JSON.stringify(msgs)); client.onMsg(wire); report.onMsg(wire);
        if (client.sides[0].length && client.sides[1].length) assert.ok(client.checkSame(fight));
    });
    await loop.run(); assert.equal(fight.turn, 3);
    assert.match(report.toString(), /触发受伤计次攻击/); assert.match(report.toString(), /触发 70% 血线/);
    assert.match(report.toString(), /周期技能/); assert.doesNotMatch(report.toString(), /未识别消息/);
    for (const unit of [...left.units, ...right.units]) assert.equal(unit.contextEmitter.listenerCount("hp"), 0);
});

// 测试：模板显式初始生命为零时生成死亡单位并清理普通 Buff，不把尸体当成存活怪物。
test("monster side: zero initial life creates a dead unit with normal death cleanup", () => {
    const { data, allocateUid } = setup(), attr = attributes(); attr.point.hp = 0;
    initMonsters([{ ...data, id: monsterId + 23, attr, ais: [] }]);
    const unit = CreateMonsterSide([monsterId + 23], zhenId, allocateUid).units[0];
    assert.equal(unit.isDied(), true); assert.equal(unit.getHp(), 0); assert.equal(unit.findBuff(buffId), undefined);
    assert.equal(unit.attr.magic.base.attack, 115); assert.equal(unit.attrOri.magic.base.attack, 100);
});
