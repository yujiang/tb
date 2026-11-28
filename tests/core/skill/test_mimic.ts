import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
	FightAttr,
	FightCmdEnum,
	FightUnitUser,
	TargetSelectEnum,
	initSkills,
	getSkillData,
	initFightContex,
	PropEnum,
	setFightGlobalData,
	initBuffs,
	getBuffData,
	FightLoopPC,
	FightClient,
} from '../../../src';
import { setupChain, chainIds } from '../../fixtures/skill_chain';

const original = 10015201,
	mimic = 10015202;
function setup(group = false) {
	const s = setupChain({ rootSelfBuff: false, finalReactions: false });
	const copier = new FightUnitUser(
		3,
		Object.assign(new FightAttr(), structuredClone(s.actor.attrOri)),
		{ name: '模仿者' },
	);
	copier.attrOri.magic.base.attack = 40;
	copier.calcAttr();
	copier.attr.point.mp = 100;
	s.fight.getSide(0).units.push(copier);
	copier.setFight(s.fight, 0);
	copier.setPos(1);
	initSkills([
		{
			...s.skills[0],
			id: original,
			name: '原招',
			func: 'normal',
			combo: undefined,

			attack: { attack: 10 , hurtP: 0},
			attackLevel: { attack: 5 },
			cost: { mp: 80 },
			cd: 3,
			sel: { target: TargetSelectEnum.enemy, num: group ? 2 : 1 },
			nosupport: true,
			noprotect: true,
		},
		{
			id: mimic,
			name: '模仿',
			func: 'mimic',
			magic: true,
			nomove: 1,
			rand: 1,
			attack: {},
			final: {},
			sel: { target: TargetSelectEnum.self },
			cost: { mp: 5 },
			cd: 2,
		},
	]);
	s.actor.addSkill(original, 3);
	copier.addSkill(mimic, 1);
	const castOriginal = () =>
		s.fight.processUnit(s.actor, {
			cmd: FightCmdEnum.skill,
			skill: original,
			target: s.target.uid,
		});
	const copy = () => s.fight.processUnit(copier, { cmd: FightCmdEnum.skill, skill: mimic });
	return { ...s, copier, castOriginal, copy };
}

// 测试：未学会原技能也能模仿，用原等级与自身属性攻击原目标，只消耗模仿技能本身的费用和CD。
test('mimic: uses an unlearned attack at the original level with its own attributes', () => {
	const s = setup();
	s.castOriginal();
	const before = s.target.getHp();
	const ctx = s.copy();
	assert.ok(
		ctx?.msgs.some(
			(m) =>
				m[0] === 'skill' &&
				m[1] === original &&
				m[2] === s.copier.uid &&
				m[3] === s.target.uid,
		),
	);
	assert.equal(before - s.target.getHp(), 65);
	assert.equal(s.copier.attr.point.mp, 95);
	assert.equal(s.copier.getSkillCd(mimic), 2);
	assert.equal(s.copier.getSkillCd(original), 0);
	assert.equal(s.copier.findSkill(original), undefined);
	assert.equal(s.copier.skills.has(original), false);
});

// 测试：防御、普通非攻击技能不覆盖最近攻击记录，模仿后保留已学原技能实例及其等级。
test('mimic: ignores defensive actions and preserves learned skills', () => {
	const s = setup();
	const learned = s.copier.addSkill(original, 1);
	s.castOriginal();
	s.fight.processUnit(s.other, { cmd: FightCmdEnum.defend });
	const buffOnly = 10015203;
	initSkills([{ ...getSkillData(mimic), id: buffOnly, func: 'nohurt', cost: undefined, cd: 0 }]);
	s.other.addSkill(buffOnly, 1);
	s.fight.processUnit(s.other, { cmd: FightCmdEnum.skill, skill: buffOnly, target: s.other.uid });
	const before = s.target.getHp();
	s.copy();
	assert.equal(before - s.target.getHp(), 65);
	assert.equal(s.copier.findSkill(original), learned);
	assert.equal(learned.level, 1);
});

