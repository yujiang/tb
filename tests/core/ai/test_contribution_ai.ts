import { setFightGlobalData } from '../../../src/fight/Datas/FightGlobalData';
import '../../../src/fight/Datas/BuffDatas';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
	BaseAttack,
	Fight,
	FightAttr,
	FightSide,
	FightUnitUser,
	FightUnitMonster,
	FightLoopPC,
	FightClient,
	FightCmdEnum,
	FightAITarget,
	createAI,
	createLethalSkillData,
	initSkills,
	initBuffs,
	initFightContex,
	OverlapEnum,
	TargetSelectEnum,
} from '../../../src';

const physical = 10011701,
	magical = 10011702,
	stone = 10011703;
function attributes(): FightAttr {
	const base = (attack = 0): BaseAttack => ({
		attack,
		rand: 0,
		hit: 0,
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
	const a = new FightAttr();
	a.point = { hp: 1000, hpMax: 1000, mp: 100, mpMax: 100 };
	a.speed = 100;
	const group = () => ({
		base: base(1234),
		next: base(),
		kill: base(),
		spread: base(),
		fback: base(),
		final: { bloodP: 0, dbackP: 0, immunity: 0, immunityP: 0 },
	});
	a.physic = group();
	a.magic = group();
	a.heal = base(100);
	a.poison = base();
	return a;
}
function setup(type: 'topThreat' | 'topHealer', magic = false) {
	initSkills([createLethalSkillData(physical), createLethalSkillData(magical, true)]);
	initBuffs([
		{
			id: stone,
			name: '石化',
			desc: '',
			status: ['石化'],
			tags: [],
			magic: false,
			attackType: 'base',
			attack: {},
			final: {},
			overlap: OverlapEnum.REPLACE,
			lastTurn: 0,
			times: 0,
			event: 'hurt',
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
		10011700,
		{ id: 1, runaway: false, runawayGrade: 0, deathPenalty: 0, winRecover: 0, winReward: 0 },
		0,
	);
	const players = [0, 1, 2, 3].map(
		(uid) => new FightUnitUser(uid, attributes(), { name: `玩家${uid}` }),
	);
	const boss = new FightUnitMonster(9, attributes(), { name: '处决者' });
	const ally = new FightUnitMonster(10, attributes(), { name: '怪物队友' });
	const a = new FightSide(),
		b = new FightSide();
	a.units.push(...players);
	b.units.push(boss, ally);
	players.forEach((unit, pos) => unit.setPos(pos));
	boss.setPos(0);
	ally.setPos(1);
	fight.createSide(a, b);
	const skill = magic ? magical : physical;
	boss.addSkill(skill, 1);
	boss.setAI({
		id: 1, type: 'target',
		contributions: type === 'topThreat' ? 'unitHurt' : 'enemyHeal',
		skill,
	});
	const loop = new FightLoopPC(fight),
		client = new FightClient();
	loop.onMsg((msgs) => client.onMsg(JSON.parse(JSON.stringify(msgs))));
	loop.start();
	loop.nextTurn();
	const decide = () => {
		boss.inputStart(fight.turn, initFightContex(fight));
		return boss.input;
	};
	const flush = (ctx: ReturnType<typeof initFightContex>) => {
		loop.bcMsg(ctx.msgs);
		assert.equal(client.checkSame(fight), true);
	};
	return { fight, players, boss, ally, skill, decide, loop, client, flush };
}

for (const magic of [false, true]) {
	// 测试：两种致死均固定使用999999攻击力且必中，选中仇恨最高者，击杀、实际仇恨和客户端消息一致。
	test(`contribution AI: highest threat receives a guaranteed lethal hit with magic=${magic}`, () => {
		const s = setup('topThreat', magic),
			ctx = initFightContex(s.fight);
		s.boss.onHurt(s.players[1], 'test', 20, ctx);
		s.boss.onHurt(s.players[0], 'test', 50, ctx);
		s.flush(ctx);
		s.players[0].attr.physic.base.dodge = 1e9;
		const input = s.decide();
		assert.deepEqual(input, { cmd: FightCmdEnum.skill, skill: s.skill, target: 0 });
		const action = s.fight.processUnit(s.boss, input);
		assert.ok(action);
		s.flush(action);
		assert.equal(s.players[0].isDied(), true);
		assert.equal(s.players[0].getHp(), 0);
		assert.equal(s.players[0].enemyHurt.get(s.boss.uid), 1000);
		assert.equal(
			action.msgs.some((msg) => msg[0] === 'miss'),
			false,
		);
		assert.equal(s.players[1].getHp(), 1000);
	});

	// 测试：致死固定的是攻击力而非最终扣血，物理/魔法仍读取各自防御，不叠加单位攻击力。
	test(`lethal skill: fixed attack preserves the matching defense pipeline with magic=${magic}`, () => {
		const s = setup('topThreat', magic);
		s.boss.enemyHurt.set(0, 1);
		s.players[0].attr.physic.base.defend = 999_990;
		s.players[0].attr.magic.base.defend = 999_980;
		s.players[0].attr.physic.base.dodge = 1e9;
		s.fight.random = () => {
			throw new Error('必中且无暴击/反应时不应抽样');
		};
		s.fight.processUnit(s.boss, s.decide());
		assert.equal(s.players[0].getHp(), magic ? 981 : 991);
	});
}

for (const type of ['topThreat', 'topHealer'] as const) {
	for (const invalid of ['dead', 'stone', 'departed', 'ally', 'missing'] as const) {
		// 测试：贡献最高者死亡、石化、离场、转为友方或不存在时，先过滤无效者，再选择下一名有效敌人。
		test(`contribution AI: ${type} skips a ${invalid} leading contributor`, () => {
			const s = setup(type);
			const scores =
				type === 'topThreat' ? s.boss.enemyHurt : s.fight.getSide(s.players[0].side).heal;
			scores.set(invalid === 'missing' ? 9999 : 0, 100);
			scores.set(1, 20);
			if (invalid === 'dead') s.players[0].die();
			if (invalid === 'stone')
				s.players[0].addBuff(s.boss, 'test', stone, 1, initFightContex(s.fight));
			if (invalid === 'departed' || invalid === 'ally')
				s.fight.getSide(s.players[0].side).units.splice(0, 1);
			if (invalid === 'ally') {
				s.players[0].setFight(s.fight, s.boss.side);
				s.fight.getSide(s.boss.side).units.push(s.players[0]);
			}
			assert.deepEqual(s.decide(), { cmd: FightCmdEnum.skill, skill: s.skill, target: 1 });
		});
	}

	// 测试：没有有效正贡献者时回退普通攻击，同分按贡献记录顺序选择且不消耗随机数。
	test(`contribution AI: ${type} falls back when empty and resolves ties deterministically`, () => {
		const s = setup(type);
		assert.deepEqual(s.decide(), { cmd: FightCmdEnum.attack });
		const scores =
			type === 'topThreat' ? s.boss.enemyHurt : s.fight.getSide(s.players[0].side).heal;
		scores.set(2, 0);
		scores.set(3, NaN);
		scores.set(1, 10);
		scores.set(0, 10);
		s.fight.random = () => {
			throw new Error('贡献排名不应抽样');
		};
		assert.equal(s.decide().target, 1);
	});

	// 测试：技能未学习、封印、休息或冷却时不提交致死指令，沿用普攻回退。
	test(`contribution AI: ${type} falls back while the chosen skill is unavailable`, () => {
		const s = setup(type);
		const scores =
			type === 'topThreat' ? s.boss.enemyHurt : s.fight.getSide(s.players[0].side).heal;
		scores.set(0, 10);
		for (const status of ['封印', '休息']) {
			const original = s.boss.inStatus.bind(s.boss);
			s.boss.inStatus = (name) => name === status;
			assert.deepEqual(s.decide(), { cmd: FightCmdEnum.attack });
			s.boss.inStatus = original;
		}
		const learned = s.boss.findSkill(s.skill);
		learned.getXls().cd = 2;
		s.boss.startSkillCd(learned, initFightContex(s.fight));
		assert.deepEqual(s.decide(), { cmd: FightCmdEnum.attack });
		s.fight.nextTurn();
		s.fight.nextTurn();
		assert.equal(s.decide().target, 0);
		s.boss.setAI({
			id: 1, type: 'target',
			contributions: type === 'topThreat' ? 'unitHurt' : 'enemyHeal',
			skill: 10011799,
		});
		assert.deepEqual(s.decide(), { cmd: FightCmdEnum.attack });
	});
}

// 测试：治疗贡献跨多个己方受疗者汇总，满血溢出不增加排名，不混入怪物阵营的受疗记录。
test('top healer AI: sum actual team healing instead of choosing the largest individual record', () => {
	const s = setup('topHealer'),
		ctx = initFightContex(s.fight);
	for (const recipient of [s.players[2], s.players[3]])
		recipient.onHurt(s.boss, 'test', 500, ctx);
	s.players[2].onHeal(s.players[0], 'heal', 200, ctx);
	s.players[3].onHeal(s.players[0], 'heal', 200, ctx);
	s.players[2].onHeal(s.players[1], 'heal', 10000, ctx); // 实际仅300，低于玩家0累计400。
	s.ally.friendHeal.set(1, 99999);
	s.flush(ctx);
	assert.equal(s.players[2].friendHeal.get(1), 300);
	assert.equal(s.decide().target, 0);
	s.players[3].die(); // 已死亡受疗者的历史治疗仍参与累计。
	assert.equal(s.decide().target, 0);
});

// 测试：受疗者离场后阵营仍保留其历史治疗贡献，不能因移除单位丢失最高治疗者的排名。
test('top healer AI: departed recipients do not erase team healing history', () => {
	const s = setup('topHealer'),
		ctx = initFightContex(s.fight);
	s.players[2].onHurt(s.boss, 'test', 500, ctx);
	s.players[2].onHeal(s.players[0], 'heal', 400, ctx);
	s.players[3].onHurt(s.boss, 'test', 500, ctx);
	s.players[3].onHeal(s.players[1], 'heal', 200, ctx);
	s.fight.getSide(s.players[2].side).units.splice(2, 1);
	assert.equal(s.decide().target, 0);
});

// 测试：工厂创建两种独立AI，物理/魔法致死配置互不共享，非法技能ID在构造时拒绝。
test('contribution AI: factories create independent typed instances and validate skill IDs', () => {
	assert.ok(
		createAI({ id: 1, type: 'target', contributions: 'unitHurt', skill: physical }) instanceof
			FightAITarget,
	);
	assert.ok(
		createAI({ id: 1, type: 'target', contributions: 'enemyHeal', skill: magical }) instanceof
			FightAITarget,
	);
	assert.notEqual(
		createAI({ id: 1, type: 'target', contributions: 'unitHurt', skill: physical }),
		createAI({ id: 1, type: 'target', contributions: 'unitHurt', skill: physical }),
	);
	for (const skill of [0, -1, 1.5, NaN])
		assert.throws(
			() => createAI({ id: 1, type: 'target', contributions: 'unitHurt', skill }),
			/positive safe integer/,
		);
	const first = createLethalSkillData(physical),
		second = createLethalSkillData(magical, true);
	first.attack.attack = 1;
	assert.equal(second.attack.attack, 999_999);
});

for (const type of ['topThreat', 'topHealer'] as const) {
	// 测试：最高贡献选人方法与技能独立，省略skill时向选中的敌人提交普通攻击。
	test(`target AI: ${type} also works with ordinary attacks`, () => {
		const s = setup(type);
		const scores =
			type === 'topThreat' ? s.boss.enemyHurt : s.fight.getSide(s.players[0].side).heal;
		scores.set(0, 50);
		scores.set(1, 10);
		s.boss.setAI({
			id: 1, type: 'target',
			contributions: type === 'topThreat' ? 'unitHurt' : 'enemyHeal',
		});
		assert.deepEqual(s.decide(), { cmd: FightCmdEnum.attack, target: 0 });
	});

	// 测试：AI只决定原始意图，有效嘲讽仍可把致死攻击重定向，实际扣血贡献归入施法者阵营。
	test(`target AI: taunt still redirects ${type} skill actions`, () => {
		const s = setup(type);
		const scores =
			type === 'topThreat' ? s.boss.enemyHurt : s.fight.getSide(s.players[0].side).heal;
		scores.set(0, 50);
		const initial = initFightContex(s.fight),
			taunt = 10011704;
		initBuffs([
			{
				id: taunt,
				name: '嘲讽',
				desc: '',
				class: 'taunt',
				status: [],
				tags: [],
				magic: false,
				attackType: 'base',
				attack: {},
				final: {},
				overlap: OverlapEnum.REPLACE,
				lastTurn: 0,
				times: 0,
				event: 'hurt',
			},
		]);
		s.boss.addBuff(s.players[1], 'test', taunt, 1, initial);
		s.flush(initial);
		const input = s.decide();
		assert.equal(input.target, 0);
		const ctx = s.fight.processUnit(s.boss, input);
		assert.ok(ctx);
		s.flush(ctx);
		assert.equal(ctx.defend.uid, 1);
		assert.equal(s.players[0].getHp(), 1000);
		assert.equal(s.players[1].getHp(), 0);
		assert.equal(input.target, 0);
		assert.equal(s.fight.getSide(s.boss.side).hurt.get(s.boss.uid), 1000);
	});
}

for (const magic of [false, true]) {
	// 测试：后排医生选人也能搭配任意致死技能，前排医生不会成为目标，执行复用普通技能流程。
	test(`target AI: rear doctor selection combines with lethal magic=${magic}`, () => {
		const s = setup('topThreat', magic);
		s.fight.createMap(3, 3);
		s.players[0].attr.career = s.players[1].attr.career = '医生';
		s.players[0].setPos(6);
		s.players[1].setPos(0);
		s.boss.setAI({ id: 1, type: 'target', career: '医生', pos: 'back', skill: s.skill });
		const input = s.decide();
		assert.deepEqual(input, { cmd: FightCmdEnum.skill, skill: s.skill, target: 0 });
		const ctx = s.fight.processUnit(s.boss, input);
		assert.ok(ctx);
		assert.equal(s.players[0].isDied(), true);
		assert.equal(s.players[1].getHp(), 1000);
	});
}

// 测试：物理技能只有显式alwaysHit=true才跳过命中，false时仍可被闪避，必中不是提高命中属性。
test('lethal skill: alwaysHit false preserves ordinary physical dodge checks', () => {
	const s = setup('topThreat');
	s.boss.findSkill(s.skill).getXls().alwaysHit = false;
	s.boss.enemyHurt.set(0, 1);
	s.players[0].attr.physic.base.dodge = 1e9;
	const ctx = s.fight.processUnit(s.boss, s.decide());
	assert.ok(ctx);
	assert.equal(
		ctx.msgs.some((msg) => msg[0] === 'miss'),
		true,
	);
	assert.equal(s.players[0].getHp(), 1000);
});

// 测试：duiwei战斗配置只控制自动普攻，明确指定非对位敌人仍合法，AI后排选人可复用严格校验。
test('target AI: default position rules do not reject explicit ordinary attack targets', () => {
	const s = setup('topThreat');
	setFightGlobalData({ duiwei: true });
	s.fight.createMap(3, 3);
	s.boss.setPos(0);
	s.players[0].setPos(6);
	s.players[1].setPos(2);
	assert.equal(s.fight.checkPC(s.boss, { cmd: FightCmdEnum.attack, target: 0 }), true);
});

for (const contributions of [
	'unitHurt',
	'unitHeal',
	'enemyHurt',
	'enemyHeal',
	'friendHurt',
	'friendHeal',
]) {
	// 六种贡献来源分别读取对应榜单，零值与非法数值不参与排名。
	test(`target AI: contribution source ${contributions} selects its legal leader`, () => {
		const s = setup('topThreat');
		const friendly = contributions === 'unitHeal' || contributions.startsWith('friend');
		const target = friendly ? s.ally : s.players[0];
		const scores =
			contributions === 'unitHurt'
				? s.boss.enemyHurt
				: contributions === 'unitHeal'
					? s.boss.friendHeal
					: s.fight.getSide(friendly ? s.boss.side : s.players[0].side)[
							contributions.endsWith('Hurt') ? 'hurt' : 'heal'
						];
		scores.set(target.uid, 10);
		s.boss.setAI({ id: 1, type: 'target', contributions });
		if (friendly) {
			const skill = s.boss.findSkill(s.skill);
			skill.getXls().sel.target = TargetSelectEnum.friend;
			s.boss.setAI({ id: 1, type: 'target', contributions, skill: s.skill });
		}
		assert.equal(s.decide().target, target.uid);
	});
}
