// 战斗地图,负责占位

import { Fight } from "./Fight";
import { FightUnit } from "./FightUnit";
import { DesSide, DiedSelectEnum, FightSideEnum, is_duiwei, MapSelectEnum, TargetSelectEnum } from "./struct";
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

    selectTargets(attack: FightUnit, des: FightUnit, die: DiedSelectEnum, sel: TargetSelectEnum) : FightUnit[]|undefined {
        switch(sel) {
            case TargetSelectEnum.self:
                return [attack];
            case TargetSelectEnum.des:
                assert(des);
                return [des];
            case TargetSelectEnum.this_all:
                return this.fight.getSideUnitsDie(attack.side, die);
            case TargetSelectEnum.des_all:
                return this.fight.getSideUnitsDie(DesSide(attack.side), die);
        }

        if (is_duiwei(sel)){
            return this.selectTargetDuiwei(attack, die, sel);
        }
        return this.selectTargetsPos(attack, des, die, sel);
    }

    // 以unit为中心来计算
    private selectTargetsMap(unit: FightUnit, die: DiedSelectEnum, sel: MapSelectEnum) {        
        const side = unit.side;
        const pos = unit.pos;
        const [x,y] = this.getPosByIndex(pos);
        let poses : number[];
        switch(sel) {
            case MapSelectEnum.x_line:
                poses = this.xLine(x);
                break;
            case MapSelectEnum.y_line:
                poses = this.yLine(y);
                break;
            default:
                assert(false);
                return;
        }
        return this.fight.getSideUnitsByPos(side, poses, die);
    }

    selectTargetsPos(attack: FightUnit, des: FightUnit, die: DiedSelectEnum, sel: TargetSelectEnum)  {        
        let v1 : FightUnit
        let mapsel = MapSelectEnum.none;
        switch(sel) {
            case TargetSelectEnum.this_x_line:
                v1 = attack;
                mapsel = MapSelectEnum.x_line;
                break;
            case TargetSelectEnum.this_y_line:
                v1 = attack;
                mapsel = MapSelectEnum.y_line;
                break;
            case TargetSelectEnum.this_cross:
                v1 = attack;
                mapsel = MapSelectEnum.cross;
                break;

            case TargetSelectEnum.des_x_line:
                v1 = des;
                mapsel = MapSelectEnum.x_line;
                break;
            case TargetSelectEnum.des_y_line:
                v1 = des;
                mapsel = MapSelectEnum.y_line;
                break;
            case TargetSelectEnum.des_cross:
                v1 = des;
                mapsel = MapSelectEnum.cross;
                break;
        }
        if (mapsel) {
            return this.selectTargetsMap(des, die, MapSelectEnum.x_line);
        }
    }

    genMap() {
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
        const deses = this.fight.getSideUnitsDie(DesSide(attack.side), die);
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

    selectTargetDuiwei(attack: FightUnit, die: DiedSelectEnum, sel: TargetSelectEnum){
        const des = this.findDuiwei(attack, die);
        if (!des) {
            return;
        }
        let mapsel = MapSelectEnum.none;
        switch(sel) {
            case TargetSelectEnum.duiwei:
                return [des];
            case TargetSelectEnum.duiwei_xline:
                mapsel = MapSelectEnum.x_line;
                break;
            case TargetSelectEnum.duiwei_yline:
                mapsel = MapSelectEnum.y_line;
                break;                            
            case TargetSelectEnum.duiwei_cross:
                mapsel = MapSelectEnum.cross;
                break;                            
        }
        if (mapsel) {
            return this.selectTargetsMap(des, die, mapsel);
        }
    }    
}
