const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const tb = require('../bin-debug');
const { exportXlsOnce } = require('../bin-debug/tools/xls/watch_xls');
const root = path.resolve(__dirname, '..');
const names = ['skill', 'buff', 'passive', 'ai', 'rule', 'attr', 'monster', 'user', 'summon', 'zhen', 'side', 'fight', 'fight_global', 'fight_const', 'character'];
const readTables = folder => Object.fromEntries(names.map(name => [name, JSON.parse(fs.readFileSync(path.join(folder, `${name}_xls.json`), 'utf8'))]));

function register(data) {
	tb.initSkills(Object.values(data.skill));
	tb.initBuffs(Object.values(data.buff));
	tb.initPassives(Object.values(data.passive));
	tb.initZhens(Object.values(data.zhen));
	tb.initMonsters(Object.values(data.monster).map(row => ({
		...row, attr: tb.resolveXlsAttr(data, 'monster', row),
		ai: row.aiId === undefined ? undefined : data.ai[row.aiId],
		rules: (row.ruleIds ?? []).map(id => data.rule[id]),
	})));
}

function makeSide(data, row, allocateUid) {
	const fight = new tb.Fight(1, data.fight[12001], 0);
	tb.initFightXls(data, allocateUid, () => fight.random());
	return tb.createSideByXls(row.id);
}

// 整套示例工作簿重新导出后应与提交的JSON一致，布尔值和跨表引用均保持正确。
test('xls data: all workbooks export coherent linked templates', async (t) => {
	const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-xls-data-'));
	t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
	await exportXlsOnce({ folder, ts: path.join(folder, 'functions') });
	const data = readTables(folder);
	assert.deepEqual(data, readTables(path.join(root, 'resource/assets/json')));
	const ref = (table, id) => assert.ok(data[table][id], `Unknown ${table}: ${id}`);
	for (const type of ['user', 'monster', 'summon']) {
		for (const unit of Object.values(data[type])) {
			if (unit.character !== undefined) ref('character', unit.character);
			for (const field of ['wugong', 'neigong', 'qinggong']) {
				if (unit[field]) ref('passive', unit[field]);
			}
			assert.ok(tb.resolveXlsAttr(data, type, unit) instanceof tb.FightAttr);
			for (const [id] of unit.skills ?? []) ref('skill', id);
			for (const [id] of unit.passiveSkills ?? []) ref('passive', id);
			for (const id of unit.ruleIds ?? []) ref('rule', id);
			if (unit.aiId !== undefined) ref('ai', unit.aiId);
			const learned = new Set((unit.skills ?? []).map(([id]) => id));
			for (const id of [unit.attackSkill, unit.fbackSkill, unit.supportSkill, unit.ultimateSkill, unit.inputSkill,
				data.ai[unit.aiId]?.skill, ...(unit.ruleIds ?? []).map(id => data.rule[id].skill)]) {
				if (id !== undefined && id !== 0) {
					assert.ok(learned.has(id), `${type} ${unit.id} did not learn ${id}`);
				}
			}
		}
	}
	for (const passive of Object.values(data.passive)) {
		for (const [id] of passive.addbuff ?? []) ref('buff', id);
		for (const key of ['attackSkill', 'fbackSkill', 'supportSkill', 'ultimateSkill']) {
			if (passive[key] !== undefined) ref('skill', passive[key]);
		}
	}
	for (const skill of Object.values(data.skill)) {
		for (const key of ['next', 'combo', 'kill', 'spread', 'attackSkill', 'fbackSkill', 'supportSkill', 'ultimateSkill']) {
			if (skill[key] !== undefined) ref('skill', skill[key]);
		}
		for (const [id] of [...(skill.addBuff ?? []), ...(skill.afterSelfBuff ?? []), ...(skill.rmeoveBuff ?? [])]) ref('buff', id);
		if (skill.supportSkill !== undefined) assert.equal(data.skill[skill.supportSkill].func ?? 'normal', 'normal');
	}
	for (const buff of Object.values(data.buff)) {
		if (buff.skill !== undefined) ref('skill', buff.skill);
		if (buff.class === 'relife') assert.equal(buff.dieNotRemove, true);
	}
	for (const table of ['skill', 'buff', 'passive']) {
		for (const row of Object.values(data[table])) assert.equal(typeof row.magic, 'boolean');
	}
	for (const rule of Object.values(data.rule)) {
		if (rule.skill !== undefined) ref('skill', rule.skill);
		for (const line of rule.lines ?? []) ref('buff', line.buff[0]);
	}
	for (const ai of Object.values(data.ai)) {
		if (ai.skill !== undefined) ref('skill', ai.skill);
	}
	for (const side of Object.values(data.side)) {
		ref('zhen', side.zhen);
		assert.ok(side.ids.length <= data.zhen[side.zhen].pos.length);
		assert.equal(new Set(data.zhen[side.zhen].pos).size, data.zhen[side.zhen].pos.length);
		const [nx, ny] = data.zhen[side.zhen].mapsize;
		assert.ok(data.zhen[side.zhen].pos.every(pos => Number.isSafeInteger(pos) && pos >= 0 && pos < nx * ny));
		for (const id of side.ids) ref(side.type, id);
	}
	for (const row of Object.values(data.fight_global)) {
		assert.equal(data.buff[row.protectBuff].class, 'protect');
		assert.equal(typeof row.duiwei, 'boolean');
	}
});

