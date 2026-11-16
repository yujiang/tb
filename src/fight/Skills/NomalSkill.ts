import { FinalAttack, BaseAttack, FightTypeAttr } from "../FightAttr";
import { FightUnit } from "../Unit/FightUnit";
import { calcHurt, mergeTable } from "./Calc";
import { tryBlood, tryDBack, tryBack } from "./FightBack";
import { FightSkill, } from "./FightSkill";
import { FightContex } from "./NormalAttack";
import { getSkillData } from "./SkillDatas";

class MagicSkill extends FightSkill {
    ft: FightTypeAttr;

    mergeAttack(attack: BaseAttack, final: FinalAttack){
        this.xls = {...this.xls};
        this.xls.attack = mergeTable(this.xls.attack, attack);
        this.xls.final = mergeTable(this.xls.final, final);
    }

    name: string;
    override getName() {
        return this.name;
    }
    
   setFt(ft: FightTypeAttr){
        this.ft = ft;
        this.mergeAttack(ft.base, ft.final);
    }

    getMagicSkill(name: string, id: number, attack: BaseAttack) {
        const data = getSkillData(id);
        if (!data) return;
        const skill = new MagicSkill(data, this.level);
        skill.name = name;
        skill.mergeAttack(attack,this.ft.final);
        return skill;
    }

    override getNextSkill(): FightSkill {
        return this.getMagicSkill("next",this.getNext(), this.ft.next);
    }
    override getKillSkill(): FightSkill {
        return this.getMagicSkill("kill",this.getNext(), this.ft.kill);
    }
    override getSpreadSkill(): FightSkill {
        return this.getMagicSkill("spread",this.getNext(), this.ft.spread);
    }
}


// 普通技能
export function skillAttack(attacker: FightUnit, defender: FightUnit, skill:FightSkill, ctx: FightContex) {
    // assert(skill);
    const f = ctx.fight;
    // 发动概率
    if (f.randomGreat(skill.getRand())) return false;
    
    const aname = attacker.getName();

    // 命中概率
    if (skill.isPhysic()){
        const d2 = skill.getAttack().hit - defender.attr.physic.base.dodge;
        if (f.randomGreat(d2 / 100)) {
            ctx.msgs.push([aname, "miss", attacker.uid, defender.uid])
            return false;            
        }
    }

    // 方便客户端绘制
    ctx.msgs.push([aname, skill.getId(), attacker.uid, defender.uid])
    ctx.effects = [];

    const ismagic = skill.isMagic();
    const dft = ismagic ? defender.attr.magic  : defender.attr.physic;
    
    let damage = calcHurt(f, skill.getAttack(), dft.base, skill.getFinal(), dft.final, ctx);
    damage = defender.onHurt(attacker, aname, damage, ctx);
    if (damage > 1) {
        if (skill.canBlood()){
            tryBlood(attacker, defender, ismagic, damage, ctx);
        }
        if (skill.canDback()){
            tryDBack(attacker, defender, ismagic, damage, ctx);
        }
    }
    ctx.damage = damage;    
    return true;
}

function skillKill(attacker: FightUnit, sk:FightSkill, ctx: FightContex) {
    const skill = sk.getKillSkill();
    if (!skill) return false;
    const f = ctx.fight;
    const a = skill.isMagic() ? attacker.attr.magic : attacker.attr.physic;
    if (!skill || f.randomGreat(skill.getRand())) return false;

    const des = f.randomEnemyAlive(attacker.side);    
    if (!des) return false;
    ctx.killNum = (ctx.killNum || 0) + 1;
    skillAttack(attacker, des, skill, ctx);
    return true;
}

function skillNext(attacker: FightUnit, sk:FightSkill, ctx: FightContex) {
    const skill = sk.getNextSkill();
    if (!skill) return false;
    const f = ctx.fight;
    const a = skill.isMagic() ? attacker.attr.magic : attacker.attr.physic;
    if (!skill || f.randomGreat(skill.getRand())) return false;

    const des = f.randomEnemyAlive(attacker.side);    
    if (!des) return false;
    ctx.nextNum = (ctx.nextNum || 0) + 1;
    skillAttack(attacker, des, skill, ctx);
    return true;
}

export function skillAttackFunc(attacker: FightUnit, defender: FightUnit, skill:FightSkill, ctx: FightContex) {
    const magic = new MagicSkill(skill.getXls(), skill.level);
    magic.setFt(skill.isMagic() ? attacker.attr.magic : attacker.attr.physic);
    return magicAttackFunc(attacker, defender, magic, ctx);
}

export function magicAttackFunc(attacker: FightUnit, defender: FightUnit, magic:FightSkill, ctx: FightContex) {
    const rt = skillAttack(attacker, defender, magic, ctx);
    if (!rt) return false;
    spread(attacker, defender, magic, ctx);
    afterSkillAttack(attacker, defender, magic, ctx);
    return true;
}

function spread(attacker: FightUnit, defender: FightUnit, skill:FightSkill, ctx: FightContex) {
    const spreadSkill = skill.getSpreadSkill();
    if (!spreadSkill) return;    

    const f = ctx.fight;
    //const xls = skill.xls;
    const targets = f.selectTargets(defender, skill.getSel());
    if (!targets?.length) return

    const ids = targets.map((target) => {
        return target.uid;
    });
    ctx.msgs.push(["spread", ids]);

    // 有spread技能，优先用spread技能，否则用自身的技能固定0.7的减伤~
    for (const target of targets) {
        skillAttack(attacker, target, spreadSkill, ctx);
    }
}

export function afterSkillAttack(attacker: FightUnit, defender: FightUnit, skill:FightSkill, ctx: FightContex) {
    if (defender.isDied()){
        //追击
        skillKill(attacker, skill, ctx);
    }
    else {
        //反击 
        // const f = ctx.fight;
        let back = false;
        if (skill.canFback()) {
            back = tryBack(defender, attacker, ctx);
        }
        if (!back) {
            skillNext(attacker, skill, ctx);
        }
    }    
}
