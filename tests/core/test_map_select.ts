import { strict as assert } from "node:assert";
import { test } from "node:test";
import { Fight } from "../../src/fight/Fight";
import { FightSide } from "../../src/fight/FightSide";
import { DiedSelectEnum, MapShapeEnum, SelectParam, TargetSelectEnum } from "../../src/fight/struct";

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
const b40 = defendSide.units[0];
const b30 = defendSide.units[1];
a10.die();
b30.die();

function names(units: ReturnType<Fight["selectTargets"]>): string[] | undefined {
    return units?.map(unit => unit.name);
}

function check(
    label: string,
    attacker: typeof a00,
    defender: typeof b40 | null,
    target: TargetSelectEnum,
    shape: MapShapeEnum,
    die: DiedSelectEnum,
    expected: string[] | undefined,
): void {
    const param: SelectParam = { target, shape, die };
    assert.deepEqual(
        names(fight.selectTargets(attacker, defender, param)),
        expected,
        label,
    );
}

const shapeCases: Array<[MapShapeEnum, string[], string[], string[]]> = [
    [MapShapeEnum.one, ["a00"], ["b40"], ["b40"]],
    [MapShapeEnum.x_line, ["a00", "a01", "a20"], ["b40", "b41"], ["b40", "b41"]],
    [MapShapeEnum.y_line, ["a00", "a02"], ["b40"], ["b40"]],
    [MapShapeEnum.cross, ["a00", "a01"], ["b40", "b41"], ["b40", "b41"]],
    [MapShapeEnum.all, ["a00", "a01", "a11", "a22", "a44", "a02", "a20", "a12", "a21", "a23", "a32", "a33"], ["b40", "b41", "b32", "b22", "b04"], ["b40", "b41", "b32", "b22", "b04"]],
];

for (const [shape, attackExpected, defendExpected, duiweiExpected] of shapeCases) {
    test(`attackside shape ${MapShapeEnum[shape]}`, () => {
        check(`attackside shape ${MapShapeEnum[shape]}`, a00, b40, TargetSelectEnum.attackside, shape, DiedSelectEnum.alive, attackExpected);
    });
    test(`defendside shape ${MapShapeEnum[shape]}`, () => {
        check(`defendside shape ${MapShapeEnum[shape]}`, a00, b40, TargetSelectEnum.defendside, shape, DiedSelectEnum.alive, defendExpected);
    });
    test(`duiwei shape ${MapShapeEnum[shape]}`, () => {
        check(`duiwei shape ${MapShapeEnum[shape]}`, a00, null, TargetSelectEnum.duiwei, shape, DiedSelectEnum.alive, duiweiExpected);
    });
}

test("self ignores shape", () => {
    check("self ignores shape", a00, null, TargetSelectEnum.self, MapShapeEnum.all, DiedSelectEnum.alive, ["a00"]);
});
test("des selects the explicit target", () => {
    check("des selects the explicit target", a00, b30, TargetSelectEnum.des, MapShapeEnum.all, DiedSelectEnum.alive, ["b30"]);
});
test("cross selects only adjacent horizontal and vertical units", () => {
    check("cross selects only adjacent horizontal and vertical units", attackSide.units[4], null, TargetSelectEnum.attackside, MapShapeEnum.cross, DiedSelectEnum.alive, ["a22", "a12", "a21", "a23", "a32"]);
});
test("attackside filters dead units", () => {
    check("attackside filters dead units", a00, b40, TargetSelectEnum.attackside, MapShapeEnum.all, DiedSelectEnum.die, ["a10"]);
});
test("defendside filters dead units", () => {
    check("defendside filters dead units", a00, b40, TargetSelectEnum.defendside, MapShapeEnum.all, DiedSelectEnum.die, ["b30"]);
});
test("shape selection filters dead units", () => {
    check("shape selection filters dead units", a00, b40, TargetSelectEnum.attackside, MapShapeEnum.y_line, DiedSelectEnum.die, ["a10"]);
});
test("duiwei can select a dead opposing unit", () => {
    check("duiwei can select a dead opposing unit", a10, null, TargetSelectEnum.duiwei, MapShapeEnum.one, DiedSelectEnum.die, ["b30"]);
});
test("duiwei skips dead units and selects the nearest alive column", () => {
    check("duiwei skips dead units and selects the nearest alive column", a10, null, TargetSelectEnum.duiwei, MapShapeEnum.one, DiedSelectEnum.alive, ["b32"]);
});
test("duiwei all selects the chosen opposing side", () => {
    check("duiwei all selects the chosen opposing side", a10, null, TargetSelectEnum.duiwei, MapShapeEnum.all, DiedSelectEnum.alive, ["b40", "b41", "b32", "b22", "b04"]);
});

for (const target of [TargetSelectEnum.attackside, TargetSelectEnum.defendside, TargetSelectEnum.duiwei]) {
    test(`${TargetSelectEnum[target]} rejects the none shape`, () => {
        assert.throws(
            () => fight.selectTargets(a00, b40, { target, shape: MapShapeEnum.none, die: DiedSelectEnum.alive }),
        );
    });
}