for (const reason of [
	'no history',
	'move forbidden',
	'skill forbidden',
	'target forbidden',
	'insufficient mimic cost',
] as const) {
	// 测试：无记录或原攻击的目标、移动、封印、费用检查失败时，拒绝模仿且不支付模仿费用。
	test(`mimic: preserves checks for ${reason}`, () => {
		const s = setup();
		if (reason !== 'no history') s.castOriginal();
		if (reason === 'move forbidden') s.copier.isForbid = (action) => action === 'move';
		if (reason === 'skill forbidden') s.copier.isForbid = (action) => action === 'skill';
		if (reason === 'target forbidden') s.target.isForbidBeAction = () => true;
		if (reason === 'insufficient mimic cost') s.copier.attr.point.mp = 4;
		const mp = s.copier.attr.point.mp;
		assert.equal(s.fight.checkPC(s.copier, { cmd: FightCmdEnum.skill, skill: mimic }), false);
		const ctx = s.copy();
		assert.ok(!ctx?.msgs.some((m) => m[0] === 'hurt'));
		assert.equal(s.copier.attr.point.mp, mp);
		assert.equal(s.copier.getSkillCd(mimic), 0);
		assert.equal(s.copier.findSkill(original), undefined);
	});
}

// 测试：被模仿技能已有CD也能执行，既不启动新CD，也不延长或缩短已有CD。
test('mimic: ignores the copied skill cooldown without changing it', () => {
	const s = setup();
	s.castOriginal();
	s.copier.startSkillCd(s.actor.findSkill(original), initFightContex(s.fight));
	s.fight.turn++;
	assert.equal(s.copier.getSkillCd(original), 2);
	assert.equal(s.fight.checkPC(s.copier, { cmd: FightCmdEnum.skill, skill: mimic }), true);
	const before = s.target.getHp();
	s.copy();
	assert.equal(before - s.target.getHp(), 65);
	assert.equal(s.copier.attr.point.mp, 95);
	assert.equal(s.copier.getSkillCd(original), 2);
});

// 测试：原技能同时消耗HP/MP/SP/JP时，模仿者只需支付模仿的费用，原表配置不被修改。
test('mimic: ignores every copied resource cost and only pays its own cost', () => {
	const s = setup();
	const data = { ...getSkillData(original), cost: { hp: 40, mp: 80, sp: 60, jp: 50 } };
	initSkills([data]);
	s.actor.addSkill(original, 3);
	setFightGlobalData({ jiqi: true });
	Object.assign(s.actor.attr.point, { sp: 100, spMax: 100, jp: 100, jpMax: 100 });
	Object.assign(s.copier.attr.point, { mp: 5, sp: 0, jp: 0 });
	s.castOriginal();
	const hp = s.copier.getHp();
	assert.equal(s.fight.checkPC(s.copier, { cmd: FightCmdEnum.skill, skill: mimic }), true);
	const before = s.target.getHp();
	const ctx = s.copy();
	assert.equal(before - s.target.getHp(), 65);
	assert.equal(s.copier.getHp(), hp);
	assert.equal(s.copier.attr.point.mp, 0);
	assert.equal(s.copier.attr.point.sp, 0);
	assert.equal(s.copier.attr.point.jp, 0);
	assert.equal(s.copier.getSkillCd(mimic), 2);
	assert.equal(s.copier.getSkillCd(original), 0);
	assert.equal(ctx.msgs.filter((m) => m[0] === 'costMp' && m[1] === s.copier.uid).length, 1);
	assert.ok(!ctx.msgs.some((m) => m[0] === 'costHp' || m[0] === 'costSp' || m[0] === 'costJp'));
	assert.ok(!ctx.msgs.some((m) => m[0] === 'skillCd' && m[2] === original));
	assert.deepEqual(data.cost, { hp: 40, mp: 80, sp: 60, jp: 50 });
	assert.equal(data.cd, 3);
});