// character表由编号直接提供专属文案，示例覆盖现有单位和剑客、将军，不再导出年龄门派等组合特征。
test('xls data: character rows directly describe entry injury and death', () => {
	const data = readTables(path.join(root, 'resource/assets/json'));
	assert.equal(Object.keys(data.character).length, 11);
	assert.match(data.character[15001].出场文本, /\$N.*\$w.*来吧/);
	assert.match(data.character[9001].受伤文本, /呜呜.*\{伤害\}/);
	assert.match(data.character[15002].死亡文本, /环顾四周.*斜阳/);
	for (const row of Object.values(data.character)) {
		assert.equal(row.年纪, undefined);
		assert.equal(row.门派, undefined);
		assert.equal(row.sex, undefined);
	}
});

function exampleBattle(data) {
	const fight = new tb.Fight(12001, data.fight[12001], 0);
	const sides = [new tb.FightSide(), new tb.FightSide()];
	let uid = 0;
	for (const side of sides) {
		for (let pos = 0; pos < 3; pos++) {
			const attr = tb.resolveXlsAttr(data, 'user', { id: 8001, attr: 6001 });
			attr.point.sp = 30;
			attr.point.jp = 5;
			const unit = new tb.FightUnitUser(uid++, attr, { name: '配置验证单位' });
			for (const skill of Object.values(data.skill)) unit.addSkill(skill.id, 1);
			unit.setPos(pos);
			side.units.push(unit);
		}
	}
	fight.createMap(3, 3);
	fight.createSide(...sides);
	fight.nextTurn();
	return { fight, actor: sides[0].units[0], allies: sides[0].units, enemies: sides[1].units };
}

// 所有已实现func与特殊Buff类都应有表格实例，状态与计时边界也要有可查配置。
test('xls data: examples cover implemented functions, buff classes and timing modes', () => {
	const data = readTables(path.join(root, 'resource/assets/json'));
	const funcs = new Set(Object.values(data.skill).map(row => row.func ?? 'normal'));
	for (const func of ['normal', 'heal', 'poison', 'relife', 'nohurt', 'observe', 'entrust', 'mimic']) assert.ok(funcs.has(func), func);
	const classes = new Set(Object.values(data.buff).map(row => row.class));
	for (const type of ['buqu', 'relife', 'taunt', 'reflect', 'rest', 'protect', 'trap', 'damageByUse']) assert.ok(classes.has(type), type);
	const states = new Set(Object.values(data.buff).flatMap(row => row.status));
	for (const state of ['封印', '沉默', '缠绕', '眩晕', '石化', '禁疗', '禁毒', '禁复活', '休息']) assert.ok(states.has(state), state);
	for (const turnType of [0, 1, 2]) assert.ok(Object.values(data.buff).some(row => row.func && row.turnType === turnType));
	assert.ok(Object.values(data.skill).some(row => row.func === 'mimic' && row.sel.target === tb.TargetSelectEnum.any));
	for (const field of ['next', 'combo', 'kill', 'spread', 'rmeoveBuff', 'removeBuffTag', 'afterSelfBuff', 'attackSkill', 'fbackSkill', 'supportSkill', 'ultimateSkill']) {
		assert.ok(Object.values(data.skill).some(row => row[field] !== undefined), field);
	}
	register(data);
	for (const row of Object.values(data.buff)) {
		const { actor } = exampleBattle(data);
		const instance = tb.createBuff(actor, row.id, 1, 0, 0);
		assert.ok(instance, row.name);
		assert.equal(instance.constructor.name, row.class ? ({ buqu: 'BuffBuqu', relife: 'BuffRelife', taunt: 'BuffTaunt', reflect: 'BuffReflect', rest: 'BuffRest', protect: 'BuffProtect', trap: 'BuffTrap', damageByUse: 'BuffDamageByUse' })[row.class] : 'FightBuff');
	}
});

