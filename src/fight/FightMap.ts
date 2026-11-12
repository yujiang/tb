// 战斗地图,负责占位

import { Fight } from "./Fight";
import { FightUnit } from "./FightUnit";
import { EnemySide, DiedSelectEnum, MapShapeEnum, SelectParam, TargetSelectEnum } from "./struct";
import { strict as assert } from "node:assert";

export class FightMap {
    fight: Fight;
    nx: number;
    ny: number;
    constructor(fight: Fight, nx: number, ny: number) {
        this.fight = fight;
        this.nx = nx;
        this.ny = ny;
    }

    maxPos() {
        return this.nx * this.ny;
    }

    getPos(x: number, y: number){
        return y * this.nx + x;
    }

    // 前位，y前x不变
    beforePos(pos: number) {
        const [x, y] = this.getPosByIndex(pos);
        if (y > 0) {
            return this.getPos(x, y - 1);
        }
        return -1;
    }
    // 后位，y后x不变, -1表示没有
    afterPos(pos: number) {
        const [x, y] = this.getPosByIndex(pos);
        if (y < this.ny - 1) {
            return this.getPos(x, y + 1);
        }
        return -1;
    }

    getDuiwei(x: number){
        return (this.ny  - 1) - x;
    }

    xLine(x: number) {
        return Array.from({length: this.ny}, (_, i) => this.getPos(x, i));
    }

    yLine(y: number) {
        return Array.from({length: this.nx}, (_, i) => this.getPos(i, y));
    }

    getPosByIndex(index: number) : [number, number]{
        return [index % this.nx, Math.floor(index / this.nx)];
    }

    // 以unit为中心来计算
    selectTargetsShape(unit: FightUnit, sel:SelectParam) {        
        const side = unit.side;
        const pos = unit.pos;
        const [x,y] = this.getPosByIndex(pos);
        let poses : number[];
        switch(sel.shape) {
            case MapShapeEnum.x_line:
                poses = this.xLine(x);
                break;
            case MapShapeEnum.y_line:
                poses = this.yLine(y);
                break;
            case MapShapeEnum.cross: {
                poses = [
                    [x, y],
                    [x - 1, y],
                    [x + 1, y],
                    [x, y - 1],
                    [x, y + 1],
                ]
                    .filter(([crossX, crossY]) => crossX >= 0 && crossX < this.nx && crossY >= 0 && crossY < this.ny)
                    .map(([crossX, crossY]) => this.getPos(crossX, crossY));
                break;
            }
            default:
                assert(false);
                return;
        }
        return this.fight.getSideUnitsByPos(side, poses, sel.die);
    }

    private genMap() {
        const maps: (FightUnit|undefined)[][] = [];
        for (let y = 0; y < this.ny; y++) {
            const lines: (FightUnit|undefined)[] = []
            for (let x = 0; x < this.nx; x++) {
                lines.push(undefined);
            }
            maps.push(lines);
        }

        return maps;
    }

    findDuiwei(attack: FightUnit, die: DiedSelectEnum) {
        const maps = this.genMap();

        // 先铺满地图.
        const deses = this.fight.getSideUnitsDie(EnemySide(attack.side), die);
        if (deses.length === 0) return;

        for (const des of deses) {
            const [x,y] = this.getPosByIndex(des.pos);
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
            if (x < 0 || x >= this.nx) continue;
            for (let y = 0; y < this.ny; y++) {
                const des = maps[y][x];
                if (des) {
                    return des;
                }
            }
        }
    }


}
