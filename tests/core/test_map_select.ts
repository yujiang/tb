import { strict as assert } from "node:assert";
import { test } from "node:test";
import { Fight } from "../../src/fight/Fight";
import { FightSide } from "../../src/fight/FightSide";
import { FightUnit } from "../../src/fight/FightUnit";
import { DiedSelectEnum, MapShapeEnum, SelectMainParam, SelectParam, TargetSelectEnum } from "../../src/fight/struct";

const fight = new Fight(100);
fight.createMap(5, 5);

const attackSide = new FightSide();
const defendSide = new FightSide();
fight.createSide(attackSide, defendSide);

attackSide.createSimpleUnits([
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
defendSide.createSimpleUnits([
    { name: "b40", id: 11, pos: 4 },
    { name: "b30", id: 12, pos: 3 },
    { name: "b41", id: 13, pos: 9 },
    { name: "b32", id: 14, pos: 7 },
    { name: "b22", id: 15, pos: 12 },
    { name: "b04", id: 16, pos: 20 },
]);

const a00 = attackSide.units[0];
const a10 = attackSide.units[1];
const a01 = attackSide.units[2];
const a11 = attackSide.units[3];
const a22 = attackSide.units[4];
const a02 = attackSide.units[6];
const b40 = defendSide.units[0];
const b30 = defendSide.units[1];
const b41 = defendSide.units[2];
const b32 = defendSide.units[3];
a10.die();
b30.die();

function names(units: FightUnit[] | undefined): string[] | undefined {
    return units?.map(unit => unit.getName());
}

function secondaryTargets(main: FightUnit, shape: MapShapeEnum, die = DiedSelectEnum.alive): string[] | undefined {
    const param: SelectParam = {
        target: TargetSelectEnum.des_or_random,
        die,
        num: 1,
        shape,
    };
    return names(fight.selectTargets(main, param));
}

test("main target selection and secondary shape selection are separate stages", () => {
    const mainParam: SelectMainParam = {
        target: TargetSelectEnum.duiwei,
        die: DiedSelectEnum.alive,
    };
    const main = fight.selectMainTarget(a00, null, mainParam);

    assert.equal(main, b40);
    assert.deepEqual(secondaryTargets(main, MapShapeEnum.x_line), ["b41"]);
});

test("self selects the attacker as the main target", () => {
    assert.equal(
        fight.selectMainTarget(a00, null, { target: TargetSelectEnum.self }),
        a00,
    );
});

test("an explicit main target is preserved", () => {
    assert.equal(
        fight.selectMainTarget(a00, b40, { target: TargetSelectEnum.des_or_random }),
        b40,
    );
});

test("duiwei can select dead units or skip them according to the die filter", () => {
    assert.equal(
        fight.selectMainTarget(a10, null, { target: TargetSelectEnum.duiwei, die: DiedSelectEnum.all }),
        b30,
    );
    assert.equal(
        fight.selectMainTarget(a10, null, { target: TargetSelectEnum.duiwei, die: DiedSelectEnum.alive }),
        b32,
    );
});

test("main-target selection filters dead units and honors sorting", () => {
    b40.attr.hp = 80;
    b41.attr.hp = 50;

    assert.equal(
        fight.selectMainTarget(a00, null, {
            target: TargetSelectEnum.des_or_random,
            die: DiedSelectEnum.alive,
            sortAttr: "hp",
        }),
        b41,
    );
});

test("secondary x-line targets exclude the main target", () => {
    assert.deepEqual(secondaryTargets(a00, MapShapeEnum.x_line), ["a01", "a20"]);
});

test("secondary y-line targets filter dead units", () => {
    assert.deepEqual(secondaryTargets(a00, MapShapeEnum.y_line), ["a02"]);
    assert.deepEqual(secondaryTargets(a00, MapShapeEnum.y_line, DiedSelectEnum.die), ["a10"]);
});

test("secondary cross targets include adjacent units but exclude the main target", () => {
    assert.deepEqual(
        secondaryTargets(a22, MapShapeEnum.cross),
        ["a12", "a21", "a23", "a32"],
    );
});

test("numeric secondary selection chooses sorted allies and excludes the main target", () => {
    a01.attr.hp = 90;
    a11.attr.hp = 40;
    a02.attr.hp = 60;

    const selected = fight.selectTargets(a00, {
        target: TargetSelectEnum.des_or_random,
        die: DiedSelectEnum.alive,
        num: 2,
        sortAttr: "hp",
    });

    assert.deepEqual(names(selected), ["a11", "a02"]);
});
