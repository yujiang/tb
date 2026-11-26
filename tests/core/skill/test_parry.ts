import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { FightCmdEnum, PropEnum, FightMud } from '../../../src';
import { setupChain } from '../../fixtures/skill_chain';

for (const [hit, parry, damage] of [
	[200, 50, 100],
	[100, 200, 50],
]) {
	// 招架概率上下限直接确定结果，不消耗随机数；属性按点数而非0～1比例处理。
	test(`parry: hit=${hit} and parry=${parry} clamp the chance without drawing randomness`, () => {
		const s = setup();
		s.actor.attr.physic.base.hit = hit;
		s.target.attr.physic.base.parry = parry;
		let draws = 0;
		s.fight.random = () => {
			draws++;
			return 0.5;
		};
		s.cast();
		assert.equal(draws, 0);
		assert.equal(s.target.getHp(), 1000 - damage);
	});
}

function setup(magic = false, actorHp = 1000) {
	const s = setupChain({
		actorHp,
		rootSelfBuff: false,
		finalReactions: false,
		change: (skills) => {
			for (const skill of skills) {
				skill.magic = magic;
				skill.damageRate = 1;
			}
			skills[0].combo = undefined;
		},
	});
	s.target.attr.physic.base.parry = 100;
	return s;
}

// 物理命中后招架成功跳过暴击，将技能倍率、生克及免伤合成后的总伤害减半，协议先出招再格挡后受伤。
test('parry: a successful block disables crit and halves the whole calculated damage', () => {
	const s = setup();
	s.actor.attr.physic.base.critP = 1;
	s.actor.attr.weaponProp = PropEnum.金;
	s.target.attr.charProp = PropEnum.木;
	s.target.attr.physic.final.immunity = 20;
	s.target.attr.physic.final.immunityP = 0.25;
	s.skills[0].damageRate = 2;
	const ctx = s.cast();
	assert.equal(s.target.getHp(), 925); // (100-20)*0.75*(2+0.5)*0.5
	assert.deepEqual(
		ctx.msgs.find((msg) => msg[0] === 'block'),
		['block', s.target.uid, s.actor.uid],
	);
	assert.equal(ctx.msgs.find((msg) => msg[0] === 'hurt')[6].includes('crit'), false);
	assert.ok(
		ctx.msgs.findIndex((msg) => msg[0] === 'skill') <
			ctx.msgs.findIndex((msg) => msg[0] === 'block'),
	);
	assert.ok(
		ctx.msgs.findIndex((msg) => msg[0] === 'block') <
			ctx.msgs.findIndex((msg) => msg[0] === 'hurt'),
	);
	assert.doesNotMatch(s.report.toString(), /未识别消息/);
	assert.match(s.report.toString(), /招架/);
});

// 未命中先返回，不抽取招架或暴击随机数，不发送格挡且目标不损血。
test('parry: miss precedes block and critical rolls', () => {
	const s = setup();
	s.actor.attr.physic.base.hit = 90;
	s.target.attr.physic.base.dodge = 10;
	let draws = 0;
	s.fight.random = () => {
		draws++;
		return 0.9;
	};
	const ctx = s.cast();
	assert.equal(draws, 1);
	assert.ok(ctx.msgs.some((msg) => msg[0] === 'miss'));
	assert.equal(
		ctx.msgs.some((msg) => msg[0] === 'block' || msg[0] === 'hurt'),
		false,
	);
	assert.equal(s.target.getHp(), 1000);
});

// hit=90且目标parry=30时招架率为40%，命中和招架各抽一次，成功后不再抽暴击。
test('parry: successful probability roll does not consume a critical roll', () => {
	const s = setup();
	s.actor.attr.physic.base.hit = 90;
	s.actor.attr.physic.base.critP = 0.5;
	s.target.attr.physic.base.dodge = 10;
	s.target.attr.physic.base.parry = 30;
	let draws = 0;
	s.fight.random = () => {
		draws++;
		return 0.1;
	};
	const ctx = s.cast();
	assert.equal(draws, 2);
	assert.equal(s.target.getHp(), 950);
	assert.ok(ctx.msgs.some((msg) => msg[0] === 'block'));
});

