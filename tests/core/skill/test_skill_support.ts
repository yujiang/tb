import { setFightGlobalData } from '../../../src/fight/Fight';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
	Fight,
	FightAttr,
	FightSide,
	FightUnitUser,
	FightLoopWest,
	FightClient,
	FightReport,
	FightMud,
	FightCmdEnum,
	SkillData,
	TargetSelectEnum,
	initSkills,
	initPassives,
	initFightContex,
	initBuffs,
	OverlapEnum,
	PropEnum,
} from '../../../src';
import { magicAttackFunc } from '../../../src/fight/Skills/Funcs/NomalSkill';

const ids = { root: 99210, support: 99211, next: 99212, back: 99213, passive: 99214 };

for (const func of ['heal', 'poison', 'nohurt', 'relife', 'observe', 'entrust', 'mimic']) {
	// 协战装配入口拒绝非normal技能，失败时保留原装配，避免把其他效果作为攻击执行。
	test(`support: equipment rejects a ${func} skill before changing the equipped slot`, () => {
		const s = setup();
		const invalidId = 10018201;
		initSkills([{ ...s.skills[1], id: invalidId, func }]);
		s.a.addSkill(invalidId, 1);
		assert.throws(() => s.a.setSupportSkill(invalidId), /normal/);
		assert.equal(s.a.supportSkill, ids.support);
	});
}

// 装配验证使用注册配置，允许先装配未学的normal技能，后续学习生效且不重置次数，0仍可卸下。
test('support: equipment validates config without learning a missing normal skill', () => {
	const s = setup();
	const skillId = 10018202;
	initSkills([{ ...s.skills[1], id: skillId, func: 'normal' }]);
	s.a.setSupportSkill(skillId);
	assert.equal(s.a.getSupportSkill(), undefined);
	s.a.addSkill(skillId, 2);
	assert.equal(s.a.getSupportSkill()?.level, 2);
	s.a.lastSupportTurn = s.fight.turn;
	s.a.setSupportSkill(0);
	assert.equal(s.a.supportSkill, 0);
	assert.equal(s.a.lastSupportTurn, s.fight.turn);
});

for (const protectable of [false, true]) {
	// 测试：主攻禁止保护时，协战仍独立读取自己的 noprotect 禁止字段，不继承主攻配置。
	test(`support: protection uses the support skill's own flag (${protectable})`, () => {
		const protectId = 99217;
		initBuffs([
			{
				id: protectId,
				name: '保护',
				desc: '',
				class: 'protect',
				overlap: OverlapEnum.REPLACE,
				status: [],
				tags: [],
				magic: false,
				attackType: 'base',
				attack: {},
				final: {},
				lastTurn: 0,
				times: 0,
				event: 'beforeHurt',
			},
		]);
		const guard = new FightUnitUser(4, attr(), { name: '保护者' });
		guard.setPos(4);
		const s = setup(
			(skills) => {
				skills[0].noprotect = true;
				skills[1].noprotect = !protectable;
			},
			false,
			({ c, enemies }) => {
				enemies.units.push(guard);
				c.addBuff(guard, 'test', protectId, 1, null);
			},
		);
		const ctx = s.cast();
		assert.equal(
			ctx.msgs.filter((msg) => msg[0] === 'skill' && msg[4] === 'support').length,
			1,
		);
		assert.equal(s.c.getHp(), protectable ? 880 : 860);
		assert.equal(guard.getHp(), protectable ? 980 : 1000);
	});
}

