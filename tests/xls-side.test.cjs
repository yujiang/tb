const assert = require('node:assert/strict');
const { test } = require('node:test');
const path = require('node:path');
const tb = require('../bin-debug');
function tables() {
	return tb.initAllDatas(path.join(__dirname, '../resource/assets/json'));
}
function create(data, id = 11001, map) {
	let uid = 0;
	const fight = new tb.Fight(1, {}, 0);
	if (map) data.zhen[data.side[id].zhen].mapsize = [map.nx, map.ny];
	tb.initFightXls(data, () => uid++, () => fight.random());
	return tb.createSideByXls(id);
}

// 稀疏属性省略的数值和阶段默认为零，显式值保留，展开不修改表配置或共享对象。
test('xls side: missing attack attributes default to zero independently', () => {
	const data = tables();
	const row = data.attr[6001];
	row.physic = { base: { attack: 65, hit: 100, rand: 0 }, final: { bloodP: 0.2 } };
	row.magic = {};
	row.heal = { attack: 20 };
	row.poison = {};
	const before = structuredClone(row);
	const attr = tb.resolveXlsAttr(data, 'user', data.user[8001]);
	assert.equal(attr.physic.base.attack, 65);
	assert.equal(attr.physic.base.rand, 0);
	assert.equal(attr.physic.base.hurt, 0);
	assert.equal(attr.physic.next.attack, 0);
	assert.equal(attr.magic.base.hit, 0);
	assert.equal(attr.heal.defend, 0);
	assert.equal(attr.poison.hurt, 0);
	assert.equal(attr.physic.final.bloodP, 0.2);
	assert.equal(attr.magic.final.immunity, 0);
	attr.physic.base.attack = 3;
	assert.deepEqual(row, before);
	assert.equal(attr.physic.next.attack, 0);
});

// 属性表直接配置各阶段和最终属性，展开后保持对应分组与显式零值。
test('xls side: nested attack attributes remain in their configured groups', () => {
	const data = tables();
	const row = data.attr[6001];
	row.physic = { base: { attack: 65, parry: 30 }, next: { attack: 20 }, final: { bloodP: 0.2 } };
	row.magic = { base: { attack: 25 }, final: { immunityP: 0 } };
	row.heal = { attack: 20 };
	row.poison = { hurt: 0.1 };
	const attr = tb.resolveXlsAttr(data, 'user', data.user[8001]);
	assert.equal(attr.physic.base.parry, 30);
	assert.equal(attr.physic.next.attack, 20);
	assert.equal(attr.physic.final.bloodP, 0.2);
	assert.equal(attr.magic.base.attack, 25);
	assert.equal(attr.magic.final.immunityP, 0);
	assert.equal(attr.heal.attack, 20);
	assert.equal(attr.poison.hurt, 0.1);
});

// 原生怪物与XLS玩家、怪物和宠物都将人物ID及实际兵器名传入display；0号人物有效，模板不被修改。
test('unit display: native and xls templates preserve character zero and weapon names', () => {
	const data = tables();
	for (const type of ['user', 'monster', 'summon']) {
		for (const row of Object.values(data[type])) {
			row.character = 0;
			row.wugong = 3004;
			row.neigong = 3005;
			row.qinggong = 3006;
			row.weaponName = `${type}的兵器`;
		}
	}
	const side = create(data);
	for (const unit of side.units) {
		assert.equal(unit.display.character, 0);
		assert.deepEqual([unit.display.wugong, unit.display.neigong, unit.display.qinggong], [3004, 3005, 3006]);
		assert.equal(unit.display.weaponName, `${unit.isUser() ? 'user' : 'summon'}的兵器`);
		assert.deepEqual(unit.getUnitMsg().display, unit.display);
	}
	const monsters = create(data, 11002);
	assert.equal(monsters.units[0].display.weaponName, 'monster的兵器');
	const template = { ...data.monster[7001], id: 10019981, attr: tb.resolveXlsAttr(data, 'monster', data.monster[7001]), ai: undefined, rules: undefined };
	tb.initMonsters([template]);
	tb.initZhens([{ id: 10019982, pos: [0] }]);
	const native = tb.CreateMonsterSide([template.id], 10019982, () => 0).units[0];
	assert.equal(native.display.character, 0);
	assert.deepEqual([native.display.wugong, native.display.neigong, native.display.qinggong], [3004, 3005, 3006]);
	assert.equal(native.display.weaponName, 'monster的兵器');
	assert.equal(template.weaponName, 'monster的兵器');
});

