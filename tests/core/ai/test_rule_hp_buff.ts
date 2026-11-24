import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
	FightRuleHp,
	HpAxisLine,
	FightAttr,
	FightUnitMonster,
	initBuffs,
	initFightContex,
	OverlapEnum,
	getBuffData,
} from '../../../src';
import { setupChain } from '../../fixtures/skill_chain';

const firstBuff = 10018001,
	secondBuff = 10018002,
	thirdBuff = 10018003;
function setup() {
	const s = setupChain({ rootSelfBuff: false, finalReactions: false });
	initBuffs([
		{
			id: firstBuff,
			name: '一阶段',
			desc: '',
			magic: true,
			attackType: 'base',
			attack: { attack: 20 },
			final: {},
			attr: { speed: 10 },
			attrLevel: { speed: 5 },
			status: [],
			tags: [],
			overlap: OverlapEnum.NOT,
			lastTurn: 0,
			times: 2,
			event: 'hurt',
			notRemove: true,
			power: 99999,
			dieNotRemove: true,
		},
		{
			id: secondBuff,
			name: '二阶段',
			desc: '',
			magic: true,
			attackType: 'base',
			attack: { attack: 80 },
			final: {},
			attr: { speed: 40 },
			status: ['封印'],
			tags: [],
			overlap: OverlapEnum.NOT,
			lastTurn: 0,
			times: 0,
			event: 'hurt',
			dieNotRemove: true,
		},
	]);
	initBuffs([{ ...getBuffData(secondBuff), id: thirdBuff, name: '三阶段' }]);
	const hurt = (damage: number) => {
		const ctx = initFightContex(s.fight);
		s.fight.resolveAction(() =>
			s.target.onHurt(s.actor, 'test', damage, ctx, { source: 'share' }),
		);
		s.flush(ctx);
		return ctx;
	};
	return { ...s, hurt };
}
function rule(lines: { hp: number; buff: [number, number] }[]) {
	return new FightRuleHp({ type: 'hp', lines });
}

// 血线使用Buff表达属性和状态；切换阶段必须先强制移除旧Buff，再添加新Buff，消息及客户端同步一致。
test('HP buff: phase changes remove the old buff before adding the next one', () => {
	const s = setup();
	s.target.addRule(
		rule([
			{ hp: 0.7, buff: [firstBuff, 2] },
			{ hp: 0.4, buff: [secondBuff, 0] },
		]),
	);
	s.hurt(350);
	assert.equal(s.target.findBuff(firstBuff)?.level, 2);
	assert.equal(s.target.attr.magic.base.attack, 120);
	assert.equal(s.target.attr.speed, s.target.attrOri.speed + 20);
	assert.equal(s.target.contextEmitter.listenerCount('hurt'), 1);
	let checkedOrder = false;
	s.target.onContex('addBuff', (unit, _ctx, _attacker, _why, buff) => {
		if (buff.getId() === secondBuff) {
			checkedOrder = true;
			assert.equal(unit.findBuff(firstBuff), undefined);
			assert.equal(unit.contextEmitter.listenerCount('hurt'), 0);
		}
	});
	const ctx = s.hurt(300);
	assert.equal(checkedOrder, true);
	assert.equal(s.target.findBuff(firstBuff), undefined);
	assert.equal(s.target.findBuff(secondBuff)?.level, 0);
	assert.equal(s.target.attr.magic.base.attack, 180);
	assert.equal(s.target.attr.speed, s.target.attrOri.speed + 40);
	assert.equal(s.target.isForbid('skill'), true);
	assert.deepEqual(
		ctx.msgs
			.filter((msg) => msg[0] === 'removeBuff' || msg[0] === 'addBuff')
			.map((msg) => [msg[0], msg[4]]),
		[
			['removeBuff', firstBuff],
			['addBuff', secondBuff],
		],
	);
	assert.equal(s.target.attrOri.magic.base.attack, 100);
	assert.ok(s.client.checkSame(s.fight));
	s.loop.end();
});

// 一次扣血直接进入c阶段，只添加c，不触发a/b的添加、移除或阶段表现消息。
test('HP buff: a large hit jumps directly to the deepest threshold', () => {
	const s = setup();
	s.target.addRule(
		rule([
			{ hp: 0.7, buff: [firstBuff, 1] },
			{ hp: 0.4, buff: [secondBuff, 1] },
			{ hp: 0.2, buff: [thirdBuff, 1] },
		]),
	);
	const ctx = s.hurt(850);
	assert.deepEqual(
		ctx.msgs.filter((msg) => msg[0] === 'addBuff').map((msg) => msg[4]),
		[thirdBuff],
	);
	assert.equal(
		ctx.msgs.some((msg) => msg[0] === 'removeBuff'),
		false,
	);
	assert.deepEqual(
		ctx.msgs.filter((msg) => msg[0] === 'aiHp').map((msg) => msg.slice(2)),
		[[0.2, thirdBuff, 1]],
	);
	assert.equal(s.target.findBuff(firstBuff), undefined);
	assert.equal(s.target.findBuff(secondBuff), undefined);
	assert.ok(s.target.findBuff(thirdBuff));
	s.loop.end();
});

