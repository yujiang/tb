"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FightSide = void 0;
const FightUnit_1 = require("./FightUnit");
class FightSide {
    createSimpleUnits(datas) {
        for (const data of datas) {
            const u = new FightUnit_1.FightUnit(data.name, data.id);
            this.units.push(u);
            u.setSidePos(this.side, data.pos);
        }
    }
}
exports.FightSide = FightSide;
//# sourceMappingURL=FightSide.js.map