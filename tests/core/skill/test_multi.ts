import { setFightGlobalData } from '../../../src/fight/Datas/FightGlobalData';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
	FightAttr,
	FightCmdEnum,
	FightUnitUser,
	FightUnitMonster,
	TargetSelectEnum,
	initFightContex,
	initBuffs,
	getBuffData,
} from '../../../src';
import { skillFunc } from '../../../src/fight/Skills/SkillFuncType';
import { setupChain, chainIds as ids } from '../../fixtures/skill_chain';

function setup(num = 99, change?: Parameters<typeof setupChain>[0]['change']) {
	return setupChain({
		finalReactions: false,
		rootSelfBuff: false,
		change: (skills) => {
			skills[0].combo = undefined;
			skills[0].attack = { ...skills[0].attack, hurtP: 0 };
			skills[0].sel = { target: TargetSelectEnum.enemy, num };
			skills[0].nosupport = true;
			change?.(skills);
		},
	});
}

// 群攻一次选定敌方全体，不选择主目标，也不发送溅射消息。
test('multi: num 99 directly attacks the whole enemy side', () => {
	const { fight, actor, target, other } = setup();
	fight.selectMainTarget = () => {
		assert.fail('群攻不应选择主目标');
	};
	const ctx = fight.processUnit(actor, { cmd: FightCmdEnum.skill, skill: ids.first });
	assert.ok(ctx);
	assert.deepEqual([target.getHp(), other.getHp(), actor.getHp()], [900, 900, 1000]);
	assert.equal(
		ctx.msgs.some((msg) => msg[0] === 'spread'),
		false,
	);
	assert.equal(ctx.msgs.filter((msg) => msg[0] === 'costMp').length, 1);
});

// 群攻人数是总人数，按血量排序选择，默认不会攻击死亡单位。
test('multi: num limits total targets and respects sorting and death filters', () => {
	const { fight, actor, target, other } = setup(2, (skills) => {
		skills[0].sel.sortAttr = 'hp';
	});
	target.die();
	const ctx = fight.processUnit(actor, { cmd: FightCmdEnum.skill, skill: ids.first });
	assert.ok(ctx);
	assert.equal(other.getHp(), 900);
	assert.deepEqual(
		ctx.msgs.filter((msg) => msg[0] === 'skill').map((msg) => msg[3]),
		[other.uid],
	);
});

// 第一个目标未命中也不会跳过其他群攻目标，施放后自身效果只添加一次。
test('multi: a miss does not cancel other targets and self buffs apply once', () => {
	const { fight, actor, target, other, client, flush } = setup(99, (skills) => {
		skills[0].magic = false;
		skills[0].afterSelfBuff = [[ids.rest, 1, 1]];
	});
	target.attr.physic.base.dodge = 100;
	fight.random = () => 0.5;
	const ctx = fight.processUnit(actor, { cmd: FightCmdEnum.skill, skill: ids.first });
	assert.deepEqual([target.getHp(), other.getHp()], [1000, 900]);
	assert.equal(ctx.msgs.filter((msg) => msg[0] === 'miss').length, 1);
	assert.equal(ctx.msgs.filter((msg) => msg[0] === 'skill').length, 1);
	assert.equal(ctx.msgs.filter((msg) => msg[0] === 'addBuff' && msg[4] === ids.rest).length, 1);
	flush(ctx);
	assert.equal(client.checkSame(fight), true);
});

// PC 群体技能不绑定一个随机主目标，执行时仍覆盖整个目标阵营。
test('multi: PC input does not bind a main target', () => {
	const { fight, actor, target, other } = setup();
	const input = { cmd: FightCmdEnum.skill, skill: ids.first };
	assert.equal(fight.checkPC(actor, input), true);
	assert.deepEqual(fight.preparePCInput(actor, input), input);
	fight.processUnit(actor, input);
	assert.deepEqual([target.getHp(), other.getHp()], [900, 900]);
});

