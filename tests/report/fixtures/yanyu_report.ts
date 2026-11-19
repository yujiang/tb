import { setImmediate } from "node:timers/promises";
import { strict as assert } from "node:assert";
import { BaseAttack, Fight, FightAttr, FightClient, FightCmdEnum, FightLoopYanYu, FightReport,
    FightSide, FightUnitUser, FightUnitMonster, TargetSelectEnum, initSkills, fightMsg } from "../../../src";

const swordId = 99970, palmId = 99971, fingerId = 99972;

function attributes(hp: number, physic: number, magic: number, speed: number): FightAttr {
    const base = (attack: number, rand = 0): BaseAttack => ({ attack, rand, hit: 100, dodge: 0, defend: 0,
        hurt: 0, hurtP: 0, hurtAnti: 0, hurtPAnti: 0, critP: 0, critPAnit: 0, critDeep: 0, critDeepAnit: 0 });
    const attr = new FightAttr(); attr.speed = speed;
    attr.point = { hp, hpMax: hp, mp: 100, mpMax: 100 };
    const group = (attack: number) => ({ base: base(attack, 1), next: base(0), kill: base(0),
        spread: base(0), fback: base(0), final: { bloodP: 0, dbackP: 0, immunity: 0, immunityP: 0 } });
    attr.physic = group(physic); attr.magic = group(magic); attr.heal = base(0); attr.poison = base(0);
    return attr;
}

// 第一回合剑客普攻后的动画期间，先后提交低速女侠和剑客的技能。
// 两个技能先执行，随后刀客、女侠、枪客继续原普攻队列；第二回合同样插入技能并取胜。
export async function runYanYuReport(output: (line: string) => void = line => console.log(line), color = true) {
    const common = { rand: 1, attack: {}, final: {}, noblood: true, nodback: true, nofback: true,
        nosupport: true, sel: { target: TargetSelectEnum.duiwei } };
    initSkills([{ ...common, id: swordId, name: "流云剑", magic: false },
        { ...common, id: palmId, name: "破阵掌", magic: true, attack: { attack: 30 }, cost: { mp: 10 } },
        { ...common, id: fingerId, name: "寒梅指", magic: true, attack: { attack: 50 }, cost: { mp: 10 } }]);
    const fight = new Fight(99970, { maxTurn: 5, waitInputSec: 1, duiwei: true }, 0);
    fight.createMap(5, 1);
    const swordsman = new FightUnitUser(0, attributes(180, 30, 50, 200), { name: "剑客" }); swordsman.setPos(0);
    const heroine = new FightUnitUser(1, attributes(140, 20, 20, 100), { name: "女侠" }); heroine.setPos(1);
    const blade = new FightUnitMonster(11, attributes(160, 20, 0, 150), { name: "刀客" }); blade.setPos(4);
    const spear = new FightUnitMonster(12, attributes(150, 15, 0, 80), { name: "枪客" }); spear.setPos(3);
    swordsman.addSkill(swordId, 1); swordsman.setAttackSkill(swordId); swordsman.addSkill(palmId, 1);
    heroine.addSkill(fingerId, 1);
    const attack = new FightSide(), defend = new FightSide();
    attack.units.push(swordsman, heroine); defend.units.push(blade, spear); fight.createSide(attack, defend);
    class DemoLoop extends FightLoopYanYu {
        override start() { super.start(); for (const unit of fight.getAllUnits()) unit.speedRand = 0; }
    }
    const loop = new DemoLoop(fight), client = new FightClient(), report = new FightReport(output, color);
    const messages: fightMsg[] = [], immediateBars: number[][] = [];
    let checkedBatches = 0, submittedTurn = 0;
    const submitted: Promise<boolean>[] = [];
    loop.onMsg(msgs => {
        const wire = JSON.parse(JSON.stringify(msgs)) as fightMsg | fightMsg[];
        const batch = typeof wire[0] === "string" ? [wire as fightMsg] : wire as fightMsg[];
        messages.push(...batch); client.onMsg(wire); report.onMsg(wire);
        if (batch.some(msg => msg[0] === "actor" && msg[3] === "skill")) immediateBars.push([...client.sort]);
        if (client.sides[0].length && client.sides[1].length) {
            assert.ok(client.checkSame(fight)); checkedBatches++;
        }
    });
    loop.waitDrawOver = async () => {
        if (submittedTurn !== fight.turn && fight.turn <= 2 && !fight.isEnd()) {
            submittedTurn = fight.turn;
            // 模拟动画期间的网络输入；不在等待钩子中 await 自己所在队列，避免互相等待。
            submitted.push(loop.onInput(heroine.uid, { turn: fight.turn, cmd: FightCmdEnum.skill,
                skill: fingerId, target: spear.uid }));
            submitted.push(loop.onInput(swordsman.uid, { turn: fight.turn, cmd: FightCmdEnum.skill,
                skill: palmId, target: blade.uid }));
        }
        await setImmediate();
    };
    const result = await loop.run();
    const accepted = await Promise.all(submitted);
    return { fight, client, report, messages, immediateBars, checkedBatches, accepted,
        result, swordsman, heroine, blade, spear };
}