function attr(): FightAttr {
	const attr = new FightAttr();
	const base = (attack = 100, rand = 0) => ({
		rand,
		hit: 100,
		dodge: 0,
		parry: 0,
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
	const group = () => ({
		base: base(100, 1),
		next: base(),
		kill: base(),
		spread: base(),
		fback: base(10),
		final: { bloodP: 0, dbackP: 0, immunity: 0, immunityP: 0 },
	});
	attr.point = { hp: 1000, hpMax: 1000, mp: 100, mpMax: 100 };
	attr.speed = 100;
	attr.physic = group();
	attr.magic = group();
	attr.heal = base();
	attr.poison = base();
	return attr;
}

function setup(
	change?: (skills: SkillData[]) => void,
	passive = false,
	prepare?: (units: {
		a: FightUnitUser;
		b: FightUnitUser;
		c: FightUnitUser;
		d: FightUnitUser;
		enemies: FightSide;
	}) => void,
) {
	const common = {
		magic: true,
		rand: 1,
		attack: {},
		final: {},
		noblood: true,
		nodback: true,
		nofback: true,
		nosupport: true,
		noprotect: true,
		sel: { target: TargetSelectEnum.enemy },
	};
	const skills: SkillData[] = [
		{ ...common, id: ids.root, name: '主攻', nosupport: false },
		{ ...common, id: ids.support, name: '协战', damageRate: 0.4 },
		{ ...common, id: ids.next, name: '连击', damageRate: 0.2 },
		{ ...common, id: ids.back, name: '反击', damageRate: 0.5 },
	];
	change?.(skills);
	initSkills(skills);
	initPassives([
		{
			id: ids.passive,
			name: '协战被动',
			desc: '',
			status: [],
			tags: [],
			magic: false,
			attackType: 'base',
			attack: {},
			final: {},
			supportSkill: ids.support,
		},
	]);
	setFightGlobalData({
		protectBuff: undefined,
		allShieldBreak: false,
		maxTurn: 10,
		waitInputSec: 1,
		duiwei: false,
	});
	const fight = new Fight(
		99210,
		{ runaway: false, runawayGrade: 0, deathPenalty: 0, winRecover: 0, winReward: 0 },
		42,
	);
	const a = new FightUnitUser(0, attr(), { name: '协战者' }, passive ? [[ids.passive, 3]] : []);
	const b = new FightUnitUser(1, attr(), { name: '主攻者' });
	const c = new FightUnitUser(2, attr(), { name: '敌人' });
	const d = new FightUnitUser(3, attr(), { name: '另一协战者' });
	for (const unit of [a, b, c, d]) unit.setPos(unit.uid);
	b.addSkill(ids.root, 1);
	c.addSkill(ids.back, 1);
	c.fbackSkill = ids.back;
	a.addSkill(ids.support, passive ? 2 : 1);
	if (!passive) a.setSupportSkill(ids.support);
	const left = new FightSide(),
		right = new FightSide();
	left.units.push(a, b, d);
	right.units.push(c);
	prepare?.({ a, b, c, d, enemies: right });
	fight.createSide(left, right);
	const loop = new FightLoopWest(fight),
		client = new FightClient();
	const report = new FightReport(() => {}, false),
		mud = new FightMud(() => {}, false);
	loop.onMsg((msgs) => {
		const wire = structuredClone(msgs);
		client.onMsg(wire);
		report.onMsg(wire);
		mud.onMsg(wire);
	});
	loop.start();
	loop.nextTurn();
	const cast = () => {
		const ctx = fight.processUnit(b, {
			cmd: FightCmdEnum.skill,
			skill: ids.root,
			target: c.uid,
		});
		assert.ok(ctx);
		loop.bcMsg(ctx.msgs);
		assert.ok(client.checkSame(fight));
		return ctx;
	};
	return { fight, a, b, c, d, loop, client, report, mud, cast, skills };
}

// 测试：协战使用自身武器相克属性，不能误用共享上下文中的主攻者属性。
test("support: elemental damage uses the supporter's weapon rather than the root actor", () => {
	const s = setup();
	s.b.attr.weaponProp = PropEnum.金;
	s.a.attr.weaponProp = PropEnum.水;
	s.c.attr.charProp = PropEnum.火;
	const ctx = s.cast();
	assert.deepEqual(
		ctx.msgs.filter((msg) => msg[0] === 'hurt' && msg[2] === s.c.uid).map((msg) => msg[4]),
		[100, 90],
	);
	assert.equal(s.c.getHp(), 810); // 协战伤害倍率 0.4 + 相克加成 0.5
});

// 测试：装备的协战紧跟主攻并继承目标，同回合只成功发动一次，下回合恢复。
test('support: equipped ally follows the hit once per global turn', () => {
	const { fight, a, c, cast, report, mud } = setup();
	const first = cast();
	assert.deepEqual(
		first.msgs.filter((m) => m[0] === 'skill').map((m) => [m[1], m[2], m[3], m[4]]),
		[
			[ids.root, 1, 2, undefined],
			[ids.support, 0, 2, 'support'],
		],
	);
	assert.equal(c.getHp(), 860);
	assert.equal(cast().msgs.filter((m) => m[4] === 'support').length, 0);
	fight.nextTurn();
	assert.equal(cast().msgs.filter((m) => m[0] === 'skill' && m[2] === a.uid).length, 1);
	assert.match(report.toString(), /【协战】/);
	assert.match(mud.toString(), /【协战】/);
});

// 测试：未允许协战的技能与自身装配的协战均不能触发助攻。
test('support: nosupport blocks assistance and another allied unit is required', () => {
	const s = setup((skills) => {
		skills[0].nosupport = true;
	});
	assert.equal(s.cast().msgs.filter((m) => m[4] === 'support').length, 0);
	s.skills[0].nosupport = false;
	s.a.supportSkill = 0;
	s.b.addSkill(ids.support, 1);
	s.b.supportSkill = ids.support;
	assert.equal(s.cast().msgs.filter((m) => m[4] === 'support').length, 0);
});

// 测试：多个候选只随机选一个，其概率失败不能转选另一个，概率只判定一次。
test('support: choose one candidate before its probability roll without retrying another', () => {
	const s = setup((skills) => {
		skills[1].rand = 0.5;
	});
	s.d.addSkill(ids.support, 1);
	s.d.supportSkill = ids.support;
	const samples = [0.99, 0.99];
	let count = 0;
	s.fight.random = () => {
		count++;
		return samples.shift() ?? 0;
	};
	assert.equal(s.cast().msgs.filter((m) => m[4] === 'support').length, 0);
	assert.equal(count, 2);
	s.fight.random = () => 0.99;
	s.skills[1].rand = 1;
	const ctx = s.cast();
	assert.deepEqual(
		ctx.msgs.filter((m) => m[4] === 'support').map((m) => m[2]),
		[s.a.uid],
	);
});

// 测试：封印和眩晕者在随机选人前被排除，不消耗抽选随机数或次数，解除后当回合仍可协战。
test('support: forbid filters candidates before selection and preserves their quota', () => {
	for (const status of ['封印', '眩晕']) {
		const s = setup();
		const passiveId = 99215;
		initPassives([
			{
				id: passiveId,
				name: status,
				desc: '',
				status: [status],
				tags: [],
				magic: false,
				attackType: 'base',
				attack: {},
				final: {},
			},
		]);
		s.a.setPassiveSkills([[passiveId, 1]]);
		s.d.addSkill(ids.support, 1);
		s.d.supportSkill = ids.support;
		let samples = 0;
		s.fight.random = () => {
			samples++;
			return 0;
		};
		const ctx = s.cast();
		assert.deepEqual(
			ctx.msgs.filter((m) => m[4] === 'support').map((m) => m[2]),
			[s.d.uid],
		);
		assert.equal(samples, 0);
		assert.equal(s.a.lastSupportTurn, -1);
		assert.equal(s.d.lastSupportTurn, s.fight.turn);
		s.a.setPassiveSkills([]);
		assert.deepEqual(
			s
				.cast()
				.msgs.filter((m) => m[4] === 'support')
				.map((m) => m[2]),
			[s.a.uid],
		);
	}
});

// 测试：协战在原攻击连击之前完成，协战自身可连击和被反击，沿用配置与共享上下文。
test('support: reuse next and counter pipeline before resuming original reactions', () => {
	const s = setup((skills) => {
		skills[0].next = ids.next;
		skills[1].next = ids.next;
		skills[2].nofback = false;
	});
	const ctx = s.cast();
	assert.deepEqual(
		ctx.msgs.filter((m) => m[0] === 'skill').map((m) => [m[1], m[2]]),
		[
			[ids.root, 1],
			[ids.support, 0],
			[ids.next, 0],
			[ids.back, 2],
			[ids.next, 1],
			[ids.back, 2],
		],
	);
	assert.equal(ctx.nextNum, 2);
	assert.equal(ctx.fbackNum, 2);
});

// 测试：协战反应链不再召唤其他协战者，避免一次攻击串出全队。
test('support: supporting reaction chain cannot request more support', () => {
	const s = setup((skills) => {
		skills[1].nosupport = false;
		skills[1].next = ids.next;
		skills[2].nosupport = false;
	});
	s.d.addSkill(ids.support, 1);
	s.d.supportSkill = ids.support;
	s.fight.random = () => 0;
	assert.equal(s.cast().msgs.filter((m) => m[4] === 'support').length, 1);
});

// 测试：死亡、禁止攻击和休息中的队友不能协战，目标已死亡时不会补打或换目标。
test('support: unavailable allies and a killed target are skipped', () => {
	for (const unavailable of ['dead', 'forbid', 'rest'] as const) {
		const s = setup(undefined, false, ({ a }) => {
			if (unavailable === 'dead') a.dead = true;
			if (unavailable === 'forbid') a.isForbid = () => true;
			if (unavailable === 'rest') a.inStatus = (status) => status === '休息';
		});
		assert.equal(s.cast().msgs.filter((m) => m[4] === 'support').length, 0);
	}
	const s = setup(undefined, false, ({ c }) => {
		c.attr.point.hp = 50;
	});
	assert.equal(s.cast().msgs.filter((m) => m[4] === 'support').length, 0);
});

// 测试：被动只装配协战技能并保留独立的已学等级，战斗中改装不能绕过当回合次数。
test('support: passive equipment and runtime equipment share the turn quota', () => {
	const s = setup(undefined, true);
	assert.equal(s.a.supportSkill, ids.support);
	assert.equal(s.a.findSkill(ids.support)?.level, 2); // 被动等级为 3，已学协战技能等级为 2。
	assert.equal(s.cast().msgs.filter((m) => m[4] === 'support').length, 1);
	s.a.addSkill(ids.next, 2);
	s.a.supportSkill = ids.next;
	assert.equal(s.cast().msgs.filter((m) => m[4] === 'support').length, 0);
	s.fight.nextTurn();
	assert.deepEqual(
		s
			.cast()
			.msgs.filter((m) => m[4] === 'support')
			.map((m) => m[1]),
		[ids.next],
	);
});

// 测试：被动同时装配反击与协战时不重建已有技能，也不自动学习尚未拥有的技能。
test('support: passive equipment preserves learned skills and does not learn missing skills', () => {
	const s = setup();
	const passiveId = 99216;
	initPassives([
		{
			id: passiveId,
			name: '组合被动',
			desc: '',
			status: [],
			tags: [],
			magic: false,
			attackType: 'base',
			attack: {},
			final: {},
			supportSkill: ids.support,
			fbackSkill: ids.back,
		},
	]);
	const support = s.a.findSkill(ids.support);
	const back = s.a.addSkill(ids.back, 5);
	s.a.setPassiveSkills([[passiveId, 3]]);
	assert.equal(s.a.getSupportSkill(), support);
	assert.equal(s.a.getFBackSkill(), back);
	assert.equal(support.level, 1);
	assert.equal(back.level, 5);
	assert.equal(s.d.findSkill(ids.support), undefined);
	assert.equal(s.d.findSkill(ids.back), undefined);
	s.d.setPassiveSkills([[passiveId, 3]]);
	assert.equal(s.d.supportSkill, ids.support);
	assert.equal(s.d.fbackSkill, ids.back);
	assert.equal(s.d.findSkill(ids.support), undefined);
	assert.equal(s.d.findSkill(ids.back), undefined);
});

// 测试：连招中途不插入协战，仅在末段后一次尝试，零概率不触发。
test('support: combo waits for terminal hit and zero probability stays zero', () => {
	const s = setup((skills) => {
		skills[0].combo = ids.next;
		skills[2].nosupport = false;
	});
	assert.deepEqual(
		s
			.cast()
			.msgs.filter((m) => m[0] === 'skill')
			.map((m) => m[1]),
		[ids.root, ids.next, ids.support],
	);
	const zero = setup((skills) => {
		skills[1].rand = 0;
	});
	assert.equal(zero.cast().msgs.filter((m) => m[4] === 'support').length, 0);
});

// 测试：选中尝试即消耗机会，概率失败及未命中均不返还，输入次数不刷新配额，下回合恢复。
test('support: probability failure and miss both consume the global turn quota', () => {
	const s = setup((skills) => {
		skills[1].rand = 0.5;
	});
	let rolls = 0;
	s.fight.random = () => {
		rolls++;
		return 0.99;
	};
	assert.equal(s.cast().msgs.filter((m) => m[4] === 'support').length, 0);
	assert.equal(rolls, 1);
	s.fight.random = () => 0;
	assert.equal(s.cast().msgs.filter((m) => m[4] === 'support').length, 0);
	s.a.inputStart(s.fight.turn, initFightContex(s.fight));
	assert.equal(s.cast().msgs.filter((m) => m[4] === 'support').length, 0);
	s.fight.nextTurn();
	assert.equal(s.cast().msgs.filter((m) => m[4] === 'support').length, 1);
	const miss = setup((skills) => {
		skills[1].magic = false;
		skills[1].attack.hit = -100;
	});
	assert.equal(miss.cast().msgs.filter((m) => m[0] === 'miss' && m[4] === 'support').length, 1);
	assert.equal(miss.cast().msgs.filter((m) => m[4] === 'support').length, 0);
});

// 测试：协战继承技能倍率、等级与自身基础攻击，像反击一样不额外支付主动技能费用。
test('support: equipped skill uses supporter base attributes and growth without an extra cost', () => {
	const s = setup((skills) => {
		skills[1].attackRate = 0.5;
		skills[1].attackLevel = { attack: 10 };
		skills[1].cost = { mp: 999 };
	});
	s.a.addSkill(ids.support, 2);
	const ctx = s.cast();
	assert.equal(s.c.getHp(), 872); // 100 + (100 × 0.5 + 10 × 2) × 0.4
	assert.equal(s.a.attr.point.mp, 100);
	assert.ok(!ctx.msgs.some((m) => m[0] === 'costMp'));
});

// 测试：主攻未命中不触发协战，协战击杀目标后不再对尸体反击或连击。
test('support: root miss skips support and support kill stops corpse reactions', () => {
	const miss = setup((skills) => {
		skills[0].magic = false;
		skills[0].attack.hit = -100;
	});
	assert.equal(miss.cast().msgs.filter((m) => m[4] === 'support').length, 0);
	const s = setup(
		(skills) => {
			skills[0].next = ids.next;
			skills[0].nofback = false;
		},
		false,
		({ c }) => {
			c.attr.point.hp = 120;
		},
	);
	const ctx = s.cast();
	assert.deepEqual(
		ctx.msgs.filter((m) => m[0] === 'skill').map((m) => m[1]),
		[ids.root, ids.support],
	);
	assert.equal(s.c.isDied(), true);
	assert.equal(ctx.fbackNum, undefined);
});

// 测试：主攻击杀时直接追击其他敌人，不触发协战或 next，也不消耗协战机会。
test('support: a killing hit pursues another enemy without support or next', () => {
	const other = new FightUnitUser(4, attr(), { name: '追击目标' });
	other.setPos(4);
	const s = setup(
		(skills) => {
			skills[0].kill = ids.back;
			skills[0].next = ids.next;
		},
		false,
		({ c, enemies }) => {
			c.attr.point.hp = 50;
			enemies.units.push(other);
		},
	);
	const ctx = s.cast();
	assert.deepEqual(
		ctx.msgs.filter((m) => m[0] === 'skill').map((m) => [m[1], m[2], m[3], m[4]]),
		[
			[ids.root, s.b.uid, s.c.uid, undefined],
			[ids.back, s.b.uid, other.uid, 'kill'],
		],
	);
	assert.equal(ctx.killNum, 1);
	assert.equal(ctx.nextNum, undefined);
	assert.equal(s.a.lastSupportTurn, -1);
	assert.equal(other.getHp(), 950);
});

// 测试：协战子技能循环与主动作共用反应上限，超限抛错并中止结算。
test('support: reaction limit is shared and aborts the action', () => {
	const s = setup((skills) => {
		skills[1].damageRate = 0;
		skills[1].next = ids.support;
	});
	const ctx = initFightContex(s.fight);
	const root = s.b.findSkill(ids.root);
	root.mergeAttack(s.b.attr.magic.base, s.b.attr.magic.final);
	assert.throws(
		() => magicAttackFunc(s.b, s.c, root, ctx),
		/Reaction limit exceeded \(64 nested action scopes\)/,
	);
	assert.equal(ctx.reactionSteps, 64); // 嵌套动作限制先于第 65 次伤害结算触发。
});
