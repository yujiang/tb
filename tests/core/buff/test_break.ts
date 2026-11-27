import { setFightGlobalData } from '../../../src/fight/Datas/FightGlobalData';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
	FightUnitEvent,
	FightCmdEnum,
	TargetSelectEnum,
	PropEnum,
	WeaponEnum,
	initSkills,
	initBuffs,
	getBuffData,
	initFightContex,
} from '../../../src';
import { setupChain, chainIds } from '../../fixtures/skill_chain';

const event: FightUnitEvent = 'break';
function setup(shield = 1) {
	const s = setupChain({
		rootSelfBuff: false,
		finalReactions: false,
		change: (skills) => {
			skills[0].combo = undefined;
			skills[0].damageRate = 1;
		},
	});
	s.target.attrOri.shield = shield;
	s.target.attrOri.weakProp = [PropEnum.金];
	s.actor.attrOri.weaponProp = PropEnum.金;
	s.actor.calcAttr();
	s.target.calcAttr();
	s.client.onMsg(['side', 1, s.fight.getSide(1).units.map((unit) => unit.getUnitMsg())]);
	return s;
}

// 测试：破盾向上下文、普通和全局监听发送同一单位、上下文及攻击者，优先级按既有规则执行。
test('break: context, unit and fight listeners receive the shield break', () => {
	const s = setup(2),
		calls: string[] = [];
	let received: unknown;
	s.target.onContex(
		event,
		(unit, ctx, attacker, allBroken) => {
			assert.equal(unit, s.target);
			assert.equal(attacker, s.actor);
			assert.equal(unit.attr.shield, 0);
			assert.equal(allBroken, false); // 另一存活敌人未配盾，此时不算全体破盾。
			assert.deepEqual(ctx.msgs[ctx.msgs.length - 1], ['shield', s.target.uid, 0]);
			received = ctx;
			calls.push('first');
		},
		-1,
	);
	s.target.onContex(event, () => calls.push('second'));
	s.target.on(event, (unit, ctx, attacker) => {
		assert.equal(unit, s.target);
		assert.equal(ctx, received);
		assert.equal(attacker, s.actor);
		calls.push('unit');
	});
	s.fight.onUnitEvent(event, (unit, ctx, attacker) => {
		assert.equal(unit, s.target);
		assert.equal(ctx, received);
		assert.equal(attacker, s.actor);
		calls.push('fight');
	});
	s.cast();
	assert.deepEqual(calls, []);
	const ctx = s.cast();
	assert.equal(received, ctx);
	assert.deepEqual(calls, ['first', 'second', 'unit', 'fight']);
	s.cast();
	assert.equal(calls.length, 4);
	s.loop.nextTurn();
	const before = initFightContex(s.fight);
	s.loop.processBeforeTurn(2, before);
	s.flush(before);
	assert.equal(calls.length, 4);
	s.cast();
	s.cast();
	assert.equal(calls.length, 8);
});

// 测试：普通次数 Buff 可使用 break 事件，破盾后消耗次数、发移除消息并解绑，回盾后不残留旧监听。
test('break: a count-limited buff expires through the existing event lifecycle', () => {
	const s = setup(),
		buffId = 1001080;
	initBuffs([
		{
			...getBuffData(chainIds.rest),
			id: buffId,
			class: undefined,
			name: '破盾次数',
			event,
			times: 1,
			lastTurn: 0,
			notRemove: false,
		},
	]);
	const added = initFightContex(s.fight);
	s.target.addBuff(s.actor, 'test', buffId, 1, added);
	s.flush(added);
	assert.equal(s.target.contextEmitter.listenerCount(event), 1);
	const ctx = s.cast();
	assert.equal(s.target.findBuff(buffId), undefined);
	assert.equal(s.target.contextEmitter.listenerCount(event), 0);
	assert.ok(
		ctx.msgs.some((msg) => msg[0] === 'removeBuff' && msg[1] === 'times' && msg[4] === buffId),
	);
	assert.equal(s.target.attr.shield, 0);
	assert.ok(s.client.checkSame(s.fight));
});

