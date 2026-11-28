import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
	FightAttr,
	FightCmdEnum,
	FightUnitUser,
	TargetSelectEnum,
	getBuffData,
	initBuffs,
	initSkills,
	setFightGlobalData,
	FightLoopPC,
} from '../../../src';
import { setupChain, chainIds } from '../../fixtures/skill_chain';

const advanced = 10015401,
	first = 10015402,
	second = 10015403,
	heal = 10015404;
function setup() {
	const s = setupChain({ rootSelfBuff: false, finalReactions: false });
	const copier = new FightUnitUser(
		3,
		Object.assign(new FightAttr(), structuredClone(s.actor.attrOri)),
		{ name: '高级模仿者' },
	);
	copier.attrOri.magic.base.attack = 40;
	copier.calcAttr();
	s.fight.getSide(0).units.push(copier);
	copier.setFight(s.fight, 0);
	copier.setPos(1);
	initSkills([
		{
			...s.skills[0],
			id: first,
			name: '甲招',
			combo: undefined,

			cd: 0,
			attack: { attack: 10 , hurtP: 0},
			attackLevel: { attack: 5 },
			nosupport: true,
		},
		{
			...s.skills[0],
			id: second,
			name: '乙招',
			combo: undefined,

			cd: 0,
			attack: { attack: 80 , hurtP: 0},
			nosupport: true,
		},
		{
			id: advanced,
			name: '高级模仿',
			func: 'mimic',
			magic: true,
			nomove: 1,
			rand: 1,
			sel: { target: TargetSelectEnum.any },
			attack: {},
			final: {},
			cost: { mp: 5 },
			cd: 2,
		},
		{
			id: heal,
			name: '自身治疗',
			func: 'heal',
			magic: true,
			nomove: 1,
			rand: 1,
			sel: { target: TargetSelectEnum.self },

			attack: { attack: 50 },
			final: {},
			cost: { mp: 70 },
			cd: 4,
		},
	]);
	s.actor.addSkill(first, 3);
	s.other.addSkill(second, 1);
	copier.addSkill(advanced, 1);
	const castFirst = () =>
		s.fight.processUnit(s.actor, {
			cmd: FightCmdEnum.skill,
			skill: first,
			target: s.target.uid,
		});
	const copy = (source: number) =>
		s.fight.processUnit(copier, { cmd: FightCmdEnum.skill, skill: advanced, target: source });
	return { ...s, copier, castFirst, copy };
}

// 测试：分别记录每个单位，高级模仿能选择UID为0的较早行动者，不被全局最后行动覆盖。
test('mimic any: selects an earlier actor and retains its original level', () => {
	const s = setup();
	s.castFirst();
	s.fight.processUnit(s.other, { cmd: FightCmdEnum.skill, skill: second });
	const hp = s.target.getHp();
	const ctx = s.copy(s.actor.uid);
	assert.ok(ctx?.msgs.some((m) => m[0] === 'skill' && m[1] === first && m[2] === s.copier.uid));
	assert.equal(hp - s.target.getHp(), 65);
	assert.equal(s.copier.attr.point.mp, 95);
	assert.equal(s.copier.getSkillCd(advanced), 2);
	assert.equal(s.copier.findSkill(first), undefined);
});

// 测试：高级模仿使用来源的最新实际指令，来源随后防御时复制防御而不是旧攻击。
test('mimic any: copies the selected actor latest defensive action', () => {
	const s = setup();
	s.castFirst();
	s.fight.processUnit(s.actor, { cmd: FightCmdEnum.defend });
	const hp = s.target.getHp();
	const ctx = s.copy(s.actor.uid);
	assert.equal(s.copier.isDefend(), true);
	assert.equal(s.target.getHp(), hp);
	assert.ok(!ctx?.msgs.some((m) => m[0] === 'hurt'));
	assert.equal(s.copier.attr.point.mp, 95);
});

// 测试：同一来源防御后高级模仿读防御，普通模仿仍读最近攻击，两种记录互不覆盖。
test('mimic any: defensive history does not replace ordinary mimic attack history', () => {
	const s = setup();
	const ordinary = 10015407;
	initSkills([
		{
			id: ordinary,
			name: '模仿',
			func: 'mimic',
			magic: true,
			nomove: 1,
			rand: 1,
			sel: { target: TargetSelectEnum.self },
			attack: {},
			final: {},
		},
	]);
	s.copier.addSkill(ordinary, 1);
	s.castFirst();
	s.fight.processUnit(s.actor, { cmd: FightCmdEnum.defend });
	s.copy(s.actor.uid);
	assert.equal(s.copier.isDefend(), true);
	const hp = s.target.getHp();
	s.fight.processUnit(s.copier, { cmd: FightCmdEnum.skill, skill: ordinary });
	assert.equal(hp - s.target.getHp(), 65);
});

// 测试：来源只是读取行动记录，死亡后仍可作为来源；新战斗重置则清空其记录。
test('mimic any: reads dead source history and clears it on reset', () => {
	const s = setup();
	s.castFirst();
	s.actor.die();
	const hp = s.target.getHp();
	s.copy(s.actor.uid);
	assert.equal(hp - s.target.getHp(), 65);
	s.fight.resetMimic();
	assert.equal(s.fight.hasMimicRecord(s.actor), false);
	assert.equal(s.fight.hasMimicRecord(s.copier), false);
});

