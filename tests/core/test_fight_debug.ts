import { setCounterChance } from '../fixtures/default_skills';
import { strict as assert } from 'node:assert';
import { test, TestContext } from 'node:test';
import * as tb from '../../src';
import { FightAttr, FightCmdEnum, FightUnitUser, initSkills } from '../../src';
import { isDebugHit, isDebugMiss, setFightDebug } from '../../src/fight/FightDebug';
import { setupChain, chainIds } from '../fixtures/skill_chain';

function flags() {
	return {
		hit: false,
		miss: false,
		crit: false,
		next: false,
		spread: false,
		kill: false,
		support: false,
		fback: false,
	};
}
function setup(
	t: TestContext,
	debug: Partial<ReturnType<typeof flags>>,
	options: Parameters<typeof setupChain>[0] = {},
) {
	setFightDebug({ ...flags(), ...debug });
	t.after(() => setFightDebug(undefined));
	const s = setupChain({ rootSelfBuff: false, finalReactions: false, ...options });
	setCounterChance(s.target, 0, false);
	return s;
}

// 测试：宿主可从公共包入口设置战斗调试配置。
test('fight debug: configuration is exported from the public entry', () => {
	assert.equal('setFightDebug' in tb, true);
});

// 测试：调试配置支持部分字段和无参数清空，每次替换而非累加，调用者修改对象不改变已设置状态。
test('fight debug: partial configuration replaces state, copies data and can be cleared', (t) => {
	t.after(() => setFightDebug());
	const data = { hit: true };
	setFightDebug(data);
	data.hit = false;
	assert.equal(isDebugHit(), true);
	setFightDebug({ miss: true });
	assert.equal(isDebugHit(), false);
	assert.equal(isDebugMiss(), true);
	setFightDebug();
	assert.equal(isDebugMiss(), false);
});

for (const [debug, hit] of [
	[{ hit: true }, true],
	[{ miss: true }, false],
	[{ hit: true, miss: true }, false],
] as const) {
	// 测试：强制命中或闪避不抽命中随机数，两个开关同时开启时闪避优先。
	test(`fight debug: physical hit override ${JSON.stringify(debug)}`, (t) => {
		const s = setup(t, debug);
		s.actor.attr.physic.base.hit = 50;
		s.fight.random = () => {
			throw new Error('forced hit must not sample');
		};
		const ctx = s.fight.processUnit(s.actor, {
			cmd: FightCmdEnum.attack,
			target: s.target.uid,
		});
		assert.ok(ctx);
		assert.equal(s.target.getHp(), hit ? 900 : 1000);
		assert.equal(
			ctx.msgs.some((msg) => msg[0] === 'miss'),
			!hit,
		);
		s.flush(ctx);
	});
}

// 测试：零暴击率也能强制暴击，使用原暴击公式与消息，且不抽暴击随机数。
test('fight debug: crit overrides zero probability through the normal damage formula', (t) => {
	const s = setup(t, { crit: true });
	s.fight.random = () => {
		throw new Error('forced crit must not sample');
	};
	const ctx = s.fight.processUnit(s.actor, { cmd: FightCmdEnum.attack, target: s.target.uid });
	assert.ok(ctx);
	assert.equal(s.target.getHp(), 850);
	assert.ok(ctx.msgs.some((msg) => msg[0] === 'hurt' && msg[6].includes('crit')));
	s.flush(ctx);
});

// 测试：治疗通过同一公式获得强制暴击，但仍按最大生命截断并通过原协议同步。
test('fight debug: crit also uses the shared healing formula', (t) => {
	const s = setup(
		t,
		{ crit: true },
		{
			targetHp: 500,
			change: (skills) => {
				Object.assign(skills[0], { func: 'heal', combo: undefined, attack: {} });
			},
		},
	);
	s.fight.random = () => {
		throw new Error('forced heal crit must not sample');
	};
	s.cast();
	assert.equal(s.target.getHp(), 650);
});