// 测试：普通攻击也可被模仿，仍攻击同一敌人并使用模仿者自己的普通攻击属性。
test('mimic: copies an ordinary attack', () => {
	const s = setup();
	s.copier.attrOri.physic.base.attack = 35;
	s.copier.calcAttr();
	s.fight.processUnit(s.actor, { cmd: FightCmdEnum.attack, target: s.target.uid });
	const before = s.target.getHp();
	s.copy();
	assert.equal(before - s.target.getHp(), 35);
	assert.equal(s.copier.attr.point.mp, 95);
});

// 测试：普通攻击显式指定的敌人不受默认对位约束，模仿仍保留原目标。
test('mimic: ordinary attack targets follow explicit target rules on a duel map', () => {
	const s = setup();
	setFightGlobalData({ duiwei: true });
	s.fight.createMap(3, 1);
	s.actor.setPos(0);
	s.target.setPos(0);
	s.copier.setPos(1);
	s.other.setPos(1);
	s.fight.processUnit(s.actor, { cmd: FightCmdEnum.attack, target: s.target.uid });
	const before = s.target.getHp();
	s.copy();
	assert.equal(before - s.target.getHp(), 100);
});

// 测试：群攻模仿原输入指令，按当前场面重新选择目标，不固定上一次目标集合。
test('mimic: group attacks replay the input and select targets again', () => {
	const s = setup(true);
	const third = new FightUnitUser(
		4,
		Object.assign(new FightAttr(), structuredClone(s.actor.attrOri)),
		{ name: '第三敌人' },
	);
	s.fight.getSide(1).units.push(third);
	third.setFight(s.fight, 1);
	third.setPos(2);
	s.fight.random = () => 0;
	const first = s.castOriginal();
	const targets = first.msgs
		.filter((m) => m[0] === 'skill' && m[1] === original)
		.map((m) => m[3]);
	s.fight.random = () => 0.999;
	const copied = s.copy();
	assert.deepEqual(
		copied.msgs.filter((m) => m[0] === 'skill' && m[1] === original).map((m) => m[3]),
		[s.target.uid, s.other.uid],
	);
	assert.notDeepEqual(targets, [s.target.uid, s.other.uid]);
	assert.equal(s.copier.attr.point.mp, 95);
});

// 测试：原指令未指定目标时，模仿也保持自动选人，不锁定上次选出的敌人。
test('mimic: an automatic target remains automatic in the recorded input', () => {
	const s = setup();
	s.fight.random = () => 0;
	s.fight.processUnit(s.actor, { cmd: FightCmdEnum.skill, skill: original });
	const hp = s.target.getHp();
	s.fight.random = () => 0.999;
	s.copy();
	assert.equal(s.target.getHp(), hp);
	assert.equal(s.other.getHp(), 935);
});

// 测试：原指令的显式目标死亡后，模仿走已有目标回退流程，选择仍合法的敌人。
test('mimic: the recorded input uses the normal invalid-target fallback', () => {
	const s = setup();
	s.castOriginal();
	s.target.die();
	assert.equal(s.fight.checkPC(s.copier, { cmd: FightCmdEnum.skill, skill: mimic }), true);
	s.copy();
	assert.equal(s.other.getHp(), 935);
	assert.equal(s.copier.attr.point.mp, 95);
});

// 测试：保存输入副本，调用者修改原指令不能改变之后模仿的显式目标。
test('mimic: records a copy of the input command', () => {
	const s = setup();
	const input = { cmd: FightCmdEnum.skill, skill: original, target: s.target.uid };
	s.fight.processUnit(s.actor, input);
	input.target = s.other.uid;
	const hp = s.target.getHp();
	s.copy();
	assert.equal(hp - s.target.getHp(), 65);
	assert.equal(s.other.getHp(), 1000);
});

