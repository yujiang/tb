import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { Fight, getFightGlobalData, getYanyuGlobalData, setFightGlobalData } from '../../src';

// 测试：全局设置提供完整默认值，每场表格数据仅保存自己的逃跑开关。
test('fight global data: complete defaults are separate from table rows', () => {
	assert.deepEqual(getFightGlobalData(), {
		maxTurn: 0,
		waitInputSec: 30,
		duiwei: false,
		jiqi: false,
		attackDie: true,
		protectBuff: undefined,
		allShieldBreak: false,
		loopType: 'pc',
		jpAdd: 1,
		spHurtRate: 0,
		spOutputRate: 0,
		defaultAttackSkill: 0,
		defaultProtectSkill: 0,
		defaultFBackSkill: 0,
	});
	const fight = new Fight(10013301, {
		id: 1, runaway: false,
		runawayGrade: 0,
		deathPenalty: 0,
		winRecover: 0,
		winReward: 0,
	});
	assert.deepEqual(fight.xls, {
		id: 1, runaway: false,
		runawayGrade: 0,
		deathPenalty: 0,
		winRecover: 0,
		winReward: 0,
	});
	assert.equal(fight.globalData, getFightGlobalData());
});

// 测试：只设置一次全局规则，多个战斗直接消费各自表格行，表格中的额外同名字段不覆盖全局规则。
test('fight global data: one setup applies to multiple battles with independent table rows', () => {
	const original = { ...getFightGlobalData() };
	try {
		setFightGlobalData({
			maxTurn: 100,
			waitInputSec: 2,
			duiwei: true,
			jiqi: true,
			protectBuff: 123,
			allShieldBreak: true,
		});
		const first = new Fight(10013302, {
			id: 1, runaway: false,
			runawayGrade: 0,
			deathPenalty: 0,
			winRecover: 0,
			winReward: 0,
		});
		const row = {
			id: 1, runaway: true,
			runawayGrade: 0,
			deathPenalty: 0,
			winRecover: 0,
			winReward: 0,
			maxTurn: 999,
			duiwei: false,
		};
		const second = new Fight(10013303, row);
		assert.equal(first.xls.runaway, false);
		assert.equal(second.xls.runaway, true);
		assert.equal(first.globalData, second.globalData);
		assert.equal(first.globalData.maxTurn, 100);
		assert.equal(second.globalData.maxTurn, 100);
		assert.equal(second.globalData.duiwei, true);
		assert.equal(second.globalData.jiqi, true);
		assert.equal(second.globalData.protectBuff, 123);
		assert.equal(second.globalData.allShieldBreak, true);
	} finally {
		setFightGlobalData(original);
	}
});

// 测试：按字段更新保留省略值，0/false及清除保护Buff均有效，所有场次统一读取同一份规则。
test('fight global data: partial updates preserve omissions and accept explicit zero and false', () => {
	const original = { ...getFightGlobalData() };
	try {
		setFightGlobalData({
			maxTurn: 5,
			waitInputSec: 2,
			duiwei: true,
			protectBuff: 123,
			allShieldBreak: true,
		});
		const fight = new Fight(10013304, {
			id: 1, runaway: false,
			runawayGrade: 0,
			deathPenalty: 0,
			winRecover: 0,
			winReward: 0,
		});
		setFightGlobalData({
			maxTurn: 0,
			waitInputSec: 0,
			duiwei: false,
			protectBuff: undefined,
			allShieldBreak: false,
		});
		setFightGlobalData({ maxTurn: 10 });
		assert.deepEqual(fight.globalData, {
			maxTurn: 10,
			waitInputSec: 0,
			duiwei: false,
			jiqi: false,
			attackDie: true,
			protectBuff: undefined,
			allShieldBreak: false,
		loopType: 'pc',
			jpAdd: 1,
			spHurtRate: 0,
			spOutputRate: 0,
		defaultAttackSkill: 0,
		defaultProtectSkill: 0,
		defaultFBackSkill: 0,
		});
	} finally {
		setFightGlobalData(original);
	}
});

// 测试：集气配置可设为true、按字段更新时保留，显式false关闭，设置后各场战斗读取同一值。
test('fight global data: jiqi supports updates, omissions and explicit false', () => {
	const original = { ...getFightGlobalData() };
	try {
		setFightGlobalData({ jiqi: true });
		assert.equal(getFightGlobalData().jiqi, true);
		setFightGlobalData({ maxTurn: 5 });
		assert.equal(getFightGlobalData().jiqi, true);
		const fight = new Fight(10013305, {
			id: 1, runaway: false,
			runawayGrade: 0,
			deathPenalty: 0,
			winRecover: 0,
			winReward: 0,
		});
		assert.equal(fight.globalData.jiqi, true);
		setFightGlobalData({ jiqi: false });
		assert.equal(fight.globalData.jiqi, false);
	} finally {
		setFightGlobalData(original);
	}
});

// 测试：烟雨预设返回独立配置，显式应用后开启对位与集气、关闭守尸输入，并保留其余字段。
test('fight global data: yanyu preset is independent and applies duiwei and jiqi', () => {
	const original = { ...getFightGlobalData() };
	try {
		const preset = getYanyuGlobalData();
		assert.deepEqual(preset, { loopType: 'yanyu', duiwei: true, jiqi: true, attackDie: false });
		assert.deepEqual(getFightGlobalData(), original);
		preset.jiqi = false;
		assert.equal(getYanyuGlobalData().jiqi, true);
		setFightGlobalData({ maxTurn: 8, waitInputSec: 2, duiwei: false, jiqi: false });
		setFightGlobalData(getYanyuGlobalData());
		assert.equal(getFightGlobalData().duiwei, true);
		assert.equal(getFightGlobalData().jiqi, true);
		assert.equal(getFightGlobalData().attackDie, false);
		assert.equal(getFightGlobalData().maxTurn, 8);
		assert.equal(getFightGlobalData().waitInputSec, 2);
	} finally {
		setFightGlobalData(original);
	}
});
