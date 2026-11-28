const assert = require('node:assert/strict');
const { test } = require('node:test');
const tb = require('../bin-debug');
const {
	getDefaultAttackSkill,
	getDefaultProtectSkill,
	getDefaultFBackSkill,
} = require('../bin-debug/fight/Skills/FightSkill');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { calcHurt } = require('../bin-debug/fight/Skills/Calc');
const { ZeroBaseAttack, ZeroFinalAttack } = require('../bin-debug/fight/FightAttr');

// 所有全局预设均引用已注册默认反击，10%发动且不能再触发反击，无额外费用或后续链。
test('default counter: global presets reference a registered 10% skill', () => {
	const tables = tb.initAllDatas(path.resolve(__dirname, '../resource/assets/json'));
	for (const global of Object.values(tables.fight_global)) {
		const counter = tables.skill[global.defaultFBackSkill];
		assert.ok(counter, `${global.id}缺少defaultFBackSkill`);
		assert.equal(counter.rand, 0.1);
		assert.equal(counter.nofback, true);
		assert.equal(counter.next, undefined);
		assert.equal(counter.kill, undefined);
		assert.equal(counter.cost, undefined);
	}
});

for (const id of [1097, 1098]) {
	// 默认普攻显式配置10%连击和追击，连击跟随原技能是否对位，子技能不继续递归。
	test(`default attack ${id}: next follows root targeting and both reactions have a 10% chance`, () => {
		const tables = tb.initAllDatas(path.resolve(__dirname, '../resource/assets/json'));
		const root = tables.skill[id];
		const next = tables.skill[root.next];
		const kill = tables.skill[root.kill];
		assert.ok(next, `${id}缺少next子技能`);
		assert.ok(kill, `${id}缺少kill子技能`);
		assert.equal(next.sel.target, root.sel.target);
		assert.equal(next.rand, 0.1);
		assert.equal(kill.rand, 0.1);
		assert.equal(kill.sel.target, tb.TargetSelectEnum.enemy);
		for (const child of [next, kill]) {
			assert.equal(child.next, undefined);
			assert.equal(child.kill, undefined);
		}
	});
}

function defaultAttackBattle(t, id, lethal, sample) {
	const original = { ...tb.getFightGlobalData() };
	t.after(() => tb.setFightGlobalData(original));
	const tables = tb.initAllDatas(path.resolve(__dirname, '../resource/assets/json'));
	tb.setFightGlobalData({
		...tables.fight_global[13001],
		defaultAttackSkill: id,
		allShieldBreak: false,
	});
	const fight = new tb.Fight(991820, tables.fight[12001], 0);
	const sides = [new tb.FightSide(), new tb.FightSide()];
	const create = (uid, side, pos, hp) => {
		const attr = tb.resolveXlsAttr(tables, 'user', { id: uid, attr: 6001 });
		attr.point = { hp, hpMax: 1000, mp: 100, mpMax: 100 };
		for (const group of [attr.physic, attr.magic]) {
			for (const stage of ['base', 'next', 'kill', 'spread', 'fback']) {
				group[stage] = { ...ZeroBaseAttack(), attack: 100, hit: 100 };
			}
			group.final = ZeroFinalAttack();
		}
		const unit = new tb.FightUnitUser(uid, attr, { name: `普攻验证${uid}` });
		unit.setPos(pos);
		if (side === 1) {
			const originalForbid = unit.isForbid.bind(unit);
			unit.isForbid = (action) => action === 'fback' || originalForbid(action);
		}
		sides[side].units.push(unit);
		return unit;
	};
	const actor = create(0, 0, 0, 1000);
	const other = create(1, 1, 3, lethal && id === 1098 ? 10 : 1000);
	const opposite = create(2, 1, 4, lethal && id === 1097 ? 10 : 1000);
	fight.createMap(5, 1);
	fight.createSide(...sides);
	fight.random = () => sample;
	const target = id === 1097 ? opposite : other;
	const ctx = fight.processUnit(actor, { cmd: tb.FightCmdEnum.attack, target: target.uid });
	assert.ok(ctx);
	return { tables, actor, other, opposite, target, ctx };
}

for (const id of [1097, 1098]) {
	for (const sample of [0.05, 0.5]) {
		for (const lethal of [false, true]) {
			// 用确定随机数实际执行默认普攻，验证10%连击/击杀追击的发动、未发动及目标规则。
			test(`default attack ${id}: ${lethal ? 'kill' : 'next'} resolves with random ${sample}`, (t) => {
				const s = defaultAttackBattle(t, id, lethal, sample);
				const reaction = lethal ? 'kill' : 'next';
				const hits = s.ctx.msgs.filter((msg) => msg[0] === 'skill' && msg[4] === reaction);
				assert.equal(hits.length, sample < 0.1 ? 1 : 0);
				if (sample < 0.1) {
					const expected = lethal ? (id === 1097 ? s.other : s.opposite) : s.target;
					assert.equal(hits[0][1], s.tables.skill[id][reaction]);
					assert.equal(hits[0][3], expected.uid);
					assert.equal(expected.getHp(), lethal ? 900 : 800);
				}
				assert.equal(
					s.ctx.msgs.filter((msg) => msg[0] === 'skill').length,
					1 + hits.length,
				);
				assert.equal(s.actor.attr.point.mp, 100);
			});
		}
	}
}

