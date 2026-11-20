import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { Fight, initFightContex } from '../../src';
import { setupChain } from '../fixtures/skill_chain';

// 测试：阵营按来源UID累计实际伤害和治疗，过量伤害、溢出治疗、自疗均按实际生命变化计算。
test('side contributions: actual damage and healing belong to their source side', () => {
	const { fight, actor, target, other } = setupChain({
		rootSelfBuff: false,
		actorHp: 950,
		targetHp: 10,
	});
	const ctx = initFightContex(fight),
		own = fight.getSide(actor.side),
		enemy = fight.getSide(target.side);
	actor.onHeal(actor, 'heal', 1000, ctx); // 自疗实际50，来源UID为0。
	fight.resolveAction(() => target.onHurt(actor, 'test', 99999, ctx)); // 实际扣10。
	actor.onHurt(other, 'test', 30, ctx);
	actor.onHeal(actor, 'heal', 10, ctx);
	assert.equal(own.hurt.get(0), 10);
	assert.equal(own.heal.get(0), 60);
	assert.equal(enemy.hurt.get(other.uid), 30);
	assert.equal(enemy.hurt.has(actor.uid), false);
	assert.equal(enemy.heal.size, 0);
	assert.equal(own.getContributions()[0].uid, 0);
});

// 测试：来源死亡或离场后仍保留战后个人贡献，零贡献成员也展示，导出数据不能反向修改内部记录。
test('side contributions: export retains departed contributors and returns independent rows', () => {
	const { fight, actor, target, other } = setupChain({ rootSelfBuff: false });
	const side = fight.getSide(target.side),
		ctx = initFightContex(fight);
	actor.onHurt(target, 'test', 30, ctx);
	target.die();
	side.units.splice(0, 1);
	const rows = side.getContributions();
	assert.deepEqual(rows, [
		{ uid: other.uid, hurt: 0, heal: 0 },
		{ uid: target.uid, hurt: 30, heal: 0 },
	]);
	rows[1].hurt = 9999;
	rows.pop();
	assert.equal(side.hurt.get(target.uid), 30);
	assert.equal(side.getContributions().length, 2);
});

// 测试：两方统计彼此隔离，清空和重新绑定战斗会清除旧贡献，普通清空不删除成员。
test('side contributions: resetting or binding a new battle clears prior records', () => {
	const { fight, actor, target } = setupChain({ rootSelfBuff: false });
	const own = fight.getSide(actor.side),
		enemy = fight.getSide(target.side);
	own.recordHurt(actor.uid, 10);
	own.recordHeal(actor.uid, 20);
	enemy.recordHurt(target.uid, 30);
	own.clearContributions();
	assert.deepEqual(own.getContributions(), [{ uid: actor.uid, hurt: 0, heal: 0 }]);
	assert.equal(enemy.hurt.get(target.uid), 30);
	const next = new Fight(10011800, { maxTurn: 1, waitInputSec: 1, duiwei: false });
	next.createSide(own, enemy);
	assert.equal(enemy.hurt.size, 0);
	assert.equal(enemy.heal.size, 0);
});
