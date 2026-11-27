import type { FightClient, FightClientUnit } from './FightClient';
import type { ReportColor } from './FightReport';
import { FightRenderUnit, FightRenderContext } from './FightRenderUnit';
import { FightMudTables, MudTexts, MudText, pickMudText, resolveMudText } from './FightMudDatas';
import { getSkillData } from '../Datas/SkillDatas';
import { getPassiveData } from '../Datas/PassiveDatas';
import { mudActionTexts, mudMissTexts, mudImpactTexts } from './FightMudProse';

export interface FightMudOutput {
	client: FightClient;
	tables: FightMudTables;
	name(id: number): string;
	skillName(id: number): string;
	buffName(id: number): string;
	paint(text: string, color: ReportColor): string;
	write(text: string, color?: ReportColor, highlight?: { start: number; length: number }): void;
}
interface MudContext extends FightRenderContext {
	target: number;
	subject: number;
	damage?: number;
	heal?: number;
	critical?: boolean;
	buff?: number;
	passive?: number;
	reduced?: number;
}
const bodyParts = ['胸口', '肩头', '腰侧', '左臂', '右臂'] as const;

/** 每个客户端单位的文字实现：动作方法内选择角色专属或通用文案，不读取服务端对象。 */
export class FightMudUnit extends FightRenderUnit {
	private textTurns = new Map<string, number>();
	private reportedHurt?: { actor: number; damage: number };
	constructor(
		data: FightClientUnit,
		private readonly output: FightMudOutput,
	) {
		super(data);
	}
	private get client() {
		return this.output.client;
	}
	private get tables() {
		return this.output.tables;
	}
	private name(id: number) {
		return id === this.uid && this.data.display.name
			? this.data.display.name + '（#' + id + '）'
			: this.output.name(id);
	}
	private skillName(id: number) {
		return this.output.skillName(id);
	}
	private buffName(id: number) {
		return this.output.buffName(id);
	}
	private paint(text: string, color: ReportColor) {
		return this.output.paint(text, color);
	}
	private write(
		text: string,
		color?: ReportColor,
		highlight?: { start: number; length: number },
	) {
		this.output.write(text, color, highlight);
	}
	private template(
		field: keyof MudTexts,
		ctx: MudContext,
		prefix = '',
		fallback?: MudText,
		action?: MudText,
		suffix = '',
		capture?: (text: string) => void,
	): boolean {
		const character = this.client.getUnitById(ctx.subject)?.display.character;
		const key = `${field}:${ctx.subject}:${ctx.skill ?? ''}`;
		const index = this.textTurns.get(key) ?? 0;
		const characterText = resolveMudText(this.tables, field, character, index);
		const passive = getPassiveData(ctx.passive);
		const passiveText = pickMudText(passive?.action, index);
		const activeText = pickMudText(action, index);
		const text = activeText ?? characterText ?? passiveText ?? pickMudText(fallback, index);
		if (!text) return false;

		this.textTurns.set(key, index + 1);
		const unit = this.client.getUnitById(ctx.target);
		const subject = this.client.getUnitById(ctx.subject);
		const weapon = subject?.display.weaponName?.trim() || '兵器';
		const part = bodyParts[index % bodyParts.length];
		const values: Record<string, string> = {
			人物: this.name(ctx.subject),
			施放者: ctx.actor === undefined ? '' : this.name(ctx.actor),
			目标: this.name(ctx.target),
			技能:
				!activeText && !characterText && passiveText
					? this.paint(`[${passive.name}]`, 'cyan')
					: ctx.skill === undefined
						? ''
						: this.skillName(ctx.skill),
			被动: passive ? this.paint(`[${passive.name}]`, 'cyan') : '',
			减伤: this.paint(String(ctx.reduced ?? 0), 'blue'),
			减伤前: String(ctx.originalDamage ?? 0),
			减伤后: String(ctx.damage ?? 0),
			兵器名称: weapon,
			部位: part,
			伤害: this.paint(String(ctx.damage ?? 0), ctx.critical ? 'orange' : 'red'),
			治疗: this.paint(String(ctx.heal ?? 0), 'green'),
			生命: String(ctx.hp ?? unit?.point.hp ?? '未知'),
			最大生命: String(unit?.point.hpMax ?? '未知'),
			未命中: this.paint('未命中', 'blue'),
			Buff: ctx.buff === undefined ? '' : this.buffName(ctx.buff),
			原因: ctx.reason ?? '',
		};
		const symbols: Record<string, string> = {
			N: values.人物,
			n: ctx.subject === ctx.actor ? values.目标 : values.施放者,
			w: weapon,
			l: part,
		};
		const line =
			prefix +
			text.replace(/\$([Nnwl])|\{([^{}]+)\}/g, (placeholder, symbol: string, key: string) =>
				symbol ? symbols[symbol] : (values[key] ?? placeholder),
			);
		if (capture) {
			capture(line);
			return true;
		}

		this.write(
			line + suffix,
			field === '死亡文本' ? 'darkRed' : field === '复活文本' ? 'brightGreen' : undefined,
		);
		return true;
	}