// 测试：己方来源的保护指令保留原target，并由模仿者成为新的保护者。
test('mimic any: replays a friendly protection command', () => {
	const s = setup();
	const ally = new FightUnitUser(
		4,
		Object.assign(new FightAttr(), structuredClone(s.actor.attrOri)),
		{ name: '被保护者' },
	);
	s.fight.getSide(0).units.push(ally);
	ally.setFight(s.fight, 0);
	ally.setPos(2);
	const protect = 10015405;
	initBuffs([{ ...getBuffData(chainIds.rest), id: protect, class: 'protect' }]);
	setFightGlobalData({ protectBuff: protect });
	s.fight.processUnit(s.actor, { cmd: FightCmdEnum.protect, target: ally.uid });
	const ctx = s.copy(s.actor.uid);
	assert.ok(
		ctx?.msgs.some((m) => m[0] === 'protect' && m[1] === s.copier.uid && m[2] === ally.uid),
	);
	assert.equal(ally.findBuff(protect).attacker, s.copier);
	assert.equal(s.copier.attr.point.mp, 95);
});

// 测试：复制敌方攻击时清空原目标，按模仿者自己的阵营选敌人，不继续攻击己方。
test('mimic any: clears an enemy attack target before selecting its own enemy', () => {
	const s = setup();
	s.fight.processUnit(s.other, { cmd: FightCmdEnum.skill, skill: second, target: s.actor.uid });
	const hp = s.actor.getHp();
	s.fight.random = () => 0;
	const ctx = s.copy(s.other.uid);
	assert.equal(s.actor.getHp(), hp);
	assert.ok(
		ctx?.msgs.some(
			(m) =>
				m[0] === 'skill' &&
				m[1] === second &&
				m[2] === s.copier.uid &&
				m[3] === s.target.uid,
		),
	);
	assert.equal(s.copier.attr.point.mp, 95);
});

// 测试：敌方自身治疗也能模仿，清空来源target后治疗模仿者，仅扣高级模仿费用/CD。
test('mimic any: copies an enemy self heal without its costs or cooldown', () => {
	const s = setup();
	s.other.addSkill(heal, 2);
	s.fight.processUnit(s.other, { cmd: FightCmdEnum.skill, skill: heal, target: s.other.uid });
	s.copier.attr.point.hp = 500;
	s.copier.attr.point.mp = 5;
	const ctx = s.copy(s.other.uid);
	assert.ok(s.copier.getHp() > 500);
	assert.ok(
		ctx?.msgs.some((m) => m[0] === 'heal' && m[2] === s.copier.uid && m[3] === s.copier.uid),
	);
	assert.equal(s.copier.attr.point.mp, 0);
	assert.equal(s.copier.getSkillCd(heal), 0);
	assert.equal(s.copier.getSkillCd(advanced), 2);
});

// 测试：未行动的单位或不存在的UID不能作为来源，失败不扣费、不启动高级模仿CD。
test('mimic any: rejects unknown and unacted sources', () => {
	const s = setup();
	for (const source of [s.actor.uid, 999999]) {
		assert.equal(
			s.fight.checkPC(s.copier, { cmd: FightCmdEnum.skill, skill: advanced, target: source }),
			false,
		);
		s.copy(source);
	}
	assert.equal(s.copier.attr.point.mp, 100);
	assert.equal(s.copier.getSkillCd(advanced), 0);
});

// 测试：PC高级模仿能复制托付，把模仿者当前行动交给原指令的队友，重新等待队友输入。
test('mimic any: replays entrust through the ordinary PC action slot', async () => {
	const s = setup();
	s.loop.end();
	const b = new FightUnitUser(
		4,
		Object.assign(new FightAttr(), structuredClone(s.actor.attrOri)),
		{ name: '受托者' },
	);
	s.fight.getSide(0).units.push(b);
	b.setFight(s.fight, 0);
	b.setPos(2);
	const entrust = 10015406;
	initSkills([
		{
			id: entrust,
			name: '托付',
			func: 'entrust',
			magic: true,
			nomove: 1,
			rand: 1,
			sel: { target: TargetSelectEnum.friend },
			attack: {},
			final: {},
		},
	]);
	s.actor.addSkill(entrust, 1);
	s.target.getActionInput = () => ({ cmd: FightCmdEnum.defend });
	s.other.getActionInput = () => ({ cmd: FightCmdEnum.defend });
	for (const [unit, speed] of [
		[s.actor, 300],
		[s.copier, 200],
		[b, 100],
		[s.target, 50],
		[s.other, 25],
	] as const) {
		unit.attrOri.speed = speed;
		unit.calcAttr();
	}
	const loop = new FightLoopPC(s.fight),
		inputs: number[] = [];
	loop.onMsg(() => {});
	loop.on('input', (unit) => {
		inputs.push(unit.uid);
		assert.ok(
			loop.onInput(
				unit.uid,
				unit === s.actor
					? { cmd: FightCmdEnum.skill, skill: entrust, target: b.uid }
					: unit === s.copier
						? { cmd: FightCmdEnum.skill, skill: advanced, target: s.actor.uid }
						: { cmd: FightCmdEnum.defend },
			),
		);
	});
	loop.start();
	for (const unit of s.fight.getAllUnits()) unit.speedRand = 0;
	loop.nextTurn();
	await loop.processOneTurn(s.fight.turn);
	assert.deepEqual(inputs, [s.actor.uid, b.uid, s.copier.uid, b.uid, b.uid]);
	assert.equal(b.myInputTurn, 3);
	assert.equal(s.copier.attr.point.mp, 95);
	assert.equal(s.copier.getSkillCd(advanced), 2);
	loop.end();
});
