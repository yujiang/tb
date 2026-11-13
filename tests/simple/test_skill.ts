import { FightLoopWest } from '../../src/fight/Online/FightLoopOnline';
import { SkillData } from '../../src/fight/Skills/FightSkill';
import { initSkills } from '../../src/fight/Skills/Skills';
import { MapShapeEnum, SelectParam, TargetSelectEnum } from '../../src/fight/struct';
import { FightUnitMonster } from '../../src/fight/Unit/FightUnitMonster';
import { createFightAndSide } from './help';

const sel : SelectParam = {
    target: TargetSelectEnum.enmey,
}

const normalSkill:SkillData = {
    id: 1,
    name: "普通魔法",
    magic: true,
    sel:{target: TargetSelectEnum.enmey,},
    rand: 0.8,
    nobackRand: 1,

    cost : {mp: 10},

    attack: 20,
    attackPercent: 0.2,
}

const healSkill:SkillData = {
    id: 2,
    name: "治疗",
    magic: true,
    sel:{target: TargetSelectEnum.friend, num: 3},
    func: "heal",

    rand: 1,
    nobackRand: 1,

    cost : {mp: 20},

    attack: 20,
    attackPercent: 0.2,
}

const spreadSkill:SkillData = {
    id: 3,
    name: "溅射",
    magic: true,
    sel: {target: TargetSelectEnum.enmey, shape: MapShapeEnum.x_line},
    func: "spread",
    
    rand: 1,
    nobackRand: 1,
    crit: 0.5,
    critDeep: 1,

    cost : {mp: 30},

    attack: 10,
    attackPercent: 0.2,
}

function prepareSkills(){
    const datas = [normalSkill, healSkill, spreadSkill]
    initSkills(datas);
}

async function run(){
    prepareSkills();

    const fight = createFightAndSide(100);
    
    const s0 = fight.Sides[0];
    // attack 都用技能
    for (const u of s0.units) {
        if (u instanceof FightUnitMonster){
            u.addSkill(normalSkill.id, 2);
            // u.inputSkill = normalSkill.id;
        }
    }

    const s1 = fight.Sides[1];
    const u1 = s1.units[0];
    if (u1 instanceof FightUnitMonster){
        u1.addSkill(healSkill.id, 6);
        // u1.inputSkill = healSkill.id;
    }
    const u2 = s1.units[1];
    if (u2 instanceof FightUnitMonster){
        u2.addSkill(spreadSkill.id, 8);
        // u1.inputSkill = healSkill.id;
    }

    const loop = new FightLoopWest(fight);
    fight.xls.waitInputSec = 1;
    const win = await loop.run();
    
    // 大概率0win， 因为用了技能有加成
    console.log("win", win, "at turn", fight.turn);
}

run();