import { setFightGlobalData } from '../../../src/fight/Fight';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
	FightAttr,
	FightClient,
	FightCmdEnum,
	FightLoopPC,
	FightLoopWest,
	FightLoopYanYu,
	FightReport,
	FightUnitUser,
	FightUnitMonster,
	initPassives,
	PropEnum,
	initFightContex,
	initSkills,
	fightMsg,
} from '../../../src';
import { setupChain, chainIds } from '../../fixtures/skill_chain';

import { equipSkill } from '../../../src/fight/Skills/Funcs/NoHurt';

const ultimateId = 1001070;
function setup(enabled = true) {
	const s = setupChain({
		rootSelfBuff: false,
		finalReactions: false,
		change: (skills) => {
			skills[0].combo = undefined;
			skills[0].damageRate = 1;
			skills[0].nosupport = true;
		},
	});
	initSkills([
		{
			id: ultimateId,
			name: '天外飞仙',
			magic: true,
			rand: 1,
			attack: { attack: 100 },
			final: {},
			cost: { mp: 3 },
			nofback: true,
			nodback: true,
			nosupport: true,
			sel: s.skills[0].sel,
		},
	]);
	const ally = new FightUnitUser(
		3,
		Object.assign(new FightAttr(), structuredClone(s.actor.attrOri)),
		{ name: '侠客' },
	);
	ally.addSkill(chainIds.first, 1);
	ally.addSkill(ultimateId, 1);
	ally.setUltimateSkill(ultimateId);
	s.actor.addSkill(ultimateId, 2);
	s.actor.setUltimateSkill(ultimateId);
	s.actor.setAttackSkill(chainIds.first);
	ally.setAttackSkill(chainIds.first);
	s.fight.getSide(0).units.push(ally);
	s.fight.createSide(s.fight.getSide(0), s.fight.getSide(1));
	setFightGlobalData({ allShieldBreak: enabled });
	setFightGlobalData({ duiwei: true });
	s.fight.createMap(5, 1);
	s.actor.setPos(0);
	ally.setPos(1);
	s.target.setPos(4);
	s.other.setPos(3);
	for (const unit of [s.actor, ally]) {
		unit.attrOri.weaponProp = PropEnum.金;
	}
	for (const unit of [s.target, s.other]) {
		unit.attrOri.shield = 1;
		unit.attrOri.weakProp = [PropEnum.金];
		unit.attrOri.speed = 50;
	}
	s.actor.attrOri.speed = 300;
	ally.attrOri.speed = 200;
	for (const unit of s.fight.getAllUnits()) unit.calcAttr();
	s.fight.turn = 0;
	s.loop.start();
	s.loop.nextTurn();
	const hit = (target = s.target) => {
		const ctx = s.fight.processUnit(s.actor, {
			cmd: FightCmdEnum.skill,
			skill: chainIds.first,
			target: target.uid,
		});
		assert.ok(ctx);
		s.flush(ctx);
		return ctx;
	};
	const breakAll = () => {
		hit(s.target);
		return hit(s.other);
	};
	return { ...s, ally, hit, breakAll };
}

function ultimates(ctx: ReturnType<typeof initFightContex>) {
	return ctx.msgs.filter((msg) => msg[0] === 'actor' && msg[3] === 'ultimate');
}

// 自动大招只在最后一面盾破碎的完整动作后施放，施法者固定为破盾者。
test('ultimate auto: the last shield breaker immediately casts their equipped skill', () => {
	const s = setup();
	assert.equal(ultimates(s.hit()).length, 0);
	const inputTurn = s.actor.myInputTurn;
	const bar = structuredClone(s.client.actions);
	const ctx = s.hit(s.other);
	assert.deepEqual(ultimates(ctx), [['actor', s.actor.uid, s.actor.getSpeed(), 'ultimate']]);
	assert.equal(s.actor.attr.point.mp, 77);
	assert.equal(s.ally.attr.point.mp, 100);
	assert.equal(s.actor.myInputTurn, inputTurn);
	assert.deepEqual(s.client.actions, bar);
	assert.ok(s.client.checkSame(s.fight));
	assert.match(s.report.toString(), /施放大招/);
});

// 群体大招无需指定主目标，沿用技能选人配置并同步每个目标的伤害。
test('ultimate auto: area skill needs no explicit target', () => {
	const s = setup();
	s.actor.getUltimateSkill().getXls().sel = { ...s.skills[0].sel, num: 99 };
	const ctx = s.breakAll();
	assert.equal(ultimates(ctx).length, 1);
	assert.equal(s.target.getHp(), 700);
	assert.equal(s.other.getHp(), 700);
	assert.ok(s.client.checkSame(s.fight));
});