// 测试：强制闪避可覆盖技能的alwaysHit，但目标不能闪避时仍按原状态规则命中。
test('fight debug: forced miss respects dodge prohibition and overrides configured alwaysHit', (t) => {
	const s = setup(
		t,
		{ miss: true },
		{
			change: (skills) => {
				Object.assign(skills[0], { magic: false, alwaysHit: true, combo: undefined });
			},
		},
	);
	s.cast();
	assert.equal(s.target.getHp(), 1000);
	t.mock.method(s.target, 'isForbid', (action: string) => action === 'dodge');
	s.cast();
	assert.equal(s.target.getHp(), 960);
});

// 测试：强制反击不覆盖技能nofback，也不会凭空创建连击、溅射或无队友的协战。
test('fight debug: forced reactions preserve prohibition flags and required skill configuration', (t) => {
	const s = setup(
		t,
		{ fback: true, next: true, spread: true, support: true },
		{
			change: (skills) => {
				skills[0].combo = undefined;
			},
		},
	);
	const ctx = s.cast();
	assert.equal(s.actor.getHp(), 1000);
	assert.equal(s.target.getHp(), 960);
	assert.equal(ctx.msgs.filter((msg) => msg[0] === 'skill').length, 1);
});

// 测试：强制连击仍共享原反应预算，循环配置必须抛出Reaction limit而非无限结算。
test('fight debug: forced reaction chains retain the reaction limit', (t) => {
	const s = setup(
		t,
		{ next: true },
		{
			targetHp: 100000,
			otherHp: 100000,
			change: (skills) => {
				Object.assign(skills[0], { combo: undefined, next: chainIds.second });
				Object.assign(skills[1], { combo: undefined, next: chainIds.first, rand: 0 });
			},
		},
	);
	assert.throws(
		() =>
			s.fight.processUnit(s.actor, {
				cmd: FightCmdEnum.skill,
				skill: chainIds.first,
				target: s.target.uid,
			}),
		/Reaction limit/,
	);
});

for (const group of [false, true]) {
	// 测试：配置连击子技能概率为零时可强制发动，群体连击外层也只使用同一次强制判定。
	test(`fight debug: next forces configured zero-probability child, group=${group}`, (t) => {
		const s = setup(
			t,
			{ next: true },
			{
				change: (skills) => {
					Object.assign(skills[0], {
						combo: undefined,
						next: chainIds.second,

					attack: { hurtP: 0 }});
					Object.assign(skills[1], {
						combo: undefined,
						rand: 0,

						sel: { ...skills[1].sel, sortAttr: 'hp', num: group ? 99 : 1 },
					attack: { hurtP: 0 }});
				},
			},
		);
		s.fight.random = () => {
			throw new Error('forced next must not sample');
		};
		const ctx = s.cast();
		assert.equal(ctx.nextNum, 1);
		assert.equal(s.target.getHp(), 800);
		assert.equal(s.other.getHp(), group ? 900 : 1000);
	});
}

// 测试：普通攻击属性中的零概率连击可强制发动，但仍只追加一段。
test('fight debug: next forces the configured normal attack followup', (t) => {
	const s = setup(t, { next: true });
	s.actor.setAttackSkill(chainIds.first);
	Object.assign(s.skills[0], { combo: undefined, next: chainIds.second, attack: {} });
	Object.assign(s.skills[1], { combo: undefined, rand: 0, attack: {} });
	s.fight.random = () => 0;
	const ctx = s.fight.processUnit(s.actor, { cmd: FightCmdEnum.attack, target: s.target.uid });
	assert.ok(ctx);
	assert.equal(s.target.getHp(), 800);
	assert.equal(ctx.msgs.filter((msg) => msg[0] === 'skill' && msg[4] === 'next').length, 1);
	s.flush(ctx);
});