// 友方群体复活直接处理所有死亡队友，不依赖第一个目标触发溅射。
test('multi: revival applies to all dead units of the selected side', () => {
	const { fight, actor, target, other } = setup(99, (skills) => {
		skills[0].func = 'relife';
		skills[0].relifeP = 0.3;
	});
	target.attr.point.hp = 0;
	other.attr.point.hp = 0;
	target.die();
	other.die();
	// 保持战斗未结束，直接走技能入口验证死亡过滤与复活函数。
	const ctx = initFightContex(fight);
	ctx.attack = actor;
	skillFunc(actor, null, ids.first, ctx);
	assert.deepEqual([target.getHp(), other.getHp()], [300, 300]);
	assert.deepEqual([target.isDied(), other.isDied()], [false, false]);
});

// 友方群疗包含施法者本人，所有人使用同一个治疗技能而非溅射子技能。
test('multi: friendly healing includes the caster', () => {
	const { fight, actor, target, other } = setup(99, (skills) => {
		skills[0].func = 'heal';
		skills[0].sel.target = TargetSelectEnum.friend;
	});
	const ally = new FightUnitUser(
		3,
		Object.assign(new FightAttr(), structuredClone(actor.attrOri)),
		{ name: '队友' },
	);
	ally.setFight(fight, actor.side);
	fight.getSide(actor.side).units.push(ally);
	actor.attr.point.hp = 500;
	ally.attr.point.hp = 400;
	fight.processUnit(actor, { cmd: FightCmdEnum.skill, skill: ids.first });
	assert.deepEqual(
		[actor.getHp(), ally.getHp(), target.getHp(), other.getHp()],
		[600, 500, 1000, 1000],
	);
});

// 群攻只抽样一次发动概率，全部目标各受一次伤害，只付一次费用和冷却。
test('multi: probability, cost and cooldown belong to the cast', () => {
	const { fight, actor, target, other } = setup(99, (skills) => {
		skills[0].rand = 0.5;
		skills[0].cd = 2;
	});
	let samples = 0;
	fight.random = () => {
		samples++;
		return 0.1;
	};
	const ctx = fight.processUnit(actor, { cmd: FightCmdEnum.skill, skill: ids.first });
	assert.equal(samples, 1);
	assert.deepEqual([target.getHp(), other.getHp(), actor.attr.point.mp], [900, 900, 90]);
	assert.equal(actor.getSkillCd(ids.first), 2);
	assert.equal(ctx.msgs.filter((msg) => msg[0] === 'costMp').length, 1);
});

// 群攻发动失败时整组不生效，也不添加施放后自身 Buff。
test('multi: failed probability cancels the whole group', () => {
	const { fight, actor, target, other } = setup(99, (skills) => {
		skills[0].rand = 0.5;
		skills[0].afterSelfBuff = [[ids.rest, 1, 1]];
	});
	let samples = 0;
	fight.random = () => {
		samples++;
		return 0.9;
	};
	const ctx = fight.processUnit(actor, { cmd: FightCmdEnum.skill, skill: ids.first });
	assert.equal(samples, 1);
	assert.deepEqual([target.getHp(), other.getHp()], [1000, 1000]);
	assert.equal(ctx.msgs.filter((msg) => msg[0] === 'skillFailed').length, 1);
	assert.ok(!actor.findBuff(ids.rest));
});

// 装配的群体普攻复用同一选择流程，PC 不为它绑定一个主目标。
test('multi: equipped attack skills also target the whole group', () => {
	const { fight, actor, target, other } = setup();
	actor.setAttackSkill(ids.first);
	const input = { cmd: FightCmdEnum.attack };
	assert.deepEqual(fight.preparePCInput(actor, input), input);
	fight.selectMainTarget = () => {
		assert.fail('群体普攻不选主目标');
	};
	fight.processUnit(actor, input);
	assert.deepEqual([target.getHp(), other.getHp(), actor.attr.point.mp], [900, 900, 100]);
});