// 已在a阶段时直接进入c，仅移除a并添加c；回血后不再补触发被跳过的b。
test('HP buff: jumping from a to c removes only the actual previous buff', () => {
	const s = setup();
	s.target.addRule(
		rule([
			{ hp: 0.7, buff: [firstBuff, 1] },
			{ hp: 0.4, buff: [secondBuff, 1] },
			{ hp: 0.2, buff: [thirdBuff, 1] },
		]),
	);
	s.hurt(350);
	const ctx = s.hurt(500);
	assert.deepEqual(
		ctx.msgs
			.filter((msg) => msg[0] === 'addBuff' || msg[0] === 'removeBuff')
			.map((msg) => [msg[0], msg[4]]),
		[
			['removeBuff', firstBuff],
			['addBuff', thirdBuff],
		],
	);
	const healed = initFightContex(s.fight);
	s.target.onHeal(s.target, 'test', 1000, healed);
	s.flush(healed);
	const again = s.hurt(650);
	assert.equal(
		again.msgs.some((msg) => ['addBuff', 'removeBuff', 'aiHp'].includes(msg[0])),
		false,
	);
	assert.ok(s.target.findBuff(thirdBuff));
	s.loop.end();
});

// 表格血线必须按a>b>c严格递减，反序或重复配置在构造阶段拒绝，不做运行时排序。
test('HP buff: threshold definitions must be strictly descending', () => {
	const s = setup();
	assert.throws(
		() =>
			rule([
				{ hp: 0.4, buff: [firstBuff, 1] },
				{ hp: 0.7, buff: [secondBuff, 1] },
			]),
		/strictly descending/,
	);
	assert.throws(
		() =>
			rule([
				{ hp: 0.7, buff: [firstBuff, 1] },
				{ hp: 0.7, buff: [secondBuff, 1] },
			]),
		/strictly descending/,
	);
	s.loop.end();
});

// 回血不会回退血轴阶段，也不会重新添加已触发或被其他逻辑移除的阶段Buff。
test('HP buff: healing does not regress or retrigger reached phases', () => {
	const s = setup();
	s.target.addRule(
		rule([
			{ hp: 0.7, buff: [firstBuff, 1] },
			{ hp: 0.4, buff: [secondBuff, 1] },
		]),
	);
	s.hurt(650);
	const ctx = initFightContex(s.fight);
	s.target.onHeal(s.target, 'test', 1000, ctx);
	s.flush(ctx);
	assert.ok(s.target.findBuff(secondBuff));
	const again = s.hurt(650);
	assert.equal(
		again.msgs.some(
			(msg) => msg[0] === 'addBuff' || msg[0] === 'removeBuff' || msg[0] === 'aiHp',
		),
		false,
	);
	s.loop.end();
});

// 多个阶段配置相同Buff时仍先移除旧实例，NOT叠加规则不能阻止新等级生效。
test('HP buff: repeated buff IDs replace the previous instance before applying a new level', () => {
	const s = setup();
	s.target.addRule(
		rule([
			{ hp: 0.7, buff: [firstBuff, 1] },
			{ hp: 0.4, buff: [firstBuff, 3] },
		]),
	);
	s.hurt(350);
	const old = s.target.findBuff(firstBuff);
	s.hurt(300);
	assert.equal(s.target.findBuff(firstBuff)?.level, 3);
	assert.notEqual(s.target.findBuff(firstBuff), old);
	assert.equal(s.target.contextEmitter.listenerCount('hurt'), 1);
	s.loop.end();
});

// 初始低血量不要求已有fight/ctx，规则提前附加Buff，随后由初始单位消息同步最终阶段。
test('HP buff: a low-health initial unit exposes only the final phase in its snapshot', () => {
	const s = setup();
	s.loop.end();
	const attr = Object.assign(new FightAttr(), structuredClone(s.target.attrOri));
	attr.point.hp = 350;
	const unit = new FightUnitMonster(4, attr, { name: '初始低血量怪物' });
	unit.addRule(
		rule([
			{ hp: 0.7, buff: [firstBuff, 1] },
			{ hp: 0.4, buff: [secondBuff, 0] },
		]),
	);
	assert.equal(unit.fight, undefined);
	assert.equal(unit.findBuff(firstBuff), undefined);
	assert.equal(unit.findBuff(secondBuff)?.level, 0);
	s.fight.getSideUnits(s.target.side)[0] = unit;
	s.fight.createSide(s.fight.getSide(0), s.fight.getSide(1));
	s.loop.start();
	assert.equal(unit.findBuff(firstBuff), undefined);
	assert.equal(unit.findBuff(secondBuff)?.level, 0);
	assert.ok(s.client.checkSame(s.fight));
	s.loop.end();
});