// 初始化一次表、UID和随机源后只传sideId，双方UID不重复，地图尺寸由阵法自动建立。
test('xls side: one argument creation uses global dependencies and formation map sizes', () => {
	const data = tables();
	for (const zhen of Object.values(data.zhen)) zhen.mapsize = [5, 5];
	data.zhen[10001].pos = [10, 11, 12];
	data.zhen[10003].pos = [1, 7, 13];
	let uid = 0;
	const fight = new tb.Fight(1, {}, 0);
	tb.initFightXls(data, () => uid++, () => fight.random());
	const players = tb.createSideByXls(11001);
	const monsters = tb.createSideByXls(11002);
	assert.deepEqual(players.mapsize, [5, 5]);
	assert.equal(new Set([...players.units, ...monsters.units].map(unit => unit.uid)).size, 9);
	fight.createSide(players, monsters);
	assert.deepEqual([fight.map.nx, fight.map.ny], [5, 5]);
	assert.equal(players.units[1].pos, players.units[0].pos - 5);
	data.zhen[10003].mapsize = [4, 5];
	const wrongSize = tb.createSideByXls(11002);
	assert.throws(() => new tb.Fight(2, {}, 0).createSide(players, wrongSize), /map size/i);
	const existingMap = new tb.Fight(3, {}, 0);
	existingMap.createMap(3, 3);
	assert.throws(() => existingMap.createSide(players, monsters), /map size/i);
});

// 前位不可用时依次选左、右、后，并预留尚未创建的主人位置，不能跨行把上一行当左边。
test('xls side: pets try front left right back without taking another owner slot', () => {
	for (const [positions, expected, nx, ny] of [
		[[4], 1, 3, 3], [[4, 1], 3, 3, 3], [[4, 1, 3], 5, 3, 3],
		[[4, 1, 3, 5], 7, 3, 3], [[0], 1, 3, 3], [[3, 0, 4], 6, 3, 3], [[5, 2, 4], 8, 3, 3],
		[[6, 4], 7, 2, 4],
	]) {
		const data = tables();
		delete data.user[8002].fightSummon;
		data.side[11001].ids = positions.map((_, index) => index === 0 ? 8001 : 8002);
		data.zhen[10001].pos = positions;
		const side = create(data, 11001, { nx, ny });
		const pet = side.units.find(unit => unit.type === tb.UnitType.summon);
		assert.equal(pet.pos, expected, JSON.stringify(positions));
		assert.equal(new Set(side.units.map(unit => unit.pos)).size, side.units.length);
	}
	const pair = tables();
	pair.side[11001].ids = [8001, 8001];
	pair.zhen[10001].pos = [4, 0];
	assert.deepEqual(create(pair, 11001, { nx: 3, ny: 3 }).units.map(unit => unit.pos), [4, 1, 0, 3]);
});

// 四邻都被主人占用时从剩余空位随机，使用战斗随机源且同种子可复现；满图报错。
test('xls side: surrounded pets choose a seeded random empty tile', () => {
	const data = tables();
	delete data.user[8002].fightSummon;
	data.side[11001].ids = [8001, 8002, 8002, 8002, 8002];
	data.zhen[10001].pos = [4, 1, 3, 5, 7];
	data.zhen[10001].mapsize = [3, 3];
	const run = seed => {
		const fight = new tb.Fight(1, {}, seed);
		fight.createMap(3, 3);
		const expected = [0, 2, 6, 8][Math.floor(fight.random() * 4)];
		const actual = new tb.Fight(1, {}, seed);
		actual.createMap(3, 3);
		let uid = 0;
		tb.initFightXls(data, () => uid++, () => actual.random());
		const side = tb.createSideByXls(11001);
		const pet = side.units.find(unit => unit.type === tb.UnitType.summon);
		assert.equal(pet.pos, expected);
		assert.equal(new Set(side.units.map(unit => unit.pos)).size, 6);
		assert.equal(actual.random(), fight.random(), '随机回退仅消耗一次抽样');
		return pet.pos;
	};
	assert.equal(run(0), run(0));
	assert.ok(new Set(Array.from({ length: 12 }, (_, seed) => run(seed))).size > 1);
	data.zhen[10001].pos = [4, 0, 1, 2, 3, 5, 6, 7, 8];
	data.side[11001].ids = data.zhen[10001].pos.map((_, index) => index ? 8002 : 8001);
	assert.throws(() => create(data), /No free position/);
});

