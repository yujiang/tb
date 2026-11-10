"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FightUnit = void 0;
const struct_1 = require("./struct");
// 战斗单元
class FightUnit {
    constructor(name, id) {
        this.dead = false;
        this.name = name;
        this.id = id;
    }
    setSidePos(side, pos) {
        this.side = side;
        this.pos = pos;
    }
    setFight(fight) {
        this.fight = fight;
    }
    isDied() {
        return this.dead;
    }
    die() {
        this.dead = true;
    }
    relife() {
        this.dead = false;
    }
    isFillterDie(die) {
        if (die == struct_1.DiedSelectEnum.all) {
            return true;
        }
        else if (die == struct_1.DiedSelectEnum.alive) {
            return !this.dead;
        }
        else if (die == struct_1.DiedSelectEnum.die) {
            return this.dead;
        }
    }
}
exports.FightUnit = FightUnit;
//# sourceMappingURL=FightUnit.js.map