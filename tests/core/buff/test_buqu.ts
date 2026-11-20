import { BuffTurnEnum } from '../../../src/fight/Buffs/BuffDatas';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
	Fight,
	FightSide,
	FightAttr,
	BaseAttack,
	FightUnitMonster,
	FightLoopWest,
	FightClient,
	FightReport,
	BuffData,
	initBuffs,
	initPassives,
	OverlapEnum,
	initFightContex,
	FightCmdEnum,
	FightResultEnum,
} from '../../../src';
import { BuffBuqu } from '../../../src/fight/Buffs/Class/BuffBuqu';

const buffId = 97601,
	passiveId = 97602;

function attributes(hp: number): FightAttr {
	const base = (attack: number, rand = 0): BaseAttack => ({
		rand,
		hit: 100,
		dodge: 0,
		attack,
		defend: 0,
		hurt: 0,
		hurtP: 0,
		hurtAnti: 0,
		hurtPAnti: 0,
		critP: 0,
		critPAnit: 0,
		critDeep: 0,
		critDeepAnit: 0,
	});
	const attr = new FightAttr();
	attr.point = { hp, hpMax: 100, mp: 0, mpMax: 0 };
	attr.speed = 100;
	const group = () => ({
		base: base(80, 1),
		next: base(0),
		kill: base(0),
		spread: base(0),
		fback: base(0),
		final: { bloodP: 0, dbackP: 0, immunity: 0, immunityP: 0 },
	});
	attr.physic = group();
	attr.magic = group();
	attr.heal = base(0);
	attr.poison = base(0);
	return attr;
}

function setup(extra: Partial<BuffData> = {}) {
	initBuffs([
		{
			id: buffId,
			name: '不屈',
			desc: '每场一次，致命伤害保留1血',
			class: 'buqu',
			overlap: OverlapEnum.REPLACE,
			status: [],
			tags: [],
			magic: false,
			attackType: 'base',
			attack: {},
			final: {},
			lastTurn: 0,
			times: 1,
			event: 'beforeHurt',
			prior: 1000,
			turnType: BuffTurnEnum.thisTurn,
			skill: 0,
			skillLevel: 1,
			notRemove: true,
			dieNotRemove: true,
			...extra,
		},
	]);
	initPassives([
		{
			id: passiveId,
			name: '不屈被动',
			desc: '',
			status: [],
			tags: [],
			magic: false,
			attackType: 'base',
			attack: {},
			final: {},
			addbuff: [[buffId, 1]],
		},
	]);
	const fight = new Fight(97600, { maxTurn: 10, waitInputSec: 1, duiwei: false }, 0);
	const attacker = new FightUnitMonster(0, attributes(20), { name: '攻击者' });
	// 被动构造时添加，尚未绑定 fight。
	const unit = new FightUnitMonster(1, attributes(50), { name: '不屈者' }, [[passiveId, 1]]);
	const ally = new FightUnitMonster(2, attributes(100), { name: '队友' });
	for (const u of [attacker, unit, ally]) u.setPos(u.uid === 2 ? 1 : 0);
	const a = new FightSide(),
		b = new FightSide();
	a.units.push(attacker);
	b.units.push(unit, ally);
	fight.createSide(a, b);
	const loop = new FightLoopWest(fight),
		client = new FightClient(),
		report = new FightReport(() => {}, false);
	loop.onMsg((msgs) => {
		const wire = JSON.parse(JSON.stringify(msgs));
		client.onMsg(wire);
		report.onMsg(wire);
	});
	loop.start();
	const hurt = (amount: number) => {
		const ctx = initFightContex(fight);
		const damage = fight.resolveAction(() => unit.onHurt(attacker, 'test', amount, ctx));
		loop.bcMsg(ctx.msgs);
		assert.equal(client.checkSame(fight), true);
		return { ctx, damage };
	};
	return { fight, attacker, unit, ally, loop, client, report, hurt };
}

// 测试：非致命伤害不消耗不屈，致命伤害保留一点生命且每场只成功一次。
test('buqu: nonlethal hits preserve the charge, lethal hits leave 1 HP once per battle', () => {
	const { fight, unit, ally, loop, client, report, hurt } = setup();
	const buff = unit.findBuff(buffId);
	assert.ok(buff instanceof BuffBuqu);
	assert.equal(hurt(10).damage, 10);
	assert.equal(unit.getHp(), 40);
	assert.equal(buff.times, 1);
	const saved = hurt(1000);
	assert.equal(saved.damage, 39);
	assert.equal(unit.getHp(), 1);
	assert.equal(unit.isDied(), false);
	assert.equal(fight.win, FightResultEnum.ongoing);
	assert.equal(unit.enemyHurt.get(0), 49);
	assert.equal(unit.findBuff(buffId), undefined);
	assert.equal(unit.contextEmitter.listenerCount('beforeHurt'), 0);
	assert.equal(buff.times, 0);
	assert.ok(!saved.ctx.msgs.some((msg) => msg[0] === 'die' || msg[0] === 'heal'));
	assert.equal(saved.ctx.msgs.filter((msg) => msg[0] === 'buffTrigger').length, 1);
	assert.match(report.toString(), /\[不屈\].*保留 1 点生命/);
	assert.doesNotMatch(report.toString(), /未识别消息/);
	hurt(1);
	assert.equal(unit.isDied(), true);

	const revival = initFightContex(fight);
	unit.onRelife(ally, 'test', revival);
	unit.onHeal(ally, 'test', 50, revival);
	unit.addBuff(ally, 'test', buffId, 1, revival);
	loop.bcMsg(revival.msgs);
	assert.equal(client.checkSame(fight), true);
	// 复活并重新施加同一 Buff，也不能重新获得本场不屈机会。
	const second = hurt(1000);
	assert.equal(unit.isDied(), true);
	assert.equal(
		second.ctx.msgs.some((msg) => msg[0] === 'buffTrigger'),
		false,
	);
});