// 测试：强制溅射仍读取已有子技能与副目标规则，不重复攻击主目标。
test('fight debug: spread forces an existing zero-probability spread skill', (t) => {
	const s = setup(
		t,
		{ spread: true },
		{
			change: (skills) => {
				Object.assign(skills[0], {
					combo: undefined,
					spread: chainIds.second,

				attack: { hurtP: 0 }});
				Object.assign(skills[1], { combo: undefined, rand: 0, attack: { hurtP: 0 }});
			},
		},
	);
	s.cast();
	assert.equal(s.target.getHp(), 900);
	assert.equal(s.other.getHp(), 900);
});

// 测试：击杀后可强制发动零概率追击，仍须存在合法存活目标。
test('fight debug: kill forces a configured pursuit after a real kill', (t) => {
	const s = setup(
		t,
		{ kill: true },
		{
			targetHp: 1,
			change: (skills) => {
				Object.assign(skills[0], {
					combo: undefined,
					kill: chainIds.second,

				attack: { hurtP: 0 }});
				Object.assign(skills[1], { combo: undefined, rand: 0, attack: { hurtP: 0 }});
			},
		},
	);
	const ctx = s.cast();
	assert.equal(ctx.killNum, 1);
	assert.equal(s.target.isDied(), true);
	assert.equal(s.other.getHp(), 900);
});

// 测试：强制反击覆盖零概率，但仍通过专用反击类限制为一次，禁止再次互相反击。
test('fight debug: fback forces one counterattack without mutual recursion', (t) => {
	const s = setup(t, { fback: true });
	const ctx = s.fight.processUnit(s.actor, { cmd: FightCmdEnum.attack, target: s.target.uid });
	assert.ok(ctx);
	assert.equal(s.actor.getHp(), 990);
	assert.equal(ctx.msgs.filter((msg) => msg[0] === 'skill' && msg[4] === 'fback').length, 1);
	s.flush(ctx);
});

// 测试：强制协战仍需存活且装配合法技能的队友，每单位每回合仍只尝试一次。
test('fight debug: support forces zero probability while preserving its round quota', (t) => {
	t.mock.method(console, 'warn', () => {});
	const s = setup(t, { support: true });
	const supportId = 10014001;
	initSkills([
		{
			...s.skills[0],
			id: supportId,
			rand: 0,
			combo: undefined,

			nosupport: true,
		attack: { hurtP: 0 }},
	]);
	const attr = Object.assign(new FightAttr(), structuredClone(s.actor.attrOri));
	const supporter = new FightUnitUser(10014002, attr, { name: '协战调试' });
	supporter.setFight(s.fight, s.actor.side);
	supporter.addSkill(supportId, 1);
	supporter.setSupportSkill(supportId);
	s.fight.getSide(s.actor.side).units.push(supporter);
	s.loop.bcMsg([
		'side',
		s.actor.side,
		s.fight.getSide(s.actor.side).units.map((unit) => unit.getUnitMsg()),
	]);
	const cast = () =>
		s.fight.processUnit(s.actor, { cmd: FightCmdEnum.attack, target: s.target.uid });
	const first = cast();
	assert.ok(first);
	assert.equal(first.msgs.filter((msg) => msg[0] === 'skill' && msg[4] === 'support').length, 1);
	s.flush(first);
	const second = cast();
	assert.ok(second);
	assert.equal(
		second.msgs.some((msg) => msg[0] === 'skill' && msg[4] === 'support'),
		false,
	);
	s.flush(second);
});

// 测试：清空调试配置后恢复零概率、命中和暴击的原随机流程，同种子结果与全false配置一致。
test('fight debug: clearing flags restores deterministic normal behavior', (t) => {
	t.after(() => setFightDebug(undefined));
	const run = () => {
		const s = setupChain({
			rootSelfBuff: false,
			finalReactions: false,
			change: (skills) => {
				skills[0].combo = undefined;
			},
		});
		return { msgs: s.cast().msgs, random: s.fight.random() };
	};
	setFightDebug(flags());
	const baseline = run();
	setFightDebug({ ...flags(), hit: true, crit: true, next: true });
	setFightDebug(undefined);
	assert.deepEqual(run(), baseline);
});
