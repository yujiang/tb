const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

// 全局loopType能保存并保留省略值；仅接受pc、yanyu、west，非法配置不部分更新其他字段。
test('global loop type supports pc yanyu west and rejects invalid values', () => {
	const api = require('..');
	const previous = { ...api.getFightGlobalData() };
	try {
		for (const loopType of ['pc', 'yanyu', 'west']) {
			api.setFightGlobalData({ loopType });
			assert.equal(api.getFightGlobalData().loopType, loopType);
			const fight = new api.Fight(1, { runaway: false, runawayGrade: 0, deathPenalty: 0, winRecover: 0, winReward: 0 });
			const Loop = { pc: api.FightLoopPC, yanyu: api.FightLoopYanYu, west: api.FightLoopWest }[loopType];
			assert.ok(api.createFightLoop(fight) instanceof Loop);
			api.setFightGlobalData({ waitInputSec: 12 });
			assert.equal(api.getFightGlobalData().loopType, loopType);
		}
		const before = { ...api.getFightGlobalData() };
		assert.throws(() => api.setFightGlobalData({ loopType: 'invalid', maxTurn: 999 }), /loopType/);
		assert.deepEqual(api.getFightGlobalData(), before);
	} finally { api.setFightGlobalData(previous); }
});

// 测试：包入口导出当前战斗实现，并生成可用的类型声明。
test('package entry exports the current Fight implementation and has declarations', () => {
	const pkg = require('../package.json');
	const api = require('..');
	assert.equal(typeof api.Fight, 'function');
	assert.equal(typeof api.getRunwayRate, 'function');
	assert.equal(typeof api.Fight.prototype.getResult, 'function');
	assert.equal(typeof api.Fight.prototype.getWinSide, 'function');
	assert.equal(typeof api.Fight.prototype.canRunaway, 'function');
	assert.equal(typeof api.getFightGlobalData, 'function');
	assert.equal(typeof api.setFightGlobalData, 'function');
	const battle = new api.Fight(10013305, {
		runaway: false,
		runawayGrade: 0,
		deathPenalty: 0,
		winRecover: 0,
		winReward: 0,
	});
	assert.deepEqual(battle.xls, {
		runaway: false,
		runawayGrade: 0,
		deathPenalty: 0,
		winRecover: 0,
		winReward: 0,
	});
	assert.equal(battle.globalData, api.getFightGlobalData());
	assert.equal(typeof api.initAllDatas, 'function');
	assert.equal(typeof api.createSideByXls, 'function');
	assert.equal(typeof api.initFightXls, 'function');
	assert.equal(typeof api.resolveXlsAttr, 'function');
	assert.equal(typeof api.FightLoopWest, 'function');
	assert.equal(typeof api.FightLoopYanYu, 'function');
	assert.equal(typeof api.FightLoopPC, 'function');
	assert.equal(typeof api.FightLoop.prototype.waitInputUtimate, 'undefined');
	assert.equal(typeof api.FightLoop.prototype.onInputUltimate, 'undefined');
	assert.equal(typeof api.FightLoop.prototype.onError, 'function');
	assert.equal(typeof api.FightUnit.prototype.getUltimateSkill, 'function');
	assert.equal(typeof api.FightUnitMonster.prototype.setAI, 'function');
	assert.equal(typeof api.FightUnitMonster.prototype.setExtraActions, 'function');
	assert.equal(typeof api.FightUnitMonster.prototype.setRules, 'function');
	assert.equal(typeof api.FightUnitMonster.prototype.clearRules, 'function');
	assert.equal(typeof api.FightAI, 'function');
	assert.equal(typeof api.FightBehavior, 'function');
	assert.ok(api.FightAI.prototype instanceof api.FightBehavior);
	assert.ok(api.FightRule.prototype instanceof api.FightBehavior);
	assert.equal(api.FightAI.prototype instanceof api.FightRule, false);
	assert.equal(typeof api.FightAI.prototype.getXls, 'function');
	assert.ok(api.FightAITarget.prototype instanceof api.FightAI);
	assert.equal(api.FightAICond, undefined);
	assert.equal(api.FightBehavior.prototype.getCustom, undefined);
	assert.throws(() => api.createAI({ type: 'cond' }), /Unknown AI type/);
	assert.ok(
		api.createAI({
			type: 'target',
			self: true,
			cond: 'hpLow',
			condData: 0.5,
			skill: 10012101,
		}) instanceof api.FightAITarget,
	);
	assert.equal(typeof api.createLethalSkillData, 'function');
	assert.equal(api.createLethalSkillData(10011701).alwaysHit, true);
	assert.equal(api.createLethalSkillData(10011702, true).magic, true);
	assert.equal(typeof api.FightSide.prototype.getContributions, 'function');
	assert.equal(typeof api.createAI, 'function');
	assert.ok(api.MonsterSide.prototype instanceof api.FightSide);
	for (const name of [
		'CreateMonsterSide',
		'initMonsters',
		'getMonsterData',
		'initZhens',
		'getZhenPos',
		'createRule',
	]) {
		assert.equal(typeof api[name], 'function');
	}
	for (const name of ['FightRuleHp', 'FightRuleTurn', 'FightRuleHurt']) {
		assert.ok(api[name].prototype instanceof api.FightRule);
	}
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
	assert.deepEqual(
		[api.BuffTurnEnum.thisTurn, api.BuffTurnEnum.inputTurn, api.BuffTurnEnum.afterTurn],
		[0, 1, 2],
	);
	assert.equal(typeof api.BuffRelife, 'function');
	assert.ok(api.BuffRelife.prototype instanceof api.FightBuff);
	assert.equal(typeof api.BuffTaunt, 'function');
	assert.ok(api.BuffTaunt.prototype instanceof api.FightBuff);
	assert.equal(typeof api.BuffReflect, 'function');
	assert.ok(api.BuffReflect.prototype instanceof api.FightBuff);
	assert.equal(typeof api.BuffRest, 'function');
	assert.ok(api.BuffRest.prototype instanceof api.FightBuff);
	assert.ok(fs.existsSync(path.join(__dirname, '..', pkg.types)));
	const f = new api.Fight(1, { maxTurn: 1, waitInputSec: 1, duiwei: false }, 42);
	assert.equal(f.fid, 1);
	assert.equal(f.turn, 0);
});
