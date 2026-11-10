"use strict";
// 战斗地图,负责占位
Object.defineProperty(exports, "__esModule", { value: true });
exports.FightMap = void 0;
const struct_1 = require("./struct");
const node_assert_1 = require("node:assert");
class FightMap {
    constructor(fight, nx, ny) {
        this.fight = fight;
        this.nx = nx;
        this.ny = ny;
    }
    maxPos() {
        return this.nx * this.ny;
    }
    getPos(x, y) {
        return y * this.nx + x;
    }
    getDuiwei(x) {
        return (this.ny - 1) - x;
    }
    xLine(x) {
        return Array.from({ length: this.ny }, (_, i) => this.getPos(x, i));
    }
    yLine(y) {
        return Array.from({ length: this.nx }, (_, i) => this.getPos(i, y));
    }
    getPosByIndex(index) {
        return [index % this.nx, Math.floor(index / this.nx)];
    }
    selectTargets(attack, des, sel) {
        switch (sel.target) {
            case struct_1.TargetSelectEnum.self:
                return [attack];
            case struct_1.TargetSelectEnum.des:
                (0, node_assert_1.strict)(des);
                return [des];
        }
        if (sel.target === struct_1.TargetSelectEnum.duiwei) {
            return this.selectTargetDuiwei(attack, sel);
        }
        return this.selectTargetsPos(attack, des, sel);
    }
    // 以unit为中心来计算
    selectTargetsShape(unit, sel) {
        const side = unit.side;
        const pos = unit.pos;
        const [x, y] = this.getPosByIndex(pos);
        let poses;
        switch (sel.shape) {
            case struct_1.MapShapeEnum.x_line:
                poses = this.xLine(x);
                break;
            case struct_1.MapShapeEnum.y_line:
                poses = this.yLine(y);
                break;
            default:
                (0, node_assert_1.strict)(false);
                return;
        }
        return this.fight.getSideUnitsByPos(side, poses, sel.die);
    }
    selectTargetsPos(attack, des, sel) {
        let v1 = sel.target === struct_1.TargetSelectEnum.attackside ? attack : des;
        if (v1) {
            if (sel.shape == struct_1.MapShapeEnum.one) {
                return [v1];
            }
            if (sel.shape == struct_1.MapShapeEnum.all) {
                return this.fight.getSideUnitsDie((0, struct_1.DesSide)(v1.side), sel.die);
            }
            return this.selectTargetsShape(v1, sel);
        }
    }
    genMap() {
        const maps = [];
        for (let y = 0; y < this.ny; y++) {
            const lines = [];
            for (let x = 0; x < this.nx; x++) {
                lines.push(undefined);
            }
            maps.push(lines);
        }
        return maps;
    }
    findDuiwei(attack, die) {
        const maps = this.genMap();
        // 先铺满地图.
        const deses = this.fight.getSideUnitsDie((0, struct_1.DesSide)(attack.side), die);
        if (deses.length === 0)
            return;
        for (const des of deses) {
            const [x, y] = this.getPosByIndex(des.pos);
            maps[y][x] = des;
        }
        const [ax, ay] = this.getPosByIndex(attack.pos);
        const dx = this.getDuiwei(ax);
        // 先dx, 然后往中间的x, 在往另一边的x...
        const mx = this.nx / 2;
        const delta = (dx > mx) ? -1 : 1;
        const xs = [dx];
        for (let i = 1; i < this.nx; i++) {
            xs.push(dx + i * delta);
            xs.push(dx - i * delta);
        }
        for (const x of xs) {
            if (x < 0 || x >= this.nx)
                continue;
            for (let y = 0; y < this.ny; y++) {
                const des = maps[y][x];
                if (des) {
                    return des;
                }
            }
        }
    }
    selectTargetDuiwei(attack, sel) {
        const des = this.findDuiwei(attack, sel.die);
        if (!des) {
            return;
        }
        const sel2 = { ...sel, target: struct_1.TargetSelectEnum.defendside };
        return this.selectTargetsPos(attack, des, sel2);
    }
}
exports.FightMap = FightMap;
//# sourceMappingURL=FightMap.js.map