// 规则被替换或删除时不清理已经添加的Buff，Buff继续独立生效并自行管理监听与到期。
test('HP buff: replacing or removing a rule leaves its applied buffs intact', () => {
	const s = setup();
	s.target.addRule(rule([{ hp: 0.7, buff: [firstBuff, 1] }]));
	s.hurt(400);
	const old = s.target.findBuff(firstBuff),
		ctx = initFightContex(s.fight);
	const next = rule([{ hp: 0.8, buff: [secondBuff, 3] }]);
	s.target.setRules([next], ctx);
	assert.equal(s.target.findBuff(firstBuff), old);
	assert.equal(s.target.findBuff(secondBuff)?.level, 3);
	assert.deepEqual(
		ctx.msgs
			.filter((msg) => msg[0] === 'removeBuff' || msg[0] === 'addBuff')
			.map((msg) => msg[0]),
		['addBuff'],
	);
	s.flush(ctx);
	const removed = initFightContex(s.fight);
	assert.equal(s.target.removeRule(next, removed), true);
	assert.equal(s.target.findBuff(firstBuff), old);
	assert.ok(s.target.findBuff(secondBuff));
	assert.equal(s.target.contextEmitter.listenerCount('hp'), 0);
	assert.equal(s.target.contextEmitter.listenerCount('hurt'), 1);
	assert.equal(s.target.attr.speed, s.target.attrOri.speed + 55);
	assert.deepEqual(removed.msgs, []);
	s.flush(removed);
	s.loop.end();
});

// 阶段Buff自行移除后不会因回血、再次跨过旧血线而补加，达到下一血线时仍能正常进入下一阶段。
test('HP buff: expired phase buffs are not reapplied before the next threshold', () => {
	const s = setup();
	s.target.addRule(
		rule([
			{ hp: 0.7, buff: [firstBuff, 1] },
			{ hp: 0.4, buff: [secondBuff, 1] },
		]),
	);
	s.hurt(350);
	const ctx = initFightContex(s.fight);
	s.target.expireBuff(s.target.findBuff(firstBuff), 'times', ctx);
	s.target.onHeal(s.target, 'test', 350, ctx);
	s.flush(ctx);
	s.hurt(350);
	assert.equal(s.target.findBuff(firstBuff), undefined);
	s.hurt(300);
	assert.ok(s.target.findBuff(secondBuff));
	assert.ok(s.client.checkSame(s.fight));
	s.loop.end();
});

// 血线配置和Buff元组都复制保存，调用者之后修改原表不能改变本场阶段。
test('HP buff: configuration and tuple copying leave the original definition independent', () => {
	const s = setup();
	const lines: HpAxisLine[] = [
		{ hp: 0.7, buff: [firstBuff, 1] },
		{ hp: 0.4, buff: [secondBuff, 1] },
	];
	const original = structuredClone(lines),
		hp = new FightRuleHp({ type: 'hp', lines });
	assert.deepEqual(lines, original);
	lines[1].buff[0] = firstBuff;
	s.target.addRule(hp);
	s.hurt(650);
	assert.equal(s.target.findBuff(firstBuff), undefined);
	assert.ok(s.target.findBuff(secondBuff));
	s.loop.end();
});

// 添加Buff的事件中移除规则时，已经加上的Buff保留，后续血线停止触发，客户端不收到额外移除消息。
test('HP buff: removing the rule during an add event keeps the applied buff', () => {
	const s = setup();
	s.target.addRule(
		rule([
			{ hp: 0.7, buff: [firstBuff, 1] },
			{ hp: 0.4, buff: [secondBuff, 1] },
		]),
	);
	s.target.onContex('addBuff', (_unit, ctx, _attacker, _why, buff) => {
		if (buff.getId() === firstBuff) s.target.clearRules(ctx);
	});
	const ctx = s.hurt(350);
	assert.ok(s.target.findBuff(firstBuff));
	assert.equal(
		ctx.msgs.some((msg) => msg[0] === 'removeBuff'),
		false,
	);
	assert.equal(s.target.findBuff(secondBuff), undefined);
	assert.equal(s.target.rules.length, 0);
	assert.equal(s.target.contextEmitter.listenerCount('hurt'), 1);
	s.hurt(300);
	assert.equal(s.target.findBuff(secondBuff), undefined);
	assert.ok(s.client.checkSame(s.fight));
	s.loop.end();
});

// 旧Buff移除回调里撤掉规则时，必须在添加下一阶段之前停止，不能短暂添加新Buff再删除。
test('HP buff: removing the rule during old buff removal prevents the next addition', () => {
	const s = setup();
	s.target.addRule(
		rule([
			{ hp: 0.7, buff: [firstBuff, 1] },
			{ hp: 0.4, buff: [secondBuff, 1] },
		]),
	);
	s.hurt(350);
	s.target.onContex('removeBuff', (_unit, ctx, _attacker, _why, buff) => {
		if (buff.getId() === firstBuff) s.target.clearRules(ctx);
	});
	const ctx = s.hurt(300);
	assert.equal(
		ctx.msgs.some((msg) => msg[0] === 'addBuff' && msg[4] === secondBuff),
		false,
	);
	assert.equal(s.target.findBuff(secondBuff), undefined);
	assert.equal(s.target.rules.length, 0);
	s.loop.end();
});
