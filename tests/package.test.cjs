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
    assert.ok(fs.existsSync(path.join(__dirname, '..', pkg.types)));
    const f = new api.Fight(1, {maxTurn: 1, waitInputSec: 1, duiwei: false}, 42);
    assert.equal(f.fid, 1);
    assert.equal(f.turn, 0);
});
