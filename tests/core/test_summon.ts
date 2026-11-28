import '../fixtures/default_skills';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import * as tb from '../../src';

function setup(Loop: typeof tb.FightLoopPC | typeof tb.FightLoopWest = tb.FightLoopPC, configure: (tables: tb.FightXlsTables) => void = () => {}) {
	const tables = tb.initAllDatas(path.join(process.cwd(), 'resource/assets/json'));
	configure(tables);
	let uid = 0;
	const fight = new tb.Fight(1, { id: 1, runaway: false, runawayGrade: 0, deathPenalty: 0, winRecover: 0, winReward: 0 }, 0);
	tb.initFightXls(tables, () => uid++, () => fight.random());
	fight.createSide(tb.createSideByXls(11004), tb.createSideByXls(11002));
	const loop = new Loop(fight), client = new tb.FightClient(), lines: string[] = [];
	const mud = new tb.FightMud(line => lines.push(line), false);
	loop.onMsg(msgs => { client.onMsg(structuredClone(msgs)); mud.onMsg(msgs); });
	loop.start(); loop.nextTurn();
	const owner = fight.getUnitById(0) as tb.FightUnitUser, old = fight.getUnitById(1);
	return { fight, loop, client, owner, old, lines };
}

for (const Loop of [tb.FightLoopPC, tb.FightLoopWest]) {
	// 召唤占主人行动并替换旧宠，初始宠物也在summons中；旧宠退出行动条，新宠次回合行动，双方客户端同步。
	test(`summon: ${Loop.name} replaces the active pet and synchronizes its entry`, () => {
		const s = setup(Loop);
		try {
			const input = { cmd: tb.FightCmdEnum.summon, summon: 9002 };
			assert.equal(s.fight.checkPC(s.owner, input), true);
			assert.equal(s.fight.checkOnline(s.owner, input), true);
			assert.deepEqual(s.fight.preparePCInput(s.owner, input), input);
			const ctx = s.fight.processUnit(s.owner, input);
			assert.ok(ctx.actionStarted);
			const pet = s.fight.getSideUnits(0).find(unit => unit instanceof tb.FightUnitSummon);
			assert.notEqual(pet, s.old);
			assert.equal(pet.user, s.owner.uid);
			assert.equal(pet.pos, s.old.pos);
			assert.equal(s.fight.hasUnit(s.old.uid), false);
			assert.equal(s.loop.actions.some(action => action.unit === s.old || action.unit === pet), false);
			s.loop.bcMsg(ctx.msgs);
			assert.ok(s.client.checkSame(s.fight));
			assert.match(s.lines.join('\n'), /刀客.*召唤.*灵狐/);
			assert.equal(s.fight.checkOnline(s.owner, { cmd: tb.FightCmdEnum.summon, summon: 9001 }), false);
			assert.equal(s.fight.checkOnline(s.owner, input), false);
			s.loop.nextTurn();
			assert.equal(s.loop.actions.some(action => action.unit === pet), true);
		} finally { s.loop.end(); }
	});
}

// 非主人、缺少或非法配置ID、初始出战宠物均不能作为备用宠物召唤，校验不分配UID或改变当前阵容。
test('summon: validates the owner and unused reserve ID before execution', () => {
	const s = setup();
	try {
		for (const summon of [undefined, -1, 1.5, 123456, 9001]) {
			assert.equal(s.fight.checkOnline(s.owner, { cmd: tb.FightCmdEnum.summon, summon }), false);
		}
		for (const actor of [s.old, s.fight.getUnitById(2)]) {
			assert.equal(s.fight.checkOnline(actor, { cmd: tb.FightCmdEnum.summon, summon: 9002 }), false);
		}
		assert.equal(s.fight.getAllUnits().length, 5);
	} finally { s.loop.end(); }
});

// 没有当前宠物时按前方优先放置，备用配置ID为0有效；宠物移除后不能重新召出。
test('summon: ID zero enters in front and cannot return after dismissal', () => {
	const s = setup(tb.FightLoopPC, tables => {
		delete tables.user[8001].fightSummon;
		tables.summon[0] = { ...tables.summon[9002], id: 0 };
		tables.user[8001].summons = [0];
	});
	try {
		const input = { cmd: tb.FightCmdEnum.summon, summon: 0 };
		assert.equal(s.fight.checkPC(s.owner, input), true);
		const ctx = s.fight.processUnit(s.owner, input);
		const pet = s.fight.getSideUnits(0).find(unit => unit instanceof tb.FightUnitSummon);
		assert.equal(pet.pos, s.owner.pos - s.fight.map.nx);
		s.loop.bcMsg(ctx.msgs);
		assert.ok(s.client.checkSame(s.fight));
		s.loop.bcMsg(s.fight.processUnit(s.owner, { cmd: tb.FightCmdEnum.dismiss, target: pet.uid }).msgs);
		assert.equal(s.fight.checkPC(s.owner, input), false);
	} finally { s.loop.end(); }
});

// 校验与执行之间备用宠物被取消时重新校验，不移除当前宠物、不生成入场消息。
test('summon: execution revalidates reserve availability', () => {
	const s = setup();
	try {
		const input = { cmd: tb.FightCmdEnum.summon, summon: 9002 };
		assert.equal(s.fight.checkOnline(s.owner, input), true);
		s.owner.summons.delete(9002);
		assert.equal(s.fight.processUnit(s.owner, input), undefined);
		assert.equal(s.fight.getUnitById(s.old.uid), s.old);
	} finally { s.loop.end(); }
});

// 没有当前宠物且己方地图已满时拒绝召唤，校验不消耗备用次数也不改变阵容。
test('summon: a full map rejects entry without consuming the reserve', () => {
	const s = setup(tb.FightLoopPC, tables => { delete tables.user[8001].fightSummon; });
	try {
		const side = s.fight.getSide(0);
		for (let pos = 0; pos < 25; pos++) {
			if (pos === s.owner.pos) continue;

			const unit = new tb.FightUnitUser(100 + pos, Object.assign(new tb.FightAttr(), structuredClone(s.owner.attrOri)), { name: '占位' });
			unit.setPos(pos); unit.setFight(s.fight, 0); side.units.push(unit);
		}
		assert.equal(s.fight.checkPC(s.owner, { cmd: tb.FightCmdEnum.summon, summon: 9002 }), false);
		assert.equal(s.owner.summons.has(9002), true);
	} finally { s.loop.end(); }
});