// 未额外增伤时按一倍结算，防御超过攻击时仍遵守最低一点伤害。
test('attr migration: default damage rate is zero additive bonus with a minimum of one', () => {
	const fight = { randomLess: () => false };
	const ctx = { effects: [] };
	const a = { ...ZeroBaseAttack(), attack: 100 };
	const d = { ...ZeroBaseAttack(), defend: 20 };
	assert.equal(calcHurt(fight, a, d, ZeroFinalAttack(), ZeroFinalAttack(), ctx), 80);
	assert.equal(
		calcHurt(fight, a, { ...d, defend: 200 }, ZeroFinalAttack(), ZeroFinalAttack(), ctx),
		1,
	);
});

// 示例属性阶段只填增量，默认技能在正式技能表注册并由全局表引用。
test('attr migration: example tables use deltas and registered defaults', () => {
	const dir = path.resolve(__dirname, '../resource/assets/json');
	const raw = JSON.parse(fs.readFileSync(path.join(dir, 'attr_xls.json'), 'utf8'));
	assert.deepEqual(raw[6001].physic.next, {});
	const tables = tb.initAllDatas(dir);
	assert.equal(tables.attr[6001].physic.next.attack, 60);
	for (const global of Object.values(tables.fight_global)) {
		assert.ok(tables.skill[global.defaultAttackSkill]);
		assert.ok(tables.skill[global.defaultProtectSkill]);
	}
});

// 属性表可省略整组或base；显式阶段增量与base逐项相加，重复初始化不累计。
test('attr migration: import supports partial groups and additive stage deltas', (t) => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-attr-migration-'));
	t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
	fs.cpSync(path.resolve(__dirname, '../resource/assets/json'), dir, { recursive: true });
	const rows = {
		1: {
			id: 1,
			physic: { base: { attack: 100, attackP: 0.1 }, next: { attack: 10, attackP: 0.2 } },
		},
		2: { id: 2, magic: { next: { attack: 20 } } },
	};
	fs.writeFileSync(path.join(dir, 'attr_xls.json'), JSON.stringify(rows));
	for (let i = 0; i < 2; i++) {
		const tables = tb.initAllDatas(dir);
		assert.equal(tables.attr[1].physic.next.attack, 110);
		assert.ok(Math.abs(tables.attr[1].physic.next.attackP - 0.3) < 1e-12);
		assert.equal(tables.attr[1].physic.kill.attack, 100);
		assert.equal(tables.attr[2].magic.next.attack, 20);
	}
});

// 技能原始属性、单位属性和成长相加，重复合并不累计，百分比字段也只作加法。
test('attr migration: skill merges complete attack objects', () => {
	const skill = new tb.FightSkill(
		{
			id: 991801,
			name: '属性合并',
			magic: false,
			rand: 1,
			sel: { target: tb.TargetSelectEnum.enemy },
			attack: { attack: 10, attackP: 0.2 },
			attackLevel: { attack: 5 },
		},
		2,
	);
	assert.equal(skill.getAttack().attack, 20);
	assert.equal(skill.getAttack().hitP, 0);
	for (let i = 0; i < 2; i++) {
		skill.mergeAttack({ attack: 100, attackP: 0.1, hit: 100 }, {});
		assert.equal(skill.getAttack().attack, 120);
		assert.ok(Math.abs(skill.getAttack().attackP - 0.3) < 1e-12);
		assert.equal(skill.getAttack().hit, 100);
	}
});

// 默认普攻和保护从全局配置查询技能表，更新配置或重新注册后使用当前定义。
test('attr migration: default skills follow current global config and registry', (t) => {
	const original = { ...tb.getFightGlobalData() };
	t.after(() => tb.setFightGlobalData(original));
	const rows = [991802, 991803].map((id) => ({
		id,
		name: `默认${id}`,
		magic: false,
		rand: 1,
		sel: { target: tb.TargetSelectEnum.enemy },
		attack: {},
	}));
	tb.initSkills(rows);
	tb.setFightGlobalData({
		defaultAttackSkill: rows[0].id,
		defaultProtectSkill: rows[1].id,
		defaultFBackSkill: rows[0].id,
	});
	assert.equal(getDefaultAttackSkill().getId(), rows[0].id);
	assert.equal(getDefaultProtectSkill().getId(), rows[1].id);
	assert.equal(getDefaultFBackSkill().getId(), rows[0].id);
	tb.setFightGlobalData({
		defaultAttackSkill: rows[1].id,
		defaultProtectSkill: rows[0].id,
		defaultFBackSkill: rows[1].id,
	});
	assert.equal(getDefaultAttackSkill().getId(), rows[1].id);
	assert.equal(getDefaultProtectSkill().getId(), rows[0].id);
	assert.equal(getDefaultFBackSkill().getId(), rows[1].id);
	tb.initSkills([{ ...rows[1], name: '重新注册' }]);
	assert.equal(getDefaultAttackSkill().getName(), '重新注册');
	assert.equal(getDefaultFBackSkill().getName(), '重新注册');
});