// 每条技能示例在满足前置条件时都能真实执行；托付走PC循环，模仿先提供来源记录。
test('xls data: every configured skill executes with its prerequisites', async (t) => {
	const data = readTables(path.join(root, 'resource/assets/json'));
	const previousGlobal = { ...tb.getFightGlobalData() };
	tb.setFightGlobalData({ ...data.fight_global[13001], jiqi: true });
	t.after(() => tb.setFightGlobalData(previousGlobal));
	register(data);
	for (const row of Object.values(data.skill)) {
		// 为当前技能单独建场，避免冷却、状态和上一技能的结算影响本次配置验证。
		await t.test(`${row.id} ${row.name}`, async () => {
			const { fight, actor, allies, enemies } = exampleBattle(data);
			if (row.func === 'entrust') {
				fight.turn = 0;
				actor.attrOri.speed = 300;
				actor.calcAttr();
				const loop = new tb.FightLoopPC(fight);
				const inputUnits = [];
				loop.start();
				for (const unit of fight.getAllUnits()) unit.speedRand = 0;
				loop.nextTurn();
				loop.on('input', unit => {
					inputUnits.push(unit.uid);
					assert.ok(loop.onInput(unit.uid, unit === actor
						? { cmd: tb.FightCmdEnum.skill, skill: row.id, target: allies[1].uid }
						: { cmd: tb.FightCmdEnum.defend }));
				});
				try {
					await loop.processOneTurn(1);
					assert.deepEqual(inputUnits.slice(0, 2), [actor.uid, allies[1].uid]);
					assert.equal(inputUnits.filter(uid => uid === allies[1].uid).length, 2);
				} finally {
					loop.end();
				}
				return;
			}

			let target = row.sel.target === 0 ? actor : row.sel.target === 2 ? allies[1] : enemies[0];
			const ctx = tb.initFightContex(fight);
			if (row.func === 'mimic') {
				const source = row.sel.target === tb.TargetSelectEnum.any ? enemies[1] : allies[1];
				fight.executeUnit(source, { cmd: tb.FightCmdEnum.skill, skill: 1003, target: source.side === 0 ? enemies[0].uid : allies[2].uid });
				target = row.sel.target === tb.TargetSelectEnum.any ? source : actor;
			}
			if (row.func === 'relife') fight.resolveAction(() => target.onHurt(enemies[0], 'test', target.getHp(), ctx, { source: 'buff' }));
			if (row.func === 'heal') fight.resolveAction(() => target.onHurt(enemies[0], 'test', 80, ctx, { source: 'buff' }));
			if (row.removeBuffTag) target.addBuff(actor, 'test', row.removeBuffTag === '增益' ? 2001 : 2027, 1, ctx);
			for (const [id] of row.rmeoveBuff ?? []) target.addBuff(actor, 'test', id, 1, ctx);
			const previousHp = target.getHp();
			const result = fight.executeUnit(actor, { cmd: tb.FightCmdEnum.skill, skill: row.id, target: target.uid });
			assert.ok(result?.actionStarted, row.name);
			if (row.rand === 1) assert.ok(actor.getSkillUseCount(row.id) > 0, row.name);
			if (row.func === 'heal' || row.func === 'relife') assert.ok(target.getHp() > previousHp, row.name);
			if (row.func === 'poison') assert.ok(target.getHp() < previousHp, row.name);
			for (const [id] of row.addBuff ?? []) assert.ok(target.findBuff(id), `${row.name}: ${id}`);
			for (const [id] of row.afterSelfBuff ?? []) assert.ok(actor.findBuff(id), `${row.name}: ${id}`);
			for (const [id] of row.rmeoveBuff ?? []) assert.equal(target.findBuff(id), undefined);
			if (row.removeBuffTag) assert.equal(target.findBuff(row.removeBuffTag === '增益' ? 2001 : 2027), undefined);
		});
	}
});

