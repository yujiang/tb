import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FightXlsTables } from '../CreateSideByXls';
import { CharacterData } from '../Client/FightMudDatas';
import { FightData, initFights } from './FightDatas';
import { FightGlobalData } from './FightGlobalData';
import { initAIs } from './AIDatas';
import { initBuffs } from './BuffDatas';
import { initPassives } from './PassiveDatas';
import { initSkills } from './SkillDatas';
import { initSides } from './XlsSideDatas';
import { initMonsters, initUsers, initSummons } from './XlsUnitDatas';
import { initZhens } from '../ZhenDatas';

/** JSON表格集合；全局规则由宿主选择并设置。 */
export type AllDatas = FightXlsTables & {
	fight: Record<number, FightData>;
	fight_global: Record<number, FightGlobalData>;
	character: Record<number, CharacterData>;
	/** 阵法表现类型表，供宿主使用。 */
	form_type: Record<number, unknown>;
};

/** 读取JSON目录中的表格，注册已有数据表并返回组队及客户端所需数据。 */
export function initAllDatas(dir: string): AllDatas {
	const names = ['fight', 'fight_global', 'attr', 'user', 'summon', 'monster', 'side', 'zhen', 'skill', 'buff', 'passive', 'ai', 'rule', 'character', 'form_type'] as const;
	const tables = Object.fromEntries(names.map(name => {
	 const file = resolve(dir, `${name}_xls.json`);
	 try { return [name, JSON.parse(readFileSync(file, 'utf8'))]; }
	 catch (error) { throw new Error(`读取表格失败：${file}：${error instanceof Error ? error.message : String(error)}`); }
	})) as AllDatas;
	initFights(Object.values(tables.fight));
	initAIs(Object.values(tables.ai));
	initSkills(Object.values(tables.skill));
	initBuffs(Object.values(tables.buff));
	initPassives(Object.values(tables.passive));
	initSides(Object.values(tables.side));
	initUsers(Object.values(tables.user));
	initSummons(Object.values(tables.summon));
	initMonsters(Object.values(tables.monster));
	initZhens(Object.values(tables.zhen));
	return tables;
}
