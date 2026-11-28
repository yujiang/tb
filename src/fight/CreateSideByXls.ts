import { selectSummonPos } from './SummonPos';
import { strict as assert } from 'node:assert';
import { BaseAttack, FightAttr, FightTypeAttr, ZeroBaseAttack } from './FightAttr';
import { FightSide } from './FightSide';
import { FightUnit } from './Unit/FightUnit';
import { FightUnitUser, FightUnitSummon } from './Unit/FightUnitUser';
import { FightUnitMonster } from './Unit/FightUnitMonster';
import { applyUnitTemplate } from './Unit/ApplyUnitTemplate';
import { AIData } from './Datas/AIDatas';
import { RuleData } from './Datas/RuleDatas';
import { ZhenData } from './ZhenDatas';
import { SkillData } from './Datas/SkillDatas';
import { BuffData } from './Datas/BuffDatas';
import { PassiveData } from './Datas/PassiveDatas';
import { XlsAttrData, XlsUnitType, xlsFightTypeAttr } from './Datas/XlsAttrDatas';
import { XlsSideData } from './Datas/XlsSideDatas';
import { XlsUserData, XlsUnitData } from './Datas/XlsUnitDatas';


/** 导出的JSON对象，以各表ID为键；本入口不读取文件，也不设置共享全局规则。 */
export interface FightXlsTables {
	/** 扁平属性预设表，组合键必须唯一。 */
	attr: Record<number, XlsAttrData>;
	/** 玩家模板表，含出战及替补宠物配置。 */
	user: Record<number, XlsUserData>;
	/** 宠物模板表，主人由创建队伍时绑定。 */
	summon: Record<number, XlsUnitData>;
	/** 怪物模板表，AI和rule引用在创建时展开。 */
	monster: Record<number, XlsUnitData>;
	/** 同类型队伍表。 */
	side: Record<number, XlsSideData>;
	/** 阵法表；位置不能越界或重叠。 */
	zhen: Record<number, ZhenData>;
	/** 主动技能表，创建单位前注册。 */
	skill: Record<number, SkillData>;
	/** Buff表，创建单位前注册。 */
	buff: Record<number, BuffData>;
	/** 被动表，创建单位前注册。 */
	passive: Record<number, PassiveData>;
	/** AI表，怪物可选引用。 */
	ai: Record<number, AIData>;
	/** rule表，怪物可选引用。 */
	rule: Record<number, RuleData>;
}

let xlsContext: {
	tables: FightXlsTables;
	allocateUid: () => number;
	random: () => number;
};

/** 绑定组队表、宿主UID分配器和战斗随机源；技能、Buff和被动须事先注册。随机源返回[0,1)，不重置宿主UID计数。 */
export function initFightXls(
	tables: FightXlsTables,
	allocateUid: () => number,
	random: () => number,
) {
	assert.equal(typeof allocateUid, 'function', 'A global UID allocator is required');
	assert.equal(typeof random, 'function', 'A random source is required');
	xlsContext = { tables, allocateUid, random };
}

function findRow<T>(rows: Record<number, T>, id: number, name: string): T {
	const row = rows[id];
	assert.ok(row, `Unknown ${name}: ${id}`);
	return row;
}

function expandAttack(data?: Partial<BaseAttack>): BaseAttack {
	return {
		...ZeroBaseAttack(),
		...data,
	};
}

function expandAttackGroup(data?: xlsFightTypeAttr): FightTypeAttr {
	return {
		base: expandAttack(data?.base),
		kill: expandAttack(data?.kill),
		next: expandAttack(data?.next),
		spread: expandAttack(data?.spread),
		fback: expandAttack(data?.fback),
		final: { bloodP: 0, dbackP: 0, immunity: 0, immunityP: 0, bloodPAnit: 0, ...data?.final },
	};
}

/** 显式attr优先；否则严格匹配类型、等级、难度，不近似匹配也不回退其他类型。 */
export function resolveXlsAttr(
	tables: FightXlsTables,
	type: XlsUnitType,
	unit: XlsUnitData,
): FightAttr {
	let row: XlsAttrData;
	if (unit.attr !== undefined) {
		row = findRow(tables.attr, unit.attr, 'attr');
		assert.equal(row.type, type, `Attribute type mismatch for ${type} ${unit.id}`);
	} else {
		assert.ok(
			Number.isSafeInteger(unit.grade) && unit.grade >= 0,
			'grade must be a nonnegative integer',
		);
		assert.ok(
			Number.isSafeInteger(unit.diff) && unit.diff >= 1 && unit.diff <= 5,
			'diff must be in 1..5',
		);
		const matches = Object.values(tables.attr).filter(
			(value) =>
				value.type === type && value.grade === unit.grade && value.diff === unit.diff,
		);
		assert.equal(
			matches.length,
			1,
			`Expected one attr for ${type}/${unit.grade}/${unit.diff}, found ${matches.length}`,
		);
		row = matches[0];
	}

	return Object.assign(new FightAttr(), {
		point: {
			hp: row.hp,
			hpMax: row.hp,
			mp: row.mp ?? 0,
			mpMax: row.mp ?? 0,
			sp: 0,
			spMax: row.spMax ?? 0,
			jp: 0,
			jpMax: row.jpMax ?? 0,
		},
		speed: row.speed ?? 0,
		grade: row.grade,
		career: row.career,
		weapon: row.weapon ?? 0,
		charProp: row.charProp ?? 0,
		weaponProp: row.weaponProp ?? 0,
		damageLimit: row.damageLimit ?? 0,
		physic: expandAttackGroup(row.physic),
		magic: expandAttackGroup(row.magic),
		heal: expandAttack(row.heal),
		poison: expandAttack(row.poison),
	});
}