// 连击子技能为群攻时直接选择整组，不多抽取一个没有用途的主目标。
test('multi: next skills select a group directly', () => {
	const { fight, actor, target, other } = setup(1, (skills) => {
		skills[0].next = ids.second;
		skills[1].combo = undefined;
		skills[1].attack = { ...skills[1].attack, hurtP: 0 };
		skills[1].sel.num = 99;
		skills[1].nosupport = true;
	});
	fight.selectMainTarget = () => {
		assert.fail('群体子技能不选主目标');
	};
	fight.processUnit(actor, { cmd: FightCmdEnum.skill, skill: ids.first, target: target.uid });
	assert.deepEqual([target.getHp(), other.getHp()], [800, 900]);
});

// 数量溅射读取子技能 num，主技能 num 只决定直接目标人数。
test('multi: child num preserves primary and secondary attack stages', () => {
	const { fight, actor, target, other } = setup(1, (skills) => {
		skills[0].spread = ids.second;
		skills[1].sel = { ...skills[1].sel, num: 1 };
		skills[1].combo = undefined;
		skills[1].attack = { ...skills[1].attack, hurtP: -0.3 };
	});
	const ctx = fight.processUnit(actor, {
		cmd: FightCmdEnum.skill,
		skill: ids.first,
		target: target.uid,
	});
	assert.deepEqual([target.getHp(), other.getHp()], [900, 930]);
	assert.deepEqual(
		ctx.msgs.find((msg) => msg[0] === 'spread'),
		['spread', [other.uid]],
	);
});

// 连招的继承目标规则优先，后续段即使填写群体人数也不能扩散到其他敌人。
test('multi: combo children keep their inherited target', () => {
	const { fight, actor, target, other } = setup(1, (skills) => {
		skills[0].combo = ids.second;
		skills[1].combo = undefined;
		skills[1].sel.num = 99;
	});
	fight.processUnit(actor, { cmd: FightCmdEnum.skill, skill: ids.first, target: target.uid });
	assert.deepEqual([target.getHp(), other.getHp()], [830, 1000]);
});

// 从三个敌人中按血量选两个，人数上限包括整组而不是主目标之外再加两人。
test('multi: sorted num two selects exactly two of three enemies', () => {
	const { fight, actor, target, other } = setup(2, (skills) => {
		skills[0].sel.sortAttr = 'hp';
	});
	const third = new FightUnitMonster(
		3,
		Object.assign(new FightAttr(), structuredClone(other.attrOri)),
		{ name: '第三敌人' },
	);
	third.setFight(fight, other.side);
	fight.getSide(other.side).units.push(third);
	target.attr.point.hp = 800;
	other.attr.point.hp = 500;
	third.attr.point.hp = 300;
	fight.random = () => {
		assert.fail('排序群攻不应随机选主目标');
		return 0;
	};
	const ctx = fight.processUnit(actor, { cmd: FightCmdEnum.skill, skill: ids.first });
	assert.deepEqual([target.getHp(), other.getHp(), third.getHp()], [800, 400, 200]);
	assert.deepEqual(
		ctx.msgs.filter((msg) => msg[0] === 'skill').map((msg) => msg[3]),
		[third.uid, other.uid],
	);
});

// 首个目标被击杀不会取消其他目标，动作结束回调要等整组伤害全部完成。
test('multi: death does not truncate the group or run action callbacks early', () => {
	const { fight, actor, target, other } = setup();
	target.attr.point.hp = 50;
	const observed: number[] = [];
	target.onContex('die', () =>
		fight.afterAction(() => {
			observed.push(other.getHp());
		}),
	);
	fight.processUnit(actor, { cmd: FightCmdEnum.skill, skill: ids.first });
	assert.equal(target.isDied(), true);
	assert.equal(other.getHp(), 900);
	assert.deepEqual(observed, [900]);
});

