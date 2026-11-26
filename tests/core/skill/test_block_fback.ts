import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { initSkills, getSkillData, TargetSelectEnum, FightUnitUser, FightAttr } from '../../../src';
import { setupChain } from '../../fixtures/skill_chain';

const counterId = 10019961,
	supportId = 10019962,
	spreadId = 10019963;
function setup(combo = false, magic = false, enabled = true) {
	const s = setupChain({
		rootSelfBuff: false,
		finalReactions: true,
		change: (skills) => {
			for (const skill of skills) {
				skill.magic = magic;
				skill.nodback = true;
				skill.nofback = false;
			}
			if (!combo) skills[0].combo = undefined;
		},
	});
	const counter = {
		id: counterId,
		name: '格挡还击',
		magic: false,
		nomove: 1 as const,
		rand: 0,
		attack: { attack: 35 },
		final: {},
		sel: { target: TargetSelectEnum.enemy },
		fbackOnBlock: enabled,
		nosupport: true,
		nodback: true,
	};
	initSkills([counter]);
	s.target.addSkill(counterId, 1);
	s.target.setFBackSkill(counterId);
	s.target.attr.physic.base.parry = 100;
	return s;
}

// 装配的格挡反击技能即使rand为0也可在格挡后发动，原始配置不被修改。
test('block fback: equipped skill bypasses its own chance after a block', () => {
	const s = setup();
	const ctx = s.cast();
	assert.equal(ctx.msgs.filter((msg) => msg[0] === 'skill' && msg[4] === 'fback').length, 1);
	assert.equal(s.actor.getHp(), 955);
	assert.equal(getSkillData(counterId).rand, 0);
});

// 当前攻击段的格挡结果在受伤事件中可由ctx读取，不必从消息列表反查。
test('block fback: damage listeners can read the current blocked result from context', () => {
	const s = setup();
	const blocked: (boolean | undefined)[] = [];
	s.target.onContex('beforeHurt', (_unit, ctx) => blocked.push(ctx.blocked));
	s.cast();
	assert.deepEqual(blocked, [true]);
});

for (const pattern of [
	[true, true, true],
	[true, true, false],
	[false, false, true],
	[false, false, false],
]) {
	// 三连击前两段即使格挡也不反击，只有末段格挡才强制发动一次，且发生在三段伤害之后。
	test(`block fback: combo uses only the terminal block ${pattern.join('/')}`, () => {
		const s = setup(true);
		let stage = 0;
		s.target.attr.physic.base.parry = pattern[0] ? 100 : 0;
		s.target.onContex('hurt', () => {
			stage++;
			s.target.attr.physic.base.parry = pattern[stage] ? 100 : 0;
		});
		const ctx = s.cast();
		const backs = ctx.msgs.filter((msg) => msg[0] === 'skill' && msg[4] === 'fback');
		assert.equal(stage, 3);
		assert.equal(backs.length, pattern[2] ? 1 : 0);
		if (backs.length) {
			const index = ctx.msgs.indexOf(backs[0]);
			assert.equal(
				ctx.msgs
					.slice(0, index)
					.filter((msg) => msg[0] === 'hurt' && msg[2] === s.target.uid).length,
				3,
			);
		}
	});
}

// 来袭技能nofback的禁止优先于格挡必反击，末段配置仍控制整个连招。
test('block fback: incoming nofback still suppresses the guaranteed counter', () => {
	for (const combo of [false, true]) {
		const s = setup(combo);
		s.skills[combo ? 2 : 0].nofback = true;
		const ctx = s.cast();
		assert.ok(ctx.msgs.some((msg) => msg[0] === 'block'));
		assert.equal(
			ctx.msgs.some((msg) => msg[0] === 'skill' && msg[4] === 'fback'),
			false,
		);
	}
});

// 仅跳过反击技能概率；未开启标记、没有格挡或反击者被封印时均不获得强制反击。
test('block fback: trigger flag block result and execution checks remain independent', () => {
	for (const mode of ['disabled', 'notBlocked', 'sealed']) {
		const s = setup(false, false, mode !== 'disabled');
		if (mode === 'notBlocked') s.target.attr.physic.base.parry = 0;
		if (mode === 'sealed') {
			const original = s.target.inStatus.bind(s.target);
			s.target.inStatus = (status) => status === '封印' || original(status);
		}
		const ctx = s.cast();
		assert.equal(
			ctx.msgs.some((msg) => msg[0] === 'skill' && msg[4] === 'fback'),
			false,
		);
	}
});

for (const mainMagic of [false, true]) {
	// 协战复用ctx也不能覆盖主攻击的格挡结果，主攻击与协战分别触发各自规则。
	test(`block fback: support does not replace the main block result magic=${mainMagic}`, () => {
		const s = setup(false, mainMagic);
		initSkills([
			{
				id: supportId,
				name: '掩护',
				magic: !mainMagic,
				rand: 1,
				attack: {},
				final: {},
				sel: { target: TargetSelectEnum.enemy },
				nofback: true,
				nodback: true,
				nosupport: true,
			},
		]);
		const supporter = new FightUnitUser(
			3,
			Object.assign(new FightAttr(), structuredClone(s.actor.attrOri)),
			{ name: '同伴' },
		);
		supporter.addSkill(supportId, 1);
		supporter.setSupportSkill(supportId);
		supporter.setFight(s.fight, 0);
		supporter.setPos(1);
		s.fight.getSide(0).units.push(supporter);
		s.client.onMsg(['side', 0, s.fight.getSide(0).units.map((unit) => unit.getUnitMsg())]);
		const ctx = s.cast();
		assert.ok(ctx.msgs.some((msg) => msg[0] === 'skill' && msg[4] === 'support'));
		assert.equal(
			ctx.msgs.filter((msg) => msg[0] === 'skill' && msg[4] === 'fback').length,
			mainMagic ? 0 : 1,
		);
	});
}

// 溅射副目标没有格挡时，也不能抹掉主目标格挡触发的反击机会。
test('block fback: splash does not erase the primary block', () => {
	const s = setup();
	initSkills([
		{
			id: spreadId,
			name: '余势',
			magic: false,
			rand: 1,
			attack: {},
			final: {},
			sel: { target: TargetSelectEnum.enemy, num: 1 },
			nofback: true,
			nodback: true,
		},
	]);
	s.skills[0].spread = spreadId;
	const ctx = s.cast();
	assert.ok(ctx.msgs.some((msg) => msg[0] === 'spread'));
	assert.equal(ctx.msgs.filter((msg) => msg[0] === 'skill' && msg[4] === 'fback').length, 1);
});

// 双方都装配格挡反击且都格挡时，专用反击技能仍禁止再次触发反击，避免无限递归。
test('block fback: a counter cannot trigger another counter even when blocked', () => {
	const s = setup();
	s.actor.addSkill(counterId, 1);
	s.actor.setFBackSkill(counterId);
	s.actor.attr.physic.base.parry = 100;
	const ctx = s.cast();
	assert.equal(ctx.msgs.filter((msg) => msg[0] === 'block').length, 2);
	assert.equal(ctx.msgs.filter((msg) => msg[0] === 'skill' && msg[4] === 'fback').length, 1);
});
