import { BaseAttack, FightTypeAttr } from '../../FightAttr';
import { FightUnit } from '../../Unit/FightUnit';
import { afterHurt, afterSelfBuff } from './Buff';
import { tryBlood, tryDBack, tryFBack } from '../FightBack';
import { FightSkill } from '../FightSkill';
import { FightContex } from '../../Fight';
import { getSkillData } from '../SkillDatas';
import { trySupport } from '../FightSupport';
import { multiFunc } from './Multi';

export type AttackReaction = 'next' | 'combo' | 'kill' | 'fback' | 'support';

// 只传给同一条 combo 的后续段，避免追击、反击或事件中的嵌套动作混入伤害。
interface ComboDamage {
	target: FightUnit;
	damage: number;
	interrupted?: boolean;
}

function usesCombo(skill: FightSkill) {
	return skill.getXls().next == null && skill.getXls().combo != null;
}

class MagicSkill extends FightSkill {
	ft: FightTypeAttr;

	name: string;
	override getName() {
		return this.name;
	}

	setFt(ft: FightTypeAttr) {
		this.ft = ft;
		this.mergeAttack(ft.base, ft.final);
	}

	createMagicSkill(name: string, id: number, attack: BaseAttack) {
		const data = getSkillData(id);
		if (!data) return;
		const skill = new MagicSkill(data, this.level);
		skill.name = name;
		skill.ft = this.ft;
		skill.mergeAttack(attack, this.ft.final);
		return skill;
	}

	override getNextSkill(): FightSkill {
		return this.createMagicSkill('next', this.getNext(), this.ft.next);
	}
	override getKillSkill(): FightSkill {
		return this.createMagicSkill('kill', this.getKill(), this.ft.kill);
	}
	override getSpreadSkill(): FightSkill {
		return this.createMagicSkill('spread', this.getSpread(), this.ft.spread);
	}
}

// 普通技能
export function skillAttack(
	attacker: FightUnit,
	defender: FightUnit,
	skill: FightSkill,
	ctx: FightContex,
	reaction?: AttackReaction,
	combo?: ComboDamage,
) {
	// assert(skill);
	const f = ctx.fight;
	if (attacker.isDied() || defender.isDied() || attacker.isForbid('attack')) return false;
	ctx.reactionSteps = (ctx.reactionSteps ?? 0) + 1;
	if (ctx.reactionSteps > 64) throw new Error('Reaction limit exceeded (64 effects per action)');

	// 发动概率, 比如连击...
	if (f.randomGreat(skill.getRand())) {
		if (!reaction && skill.getId() !== 0) {
			ctx.msgs.push(['skillFailed', attacker.uid, defender.uid, skill.getId()]);
		}
		return false;
	}

	// 命中概率
	if (skill.isPhysic() && !skill.physicHitTest(f, defender)) {
		ctx.msgs.push(
			reaction
				? ['miss', skill.getId(), attacker.uid, defender.uid, reaction]
				: ['miss', skill.getId(), attacker.uid, defender.uid],
		);
		// 已发动但未命中，仍支付该段配置的施放后效果。
		afterSelfBuff(attacker, skill, ctx);
		return false;
	}

	// 方便客户端绘制
	ctx.msgs.push(
		reaction
			? ['skill', skill.getId(), attacker.uid, defender.uid, reaction]
			: ['skill', skill.getId(), attacker.uid, defender.uid],
	);
	ctx.effects = [];

	const ismagic = skill.isMagic();

	let damage = skill.calcHurt(f, defender, ctx, attacker);
	damage = defender.onHurt(attacker, 'skill', damage, ctx, {
		magic: ismagic,
		source: 'skill',
		noprotect: !skill.canProtect(),
		weakPoint: defender.isWeakPoint(
			skill.getXls().skillProp ?? attacker.attr.weaponProp,
			attacker.attr.weapon,
		),
	});
	if (combo && defender === combo.target) combo.damage += damage;
	afterHurt(attacker, defender, skill, ctx);
	if (damage > 1) {
		if (skill.canBlood()) {
			tryBlood(attacker, defender, ismagic, damage, ctx, skill.getFinal().bloodP);
		}
		if (!combo && skill.canDBack()) {
			tryDBack(attacker, defender, ismagic, damage, ctx);
		}
	}
	ctx.damage = damage;
	return true;
}

function skillKill(attacker: FightUnit, sk: FightSkill, ctx: FightContex) {
	const skill = sk.getKillSkill();
	if (!skill) return false;
	const f = ctx.fight;
	if (skill.getRand() <= 0) return false;

	const configured = sk.getKill() != null;
	if (configured && skill.isMulti()) {
		ctx.killNum = (ctx.killNum || 0) + 1;
		return magicAttackFunc(attacker, null, skill, ctx, 'kill');
	}
	const des =
		configured && skill.getSel()
			? f.selectMainTarget(attacker, skill)
			: f.randomEnemyAlive(attacker.side);
	if (!des) return false;
	ctx.killNum = (ctx.killNum || 0) + 1;
	if (configured) return magicAttackFunc(attacker, des, skill, ctx, 'kill');
	// 普攻的内置追击保留单次触发，不因通用技能链扩展而递归追击。
	skillAttack(attacker, des, skill, ctx, 'kill');
	return true;
}

