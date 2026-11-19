import { strict as assert } from "node:assert";
import { test } from "node:test";
import { BaseAttack, BuffTurnEnum, Fight, FightAttr, FightClient, FightCmdEnum, FightLoopWest,
    FightReport, FightSide, FightUnitUser, OverlapEnum, TargetSelectEnum, fightMsg,
    initBuffs, initFightContex, initSkills, FightPreParse } from "../../src";

const mainId = 99560, supportId = 99561, secondId = 99562, protectId = 99563;

function attributes(attack: number, speed: number, hp = 1000): FightAttr {
    const base = (value: number, rand = 0): BaseAttack => ({ attack: value, rand, property: 0, hit: 100,
        dodge: 0, defend: 0, hurt: 0, hurtP: 0, hurtAnti: 0, hurtPAnti: 0,
        critP: 0, critPAnit: 0, critDeep: 0, critDeepAnit: 0 });
    const attr = new FightAttr();
    attr.point = { hp, hpMax: 1000, mp: 100, mpMax: 100 }; attr.speed = speed;
    const group = () => ({ base: base(attack, 1), next: base(0), kill: base(0), spread: base(0), fback: base(0),
        final: { bloodP: 0, dbackP: 0, immunity: 0, immunityP: 0 } });
    attr.physic = group(); attr.magic = group(); attr.heal = base(0); attr.poison = base(0);
    return attr;
}

// 测试：真实单回合简报展示保护优先、主攻与协战同时出手、双方分担受伤及协战次数限制。
test("report demo: protect and support share a real round with incremental client checks", async () => {
    console.log("示例：铁卫仅剩 80 血，先保护少侠；剑客与侠客同时出手，随后拳师攻击，协战本回合不再发动。\n");
    const common = { magic: true, rand: 1, attack: {}, final: {}, noprotect: false, sel: { target: TargetSelectEnum.enmey } };
    initSkills([{ ...common, id: mainId, name: "破阵掌", nosupport: false },
        { ...common, id: supportId, name: "飞燕剑", damageRate: 0.4 },
        { ...common, id: secondId, name: "追风拳", nosupport: false }]);
    initBuffs([{ id: protectId, name: "保护", desc: "分担本回合队友受到的直接攻击伤害", class: "protect",
        overlap: OverlapEnum.REPLACE, status: [], tags: [], magic: false, attackType: "base", attack: {}, final: {},
        turnType: BuffTurnEnum.afterTurn, lastTurn: 1, times: 0, event: "beforeHurt", prior: 500 }]);
    const fight = new Fight(99560, { maxTurn: 5, waitInputSec: 1, duiwei: false, protectBuff: protectId }, 0);
    const swordsman = new FightUnitUser(0, attributes(100, 120), { name: "剑客" });
    const supporter = new FightUnitUser(1, attributes(100, 100), { name: "侠客" });
    const victim = new FightUnitUser(2, attributes(0, 80), { name: "少侠" });
    const protector = new FightUnitUser(3, attributes(0, 10, 80), { name: "铁卫" });
    const boxer = new FightUnitUser(4, attributes(60, 110), { name: "拳师" });
    swordsman.addSkill(mainId, 1); boxer.addSkill(secondId, 1);
    supporter.addSkill(supportId, 1); supporter.setSupportSkill(supportId);
    for (const unit of [swordsman, supporter, victim, protector, boxer]) unit.setPos(unit.uid);
    const attack = new FightSide(), defend = new FightSide();
    attack.units.push(swordsman, supporter, boxer); defend.units.push(victim, protector);
    fight.createSide(attack, defend);
    const loop = new FightLoopWest(fight), client = new FightClient(), report = new FightReport();
    const messages: fightMsg[] = [];
    const preParser = new FightPreParse();
    const presentationGroups: string[] = [];
    let checked = 0;
    loop.onMsg(msgs => {
        const wire = JSON.parse(JSON.stringify(msgs)) as fightMsg | fightMsg[];
        const batch = typeof wire[0] === "string" ? [wire as fightMsg] : wire as fightMsg[];
        const parsed = preParser.parse(wire);
        assert.deepEqual(parsed.messages, batch);
        presentationGroups.push(...parsed.groups.map(group => group.kind));
        messages.push(...batch); client.onMsg(wire); report.onMsg(wire);
        if (client.sides[0].length && client.sides[1].length) {
            assert.ok(client.checkSame(fight)); checked++;
        }
    });
    loop.start(); loop.nextTurn();
    const before = initFightContex(fight);
    loop.processBeforeTurn(fight.turn, before); loop.bcMsg(before.msgs);
    swordsman.input = { cmd: FightCmdEnum.skill, skill: mainId, target: victim.uid };
    boxer.input = { cmd: FightCmdEnum.skill, skill: secondId, target: victim.uid };
    supporter.input = { cmd: FightCmdEnum.defend };
    victim.input = { cmd: FightCmdEnum.defend };
    protector.input = { cmd: FightCmdEnum.protect, target: victim.uid };
    await loop.processOneTurn(fight.turn);
    const after = initFightContex(fight);
    loop.processAfterTurn(fight.turn, after); loop.bcMsg(after.msgs);
    const joint = report.lines.filter(line => line.includes("同时攻击"));
    assert.equal(joint.length, 1);
    assert.deepEqual(presentationGroups, ["support", "protect", "protect", "protect"]);
    assert.match(joint[0], /剑客.*\[破阵掌\].*侠客.*\[飞燕剑\].*少侠/);
    assert.equal(report.lines.filter(line => line.includes("点分担伤害") && line.includes("；对")).length, 3);
    assert.equal(messages.find(msg => msg[0] === "actor")[1], protector.uid);
    assert.equal(messages.filter(msg => msg[0] === "skill" && msg[4] === "support").length, 1);
    assert.deepEqual(messages.filter(msg => msg[0] === "hurt").map(msg => [msg[2], msg[4]]),
        [[3, 50], [2, 50], [3, 20], [2, 20], [3, 10], [2, 30]]);
    const death = messages.findIndex(msg => msg[0] === "die");
    assert.deepEqual(messages.slice(death - 2, death).map(msg => msg[0]), ["hurt", "hurt"]);
    assert.equal(victim.getHp(), 900); assert.equal(protector.getHp(), 0);
    assert.equal(victim.findBuff(protectId), undefined);
    assert.ok(checked >= 6); assert.ok(client.checkSame(fight));
});
