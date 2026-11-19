const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

// 测试：包入口导出当前战斗实现，并生成可用的类型声明。
test('package entry exports the current Fight implementation and has declarations', () => {
    const pkg = require('../package.json');
    const api = require('..');
    assert.equal(typeof api.Fight, 'function');
    assert.equal(typeof api.FightLoopWest, 'function');
    assert.equal(typeof api.FightClient, 'function');
    assert.equal(typeof api.FightReport, 'function');
    assert.equal(typeof api.FightPreParse, 'function');
    assert.equal(typeof api.FightMud, 'function');
    assert.equal(typeof api.resolveMudText, 'function');
    assert.ok(api.FightMud.prototype instanceof api.FightReport);
    assert.equal(typeof api.OrderedEventEmitter, 'function');
    assert.equal(typeof api.BuffBuqu, 'function');
    assert.ok(api.BuffBuqu.prototype instanceof api.FightBuff);
    assert.equal(typeof api.BuffProtect, 'function');
    assert.ok(api.BuffProtect.prototype instanceof api.FightBuff);
    assert.deepEqual([api.BuffTurnEnum.thisTurn, api.BuffTurnEnum.inputTurn, api.BuffTurnEnum.afterTurn], [0, 1, 2]);
    assert.equal(typeof api.BuffRelife, 'function');
    assert.ok(api.BuffRelife.prototype instanceof api.FightBuff);
    assert.equal(typeof api.BuffTaunt, 'function');
    assert.ok(api.BuffTaunt.prototype instanceof api.FightBuff);
    assert.equal(typeof api.BuffReflect, 'function');
    assert.ok(api.BuffReflect.prototype instanceof api.FightBuff);
    assert.equal(typeof api.BuffRest, 'function');
    assert.ok(api.BuffRest.prototype instanceof api.FightBuff);
    assert.ok(fs.existsSync(path.join(__dirname, '..', pkg.types)));
    const f = new api.Fight(1, {maxTurn: 1, waitInputSec: 1, duiwei: false}, 42);
    assert.equal(f.fid, 1);
    assert.equal(f.turn, 0);
});