function skillNext(
	attacker: FightUnit,
	previous: FightUnit,
	sk: FightSkill,
	ctx: FightContex,
	comboDamage?: ComboDamage,
) {
	const skill = sk.getNextSkill();
	if (!skill) return false;
	const f = ctx.fight;
	if (skill.getRand() <= 0) return false;

	const configured = sk.getNext() != null;
	const combo = usesCombo(sk);
	if (configured && !combo && skill.isMulti()) {
		ctx.nextNum = (ctx.nextNum || 0) + 1;
		return magicAttackFunc(attacker, null, skill, ctx, 'next');
	}
	let des: FightUnit;
	if (combo) {
		// 连招固定沿用上一段实际主目标，失效时停止，不再排序、抽样或被新嘲讽重定向。
		if (
			comboDamage?.interrupted ||
			!previous ||
			previous.isDied() ||
			previous.fight !== f ||
			!f.getAllUnits().includes(previous) ||
			(skill.getSel() && !f.isLegalTarget(attacker, previous, skill))
		)
			return false;
		des = previous;
	} else {
		des =
			configured && skill.getSel()
				? f.selectMainTarget(attacker, skill)
				: f.randomEnemyAlive(attacker.side);
	}
	if (!des) return false;
	ctx.nextNum = (ctx.nextNum || 0) + 1;
	if (configured)
		return magicAttackFunc(
			attacker,
			des,
			skill,
			ctx,
			combo ? 'combo' : 'next',
			combo ? comboDamage : undefined,
		);
	// 普攻的内置概率连击仍只执行一次。
	skillAttack(attacker, des, skill, ctx, 'next');
	return true;
}

export function skillAttackFunc(
	attacker: FightUnit,
	defender: FightUnit,
	skill: FightSkill,
	ctx: FightContex,
	reaction?: AttackReaction,
) {
	const magic = new MagicSkill(skill.getXls(), skill.level);
	magic.setFt(skill.isMagic() ? attacker.attr.magic : attacker.attr.physic);
	return magicAttackFunc(attacker, defender, magic, ctx, reaction);
}

export function magicAttackFunc(
	attacker: FightUnit,
	defender: FightUnit,
	magic: FightSkill,
	ctx: FightContex,
	reaction?: AttackReaction,
	combo?: ComboDamage,
): boolean {
	if (magic.isMulti() && reaction !== 'combo' && reaction !== 'support')
		return multiFunc(attacker, magic, ctx, (actor, target, single, context) =>
			magicAttackFunc(actor, target, single, context, reaction),
		);
	return ctx.fight.resolveAction(() => {
		const chain = combo ?? (usesCombo(magic) ? { target: defender, damage: 0 } : undefined);
		const ownsChain = !combo && !!chain;
		const onDeath = () => {
			chain.interrupted = true;
		};
		if (ownsChain) {
			attacker.onContex('die', onDeath);
			defender.onContex('die', onDeath);
		}
		try {
			const rt = skillAttack(attacker, defender, magic, ctx, reaction, chain);
			if (!rt) return false;
			if (!attacker.isDied()) {
				if (!usesCombo(magic) && !chain?.interrupted && magic.canSupport()) {
					trySupport(attacker, defender, ctx);
				}
			}
			if (!attacker.isDied()) {
				spread(attacker, defender, magic, ctx, chain);
				// 只有成功执行到最后一段且双方未死亡，才按末段配置结算整招反伤。
				if (
					chain &&
					!chain.interrupted &&
					!usesCombo(magic) &&
					!attacker.isDied() &&
					!defender.isDied() &&
					chain.damage > 1 &&
					magic.canDBack()
				) {
					tryDBack(attacker, defender, magic.isMagic(), chain.damage, ctx);
				}
				afterSkillAttack(attacker, defender, magic, ctx, chain);
			}
			afterSelfBuff(attacker, magic, ctx);
			return true;
		} finally {
			if (ownsChain) {
				attacker.offContex('die', onDeath);
				defender.offContex('die', onDeath);
			}
		}
	});
}

function spread(
	attacker: FightUnit,
	defender: FightUnit,
	skill: FightSkill,
	ctx: FightContex,
	combo?: ComboDamage,
) {
	const spreadSkill = skill.getSpreadSkill();
	if (!spreadSkill) return;

	const f = ctx.fight;
	//const xls = skill.xls;
	const targets = f.selectSpreadTargets(defender, spreadSkill);
	if (!targets?.length) return;

	const ids = targets.map((target) => {
		return target.uid;
	});
	ctx.msgs.push(['spread', ids]);

	// 副目标只执行单次攻击结算，是否允许保护由溅射子技能配置决定。
	for (const target of targets) {
		skillAttack(attacker, target, spreadSkill, ctx, undefined, combo);
	}
}

export function afterSkillAttack(
	attacker: FightUnit,
	defender: FightUnit,
	skill: FightSkill,
	ctx: FightContex,
	combo?: ComboDamage,
) {
	if (attacker.isDied()) return;
	if (defender.isDied()) {
		//追击
		skillKill(attacker, skill, ctx);
	} else {
		if (combo?.interrupted) return;
		//反击
		// const f = ctx.fight;
		let back = false;
		if (!usesCombo(skill) && skill.canFBack()) {
			back = tryFBack(defender, attacker, ctx);
		}
		if (!back) {
			skillNext(attacker, defender, skill, ctx, combo);
		}
	}
}