// 破盾事件的实际攻击者决定大招施法者，不能误用外层上下文中的攻击者。
test('ultimate auto: uses the event attacker instead of the root context actor', () => {
	const s = setup();
	s.hit();
	const ctx = { ...initFightContex(s.fight), attack: s.actor };
	s.fight.resolveAction(() => s.other.onHurt(s.ally, 'test', 1, ctx, { weakPoint: true }));
	s.flush(ctx);
	assert.deepEqual(ultimates(ctx), [['actor', s.ally.uid, s.ally.getSpeed(), 'ultimate']]);
	assert.equal(s.actor.attr.point.mp, 90);
	assert.equal(s.ally.attr.point.mp, 97);
});

// 破盾者没有装配大招时直接跳过，不转交给装配了大招的队友。
test('ultimate auto: no equipped skill skips without substituting a teammate', () => {
	const s = setup();
	s.actor.setUltimateSkill(0);
	assert.equal(ultimates(s.breakAll()).length, 0);
	assert.equal(s.ally.attr.point.mp, 100);
});

// 功能关闭或存活敌人存在无盾单位时，不触发自动大招。
test('ultimate auto: disabled mode and unshielded living enemies prevent triggering', () => {
	const disabled = setup(false);
	assert.equal(ultimates(disabled.breakAll()).length, 0);
	const s = setup();
	s.other.attrOri.shield = undefined;
	s.other.calcAttr();
	s.loop.start();
	assert.equal(ultimates(s.hit()).length, 0);
});

for (const blocked of ['skill', 'action', 'cost', 'cooldown'] as const) {
	// 破盾者无法施法时直接跳过，不保留选择窗口，费用和冷却继续使用普通技能规则。
	test('ultimate auto: skips unavailable caster for ' + blocked, () => {
		const s = setup();
		if (blocked === 'cost') s.actor.getUltimateSkill().getXls().cost = { mp: 1000 };
		else if (blocked === 'cooldown') {
			s.actor.getUltimateSkill().getXls().cd = 2;
			const ctx = initFightContex(s.fight);
			s.actor.startSkillCd(s.actor.getUltimateSkill(), ctx);
			s.flush(ctx);
		} else {
			s.other.onContex('break', () => {
				s.actor.isForbid = (action) => action === blocked;
			});
		}
		assert.equal(ultimates(s.breakAll()).length, 0);
		assert.equal(s.ally.attr.point.mp, 100);
	});
}

// 破盾事件登记后即使立即回盾，动作结束仍施放一次大招。
test('ultimate auto: immediate shield restoration does not cancel a registered break', () => {
	const s = setup();
	s.other.onContex('break', (unit, ctx) => {
		unit.attr.shield = 1;
		ctx.msgs.push(['shield', unit.uid, 1, 'recover']);
	});
	assert.equal(ultimates(s.breakAll()).length, 1);
});

// 连招各段和受伤回调全部完成后才施放大招，不能插到连招中途。
test('ultimate auto: waits until all combo segments and reactions finish', () => {
	const s = setup();
	s.hit();
	s.skills[0].combo = chainIds.second;
	const during: number[] = [];
	s.other.onContex('hurt', (_unit, ctx) => {
		if (!ctx.msgs.some((msg) => msg[0] === 'skill' && msg[1] === ultimateId)) {
			during.push(s.actor.attr.point.mp);
		}
	});
	const ctx = s.hit(s.other);
	assert.ok(during.length > 1);
	assert.ok(during.every((mp) => mp === 80));
	const marker = ctx.msgs.findIndex((msg) => msg[0] === 'actor' && msg[3] === 'ultimate');
	const lastCombo = ctx.msgs
		.map((msg) => (msg[0] === 'skill' ? msg[1] : undefined))
		.lastIndexOf(chainIds.third);
	assert.ok(marker > lastCombo);
});

// 同队同回合重复破盾不再施放；下一回合重新破盾才获得新的自动出手机会。
test('ultimate auto: at most once per side per round', () => {
	const s = setup();
	assert.equal(ultimates(s.breakAll()).length, 1);
	const restore = () => {
		s.other.attr.shield = 1;
		s.client.onMsg(['shield', s.other.uid, 1, 'recover']);
	};
	restore();
	assert.equal(ultimates(s.hit(s.other)).length, 0);
	s.loop.nextTurn();
	restore();
	assert.equal(ultimates(s.hit(s.other)).length, 1);
});