// 表格的陷阱应先表现攻击者出手，再结算陷阱并缠绕；原近身攻击被中断。
test('xls data: trap example interrupts movement after announcing the incoming attack', () => {
	const data = readTables(path.join(root, 'resource/assets/json'));
	register(data);
	const { fight, actor, enemies } = exampleBattle(data);
	fight.executeUnit(actor, { cmd: tb.FightCmdEnum.skill, skill: 1028, target: actor.uid });
	const hp = actor.getHp();
	const result = fight.executeUnit(enemies[0], { cmd: tb.FightCmdEnum.skill, skill: 1001, target: actor.uid });
	assert.equal(actor.getHp(), hp);
	assert.ok(enemies[0].findBuff(2006));
	assert.equal(actor.findBuff(2005), undefined);
	const incoming = result.msgs.findIndex(msg => msg[0] === 'skill' && msg[1] === 1001);
	const trap = result.msgs.findIndex(msg => msg[0] === 'buffTrigger' && msg[2] === 2005);
	assert.ok(incoming >= 0 && trap > incoming);
});

// 表格展开后应能生成独立的玩家、怪物、召唤物及规则实例，并执行攻击、治疗和吸血技能。
test('xls data: template examples instantiate and execute real skills', () => {
	const data = readTables(path.join(root, 'resource/assets/json'));
	const previousGlobal = { ...tb.getFightGlobalData() };
	const previousConsts = { ...tb.fightConsts };
	try {
		tb.setFightGlobalData(data.fight_global[13001]);
		tb.initFightConsts(data.fight_const[14001]);
		register(data);
		let uid = 0;
		const allocateUid = () => uid++;
		for (const row of Object.values(data.side)) {
			const first = makeSide(data, row, allocateUid);
			const second = makeSide(data, row, allocateUid);
			assert.notStrictEqual(first.units[0].attr.point, second.units[0].attr.point);
			const pets = row.type === 'user' ? row.ids.filter(id => data.user[id].fightSummon !== undefined).length : 0;
			assert.equal(first.units.length, row.ids.length + pets);
			assert.equal(new Set([...first.units, ...second.units].map(unit => unit.uid)).size, first.units.length * 2);
		}
		const fight = new tb.Fight(12001, data.fight[12001], 0);
		const allies = makeSide(data, data.side[11001], allocateUid);
		const enemies = makeSide(data, data.side[11002], allocateUid);
		fight.createSide(allies, enemies);
		fight.nextTurn();
		const target = enemies.units[0];
		const hp = target.getHp();
		const attack = fight.executeUnit(allies.units[0], { cmd: tb.FightCmdEnum.skill, skill: 1001, target: target.uid });
		assert.ok(target.getHp() < hp);
		assert.ok(attack.msgs.some(msg => msg[0] === 'costMp'));
		const users = allies.units.filter(unit => unit.type === tb.UnitType.user);
		const mage = users[1];
		fight.resolveAction(() => mage.onHurt(target, 'test', 100, tb.initFightContex(fight), { source: 'buff' }));
		const beforeBlood = mage.getHp();
		const blood = fight.executeUnit(mage, { cmd: tb.FightCmdEnum.skill, skill: 1003, target: target.uid });
		assert.ok(mage.getHp() > beforeBlood);
		assert.ok(blood.msgs.length > 0);
		const beforeHeal = mage.getHp();
		fight.executeUnit(users[2], { cmd: tb.FightCmdEnum.skill, skill: 1002, target: mage.uid });
		assert.ok(mage.getHp() > beforeHeal);
	} finally {
		tb.setFightGlobalData(previousGlobal);
		tb.initFightConsts(previousConsts);
	}
});
