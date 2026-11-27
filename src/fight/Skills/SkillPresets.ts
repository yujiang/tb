import { PropEnum } from '../FightAttr';
import { TargetSelectEnum } from '../struct';
import type { SkillData } from '../Datas/SkillDatas';

/** 创建独立的致死攻击配置；id由宿主分配并通过initSkills注册，magic缺省false物理版，true魔法版。 */
const MAX_ATTACK = 999999;

export function createLethalSkillData(id: number, magic = false): SkillData {
	return {
		id,
		name: magic ? '魔法致死' : '物理致死',
		magic,
		alwaysHit: true,
		rand: 1,
		func: 'normal',
		sel: { target: TargetSelectEnum.enemy },
		// 不叠加单位attack，固定以99999作为攻击力；防御、免伤、保护及反应仍正常结算。
		attackRate: 0,
		attack: { attack: MAX_ATTACK },
		final: {},
		skillProp: PropEnum.none,
	};
}
