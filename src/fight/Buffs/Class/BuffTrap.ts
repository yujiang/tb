import { FightBuff } from '../FightBuff';
import type { FightUnit, UnitContextEventFunc, UnitEventArgs } from '../../Unit/FightUnit';
import { FightSkill } from '../../Skills/FightSkill';
import { getSkillData } from '../../Skills/SkillDatas';
import { skillAttack } from '../../Skills/Funcs/NomalSkill';

// 陷阱挂在受保护单位身上；布置和触发分别走普通技能与命中前事件。
export class BuffTrap extends FightBuff {
	override func: UnitContextEventFunc<'beforeAttack'>;
	override onAdded(unit: FightUnit) {
		this.func = this.onEvent.bind(this);
		unit.onContex('beforeAttack', this.func, this.xls.prior ?? 0);
	}

	override onRemoved(unit: FightUnit) {
		if (this.func) unit.offContex('beforeAttack', this.func);
		this.func = null;
	}

	override onEvent(...[unit, ctx, attacker, incoming, startAttack]: UnitEventArgs<'beforeAttack'>) {
		if (
			unit.findBuff(this.getId()) !== this ||
			!incoming.isMove()
		) {
			return;
		}

		const data = getSkillData(this.xls.skill);
		if (!data) return;

		const skill = new FightSkill(data, this.xls.skillLevel ?? 0);
		const attr = skill.isMagic() ? unit.attr.magic : unit.attr.physic;
		skill.mergeAttack(attr.base, attr.final);
		ctx.fight.resolveAction(() => {
			startAttack();
			ctx.msgs.push(['buffTrigger', unit.uid, this.getId(), 'trap', attacker.uid]);
			// 陷阱只执行单次攻击，沿用伤害、命中和附加Buff；不再触发另一个陷阱。
			skillAttack(unit, attacker, skill, ctx, undefined, undefined, false, {
				mainTarget: false,
				checkAttacker: false,
				useSkill: unit.createSkillUse(skill, ctx, 'trap'),
			});
			this.consumeTimes(unit, ctx);
		});
	}
}