	override enter() {
		const uid = this.uid;
		if (this.template('出场文本', { actor: uid, target: uid, subject: uid })) return;

		this.write(`${this.name(uid)}步入场中，凝神戒备。`);
	}

	override ready() {
		this.write('');
		if (this.template('准备文本', { actor: this.uid, target: this.uid, subject: this.uid }))
			return;

		this.write(this.name(this.uid) + '凝神应战，准备出手。');
	}
	override action(skill: number, target: number, reaction?: string) {
		this.template(
			'出手文本',
			{ actor: this.uid, target, subject: this.uid, skill },
			this.reaction(reaction),
			mudActionTexts(getSkillData(skill)),
			getSkillData(skill)?.action,
		);
	}
	override miss(attacker: number, skill: number, reaction?: string) {
		this.template(
			'未命中文本',
			{
				actor: attacker,
				target: this.uid,
				subject: this.uid,
				skill,
				passive: this.data.display.qinggong,
			},
			this.reaction(reaction),
			mudMissTexts,
		);
	}
	override block(attacker: number) {
		if (
			this.template('格挡文本', {
				actor: attacker,
				target: this.uid,
				subject: this.uid,
				passive: this.data.display.wugong,
			})
		)
			return;

		this.write(this.name(this.uid) + '架住' + this.name(attacker) + '的攻势。');
	}
	override mitigate(amount: number, event: FightRenderContext = {}) {
		let suffix =
			event.actualDamage === undefined
				? ''
				: `${this.data.display.name || this.name(this.uid)}受到了${this.paint(String(event.actualDamage), 'red')}点伤害。`;
		if (event.actualDamage > 0) {
			this.template(
				'受伤文本',
				{
					...event,
					target: this.uid,
					subject: this.uid,
					damage: event.actualDamage,
					critical: event.effects?.includes('crit'),
				},
				'',
				undefined,
				undefined,
				'',
				(text) => {
					suffix = text;
				},
			);
		}

		this.reportedHurt =
			event.actualDamage === undefined
				? undefined
				: { actor: event.actor, damage: event.actualDamage };
		if (
			this.template(
				'减伤文本',
				{
					...event,
					target: this.uid,
					subject: this.uid,
					passive: this.data.display.neigong,
					reduced: amount,
				},
				'',
				undefined,
				undefined,
				suffix,
			)
		)
			return;

		this.write(`${this.name(this.uid)}化去部分劲力，减免 ${amount} 点伤害。${suffix}`);
	}
	override die(event: FightRenderContext = {}) {
		if (this.template('死亡文本', { ...event, target: this.uid, subject: this.uid })) return;

		this.write(this.name(this.uid) + '身形一晃，终于支撑不住，倒地不起。', 'darkRed');
	}
	override relife() {
		if (this.template('复活文本', { target: this.uid, subject: this.uid })) return;

		this.write(
			'一线生机重新凝聚，' + this.name(this.uid) + '缓缓睁开双眼，重新站起。',
			'brightGreen',
		);
	}
	override addBuff(id: number, source?: number, initial = false) {
		if (
			this.template('添加Buff文本', {
				actor: source,
				target: this.uid,
				subject: this.uid,
				buff: id,
			})
		)
			return;

		this.write(
			initial
				? this.name(this.uid) + '身上带着' + this.buffName(id) + '。'
				: this.name(source) +
						'将' +
						this.buffName(id) +
						'施于' +
						this.name(this.uid) +
						'身上。',
		);
	}
	override removeBuff(id: number, source?: number, reason = '') {
		const description =
			reason === 'die'
				? '（死亡清除）'
				: reason === 'turn'
					? '（持续时间结束）'
					: reason === 'times'
						? '（次数耗尽）'
						: '';
		if (
			this.template('移除Buff文本', {
				actor: source,
				target: this.uid,
				subject: this.uid,
				buff: id,
				reason: description,
			})
		)
			return;

		this.write(this.name(this.uid) + '身上的' + this.buffName(id) + '消散了。' + description);
	}
	override buffTimes(id: number, remaining: number) {
		this.write(
			this.name(this.uid) + '身上的' + this.buffName(id) + '还剩' + remaining + '次。',
		);
	}
	override defend() {
		this.write(this.name(this.uid) + '收招凝神，采取防御姿态。');
	}
	override protect(target: number) {
		this.write(
			this.name(this.uid) + '挺身护在' + this.name(target) + '身前，准备替其挡下攻势。',
		);
	}
	override skillFailed(skill: number) {
		this.write(
			this.name(this.uid) +
				'欲使出' +
				this.skillName(skill) +
				'，却气机一滞，这一式未能发动。',
		);
	}
	override skipAction(buff?: number, status?: string) {
		this.write(
			this.name(this.uid) +
				'受' +
				(buff != null ? this.buffName(buff) : status) +
				'影响，只能按兵不动，这一回合未能行动。',
		);
	}
	override dismiss(operator?: number) {
		this.write(this.name(operator) + ' 移除 ' + this.name(this.uid) + '，使其离场');
	}
	private reaction(type: string): string {
		const label =
			type === 'combo'
				? '连招'
				: type === 'next'
					? '连击'
					: type === 'kill'
						? '追击'
						: type === 'fback'
							? '反击'
							: type === 'support'
								? '协战'
								: '';
		return label ? `【${label}】` : '';
	}