// 招架未成功才继续暴击判定，不能误减半或漏掉暴击效果。
test('parry: failed block continues to the ordinary critical calculation', () => {
	const s = setup();
	s.actor.attr.physic.base.hit = 90;
	s.actor.attr.physic.base.critP = 0.5;
	s.target.attr.physic.base.dodge = 10;
	s.target.attr.physic.base.parry = 30;
	const values = [0.1, 0.9, 0.1];
	let draws = 0;
	s.fight.random = () => values[draws++];
	const ctx = s.cast();
	assert.equal(draws, 3);
	assert.equal(s.target.getHp(), 850);
	assert.equal(
		ctx.msgs.some((msg) => msg[0] === 'block'),
		false,
	);
	assert.ok(ctx.msgs.find((msg) => msg[0] === 'hurt')[6].includes('crit'));
});

// parry=0关闭招架，即使命中不足100也不额外判定，保留原有随机抽样数量。
test('parry: zero disables blocking and preserves the original random sequence', () => {
	const s = setup();
	s.target.attr.physic.base.parry = 0;
	s.actor.attr.physic.base.hit = 80;
	s.actor.attr.physic.base.critP = 0.5;
	const values = [0.1, 0.9];
	let draws = 0;
	s.fight.random = () => values[draws++];
	const ctx = s.cast();
	assert.equal(draws, 2);
	assert.equal(s.target.getHp(), 900);
	assert.equal(
		ctx.msgs.some((msg) => msg[0] === 'block'),
		false,
	);
});

// 魔法不受物理招架影响，仍可正常暴击；无需因此关闭弱点配置。
test('parry: magical attacks retain their critical behavior', () => {
	const s = setup(true);
	s.actor.attr.magic.base.critP = 1;
	const ctx = s.cast();
	assert.equal(s.target.getHp(), 850);
	assert.equal(
		ctx.msgs.some((msg) => msg[0] === 'block'),
		false,
	);
});

// 必中仅跳过闪避，不跳过招架；眩晕禁止招架，不能依靠招架减伤。
test('parry: alwaysHit does not bypass blocking but stun prevents it', () => {
	const s = setup();
	s.skills[0].alwaysHit = true;
	s.target.attr.physic.base.dodge = 1000;
	assert.equal(
		s.cast().msgs.some((msg) => msg[0] === 'block'),
		true,
	);
	assert.equal(s.target.getHp(), 950);
	const inStatus = s.target.inStatus.bind(s.target);
	s.target.inStatus = (status) => status === '眩晕' || inStatus(status);
	s.actor.attr.physic.base.critP = 1;
	assert.equal(
		s.cast().msgs.some((msg) => msg[0] === 'block'),
		false,
	);
	assert.equal(s.target.getHp(), 800);
});

// 普攻也复用招架结算，防御与招架分别减半，最终向下取整，客户端可正确表现格挡。
test('parry: basic attacks share the pipeline and stack with defense', () => {
	const s = setup();
	s.actor.attr.physic.base.attack = 101;
	s.target.attr.physic.fback.rand = 0;
	s.target.doDefend();
	const ctx = s.fight.processUnit(s.actor, { cmd: FightCmdEnum.attack, target: s.target.uid });
	assert.equal(s.target.getHp(), 975);
	assert.ok(ctx.msgs.some((msg) => msg[0] === 'block'));
	s.flush(ctx);
	const mud = new FightMud(() => {}, false);
	mud.onMsg([
		['side', 0, [s.actor.getUnitMsg()]],
		['side', 1, [s.target.getUnitMsg()]],
		['block', s.target.uid, s.actor.uid],
	]);
	assert.match(mud.toString(), /卫士.*架住剑客/);
});

// 吸血和反伤基于格挡后实际损血，不能按格挡前或虚构的暴击伤害计算。
test('parry: lifesteal and reflection use the blocked actual damage', () => {
	const s = setup(false, 500);
	s.actor.attr.physic.final.bloodP = 1;
	s.target.attr.physic.final.dbackP = 0.2;
	s.skills[0].nodback = false;
	const ctx = s.cast();
	assert.equal(ctx.msgs.find((msg) => msg[0] === 'hurt' && msg[1] === 'skill')[4], 50);
	assert.equal(ctx.msgs.find((msg) => msg[0] === 'heal' && msg[1] === 'blood')[4], 50);
	assert.equal(ctx.msgs.find((msg) => msg[0] === 'hurt' && msg[1] === 'dback')[4], 10);
	assert.equal(s.actor.getHp(), 540);
});
