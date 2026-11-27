import { setFightGlobalData } from '../../src/fight/Datas/FightGlobalData';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
	BaseAttack,
	Fight,
	FightAttr,
	FightClient,
	FightCmdEnum,
	FightLoopWest,
	FightReport,
	FightResultEnum,
	FightSide,
	FightUnitMonster,
	FightUnitUser,
	PropEnum,
	WeaponEnum,
	TargetSelectEnum,
	fightMsg,
	initFightContex,
	initSkills,
} from '../../src';

function attributes(hp: number, attack: number, speed: number): FightAttr {
	const base = (value: number, rand = 0): BaseAttack => ({
		attack: value,
		rand,
		hit: 100,
		dodge: 0,
		parry: 0,
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
	attr.speed = speed;
	attr.point = { hp, hpMax: hp, mp: 0, mpMax: 0 };
	const group = () => ({
		base: base(attack, 1),
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

// 测试：真实两回合简报展示非弱点半伤、弱点原伤并扣盾、破盾眩晕及下一全局回合行动前回盾，逐批校验客户端。
test('report demo: weakness shield breaks, stuns and refills before the next round actions', async () => {
	console.log(
		'示例：山贼首领有 2 格盾，弱点为刀、火；拳师不命中弱点，刀客同时命中两个弱点仍只扣 1 格。\n',
	);
	const common = {
		magic: true,
		rand: 1,
		attack: {},
		final: {},
		nosupport: true,
		nodback: true,
		nofback: true,
		sel: { target: TargetSelectEnum.enemy },
	};
	initSkills([
		{ ...common, id: 1001030, name: '开山拳' },
		{ ...common, id: 1001031, name: '烈焰刀' },
		{ ...common, id: 1001032, name: '火云掌' },
	]);
	const boxer = new FightUnitUser(0, attributes(300, 80, 300), { name: '拳师' });
	const swordsman = new FightUnitUser(1, attributes(300, 100, 200), { name: '刀客' });
	const mage = new FightUnitUser(2, attributes(300, 100, 100), { name: '术士' });
	const bossAttr = attributes(480, 40, 50);
	bossAttr.shield = 2;
	bossAttr.weakProp = [PropEnum.火];
	bossAttr.weakWeapon = [WeaponEnum.刀];
	const boss = new FightUnitMonster(3, bossAttr, { name: '山贼首领' });
	boxer.attrOri.weapon = WeaponEnum.拳;
	swordsman.attrOri.weapon = WeaponEnum.刀;
	swordsman.attrOri.weaponProp = PropEnum.火;
	mage.attrOri.weaponProp = PropEnum.火;
	const allies = [boxer, swordsman, mage];
	allies.forEach((unit, i) => {
		unit.calcAttr();
		unit.addSkill(1001030 + i, 1);
		unit.setAttackSkill(1001030 + i);
	});
	const left = new FightSide(),
		right = new FightSide();
	left.units.push(...allies);
	right.units.push(boss);
	setFightGlobalData({
		protectBuff: undefined,
		allShieldBreak: false,
		maxTurn: 2,
		waitInputSec: 1,
		duiwei: false,
	});
	const fight = new Fight(
		1001030,
		{ id: 1, runaway: false, runawayGrade: 0, deathPenalty: 0, winRecover: 0, winReward: 0 },
		0,
	);
	for (const unit of [...allies, boss]) unit.setPos(unit.uid);
	fight.createSide(left, right);
	const loop = new FightLoopWest(fight),
		client = new FightClient(),
		report = new FightReport();
	const messages: fightMsg[] = [];
	let checked = 0;
	loop.onMsg((msgs) => {
		const wire = JSON.parse(JSON.stringify(msgs)) as fightMsg | fightMsg[];
		const batch = typeof wire[0] === 'string' ? [wire as fightMsg] : (wire as fightMsg[]);
		messages.push(...batch);
		client.onMsg(wire);
		report.onMsg(wire);
		if (client.sides[0].length && client.sides[1].length) {
			assert.ok(client.checkSame(fight));
			checked++;
		}
	});
	loop.start();
	assert.match(
		report.lines.find((line) => line.startsWith('防守方：')),
		/生命 480\/480，法力 0\/0，护盾 2\/2/,
	);
	assert.doesNotMatch(
		report.lines.find((line) => line.startsWith('攻击方：')),
		/护盾/,
	);
	for (const unit of [...allies, boss]) unit.speedRand = 0;
	for (let turn = 1; turn <= 2; turn++) {
		loop.nextTurn();
		const before = initFightContex(fight);
		loop.processBeforeTurn(turn, before);
		loop.bcMsg(before.msgs);
		if (turn === 2) {
			assert.equal(boss.attr.shield, 2);
			assert.equal(boss.inStatus('眩晕'), false);
			assert.equal(messages[messages.length - 1][3], 'recover');
		}
		for (const unit of [...allies, boss]) unit.input = { cmd: FightCmdEnum.attack };
		await loop.processOneTurn(turn);
		assert.equal(boss.attr.shield, 0);
		assert.equal(boss.inStatus('眩晕'), true);
		const after = initFightContex(fight);
		loop.processAfterTurn(turn, after);
		loop.bcMsg(after.msgs);
		fight.finishTurn();
	}
	loop.end();
	assert.equal(fight.result, FightResultEnum.attack);
	assert.ok(checked > 10);
	assert.deepEqual(
		messages.filter((msg) => msg[0] === 'shield').map((msg) => msg.slice(2)),
		[[1], [0], [2, 'recover'], [1], [0]],
	);
	assert.deepEqual(
		messages.filter((msg) => msg[0] === 'hurt').map((msg) => msg[4]),
		[40, 100, 100, 40, 100, 100],
	);
	assert.ok(!messages.some((msg) => msg[0] === 'skill' && msg[2] === boss.uid));
	const secondTurn = messages.findIndex((msg) => msg[0] === 'turn' && msg[1] === 2);
	const recovered = messages.findIndex((msg) => msg[0] === 'shield' && msg[3] === 'recover');
	const nextActor = messages.findIndex((msg, i) => i > secondTurn && msg[0] === 'actor');
	assert.ok(secondTurn < recovered && recovered < nextActor);
	assert.doesNotMatch(report.toString(), /未识别消息/);
	assert.ok(client.checkSame(fight));
});