	private injury(id: number, hp: number): string {
		const max = this.client.getUnitById(id)?.point.hpMax;
		if (!(max > 0)) return `（剩余生命 ${hp}）`;

		const ratio = hp / max;
		const description =
			hp <= 0
				? '气息将绝，已到了生死边缘'
				: ratio >= 0.8
					? '气息略乱，受了轻伤'
					: ratio >= 0.5
						? '呼吸渐急，伤势渐重'
						: ratio >= 0.2
							? '身受重伤，气息已乱'
							: '气若游丝，勉力支撑';
		return `（${description}；生命 ${hp}/${max}）`;
	}

	override hurt(damage: number, event: FightRenderContext = {}) {
		const reported = this.reportedHurt;
		this.reportedHurt = undefined;
		if (reported?.actor === event.actor && reported?.damage === damage) {
			return;
		}

		const hp = event.hp ?? this.data.point.hp,
			flags = event.effects ?? [];
		const ctx: MudContext = {
			...event,
			target: this.uid,
			subject: this.uid,
			damage,
			hp,
			critical: flags.includes('crit'),
		};
		if (damage > 0) {
			if (this.template('受伤文本', ctx)) return;
		}

		const target = this.name(this.uid),
			attacker = this.name(event.actor);
		const amount = String(damage);
		if (damage === 0) {
			const prefix = `${attacker}这一击未能伤及${target}，造成 `;
			this.write(`${prefix}${amount} 点伤害。`, 'red', {
				start: prefix.length,
				length: amount.length,
			});
			return;
		}

		const critical = (flags ?? []).includes('crit');
		let prefix: string,
			resource = '伤害';
		if ((event.reason ?? 'skill') === 'dback') {
			prefix = `${target}被${attacker}的劲力反震，损失 `;
			resource = '生命';
		} else if ((event.reason ?? 'skill') === 'share') {
			prefix = `${target}挺身挡下一击，分担 `;
		} else if ((event.reason ?? 'skill') === 'reflect') {
			prefix = `${attacker}将攻势原路反射，${target}遭到反噬，受到 `;
		} else if ((event.reason ?? 'skill') === 'poison' || (event.reason ?? 'skill') === 'buff') {
			prefix = `${target}${(event.reason ?? 'skill') === 'poison' ? '体内毒性发作' : '遭到持续侵蚀'}，损失 `;
			resource = '生命';
		} else {
			const max = this.client.getUnitById(this.uid)?.point.hpMax;
			const ratio = max > 0 ? damage / max : 0;
			const kind = ratio < 0.05 ? 'light' : ratio < 0.2 ? 'medium' : 'heavy';
			const key = `impact:${this.uid}:${kind}`;
			const index = this.textTurns.get(key) ?? 0;
			const impact = pickMudText(mudImpactTexts[kind], index);
			if (!critical) this.textTurns.set(key, index + 1);

			prefix = critical ? `这一击直中${target}要害，造成 ` : `${target}${impact}`;
		}
		const effects = (flags ?? []).map((effect: string) =>
			effect === 'crit' ? '暴击' : effect,
		);
		this.write(
			`${prefix}${amount} 点${resource}${effects.length ? `（${effects.join('、')}）` : ''}。${this.injury(this.uid, hp)}`,
			critical ? 'orange' : 'red',
			{ start: prefix.length, length: amount.length },
		);
	}

	override heal(value: number, event: FightRenderContext = {}) {
		const unit = this.data,
			hp = event.hp ?? unit.point.hp,
			flags = event.effects ?? [];
		if (
			this.template('治疗文本', {
				...event,
				target: this.uid,
				subject: this.uid,
				heal: value,
				hp,
			})
		)
			return;

		const amount = String(value);
		const target = this.name(this.uid),
			healer = this.name(event.actor);
		const prefix =
			(event.reason ?? 'heal') === 'blood'
				? `${target}借着攻势汲回血气（吸血），恢复 `
				: (event.reason ?? 'heal') === 'relife'
					? `${target}重新凝聚生机，恢复 `
					: (event.reason ?? 'heal') === 'reflect'
						? `${healer}转来的生机落在${target}身上，恢复 `
						: this.uid === event.actor
							? `${target}运气调息，恢复 `
							: `${healer}为${target}渡入一股生机，恢复 `;
		const feeling = hp === hp - value ? '气血未有变化。' : '气息稍稍平复。';
		const effects = (flags ?? []).map((effect: string) =>
			effect === 'crit' ? '暴击' : effect,
		);
		this.write(
			`${prefix}${amount} 点生命${effects.length ? `（${effects.join('、')}）` : ''}，${feeling}（生命 ${hp}/${unit?.point.hpMax ?? '未知'}）`,
			'green',
			{ start: prefix.length, length: amount.length },
		);
	}
}
