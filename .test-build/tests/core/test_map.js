"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Fight_1 = require("../../src/fight/Fight");
const FightSide_1 = require("../../src/fight/FightSide");
const struct_1 = require("../../src/fight/struct");
function run() {
    const fight = new Fight_1.Fight(100);
    fight.createMap(5, 5);
    const s1 = new FightSide_1.FightSide();
    const s2 = new FightSide_1.FightSide();
    fight.createSide(s1, s2);
    s1.createSimpleUnits([
        { name: 'a1', id: 1, pos: 1 },
        { name: 'a2', id: 2, pos: 3 },
        { name: 'a3', id: 3, pos: 5 },
        { name: 'a4', id: 4, pos: 7 },
    ]);
    const u1 = s1.units[1];
    u1.die();
    s2.createSimpleUnits([
        { name: 'b1', id: 11, pos: 1 },
        { name: 'b2', id: 12, pos: 3 },
        { name: 'b3', id: 13, pos: 5 },
        { name: 'b4', id: 14, pos: 7 },
    ]);
    const u2 = s2.units[2];
    u2.die();
    const param = { die: struct_1.DiedSelectEnum.alive, target: struct_1.TargetSelectEnum.duiwei, shape: struct_1.MapShapeEnum.one };
    const t1 = fight.selectTargets(s1.units[2], null, param);
    console.log("t1", t1);
    const t2 = fight.selectTargets(s2.units[2], null, param);
    console.log("t2", t2);
}
run();
//# sourceMappingURL=test_map.js.map