import { FightLoopWest } from '../../src/fight/Online/FightLoopOnline';
import { SkillData } from '../../src/fight/Skills/FightSkill';
import { initSkills } from '../../src/fight/Skills/Skills';
import { SelectParam, TargetSelectEnum } from '../../src/fight/struct';
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
    rand: 1,
    nobackRand: 1,

    cost : {mp: 10},

    attack: 20,
    attackPercent: 0.2,
}

const healSkill:SkillData = {
    id: 2,
    name: "heal",
    magic: true,
    sel:{target: TargetSelectEnum.friend, },
    rand: 1,
    nobackRand: 1,

    cost : {mp: 10},

    attack: 20,
    attackPercent: 0.2,
}

function prepareSkills(){
    const datas = [normalSkill]
    initSkills(datas);
}

async function run(){
    prepareSkills();

    const fight = createFightAndSide(100);
    
    const s0 = fight.Sides[0];
    // attack 都用技能
    for (const u of s0.units) {
        if (u instanceof FightUnitMonster){
            u.inputSkill = normalSkill.id;
        }
    }

    const s1 = fight.Sides[1];

    const loop = new FightLoopWest(fight);
    fight.xls.waitInputSec = 1;
    const win = await loop.run();
    
    // 大概率0win， 因为用了技能有加成
    console.log("win", win, "at turn", fight.turn);
}

run();