import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
	BuffData,
	FightCmdEnum,
	FightLoopPC,
	FightLoopWest,
	FightLoopYanYu,
	FightRule,
	FightAttr,
	FightUnit,
	getBuffData,
	initBuffs,
	initFightContex,
} from '../../src';
import { setupChain, chainIds } from '../fixtures/skill_chain';
import { EmptyAI } from '../fixtures/empty_ai';

const slow = 10015001,
	fast = 10015002;
function setup() {
	const s = setupChain({ rootSelfBuff: false, finalReactions: false });
	initBuffs(
		[slow, fast].map((id): BuffData => ({
			...getBuffData(chainIds.rest),
			id,
			class: undefined,
			attack: undefined,
			final: undefined,
			lastTurn: 0,
			notRemove: false,
			attr: { speed: id === slow ? -150 : 200 },
		})),
	);
	return s;
}

// 测试：连续增删属性 Buff 在首次读取前不重算，读取时合并一次并保留资源和盾。
test('attributes: buff changes are calculated once on demand', () => {
	const { actor, fight } = setup();
	actor.attrOri.shield = 3;
	actor.calcAttr();
	Object.assign(actor.attr.point, { hp: 321, mp: 42, sp: 7, jp: 8 });
	actor.attr.shield = 1;
	const speed = actor.attr.speed;
	let calculations = 0;
	actor.on('attr', () => calculations++);
	const ctx = initFightContex(fight);
	actor.addBuff(actor, 'test', slow, 1, ctx);
	actor.addBuff(actor, 'test', fast, 1, ctx);
	actor.removeBuff(actor, 'test', slow, 999, ctx);
	assert.equal(calculations, 0);
	assert.equal(actor.attr.speed, speed + 200);
	assert.equal(calculations, 1);
	assert.equal(actor.attr.point.hp, 321);
	assert.equal(actor.attr.point.mp, 42);
	assert.equal(actor.attr.point.sp, 7);
	assert.equal(actor.attr.point.jp, 8);
	assert.equal(actor.attr.shield, 1);
	assert.equal(calculations, 1);
});

// 测试：被动、AI与规则的连续修改合并计算，扩展及事件中读取 attr 不递归，移除后恢复。
test('attributes: passive AI and rule changes are lazy and callbacks can read attributes', () => {
	const { target } = setup();
	const baseSpeed = target.attr.speed;
	let calculations = 0;
	class SpeedAI extends EmptyAI {
		override modifyAttr(unit: FightUnit, attr: FightAttr) {
			assert.equal(unit.attr, attr);
			attr.speed += 10;
		}
	}
	class SpeedRule extends FightRule {
		override modifyAttr(unit: FightUnit, attr: FightAttr) {
			assert.equal(unit.attr, attr);
			attr.speed += 5;
		}
	}
	target.on('attr', () => {
		calculations++;
		assert.equal(target.attrDirty, false);
		assert.ok(target.attr.speed > 0);
	});
	target.on('speed', (_unit, speed) => assert.equal(target.attr.speed, speed));
	target.setPassiveSkills([]);
	target.ai = new SpeedAI();
	const rule = new SpeedRule();
	target.addRule(rule);
	assert.equal(calculations, 0);
	assert.equal(target.attr.speed, baseSpeed + 15);
	assert.equal(calculations, 1);
	target.removeRule(rule);
	target.ai = undefined;
	assert.equal(calculations, 1);
	assert.equal(target.attr.speed, baseSpeed);
	assert.equal(calculations, 2);
});

for (const [Loop, readDuringAction] of [FightLoopWest, FightLoopPC, FightLoopYanYu].flatMap(
	(Loop) => [false, true].map((read) => [Loop, read] as const),
)) {
	// 测试：三种循环在完整行动后刷新所有脏单位，并在下一行动出队前按新速度排序。
	test(`attributes: ${Loop.name} flushes after an action with early read=${readDuringAction}`, async () => {
		const s = setup();
		s.loop.end();
		for (const [unit, speed] of [
			[s.actor, 300],
			[s.target, 200],
			[s.other, 100],
		] as const) {
			unit.attrOri.speed = speed;
			unit.calcAttr();
			unit.input = { cmd: FightCmdEnum.defend };
		}
		const loop = new Loop(s.fight);
		let calculations = 0;
		const actors: number[] = [];
		loop.onMsg((msgs) => {
			const batch = Array.isArray(msgs[0]) ? msgs : [msgs];
			for (const msg of batch) {
				if (msg[0] === 'actor') {
					actors.push(msg[1]);
					assert.equal(calculations, actors.length === 1 && Loop === FightLoopPC ? 0 : 2);
				}
			}
		});
		loop.on('input', (unit) => loop.onInput(unit.uid, { cmd: FightCmdEnum.defend }));
		loop.start();
		loop.nextTurn();
		for (const unit of s.fight.getAllUnits()) unit.speedRand = 0;
		s.target.on('attr', () => calculations++);
		s.other.on('attr', () => calculations++);
		const process = s.fight.processUnit.bind(s.fight);
		s.fight.processUnit = (unit, input) => {
			const ctx = process(unit, input);
			if (unit === s.actor) {
				s.target.addBuff(unit, 'test', slow, 1, ctx);
				s.other.addBuff(unit, 'test', fast, 1, ctx);
				assert.equal(calculations, 0);
				// 即便动作内部读取触发计算，也等完整动作结束后再调整行动条。
				if (readDuringAction) {
					s.target.getSpeed();
					s.other.getSpeed();
				}
				assert.deepEqual(
					loop.processUnits.map((unit) => unit.uid),
					[s.target.uid, s.other.uid],
				);
			}
			return ctx;
		};
		await loop.processOneTurn(s.fight.turn);
		assert.deepEqual(actors, [s.actor.uid, s.other.uid, s.target.uid]);
		assert.equal(calculations, 2);
		loop.end();
	});
}
