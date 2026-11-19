import { strict as assert } from "node:assert";
import { test } from "node:test";
import { Fight } from "../../src/fight/Fight";
import { FightSide } from "../../src/fight/FightSide";
import { FightUnit } from "../../src/fight/Unit/FightUnit";
import { DiedSelectEnum, MapShapeEnum, SelectMainParam, SelectParam, TargetSelectEnum } from "../../src/fight/struct";

const fight = new Fight(100, {
        maxTurn: 100,
        waitInputSec: 1,
        duiwei: false,
    });
fight.createMap(5, 5);

const attackSide = new FightSide();
const defendSide = new FightSide();

attackSide.createSimpleMonster(fight,[
    { name: "a00", id: 1, pos: 0 },
    { name: "a10", id: 2, pos: 1 },
    { name: "a01", id: 3, pos: 5 },
    { name: "a11", id: 4, pos: 6 },
    { name: "a22", id: 5, pos: 12 },
    { name: "a44", id: 6, pos: 24 },
    { name: "a02", id: 7, pos: 2 },
    { name: "a20", id: 8, pos: 10 },
    { name: "a12", id: 9, pos: 7 },
    { name: "a21", id: 10, pos: 11 },
    { name: "a23", id: 17, pos: 13 },
    { name: "a32", id: 18, pos: 17 },
    { name: "a33", id: 19, pos: 18 },
]);
defendSide.createSimpleMonster(fight,[
    { name: "b40", id: 11, pos: 4 },
    { name: "b30", id: 12, pos: 3 },
    { name: "b41", id: 13, pos: 9 },
    { name: "b32", id: 14, pos: 7 },
    { name: "b22", id: 15, pos: 12 },
    { name: "b04", id: 16, pos: 20 },
]);
fight.createSide(attackSide, defendSide);
fight.random = () => 0;

const a00 = attackSide.units[0];
const a10 = attackSide.units[1];
const a01 = attackSide.units[2];
const a11 = attackSide.units[3];
const a22 = attackSide.units[4];
const a02 = attackSide.units[6];
const b40 = defendSide.units[0];
const b30 = defendSide.units[1];
const b41 = defendSide.units[2];
a10.die();
b30.die();

function names(units: FightUnit[] | undefined): string[] | undefined {
    return units?.map(unit => unit.getName());
}

function secondaryTargets(main: FightUnit, shape: MapShapeEnum, die = DiedSelectEnum.alive): string[] | undefined {
    const param: SelectParam = {
        target: TargetSelectEnum.enmey,
        die,
        numSpread: 1,
        shape,
    };
    return names(fight.selectTargets(main, param));
}

// 测试：主目标选择和副目标形状查询分成两个阶段执行。
test("main target selection and secondary shape selection are separate stages", () => {
    const mainParam: SelectMainParam = {
        target: TargetSelectEnum.duiwei,
        die: DiedSelectEnum.alive,
    };
    const main = fight.selectMainTarget(a00, mainParam);

    assert.equal(main, b40);
    assert.deepEqual(secondaryTargets(main, MapShapeEnum.x_line), ["b41"]);
});

// 测试：选择自身时以行动者作为主目标。
test("self selects the attacker as the main target", () => {
    assert.equal(
        fight.selectMainTarget(a00, { target: TargetSelectEnum.self }),
        a00,
    );
});

// 测试：选出的主目标保持为预期的敌方单位。
test("an explicit main target is preserved", () => {
    assert.equal(
        fight.selectMainTarget(a00, { target: TargetSelectEnum.enmey }),
        b40,
    );
});

// 测试：对位选择根据死亡过滤决定包含尸体或跳过尸体。
test("duiwei can select dead units or skip them according to the die filter", () => {
    b40.die();
    assert.equal(
        fight.selectMainTarget(a00, { target: TargetSelectEnum.duiwei, die: DiedSelectEnum.all }),
        b40,
    );
    assert.equal(
        fight.selectMainTarget(a00, { target: TargetSelectEnum.duiwei, die: DiedSelectEnum.alive }),
        b41,
    );
    b40.relife();
});

// 测试：主目标选择过滤死亡单位，并按指定属性排序。
test("main-target selection filters dead units and honors sorting", () => {
    b40.attr.point.hp = 80;
    b41.attr.point.hp = 50;

    assert.equal(
        fight.selectMainTarget(a00, {
            target: TargetSelectEnum.enmey,
            die: DiedSelectEnum.alive,
            sortAttr: "hp",
        }),
        b41,
    );
});

// 测试：横线副目标选择排除主目标自身。
test("secondary x-line targets exclude the main target", () => {
    assert.deepEqual(secondaryTargets(a00, MapShapeEnum.x_line), ["a01", "a20"]);
});

// 测试：竖线副目标选择按配置过滤死亡状态。
test("secondary y-line targets filter dead units", () => {
    assert.deepEqual(secondaryTargets(a00, MapShapeEnum.y_line), ["a02"]);
    assert.deepEqual(secondaryTargets(a00, MapShapeEnum.y_line, DiedSelectEnum.die), ["a10"]);
});

// 测试：十字副目标选择包含相邻单位并排除主目标。
test("secondary cross targets include adjacent units but exclude the main target", () => {
    assert.deepEqual(
        secondaryTargets(a22, MapShapeEnum.cross),
        ["a12", "a21", "a23", "a32"],
    );
});

// 测试：按数量选择副目标时排序同阵营候选并排除主目标。
test("numeric secondary selection chooses sorted allies and excludes the main target", () => {
    a01.attr.point.hp = 90;
    a11.attr.point.hp = 40;
    a02.attr.point.hp = 60;

    const selected = fight.selectTargets(a00, {
        target: TargetSelectEnum.enmey,
        die: DiedSelectEnum.alive,
        numSpread: 2,
        sortAttr: "hp",
    });

    assert.deepEqual(names(selected), ["a11", "a02"]);
});
