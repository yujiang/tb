import { IdLevelArray } from '../struct';
import { FightUnit } from '../Unit/FightUnit';
import { getPassiveData, PassiveData } from '../Datas/PassiveDatas';
import { FightStatic } from './FightStatic';

// 被动技能跟buff反而更像
export class PassiveSkill extends FightStatic {
	protected override xls: PassiveData;
	constructor(xls: PassiveData, level: number) {
		super(xls, level);
	}

	onInit(unit: FightUnit) {
		const xls = this.xls;
		if (xls.attackSkill != null) {
			unit.setAttackSkill(xls.attackSkill);
		}
		if (xls.ultimateSkill != null) {
			unit.setUltimateSkill(xls.ultimateSkill);
		}
		//if (xls.supportSkill != null && unit.addSkill(xls.supportSkill, this.level)) {
		// 为什么不应该加，1.因为这个肯定是组合技，这个被动肯定在supportSkill学会之后才有，不会失效。
		// 2.而主动技，在fightUnit的init的时候，主动技已经全部加上了，这里再加就乱了，并且用this.level也不对
		if (xls.supportSkill != null) {
			unit.setSupportSkill(xls.supportSkill);
		}
		if (xls.fbackSkill) {
			unit.setFBackSkill(xls.fbackSkill);
		}
		if (xls.addbuff) {
			unit.addBuffsByPassiveSkill(xls.addbuff);
		}
	}
}

export function createPassiveSkills(passiveSkills: IdLevelArray) {
	return passiveSkills.map(([id, level]) => new PassiveSkill(getPassiveData(id), level));
}
