import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
	Fight, FightContex, FightUnit, PendingHurt, PendingHeal, initFightContex,
	UnitEventArgs, UnitContextEventFunc,
} from '../../src';
import { setupChain } from '../fixtures/skill_chain';

function expectType<T>(_value: T): void {}

// 此函数只参与编译检查，不实际发送非法事件。
function checkEventTypes(unit: FightUnit, fight: Fight, ctx: FightContex) {
	unit.onContex('beforeHurt', (target, received, attacker, pending) => {
		expectType<FightUnit>(target);
		expectType<FightContex>(received);
		expectType<FightUnit>(attacker);
		expectType<PendingHurt>(pending);
		pending.damage = 1;
		// @ts-expect-error 受伤前参数不是治疗量。
		pending.heal = 2;
	});
	unit.onContex('beforeHeal', (_unit, _ctx, _healer, pending) => {
		expectType<PendingHeal>(pending);
		pending.heal = 1;
	});
	unit.onContex('hurt', (_unit, _ctx, _attacker, damage, pending) => {
		expectType<number>(damage);
		// @ts-expect-error 已结算的伤害信息只供读取，不通过它修改扣血结果。
		pending.damage = 2;
	});
	const handler: UnitContextEventFunc<'beforeHurt'> = (...[_unit, _ctx, _attacker, pending]: UnitEventArgs<'beforeHurt'>) => {
		pending.damage = 1;
	};
	unit.onContex('beforeHurt', handler);
	unit.offContex('beforeHurt', handler);
	// @ts-expect-error 明确声明的处理器不能错绑到治疗事件。
	unit.onContex('beforeHeal', handler);
	// @ts-expect-error 解绑也检查事件与处理器契约。
	unit.offContex('beforeHeal', handler);
	unit.on('speed', (_unit, speed) => expectType<number>(speed));
	fight.onUnitEvent('hp', (_unit, received, _source, previous, current) => {
		expectType<FightContex>(received);
		expectType<number>(previous);
		expectType<number>(current);
	});
	// @ts-expect-error 受伤前必须接收PendingHurt，不能把它当作数字。
	unit.onContex('beforeHurt', (_unit, _ctx, _attacker, damage: number) => {});
	// @ts-expect-error 普通速度事件不携带上下文。
	unit.onContex('speed', () => {});
	// @ts-expect-error 速度回调的参数必须是number。
	unit.on('speed', (_unit, speed: string) => {});
	// @ts-expect-error 受伤事件要求实际伤害和pending，不能传治疗结构。
	unit.emitContext('hurt', ctx, unit, { heal: 1 });
	// @ts-expect-error 普通属性事件不能通过上下文入口发送。
	unit.emitContext('attr', ctx);
	// @ts-expect-error 普通发送入口不能绕过上下文事件流程。
	unit.emit('hp', ctx, unit, 1, 2);
	// @ts-expect-error 速度必须是number。
	unit.emit('speed', 'fast');
	// @ts-expect-error 战斗级转发也必须提供why和治疗量。
	fight.emitUnitEvent('heal', unit, ctx, unit, 5);
	// @ts-expect-error 战斗级监听同样检查实际伤害的类型。
	fight.onUnitEvent('hurt', (_unit, _ctx, _attacker, damage: string) => {});
	// @ts-expect-error 有序事件入口不能绕过参数检查。
	unit.contextEmitter.emit('beforeHurt', unit, ctx, unit, { heal: 1 });
}
void checkEventTypes;

// 类型约束不改变转发流程：优先级监听、单位普通监听、战斗监听依次收到同一上下文和参数。
test('unit event types: typed forwarding preserves parameters and listener order', () => {
	const s = setupChain();
	const ctx = initFightContex(s.fight);
	const calls: string[] = [];
	const pending: PendingHurt = { damage: 7 };
	s.actor.onContex('beforeHurt', (unit, received, attacker, value) => {
		assert.equal(unit, s.actor);
		assert.equal(received, ctx);
		assert.equal(attacker, s.target);
		assert.equal(value, pending);
		calls.push('context');
	});
	s.actor.on('beforeHurt', (_unit, received, _attacker, value) => {
		assert.equal(received, ctx);
		assert.equal(value, pending);
		calls.push('unit');
	});
	s.fight.onUnitEvent('beforeHurt', (_unit, received, _attacker, value) => {
		assert.equal(received, ctx);
		assert.equal(value, pending);
		calls.push('fight');
	});
	s.actor.emitContext('beforeHurt', ctx, s.target, pending);
	assert.deepEqual(calls, ['context', 'unit', 'fight']);
});
