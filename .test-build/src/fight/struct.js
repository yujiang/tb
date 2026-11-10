"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MapShapeEnum = exports.TargetSelectEnum = exports.DiedSelectEnum = exports.FightSideEnum = void 0;
exports.DesSide = DesSide;
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
    TargetSelectEnum[TargetSelectEnum["des"] = 0] = "des";
    TargetSelectEnum[TargetSelectEnum["self"] = 1] = "self";
    TargetSelectEnum[TargetSelectEnum["attackside"] = 2] = "attackside";
    TargetSelectEnum[TargetSelectEnum["defendside"] = 3] = "defendside";
    TargetSelectEnum[TargetSelectEnum["duiwei"] = 4] = "duiwei";
})(TargetSelectEnum || (exports.TargetSelectEnum = TargetSelectEnum = {}));
var MapShapeEnum;
(function (MapShapeEnum) {
    MapShapeEnum[MapShapeEnum["none"] = 0] = "none";
    MapShapeEnum[MapShapeEnum["one"] = 1] = "one";
    MapShapeEnum[MapShapeEnum["x_line"] = 2] = "x_line";
    MapShapeEnum[MapShapeEnum["y_line"] = 3] = "y_line";
    MapShapeEnum[MapShapeEnum["cross"] = 4] = "cross";
    MapShapeEnum[MapShapeEnum["all"] = 5] = "all";
})(MapShapeEnum || (exports.MapShapeEnum = MapShapeEnum = {}));
//# sourceMappingURL=struct.js.map