/** 只传队伍ID；共享依赖来自initFightXls，地图尺寸来自阵法mapsize，不绑定阵营或开始战斗。 */
export function createSideByXls(id: number): FightSide {
	assert.ok(xlsContext, 'Call initFightXls before createSideByXls');
	const { tables, allocateUid, random } = xlsContext;
	const row = findRow(tables.side, id, 'side');
	assert.ok(row.type === 'user' || row.type === 'monster', 'side.type must be user or monster');
	const zhen = findRow(tables.zhen, row.zhen, 'zhen');
	assert.ok(zhen.mapsize?.length === 2, 'Formation mapsize is required');
	const map = { nx: zhen.mapsize[0], ny: zhen.mapsize[1] };
	assert.ok(
		Number.isSafeInteger(map.nx) && map.nx > 0 && Number.isSafeInteger(map.ny) && map.ny > 0,
		'Invalid map dimensions',
	);
	const positions = zhen.pos;
	assert.ok(positions.length >= row.ids.length, 'Formation has too few positions');
	const reserved = new Set(positions.slice(0, row.ids.length));
	assert.equal(reserved.size, row.ids.length, 'Occupied position in formation');
	assert.ok(
		[...reserved].every(
			(pos) => Number.isSafeInteger(pos) && pos >= 0 && pos < map.nx * map.ny,
		),
		'Invalid formation position',
	);
	const occupied = new Set<number>();
	const uids = new Set<number>();
	const side = new FightSide();
	side.mapsize = [map.nx, map.ny];
	const makeUnit = (type: XlsUnitType, templateId: number): FightUnit => {
		const template = findRow(tables[type], templateId, type);
		const attr = resolveXlsAttr(tables, type, template);
		const uid = allocateUid();
		assert.ok(Number.isSafeInteger(uid) && !uids.has(uid), `Invalid or repeated UID: ${uid}`);
		uids.add(uid);
		const Unit =
			type === 'user'
				? FightUnitUser
				: type === 'summon'
					? FightUnitSummon
					: FightUnitMonster;
		const unit = new Unit(uid, attr, template);
		applyUnitTemplate(unit, { ...template, attr });
		if (unit instanceof FightUnitMonster) {
			unit.monsterId = template.id;
			if (template.extraAction) unit.setExtraActions(template.extraAction);
			if (template.inputSkill !== undefined) unit.inputSkill = template.inputSkill;
			if (template.aiId !== undefined) unit.setAI(findRow(tables.ai, template.aiId, 'ai'));
			if (template.ruleIds)
				unit.setRules(
					template.ruleIds.map((ruleId) => findRow(tables.rule, ruleId, 'rule')),
				);
		}
		return unit;
	};
	const create = (type: XlsUnitType, templateId: number, pos: number): FightUnit => {
		assert.ok(
			Number.isSafeInteger(pos) && pos >= 0 && pos < map.nx * map.ny,
			`Invalid ${type} position: ${pos}`,
		);
		assert.ok(!occupied.has(pos), `Occupied position: ${pos}`);
		occupied.add(pos);
		const unit = makeUnit(type, templateId);
		unit.setPos(pos);
		side.units.push(unit);
		return unit;
	};
	row.ids.forEach((templateId, index) => {
		const pos = positions[index];
		const owner = create(row.type, templateId, pos);
		if (row.type === 'user') {
			const user = tables.user[templateId];
			for (const summonId of user.summons ?? []) findRow(tables.summon, summonId, 'summon');
			for (const summonId of user.summons ?? []) {
				if (summonId === user.fightSummon) continue;

				(owner as FightUnitUser).summons.set(
					summonId,
					() => makeUnit('summon', summonId) as FightUnitSummon,
				);
			}
			if (user.fightSummon !== undefined) {
				const summonPos = selectSummonPos(pos, map, occupied, reserved, random);
				const summon = create('summon', user.fightSummon, summonPos) as FightUnitSummon;
				summon.user = owner.uid;
			}
		}
	});
	return side;
}
