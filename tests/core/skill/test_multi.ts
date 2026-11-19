import { strict as assert } from "node:assert";
import { test } from "node:test";
import { DiedSelectEnum, FightCmdEnum, TargetSelectEnum, initFightContex } from "../../../src";
import { skillFunc } from "../../../src/fight/Skills/SkillFuncType";
import { setupChain, chainIds as ids } from "../../fixtures/skill_chain";

function setup(num = 99, change?: Parameters<typeof setupChain>[0]["change"]) {
    return setupChain({ finalReactions: false, rootSelfBuff: false, change: skills => {
        skills[0].combo = undefined;
        skills[0].damageRate = 1;
        skills[0].sel = { target: TargetSelectEnum.enmey, num };
        skills[0].nosupport = true;
        change?.(skills);
    } });
}

// 群攻一次选定敌方全体，不选择主目标，也不发送溅射消息。
test("multi: num 99 directly attacks the whole enemy side", () => {
    const { fight, actor, target, other } = setup();
    fight.selectMainTarget = () => { assert.fail("群攻不应选择主目标"); };
    const ctx = fight.processUnit(actor, { cmd: FightCmdEnum.skill, skill: ids.first });
    assert.ok(ctx);
    assert.deepEqual([target.getHp(), other.getHp(), actor.getHp()], [900, 900, 1000]);
    assert.equal(ctx.msgs.some(msg => msg[0] === "spread"), false);
    assert.equal(ctx.msgs.filter(msg => msg[0] === "costMp").length, 1);
});

// 群攻人数是总人数，按血量排序选择，默认不会攻击死亡单位。
test("multi: num limits total targets and respects sorting and death filters", () => {
    const { fight, actor, target, other } = setup(2, skills => { skills[0].sel.sortAttr = "hp"; });
    target.die();
    const ctx = fight.processUnit(actor, { cmd: FightCmdEnum.skill, skill: ids.first });
    assert.ok(ctx);
    assert.equal(other.getHp(), 900);
    assert.deepEqual(ctx.msgs.filter(msg => msg[0] === "skill").map(msg => msg[3]), [other.uid]);
});

// 第一个目标未命中也不会跳过其他群攻目标，施放后自身效果只添加一次。
test("multi: a miss does not cancel other targets and self buffs apply once", () => {
    const { fight, actor, target, other, client, flush } = setup(99, skills => {
        skills[0].magic = false;
        skills[0].afterSelfBuff = [[ids.rest, 1, 1]];
    });
    target.attr.physic.base.dodge = 100;
    fight.random = () => 0.5;
    const ctx = fight.processUnit(actor, { cmd: FightCmdEnum.skill, skill: ids.first });
    assert.deepEqual([target.getHp(), other.getHp()], [1000, 900]);
    assert.equal(ctx.msgs.filter(msg => msg[0] === "miss").length, 1);
    assert.equal(ctx.msgs.filter(msg => msg[0] === "skill").length, 1);
    assert.equal(ctx.msgs.filter(msg => msg[0] === "addBuff" && msg[4] === ids.rest).length, 1);
    flush(ctx);
    assert.equal(client.checkSame(fight), true);
});

// PC 群体技能不绑定一个随机主目标，执行时仍覆盖整个目标阵营。
test("multi: PC input does not bind a main target", () => {
    const { fight, actor, target, other } = setup();
    const input = { cmd: FightCmdEnum.skill, skill: ids.first };
    assert.equal(fight.checkPC(actor, input), true);
    assert.deepEqual(fight.preparePCInput(actor, input), input);
    fight.processUnit(actor, input);
    assert.deepEqual([target.getHp(), other.getHp()], [900, 900]);
});

// 友方群体复活直接处理所有死亡队友，不依赖第一个目标触发溅射。
test("multi: revival applies to all dead units of the selected side", () => {
    const { fight, actor, target, other } = setup(99, skills => {
        skills[0].func = "relife";
        skills[0].healRate = 0.3;
        skills[0].sel.die = DiedSelectEnum.die;
    });
    target.attr.point.hp = 0; other.attr.point.hp = 0;
    target.die(); other.die();
    // 保持战斗未结束，直接走技能入口验证死亡过滤与复活函数。
    const ctx = initFightContex(fight);
    ctx.attack = actor;
    skillFunc(actor, null, ids.first, ctx);
    assert.deepEqual([target.getHp(), other.getHp()], [300, 300]);
    assert.deepEqual([target.isDied(), other.isDied()], [false, false]);
});
