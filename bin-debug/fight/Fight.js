"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Fight = void 0;
// 核心的战斗对象
const FightMap_1 = require("./FightMap");
const struct_1 = require("./struct");
class Fight {
    constructor(id) {
        // TODO
        this.id = id;
    }
    createSide(attack, des) {
        attack.side = struct_1.FightSideEnum.attack;
        des.side = struct_1.FightSideEnum.defend;
        this.Sides = [attack, des];
        this.AllUnits = [attack.units, des.units];
    }
    getSideUnits(side) {
        return this.AllUnits[side];
    }
    getAllUnits() {
        return this.AllUnits.flat();
    }
    getSideUnitsDie(side, die) {
        return this.AllUnits[side].filter(u => u.isFillterDie(die));
    }
    getSideUnitsByPos(side, poses, die) {
        return this.getSideUnits(side).filter(u => u.isFillterDie(die) && poses.includes(u.pos));
    }
    getSideUnitByPos(side, pos) {
        return this.getSideUnits(side).find(u => u.pos == pos);
    }
    createMap(nx, ny) {
        this.map = new FightMap_1.FightMap(this, nx, ny);
    }
    selectTargets(attack, des, die, sel) {
        //const attacks = this.getSideUnits(0).filter(u => u.isFillterDie(die));
        //const dess = this.getSideUnits(1).filter(u => u.isFillterDie(die));
        return this.map.selectTargets(attack, des, die, sel);
    }
}
exports.Fight = Fight;
//# sourceMappingURL=Fight.js.map