// 显式指定的错误阵营或不存在目标仍拒绝，合法目标不会把群攻缩成单体。
test('multi: explicit targets are validated without anchoring the group', () => {
	const { fight, actor, target, other } = setup();
	assert.equal(
		fight.processUnit(actor, { cmd: FightCmdEnum.skill, skill: ids.first, target: 99999 }),
		undefined,
	);
	assert.equal(
		fight.processUnit(actor, { cmd: FightCmdEnum.skill, skill: ids.first, target: actor.uid }),
		undefined,
	);
	assert.equal(actor.attr.point.mp, 100);
	fight.processUnit(actor, { cmd: FightCmdEnum.skill, skill: ids.first, target: other.uid });
	assert.deepEqual([target.getHp(), other.getHp()], [900, 900]);
});

// 群疗选人时先排除禁疗者，不能让其占用人数导致可治疗队友漏选。
test('multi: ineligible effect targets do not consume group slots', () => {
	const { fight, actor, target, other } = setup(2, (skills) => {
		skills[0].func = 'heal';
		skills[0].sel.sortAttr = 'hp';
	});
	const third = new FightUnitMonster(
		3,
		Object.assign(new FightAttr(), structuredClone(other.attrOri)),
		{ name: '第三敌人' },
	);
	third.setFight(fight, other.side);
	fight.getSide(other.side).units.push(third);
	target.attr.point.hp = 300;
	other.attr.point.hp = 400;
	third.attr.point.hp = 500;
	target.inStatus = (status) => status === '禁疗';
	const input = { cmd: FightCmdEnum.skill, skill: ids.first };
	assert.equal(fight.checkPC(actor, input), true);
	fight.processUnit(actor, input);
	assert.deepEqual([target.getHp(), other.getHp(), third.getHp()], [300, 500, 600]);
});

for (const num of [1, 99]) {
	for (const prohibited of [false, true]) {
		// 单体和群攻均按 nosupport 配置决定协战，禁止时不消耗队友的协战次数。
		test(`multi: support follows nosupport=${prohibited} (num=${num})`, () => {
			const { fight, actor, target, other } = setup(num, (skills) => {
				skills[0].nosupport = prohibited;
				skills[1].combo = undefined;
			});
			const supporter = new FightUnitUser(
				3,
				Object.assign(new FightAttr(), structuredClone(actor.attrOri)),
				{ name: '协战者' },
			);
			supporter.addSkill(ids.second, 1);
			supporter.setSupportSkill(ids.second);
			supporter.setFight(fight, actor.side);
			fight.getSide(actor.side).units.push(supporter);
			const previousTurn = supporter.lastSupportTurn;
			const ctx = fight.processUnit(actor, {
				cmd: FightCmdEnum.skill,
				skill: ids.first,
				target: target.uid,
			});
			assert.equal(
				ctx.msgs.some((msg) => msg[0] === 'skill' && msg[4] === 'support'),
				!prohibited,
			);
			assert.equal(supporter.lastSupportTurn, prohibited ? previousTurn : fight.turn);
			assert.deepEqual(
				[target.getHp(), other.getHp()],
				[prohibited ? 900 : 830, num === 1 ? 1000 : 900],
			);
			assert.equal(actor.findSkill(ids.first).canSupport(), !prohibited);
			assert.equal(actor.findSkill(ids.first).getXls().nosupport, prohibited);
		});
	}
}

for (const func of ['normal', 'poison']) {
	for (const num of [1, 99]) {
		for (const prohibited of [false, true]) {
			// 单体与群体的普通伤害和毒伤都按 noprotect 配置决定是否保护。
			test(`multi: ${func} protection follows noprotect=${prohibited} (num=${num})`, () => {
				const { fight, actor, target, other, flush } = setup(num, (skills) => {
					skills[0].func = func;
					skills[0].noprotect = prohibited;
				});
				const protectId = 1001090;
				initBuffs([
					{
						...getBuffData(ids.rest),
						id: protectId,
						name: '保护',
						class: 'protect',
						prior: 500,
						lastTurn: 1,
						notRemove: false,
					},
				]);
				setFightGlobalData({ protectBuff: protectId });
				flush(fight.processUnit(target, { cmd: FightCmdEnum.protect, target: other.uid }));
				const ctx = fight.processUnit(actor, {
					cmd: FightCmdEnum.skill,
					skill: ids.first,
					target: other.uid,
				});
				flush(ctx);
				assert.equal(
					ctx.msgs.some((msg) => msg[0] === 'hurt' && msg[1] === 'share'),
					!prohibited,
				);
				assert.deepEqual(
					[target.getHp(), other.getHp()],
					prohibited
						? [num === 1 ? 1000 : 900, 900]
						: num === 1
							? [950, 950]
							: [850, 950],
				);
				assert.equal(actor.findSkill(ids.first).canProtect(), !prohibited);
				assert.equal(actor.findSkill(ids.first).getXls().noprotect, prohibited);
			});
		}
	}
}