// 三类单位都支持组合属性；显式attr优先、0号有效、错误ID不回退，实例属性互相独立。
test('xls side: explicit attributes take precedence over type grade difficulty lookup', () => {
	const data = tables();
	for (const type of ['user', 'summon', 'monster']) {
		const row = Object.values(data[type])[1];
		assert.equal(row.attr, undefined);
		const attr = tb.resolveXlsAttr(data, type, row);
		assert.equal(attr.grade, row.grade);
		const profile = Object.values(data.attr).find(value => value.type === type && value.grade === row.grade && value.diff === row.diff);
		assert.equal(attr.point.hpMax, profile.hp);
		data.attr[0] = { ...profile, id: 0, hp: 777 };
		const explicit = tb.resolveXlsAttr(data, type, { ...row, attr: 0, grade: 999, diff: 5 });
		assert.equal(explicit.point.hpMax, 777);
		assert.throws(() => tb.resolveXlsAttr(data, type, { ...row, attr: -1 }), /Unknown attr/);
		explicit.point.hp = 1;
		assert.equal(data.attr[0].hp, 777);
		delete data.attr[0];
	}
	assert.throws(() => tb.resolveXlsAttr(data, 'monster', { id: 1, attr: 6001 }), /type mismatch/);
	assert.throws(() => tb.resolveXlsAttr(data, 'user', { id: 1, grade: 999, diff: 1 }), /found 0/);
	const first = data.attr[6001];
	data.attr[999] = { ...first, id: 999 };
	assert.throws(() => tb.resolveXlsAttr(data, 'user', { id: 1, grade: first.grade, diff: first.diff }), /found 2/);
});

// user队只填玩家ID，自动加入出战宠物并绑定主人；替补不入场，重复创建不共享状态。
test('xls side: active pets spawn ahead of owners and reserves stay out', () => {
	const data = tables();
	const before = JSON.stringify(data);
	const side = create(data);
	const users = side.units.filter(unit => unit.type === tb.UnitType.user);
	const pets = side.units.filter(unit => unit.type === tb.UnitType.summon);
	assert.equal(users.length, 3);
	assert.equal(pets.length, 3);
	assert.equal(new Set(side.units.map(unit => unit.pos)).size, 6);
	for (const [index, user] of users.entries()) {
		const pet = pets.find(unit => unit.user === user.uid);
		assert.equal(pet.pos, user.pos - side.mapsize[0]);
		assert.equal(pet.pos % side.mapsize[0], user.pos % side.mapsize[0]);
		assert.equal(pet.getName(), data.summon[data.user[data.side[11001].ids[index]].fightSummon].name);
	}
	assert.equal(pets[0].user, 0);
	const again = create(data);
	assert.notStrictEqual(side.units[0].attr.point, again.units[0].attr.point);
	assert.notStrictEqual(pets[0].findBuff(2002), again.units.find(unit => unit.type === tb.UnitType.summon).findBuff(2002));
	assert.equal(JSON.stringify(data), before);
	const solo = tables();
	solo.side[11001].ids = [8001];
	assert.equal(create(solo).units.length, 2);
	delete solo.user[8001].fightSummon;
	assert.equal(create(solo).units.length, 1);
});

// 非正方形地图前位计算正确，首排和已占前位按邻格回退；非法归属和重复UID仍报错。
test('xls side: pet positions respect map width and reject invalid formations', () => {
	const data = tables();
	data.side[11001].ids = [8001];
	data.zhen[10001].pos = [6];
	const side = create(data, 11001, { nx: 2, ny: 4 });
	assert.deepEqual(side.units.map(unit => unit.pos), [6, 4]);
	data.zhen[10001].mapsize = [3, 3];
	data.zhen[10001].pos = [0];
	assert.deepEqual(create(data).units.map(unit => unit.pos), [0, 1]);
	data.side[11001].ids = [8001, 8002];
	data.zhen[10001].pos = [3, 0];
	assert.deepEqual(create(data).units.map(unit => unit.pos), [3, 4, 0, 1]);
	data.side[11001].ids = [8001];
	data.zhen[10001].pos = [3];
	data.user[8001].fightSummon = 9003;
	assert.ok(create(data).units.some(unit => unit instanceof tb.FightUnitSummon && unit.getName() === data.summon[9003].name));
	data.user[8001].fightSummon = 9001;
	tb.initFightXls(data, () => 0, () => 0);
	assert.throws(() => tb.createSideByXls(11001), /repeated UID/);
});

// monster队只查询怪物表，重复模板也创建独立AI与规则；创建的双方可以直接绑定战斗。
test('xls side: homogeneous monster sides instantiate independent behavior', () => {
	const data = tables();
	data.side[11002].ids = [7001, 7001];
	let uid = 0;
	const fight = new tb.Fight(1, { runaway: false, runawayGrade: 0, deathPenalty: 0, winRecover: 0, winReward: 0 });
	tb.initFightXls(data, () => uid++, () => fight.random());
	const players = tb.createSideByXls(11001);
	const monsters = tb.createSideByXls(11002);
	assert.ok(monsters.units.every(unit => unit instanceof tb.FightUnitMonster));
	assert.notStrictEqual(monsters.units[0].ai, monsters.units[1].ai);
	assert.notStrictEqual(monsters.units[0].rules[0], monsters.units[1].rules[0]);
	fight.createSide(players, monsters);
	assert.equal(new Set(fight.getAllUnits().map(unit => unit.uid)).size, 8);
	data.side[11002].ids = [8001];
	assert.throws(() => create(data, 11002), /Unknown monster/);
});
