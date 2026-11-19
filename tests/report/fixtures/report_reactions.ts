import { Fight, FightAttr, BaseAttack, FightSide, FightLoopWest, FightUnitMonster,
    FightClient, FightReport, initSkills, TargetSelectEnum, fightMsg } from "../../../src";

const mainId = 97201, nextId = 97202, killId = 97203;

function base(attack: number, rand = 0): BaseAttack {
    return { rand, hit: 100, dodge: 0, attack, defend: 0,
        hurt: 0, hurtP: 0, hurtAnti: 0, hurtPAnti: 0, critP: 0,
        critPAnit: 0, critDeep: 0, critDeepAnit: 0 };
}

function attr(hp: number, attack: number, speed: number): FightAttr {
    const a = new FightAttr();
    a.point = { hp, hpMax: hp, mp: 0, mpMax: 0 };
    a.speed = speed;
    const group = () => ({ base: base(attack, 1), next: base(15), kill: base(100),
        spread: base(0), fback: base(0),
        final: { bloodP: 0, dbackP: 0, immunity: 0, immunityP: 0 } });
    a.physic = group(); a.magic = group();
    a.heal = base(0); a.poison = base(0);
    return a;
}

// 连击与反击按现有规则互斥：剑客主技能不触发目标反击；敌人的普攻触发剑客反击。
// 第一轮压低敌方生命，第二轮击杀主目标后追击另一人；所有配置概率为 1，关闭暴击。
export async function runReactionReport(output: (line: string) => void = line => console.log(line), Report = FightReport) {
    const skill = { magic: true, rand: 1, sel: { target: TargetSelectEnum.enmey, sortAttr: "hp" },
        attack: {}, final: {}, noblood: false, nodback: false, nofback: true };
    initSkills([
        { ...skill, id: mainId, name: "汲血剑", next: nextId, kill: killId },
        { ...skill, id: nextId, name: "连斩" },
        { ...skill, id: killId, name: "收割" },
    ]);
    const fight = new Fight(97200, { maxTurn: 5, waitInputSec: 1, duiwei: false }, 0);
    const heroAttr = attr(80, 25, 200);
    heroAttr.point.hpMax = 120;
    heroAttr.physic.fback = base(8, 1);
    heroAttr.magic.final.bloodP = 0.5;
    const hero = new FightUnitMonster(0, heroAttr, { name: "剑客" });
    hero.addSkill(mainId, 1);
    hero.inputSkill = mainId;
    const guardAttr = attr(60, 12, 100);
    guardAttr.magic.final.dbackP = 0.2;
    const guard = new FightUnitMonster(1, guardAttr, { name: "荆棘卫士" });
    const archerAttr = attr(100, 10, 50);
    archerAttr.magic.final.dbackP = 0.2;
    const archer = new FightUnitMonster(2, archerAttr, { name: "荆棘弓手" });
    const attack = new FightSide(), defend = new FightSide();
    attack.units.push(hero); defend.units.push(guard, archer);
    for (const u of [hero, guard, archer]) u.setPos(u.uid === 2 ? 1 : 0);
    fight.createSide(attack, defend);
    const loop = new FightLoopWest(fight);
    const client = new FightClient();
    const report = new Report(output);
    const messages: fightMsg[] = [];
    let checkedBatches = 0;
    loop.onMsg(msgs => {
        const batch: fightMsg[] = typeof msgs[0] === "string" ? [msgs as fightMsg] : msgs as fightMsg[];
        const wire = JSON.parse(JSON.stringify(batch)) as fightMsg[];
        messages.push(...wire);
        client.onMsg(wire);
        report.onMsg(wire);
        // 初始化两方收齐后，每批都核对；不补发任何状态。
        if (client.sides[0].length && client.sides[1].length) {
            if (!client.checkSame(fight)) throw new Error("Reaction report client differs from server");
            checkedBatches++;
        }
    });
    await loop.run();
    return { fight, client, report, messages, checkedBatches };
}