// 测试：普通攻击后自动施放的破盾攻击大招才是最近攻击，不能被较早结束的普通技能覆盖。
test('mimic: an automatic ultimate remains the most recent attack', () => {
	const s = setup(true);
	const ultimate = 10015204;
	initSkills([
		{
			...getSkillData(original),
			id: ultimate,
			cost: undefined,
			cd: 0,
			attack: { attack: 1 },
			attackLevel: {},
			sel: { target: TargetSelectEnum.enemy },
		},
	]);
	s.actor.addSkill(ultimate, 1);
	s.actor.setUltimateSkill(ultimate);
	setFightGlobalData({ allShieldBreak: true });
	s.actor.attrOri.weaponProp = PropEnum.金;
	for (const unit of [s.target, s.other]) {
		unit.attrOri.shield = 1;
		unit.attrOri.weakProp = [PropEnum.金];
		unit.calcAttr();
	}
	s.actor.calcAttr();
	const first = s.castOriginal();
	assert.ok(first.msgs.some((m) => m[0] === 'skill' && m[1] === ultimate));
	const copied = s.copy();
	assert.ok(
		copied.msgs.some((m) => m[0] === 'skill' && m[1] === ultimate && m[2] === s.copier.uid),
	);
	assert.ok(!copied.msgs.some((m) => m[0] === 'skill' && m[1] === original));
});

// 测试：B放保护不覆盖A的攻击记录，后续模仿仍攻击A原来的敌人。
test('mimic: protection does not overwrite the last attack', () => {
	const s = setup();
	const protect = 10015205;
	initBuffs([{ ...getBuffData(chainIds.rest), id: protect, class: 'protect' }]);
	setFightGlobalData({ protectBuff: protect });
	s.castOriginal();
	const protection = s.fight.processUnit(s.copier, {
		cmd: FightCmdEnum.protect,
		target: s.actor.uid,
	});
	assert.ok(protection?.msgs.some((m) => m[0] === 'protect'));
	const before = s.target.getHp();
	s.copy();
	assert.equal(before - s.target.getHp(), 65);
});

// 测试：被模仿的攻击抛错后撤销临时技能能力，未学技能及其CD不能在后续普通输入中被绕过。
test('mimic: an exception revokes the temporary skill', () => {
	const s = setup();
	s.castOriginal();
	const failure = new Error('copied attack failed');
	s.target.onHurt = () => {
		throw failure;
	};
	assert.throws(s.copy, (error) => error === failure);
	assert.equal(s.copier.findSkill(original), undefined);
	assert.equal(s.copier.isTemporarySkill(original), false);
	assert.equal(
		s.fight.checkPC(s.copier, {
			cmd: FightCmdEnum.skill,
			skill: original,
			target: s.target.uid,
		}),
		false,
	);
});

// 测试：PC中A先攻击、B防御、C再模仿，实际执行记录与客户端资源消息一致。
test('mimic: PC execution skips defensive turns and synchronizes the copied costs', async () => {
	const s = setup();
	s.loop.end();
	s.target.getActionInput = () => ({ cmd: FightCmdEnum.defend });
	s.other.getActionInput = () => ({ cmd: FightCmdEnum.defend });
	for (const [unit, speed] of [
		[s.actor, 300],
		[s.target, 200],
		[s.copier, 100],
		[s.other, 50],
	] as const) {
		unit.attrOri.speed = speed;
		unit.calcAttr();
	}
	const loop = new FightLoopPC(s.fight),
		client = new FightClient();
	loop.onMsg((msgs) => client.onMsg(JSON.parse(JSON.stringify(msgs))));
	loop.on('input', (unit) => {
		assert.ok(
			loop.onInput(
				unit.uid,
				unit === s.actor
					? { cmd: FightCmdEnum.skill, skill: original, target: s.target.uid }
					: { cmd: FightCmdEnum.skill, skill: mimic },
			),
		);
	});
	loop.start();
	for (const unit of s.fight.getAllUnits()) unit.speedRand = 0;
	loop.nextTurn();
	await loop.processOneTurn(s.fight.turn);
	// B防御减半C的伤害：A先造成125，C按65减半向下取整造成32。
	assert.equal(s.target.getHp(), 843);
	assert.equal(s.copier.attr.point.mp, 95);
	assert.ok(client.checkSame(s.fight));
	loop.end();
});