// 测试：未发动、未命中和取消的伤害不破盾，不发 break 事件。
test('break: failed, missed and cancelled attacks do not emit', () => {
	const s = setup();
	let calls = 0;
	s.target.onContex(event, () => {
		calls++;
	});
	s.skills[0].rand = 0;
	s.cast();
	s.skills[0].rand = 1;
	s.skills[0].magic = false;
	s.actor.attr.physic.base.hit = 0;
	s.cast();
	s.skills[0].magic = true;
	s.target.onContex('beforeHurt', (_unit, _ctx, _attacker, pending) => {
		pending.cancelled = true;
	});
	s.cast();
	assert.equal(calls, 0);
	assert.equal(s.target.attr.shield, 1);
});

// 测试：最后一面盾破碎的事件已发生，即使 break 监听者立刻回盾，也不取消全体破盾的大招触发。
test('break: buff reactions cannot erase the last-shield-break event', () => {
	const s = setup();
	const ultimateId = 1001750;
	initSkills([{ ...s.skills[0], id: ultimateId, combo: undefined }]);
	s.actor.addSkill(ultimateId, 1);
	s.actor.setUltimateSkill(ultimateId);
	setFightGlobalData({ allShieldBreak: true });
	const initial = initFightContex(s.fight);
	s.other.onHurt(s.actor, 'test', 1000, initial);
	s.flush(initial);
	s.target.onContex(event, (unit, ctx) => {
		unit.attr.shield = 1;
		ctx.msgs.push(['shield', unit.uid, 1, 'recover']);
	});
	const ctx = s.cast();
	assert.equal(s.target.attr.shield, 1);
	assert.equal(ctx.msgs.filter((msg) => msg[0] === 'actor' && msg[3] === 'ultimate').length, 1);
	assert.ok(s.client.checkSame(s.fight));
});

// Boss每次破盾只增加下次回满层数，回盾时客户端同步从3层成长到6层、9层。
test('break: shieldAdd syncs the new maximum at each break and refills next turn', () => {
	const s = setup(3);
	s.target.setRules([{ type: 'shieldAdd', shieldAdd: 3 }]);
	const hit = () => {
		const ctx = initFightContex(s.fight);
		s.fight.resolveAction(() => s.target.onHurt(s.actor, 'test', 2, ctx, { weakPoint: true }));
		s.flush(ctx);
	};
	for (const [layers, next] of [
		[3, 6],
		[6, 9],
	]) {
		for (let i = 0; i < layers; i++) hit();
		assert.equal(s.target.attr.shield, 0);
		assert.equal(s.client.getUnitById(s.target.uid).shieldMax, next);
		assert.equal(s.target.getUnitMsg().shieldMax, next);
		hit();
		assert.equal(s.target.attr.shield, 0);
		s.loop.nextTurn();
		const ctx = initFightContex(s.fight);
		s.loop.processBeforeTurn(s.fight.turn, ctx);
		s.flush(ctx);
		assert.equal(s.target.attr.shield, next);
		assert.equal(s.client.getUnitById(s.target.uid).shieldMax, next);
	}
	assert.equal(s.target.attrOri.shield, 3);
});