// 测试：普通减伤先执行，不屈在其后根据最终伤害判断是否致命。
test('buqu: earlier damage reduction runs before the final lethal check', () => {
	const { unit, hurt } = setup();
	// 故意在不屈之后注册，依然应该按优先级先减半。
	unit.onContex(
		'beforeHurt',
		(_unit, _ctx, _attacker, pending) => {
			pending.damage *= 0.5;
		},
		0,
	);
	assert.equal(hurt(80).damage, 40);
	assert.equal(unit.getHp(), 10);
	assert.equal(unit.findBuff(buffId)?.times, 1);
	assert.equal(hurt(80).damage, 9);
	assert.equal(unit.getHp(), 1);
});

// 测试：不屈抵挡后，吸血、反伤和贡献统计都按实际扣血计算。
test('buqu: attacks use prevented damage for lifesteal, reflection and contribution', () => {
	const { fight, attacker, unit, loop, client } = setup();
	attacker.attrOri.physic.final.bloodP = 0.5;
	unit.attrOri.physic.final.dbackP = 0.2;
	attacker.calcAttr();
	unit.calcAttr();
	const ctx = fight.processUnit(attacker, { cmd: FightCmdEnum.attack, target: unit.uid });
	assert.ok(ctx);
	loop.bcMsg(ctx.msgs);
	assert.equal(unit.getHp(), 1);
	assert.equal(unit.enemyHurt.get(attacker.uid), 49);
	assert.equal(attacker.getHp(), 35); // 20 + floor(49 * 0.5) - floor(49 * 0.2)
	assert.deepEqual(
		ctx.msgs.filter((msg) => msg[0] === 'hurt').map((msg) => msg[4]),
		[49, 9],
	);
	assert.equal(client.checkSame(fight), true);
});

// 测试：一点生命时遭受致命攻击仍消耗不屈，本次实际伤害为零。
test('buqu: a lethal hit at 1 HP consumes the charge and deals zero damage', () => {
	const { unit, loop, hurt } = setup();
	const ctx = initFightContex(unit.fight);
	unit.onHurt(unit, 'prepare', 49, ctx);
	loop.bcMsg(ctx.msgs);
	assert.equal(unit.findBuff(buffId)?.times, 1);
	assert.equal(hurt(1).damage, 0);
	assert.equal(unit.getHp(), 1);
	assert.equal(unit.isDied(), false);
	hurt(1);
	assert.equal(unit.isDied(), true);
});

// 测试：替换、驱散和自然到期都会清理不屈监听器。
test('buqu: replacement, dispel and natural expiration clean up listeners', () => {
	const { unit, ally, hurt, loop, client } = setup({ notRemove: false, lastTurn: 1 });
	const ctx = initFightContex(unit.fight);
	const old = unit.findBuff(buffId);
	unit.addBuff(ally, 'replace', buffId, 2, ctx);
	assert.notEqual(unit.findBuff(buffId), old);
	assert.equal(unit.contextEmitter.listenerCount('beforeHurt'), 1);
	unit.removeBuff(ally, 'dispel', buffId, 99, ctx);
	assert.equal(unit.contextEmitter.listenerCount('beforeHurt'), 0);
	unit.addBuff(ally, 'test', buffId, 1, ctx);
	unit.processBeforeTurn(1, ctx);
	assert.equal(unit.contextEmitter.listenerCount('beforeHurt'), 0);
	assert.equal(unit.findBuff(buffId), undefined);
	// 过期/驱散没有消耗本场触发机会，重新添加后仍可触发。
	unit.addBuff(ally, 'test', buffId, 1, ctx);
	loop.bcMsg(ctx.msgs);
	assert.equal(client.checkSame(unit.fight), true);
	assert.equal(hurt(100).damage, 49);
	assert.equal(unit.getHp(), 1);
	assert.equal(unit.contextEmitter.listenerCount('beforeHurt'), 0);
});

// 测试：复用单位进入新战斗后重新获得一次不屈机会。
test('buqu: reusing a unit in a new battle grants a new opportunity', () => {
	const { unit, attacker, ally, hurt } = setup();
	hurt(100);
	const nextFight = new Fight(97603, { maxTurn: 1, waitInputSec: 1, duiwei: false }, 0);
	const a = new FightSide(),
		b = new FightSide();
	a.units.push(attacker);
	b.units.push(unit, ally);
	nextFight.createSide(a, b);
	unit.attr.point.hp = 50;
	const ctx = initFightContex(nextFight);
	unit.addBuff(unit, 'next battle', buffId, 1, ctx);
	assert.equal(unit.onHurt(attacker, 'test', 100, ctx), 49);
	assert.equal(unit.getHp(), 1);
	assert.equal(ctx.msgs.filter((msg) => msg[0] === 'buffTrigger').length, 1);
});