for (const func of ['normal', 'poison']) {
	for (const prohibited of [false, true]) {
		// 溅射是否被保护由子技能自己的 noprotect 决定，主目标保持原配置。
		test(`multi: ${func} spread protection follows noprotect=${prohibited}`, () => {
			const { fight, actor, target, other, flush } = setup(1, (skills) => {
				skills[0].func = func;
				skills[0].spread = ids.second;
				skills[1].sel = { ...skills[1].sel, num: 1 };
				skills[0].noprotect = false;
				skills[1].func = func;
				skills[1].combo = undefined;
				skills[1].noprotect = prohibited;
				skills[1].attack = { ...skills[1].attack, hurtP: -0.3 };
			});
			const protectId = 1001091;
			initBuffs([
				{
					...getBuffData(ids.rest),
					id: protectId,
					name: '保护',
					class: 'protect',
					prior: 500,
					lastTurn: 1,
					notRemove: false,
				},
			]);
			const initial = initFightContex(fight);
			target.addBuff(other, 'test', protectId, 1, initial);
			other.addBuff(target, 'test', protectId, 1, initial);
			flush(initial);
			const ctx = fight.processUnit(actor, {
				cmd: FightCmdEnum.skill,
				skill: ids.first,
				target: target.uid,
			});
			flush(ctx);
			assert.deepEqual([target.getHp(), other.getHp()], prohibited ? [950, 880] : [915, 915]);
			assert.equal(
				ctx.msgs.filter((msg) => msg[0] === 'hurt' && msg[1] === 'share').length,
				prohibited ? 1 : 2,
			);
			assert.equal(
				ctx.msgs.filter((msg) => msg[0] === 'buffTrigger' && msg[3] === 'protect').length,
				prohibited ? 1 : 2,
			);
		});
	}
}

// 主目标只召唤一次协战，溅射目标不额外召唤另一位有协战机会的队友。
test('multi: only the main target triggers support before spread', () => {
	const { fight, actor, target, other } = setup(1, (skills) => {
		skills[0].nosupport = false;
		skills[0].spread = ids.second;
		skills[1].sel = { ...skills[1].sel, num: 1 };
		skills[1].combo = undefined;
		skills[1].nosupport = false;
	});
	const supporters = [3, 4].map((uid) => {
		const unit = new FightUnitUser(
			uid,
			Object.assign(new FightAttr(), structuredClone(actor.attrOri)),
			{ name: '协战者' },
		);
		unit.addSkill(ids.kill, 1);
		unit.setSupportSkill(ids.kill);
		unit.setFight(fight, actor.side);
		fight.getSide(actor.side).units.push(unit);
		return unit;
	});
	const ctx = fight.processUnit(actor, {
		cmd: FightCmdEnum.skill,
		skill: ids.first,
		target: target.uid,
	});
	const attacks = ctx.msgs.filter((msg) => msg[0] === 'skill' && msg[4] === 'support');
	assert.equal(attacks.length, 1);
	assert.equal(attacks[0][3], target.uid);
	assert.equal(supporters.filter((unit) => unit.lastSupportTurn === fight.turn).length, 1);
	assert.deepEqual([target.getHp(), other.getHp()], [800, 930]);
});