// 怪物初始隐藏弱点，未命中或取消不揭示，命中的五行和兵器只揭示匹配项各一次。
test('break: client discovers only the weaknesses actually hit', () => {
	const s = setup(6);
	s.target.attrOri.weakProp = [PropEnum.火, PropEnum.水];
	s.target.attrOri.weakWeapon = [WeaponEnum.刀, WeaponEnum.枪];
	s.target.calcAttr();
	s.client.onMsg(['side', 1, s.fight.getSide(1).units.map((unit) => unit.getUnitMsg())]);
	const client = () => s.client.getUnitById(s.target.uid);
	assert.equal(client().revealedWeakProp, undefined);
	assert.equal(client().revealedWeakWeapon, undefined);
	s.skills[0].skillProp = PropEnum.火;
	s.actor.attr.weapon = WeaponEnum.刀;
	s.skills[0].rand = 0;
	assert.ok(!s.cast().msgs.some((msg) => msg[0] === 'weakness'));
	s.skills[0].rand = 1;
	let cancel = true;
	s.target.onContex('beforeHurt', (_unit, _ctx, _attacker, pending) => {
		pending.cancelled = cancel;
	});
	assert.ok(!s.cast().msgs.some((msg) => msg[0] === 'weakness'));
	cancel = false;
	assert.deepEqual(
		s.cast().msgs.filter((msg) => msg[0] === 'weakness'),
		[
			['weakness', s.target.uid, 'prop', PropEnum.火],
			['weakness', s.target.uid, 'weapon', WeaponEnum.刀],
		],
	);
	assert.deepEqual(client().revealedWeakProp, [PropEnum.火]);
	assert.deepEqual(client().revealedWeakWeapon, [WeaponEnum.刀]);
	assert.ok(!s.cast().msgs.some((msg) => msg[0] === 'weakness'));
	s.skills[0].skillProp = PropEnum.水;
	s.actor.attr.weapon = WeaponEnum.none;
	s.cast();
	assert.deepEqual(client().revealedWeakProp, [PropEnum.火, PropEnum.水]);
	assert.deepEqual(client().revealedWeakWeapon, [WeaponEnum.刀]);
});

// 每次成功观察一次性同步目标的完整弱点，可用空列表明确表示没有弱点。
test('observe: reveals all weaknesses on the selected enemy without damage', () => {
	const s = setup(3);
	const id = 1001751;
	initSkills([
		{
			id,
			name: '观察',
			func: 'observe',
			magic: false,
			rand: 1,
			sel: { target: TargetSelectEnum.enemy },
			attack: {},
			final: {},
		},
	]);
	s.actor.addSkill(id, 1);
	s.target.attrOri.weakProp = [PropEnum.金, PropEnum.火];
	s.target.attrOri.weakWeapon = [WeaponEnum.刀];
	s.target.calcAttr();
	s.cast();
	const hp = s.target.getHp();
	const shield = s.target.attr.shield;
	const observe = () => {
		const ctx = s.fight.processUnit(s.actor, {
			cmd: FightCmdEnum.skill,
			skill: id,
			target: s.target.uid,
		});
		assert.ok(ctx);
		s.flush(ctx);
		return ctx.msgs;
	};
	const msgs = observe();
	const weaknessAll = ['weaknessAll', s.target.uid, [PropEnum.金, PropEnum.火], [WeaponEnum.刀]];
	assert.deepEqual(
		msgs.filter((msg) => msg[0] === 'weaknessAll'),
		[weaknessAll],
	);
	assert.ok(!msgs.some((msg) => msg[0] === 'weakness'));
	assert.ok(msgs.some((msg) => msg[0] === 'skill' && msg[1] === id));
	assert.equal(s.target.getHp(), hp);
	assert.equal(s.target.attr.shield, shield);
	assert.deepEqual(s.client.getUnitById(s.target.uid).revealedWeakProp, [
		PropEnum.金,
		PropEnum.火,
	]);
	assert.deepEqual(s.client.getUnitById(s.target.uid).revealedWeakWeapon, [WeaponEnum.刀]);
	assert.deepEqual(
		observe().filter((msg) => msg[0] === 'weaknessAll'),
		[weaknessAll],
	);
	s.target.attrOri.weakProp = undefined;
	s.target.attrOri.weakWeapon = undefined;
	s.target.calcAttr();
	assert.deepEqual(
		observe().filter((msg) => msg[0] === 'weaknessAll'),
		[['weaknessAll', s.target.uid, [], []]],
	);
	assert.deepEqual(s.client.getUnitById(s.target.uid).revealedWeakProp ?? [], []);
	assert.deepEqual(s.client.getUnitById(s.target.uid).revealedWeakWeapon ?? [], []);
});