// 原动作已经结束战斗时不再追加大招，避免对已结束场面继续结算。
test('ultimate auto: a winning action does not cast another skill', () => {
	const s = setup();
	const ctx = initFightContex(s.fight);
	s.fight.resolveAction(() => {
		s.target.onHurt(s.actor, 'test', 1000, ctx, { weakPoint: true });
		s.other.onHurt(s.actor, 'test', 1000, ctx, { weakPoint: true });
	});
	s.flush(ctx);
	assert.equal(s.fight.isEnd(), true);
	assert.equal(ultimates(ctx).length, 0);
});

// 破盾者在同一反应链中死亡时跳过大招，不由队友代放。
test('ultimate auto: caster dying in the root reaction chain is skipped', () => {
	const s = setup();
	s.hit();
	s.other.onContex('hurt', (_unit, ctx) => s.actor.onHurt(s.other, 'test', 1000, ctx));
	const ctx = s.hit(s.other);
	assert.equal(s.actor.isDied(), true);
	assert.equal(ultimates(ctx).length, 0);
});

// 普通输入仍禁止伪造内部大招标记或直接使用大招槽技能。
test('ultimate auto: ordinary input cannot submit an ultimate', () => {
	const s = setup();
	const input = { cmd: FightCmdEnum.skill, skill: ultimateId };
	assert.equal(s.actor.onInput(input), false);
	assert.equal(s.actor.onInput({ ...input, ultimate: true }), false);
});

// 概率未发动仍消耗正常费用和冷却，同队本回合不再补发。
test('ultimate auto: failed activation spends costs cooldown and the round trigger', () => {
	const s = setup();
	const data = s.actor.getUltimateSkill().getXls();
	data.rand = 0;
	data.cd = 2;
	const ctx = s.breakAll();
	assert.equal(ultimates(ctx).length, 1);
	assert.equal(s.actor.attr.point.mp, 77);
	assert.equal(s.actor.getSkillCd(ultimateId), 2);
	assert.ok(ctx.msgs.some((msg) => msg[0] === 'skillFailed' && msg[3] === ultimateId));
});

for (const Loop of [FightLoopPC, FightLoopWest, FightLoopYanYu]) {
	// 三种循环自动由最后破盾者施放大招，不发选人事件，不消耗普通行动条，逐批同步客户端。
	test(
		'ultimate auto integration: ' + Loop.name + ' casts without waiting for input',
		async () => {
			const s = setup();
			s.actor.getUltimateSkill().getXls().sel = { ...s.skills[0].sel, num: 99 };
			const loop = new Loop(s.fight);
			const client = new FightClient();
			const messages: fightMsg[] = [];
			loop.onMsg((msgs) => {
				const wire = JSON.parse(JSON.stringify(msgs));
				messages.push(...(typeof wire[0] === 'string' ? [wire] : wire));
				client.onMsg(wire);
				if (client.sides[0].length && client.sides[1].length)
					assert.ok(client.checkSame(s.fight));
			});
			loop.on('ultimate', () => assert.fail('自动大招不应请求选人'));
			loop.on('input', (unit) => loop.onInput(unit.uid, { cmd: FightCmdEnum.attack }));
			loop.start();
			s.fight.turn = 0;
			loop.nextTurn();
			if (loop instanceof FightLoopYanYu) {
				const ctx = initFightContex(s.fight);
				await loop.waitInput(1, ctx);
				loop.bcMsg(ctx.msgs);
			}
			for (const unit of s.fight.getAllUnits()) unit.input = { cmd: FightCmdEnum.attack };
			await loop.processOneTurn(1);
			const casts = messages.filter((msg) => msg[0] === 'actor' && msg[3] === 'ultimate');
			assert.deepEqual(casts, [['actor', s.ally.uid, s.ally.getSpeed(), 'ultimate']]);
			assert.equal(s.ally.attr.point.mp, 97);
			assert.equal(s.actor.attr.point.mp, 100);
			assert.equal(s.ally.myInputTurn, loop instanceof FightLoopWest ? 0 : 1);
			assert.ok(client.checkSame(s.fight));
			loop.end();
		},
	);
}

// 破盾者在动作结束前被dismiss时不能施放，也不会转交给存活队友。
test('ultimate auto: a dismissed breaker is skipped', () => {
	const s = setup();
	const caster = new FightUnitMonster(
		4,
		Object.assign(new FightAttr(), structuredClone(s.actor.attrOri)),
		{ name: '破盾怪物' },
	);
	caster.addSkill(ultimateId, 1);
	caster.setUltimateSkill(ultimateId);
	s.fight.getSide(0).units.push(caster);
	s.fight.createSide(s.fight.getSide(0), s.fight.getSide(1));
	s.loop.start();
	s.hit();
	s.other.onContex('hurt', (_unit, ctx) => {
		const dismissed = s.fight.processUnit(s.target, {
			cmd: FightCmdEnum.dismiss,
			target: caster.uid,
		});
		assert.ok(dismissed);
		ctx.msgs.push(...dismissed.msgs);
	});
	const ctx = initFightContex(s.fight);
	s.fight.resolveAction(() => s.other.onHurt(caster, 'test', 1, ctx, { weakPoint: true }));
	s.flush(ctx);
	assert.equal(s.fight.getUnitById(caster.uid), undefined);
	assert.equal(ultimates(ctx).length, 0);
});

