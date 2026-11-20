import { FightAttr } from '../FightAttr';
import { FightDisplay, IdLevelArray, SpeedSkill } from '../struct';
import { RuleData } from '../Rules/RuleDatas';
import { AIData } from '../AI/AIDatas';

export interface MonsterData extends FightDisplay {
	/** 怪物模板 ID，0 有效；不是运行单位 uid；同模板可以重复生成，uid 由宿主分配。 */
	id: number;
	/** 完整初始 FightAttr，可来自同结构 JSON；生成时恢复为 FightAttr 并深拷贝，各实例独立。 */
	attr: FightAttr;
	/** 已学主动技能 [技能 ID, 等级][]，缺省空；0 级有效，必须先注册对应技能。 */
	skills?: IdLevelArray;
	/** 初始被动 [被动 ID, 等级][]，缺省空；先学习主动技能，再初始化被动附加 Buff 和装配。 */
	passiveSkills?: IdLevelArray;
	/** 初始替代普攻技能 ID；缺省保留被动装配，0 卸下；只装配，不自动学习。 */
	attackSkill?: number;
	/** 初始反击技能 ID；缺省保留被动装配，0 卸下，需在 skills 中学习。 */
	fbackSkill?: number;
	/** 初始协战技能 ID；缺省保留被动装配，0 卸下，需为已学攻击类技能。 */
	supportSkill?: number;
	/** 初始破盾大招 ID；缺省保留被动装配，0 卸下，仍需全体破盾机会及独立输入。 */
	ultimateSkill?: number;
	/** 无 AI 和规则时的固定主动输入技能；缺省/0 使用技能首项，再无技能则普通攻击。 */
	inputSkill?: number;
	/** 唯一决策 AI 配置，缺省无 AI；每只怪物由 createAI 新建实例，可用 setAI 战斗中替换。 */
	ai?: AIData;
	/** 固定行为规则列表，缺省空；各规则独立实例，按 prior/添加顺序执行，支持整组切换。 */
	rules?: RuleData[];

	/** 每回合额外行动[当前速度倍率,已学技能ID][]，缺省空；倍率非负有限数，随减速重排；技能0重新走AI、无AI普攻；单回合与动态插队合计最多64条。 */
	extraAction?: SpeedSkill[];
}

const monsters = new Map<number, MonsterData>();
export function initMonsters(datas: MonsterData[]) {
	for (const data of datas) monsters.set(data.id, data);
}
export function getMonsterData(id: number): MonsterData | undefined {
	return monsters.get(id);
}
