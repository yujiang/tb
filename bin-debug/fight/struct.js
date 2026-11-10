"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MapSelectEnum = exports.TargetSelectEnum = exports.DiedSelectEnum = exports.FightSideEnum = void 0;
exports.DesSide = DesSide;
exports.is_this_line = is_this_line;
exports.is_des_line = is_des_line;
exports.is_duiwei = is_duiwei;
var FightSideEnum;
(function (FightSideEnum) {
    FightSideEnum[FightSideEnum["attack"] = 0] = "attack";
    FightSideEnum[FightSideEnum["defend"] = 1] = "defend";
})(FightSideEnum || (exports.FightSideEnum = FightSideEnum = {}));
function DesSide(side) {
    return 1 - side;
}
var DiedSelectEnum;
(function (DiedSelectEnum) {
    DiedSelectEnum[DiedSelectEnum["alive"] = 0] = "alive";
    DiedSelectEnum[DiedSelectEnum["die"] = 1] = "die";
    DiedSelectEnum[DiedSelectEnum["all"] = 2] = "all";
})(DiedSelectEnum || (exports.DiedSelectEnum = DiedSelectEnum = {}));
// 比如攻击前排, 攻击后排, 攻击对位... ?
var TargetSelectEnum;
(function (TargetSelectEnum) {
    TargetSelectEnum[TargetSelectEnum["self"] = 0] = "self";
    TargetSelectEnum[TargetSelectEnum["des"] = 1] = "des";
    TargetSelectEnum[TargetSelectEnum["this_x_line"] = 10] = "this_x_line";
    TargetSelectEnum[TargetSelectEnum["this_y_line"] = 11] = "this_y_line";
    TargetSelectEnum[TargetSelectEnum["this_cross"] = 12] = "this_cross";
    TargetSelectEnum[TargetSelectEnum["this_all"] = 13] = "this_all";
    TargetSelectEnum[TargetSelectEnum["des_x_line"] = 20] = "des_x_line";
    TargetSelectEnum[TargetSelectEnum["des_y_line"] = 21] = "des_y_line";
    TargetSelectEnum[TargetSelectEnum["des_cross"] = 22] = "des_cross";
    TargetSelectEnum[TargetSelectEnum["duiwei"] = 30] = "duiwei";
    TargetSelectEnum[TargetSelectEnum["duiwei_xline"] = 31] = "duiwei_xline";
    TargetSelectEnum[TargetSelectEnum["duiwei_yline"] = 32] = "duiwei_yline";
    TargetSelectEnum[TargetSelectEnum["duiwei_cross"] = 33] = "duiwei_cross";
    TargetSelectEnum[TargetSelectEnum["des_all"] = 34] = "des_all";
    TargetSelectEnum[TargetSelectEnum["custom_start"] = 35] = "custom_start";
})(TargetSelectEnum || (exports.TargetSelectEnum = TargetSelectEnum = {}));
function is_this_line(target) {
    return target >= TargetSelectEnum.this_x_line && target <= TargetSelectEnum.this_all;
}
function is_des_line(target) {
    return target >= TargetSelectEnum.des_x_line && target <= TargetSelectEnum.des_all;
}
function is_duiwei(target) {
    return target >= TargetSelectEnum.duiwei && target <= TargetSelectEnum.duiwei_cross;
}
var MapSelectEnum;
(function (MapSelectEnum) {
    MapSelectEnum[MapSelectEnum["none"] = 0] = "none";
    MapSelectEnum[MapSelectEnum["x_line"] = 1] = "x_line";
    MapSelectEnum[MapSelectEnum["y_line"] = 2] = "y_line";
    MapSelectEnum[MapSelectEnum["cross"] = 3] = "cross";
})(MapSelectEnum || (exports.MapSelectEnum = MapSelectEnum = {}));
//# sourceMappingURL=struct.js.map