// 触发动作抛错时丢弃自动大招，不在本次或后续动作中发布部分结算。
test('ultimate auto: failed root actions discard pending casts', () => {
	const s = setup();
	s.hit();
	const ctx = initFightContex(s.fight);
	assert.throws(
		() =>
			s.fight.resolveAction(() => {
				s.other.onHurt(s.actor, 'test', 1, ctx, { weakPoint: true });
				throw new Error('root action failed');
			}),
		/root action failed/,
	);
	assert.equal(ultimates(ctx).length, 0);
	s.fight.resolveAction(() => {});
	assert.equal(ultimates(ctx).length, 0);
	assert.equal(s.actor.attr.point.mp, 90);
});

// 原目标在破盾动作中死亡但战斗未结束时，单体大招按技能规则自动选择仍存活的敌人。
test('ultimate auto: a dead original target is not reused', () => {
	const s = setup();
	s.hit(s.other);
	const ctx = initFightContex(s.fight);
	s.fight.resolveAction(() => s.target.onHurt(s.actor, 'test', 1000, ctx, { weakPoint: true }));
	s.flush(ctx);
	assert.equal(s.target.isDied(), true);
	assert.equal(ultimates(ctx).length, 1);
	assert.ok(
		ctx.msgs.some(
			(msg) => msg[0] === 'skill' && msg[1] === ultimateId && msg[3] === s.other.uid,
		),
	);
});

// 被动及技能仍只装配或卸下大招，不改变已学习的大招等级。
test('ultimate auto: passive and active equipment preserve learned levels', () => {
	const s = setup();
	const passiveId = 1001071;
	initPassives([
		{
			id: passiveId,
			name: '大招装配',
			desc: '',
			tags: [],
			status: [],
			magic: false,
			attackType: 'base',
			attack: {},
			final: {},
			ultimateSkill: ultimateId,
		},
	]);
	s.actor.setUltimateSkill(0);
	s.actor.setPassiveSkills([[passiveId, 8]]);
	assert.equal(s.actor.getUltimateSkill().level, 2);
	s.skills[0].ultimateSkill = 0;
	equipSkill(s.actor, s.actor.findSkill(chainIds.first), initFightContex(s.fight));
	assert.equal(s.actor.getUltimateSkill(), undefined);
	assert.equal(s.actor.findSkill(ultimateId).level, 2);
});

// 单体大招指定最后被破盾者，即使自动选人会选另一个敌人，也不重新抽选主目标。
test('ultimate auto target: single skill hits the final broken unit', () => {
	const s = setup();
	const select = s.fight.selectMainTarget.bind(s.fight);
	s.fight.selectMainTarget = (unit, skill) =>
		skill.getId() === ultimateId ? s.target : select(unit, skill);
	s.hit();
	const firstHp = s.target.getHp();
	const ctx = s.hit(s.other);
	const hits = ctx.msgs.filter((msg) => msg[0] === 'skill' && msg[1] === ultimateId);
	assert.equal(hits.length, 1);
	assert.equal(hits[0][3], s.other.uid);
	assert.equal(s.target.getHp(), firstHp);
	assert.equal(s.other.getHp(), 700);
	assert.ok(s.client.checkSame(s.fight));
});

// 群攻动作里最后一个破盾对象可能不同于根动作目标，单体大招必须追随实际break事件对象。
test('ultimate auto target: follows the break event rather than the root target', () => {
	const s = setup();
	const ctx = { ...initFightContex(s.fight), attack: s.actor, defend: s.target };
	const select = s.fight.selectMainTarget.bind(s.fight);
	s.fight.selectMainTarget = (unit, skill) =>
		skill.getId() === ultimateId ? s.target : select(unit, skill);
	s.fight.resolveAction(() => {
		s.target.onHurt(s.actor, 'test', 1, ctx, { weakPoint: true });
		s.other.onHurt(s.actor, 'test', 1, ctx, { weakPoint: true });
	});
	s.flush(ctx);
	assert.ok(
		ctx.msgs.some(
			(msg) => msg[0] === 'skill' && msg[1] === ultimateId && msg[3] === s.other.uid,
		),
	);
});
