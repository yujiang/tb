import { fightMsg } from '../struct';
import { getSkillData } from '../Datas/SkillDatas';

/** 原始消息及其在本批 messages 中的位置；预解析只读取，不修改消息。 */
export interface FightMessageRef {
	readonly index: number;
	readonly message: fightMsg;
}

/** 双方同时出手，各自的伤害仍保留原结算顺序。 */
export interface FightSupportGroup {
	readonly kind: 'support';
	readonly attack: FightMessageRef;
	readonly support: FightMessageRef;
}

/** 双方同时受伤，之后的死亡、复活等消息不并入本组。 */
export interface FightProtectGroup {
	readonly kind: 'protect';
	readonly share: FightMessageRef;
	readonly target: FightMessageRef;
}

export type FightPresentationGroup = FightSupportGroup | FightProtectGroup;

export interface FightPresentation {
	readonly messages: readonly fightMsg[];
	readonly groups: readonly FightPresentationGroup[];
}

/**
 * 客户端表现预解析，共用于文字与图形渲染。
 * 只保留阵营 ID 关系，不结算战斗、不更新资源、不处理名称和颜色。
 * 每次 parse 只合并当前批次，不缓存不完整动作；关联不明确时保留独立消息。
 */
export class FightPreParse {
	private readonly sides = new Map<number, number>();

	// 宿主使用其他技能表时，可注入自己的协战开关查询。
	constructor(
		private readonly canSupport: (skillId: number) => boolean = (id) =>
			id === 0 || (getSkillData(id) !== undefined && !getSkillData(id).nosupport),
	) {}

	parse(msgs: fightMsg | fightMsg[]): FightPresentation {
		const messages: fightMsg[] = !msgs?.length
			? []
			: typeof msgs[0] === 'string'
				? [msgs as fightMsg]
				: [...(msgs as fightMsg[])];
		const groups: FightPresentationGroup[] = [];
		const ref = (index: number): FightMessageRef => ({ index, message: messages[index] });
		for (let index = 0; index < messages.length; index++) {
			const msg = messages[index];
			if (msg[0] === 'start') this.sides.clear();
			if (msg[0] === 'dismiss') this.sides.delete(msg[2]);
			if (msg[0] === 'summon') this.sides.set(msg[3].uid, msg[2]);
			if (msg[0] === 'side') {
				for (const [uid, side] of this.sides) if (side === msg[1]) this.sides.delete(uid);
				for (const unit of msg[2]) this.sides.set(unit.uid, msg[1]);
			}
			const supportIndex = this.findSupport(messages, index);
			if (supportIndex >= 0)
				groups.push({ kind: 'support', attack: ref(index), support: ref(supportIndex) });
			const next = messages[index + 1];
			if (
				msg[0] === 'hurt' &&
				msg[1] === 'share' &&
				next?.[0] === 'hurt' &&
				next[1] === 'skill' &&
				next[3] === msg[3] &&
				next[2] !== msg[2]
			) {
				groups.push({ kind: 'protect', share: ref(index), target: ref(index + 1) });
			}
		}
		return { messages, groups };
	}

	private findSupport(messages: readonly fightMsg[], index: number): number {
		const attack = messages[index];
		if (attack[0] !== 'skill' || attack[4] === 'support' || !this.canSupport(attack[1])) {
			return -1;
		}

		let hit = false;
		for (let next = index + 1; next < messages.length; next++) {
			const msg = messages[next];
			if (
				[
					'start',
					'side',
					'actor',
					'turn',
					'end',
					'skillFailed',
					'skipAction',
					'protect',
					'dismiss',
					'summon',
				].includes(msg[0])
			) {
				return -1;
			}

			if (msg[0] === 'die' && (msg[1] === attack[2] || msg[1] === attack[3])) {
				return -1;
			}

			if (
				msg[0] === 'hurt' &&
				msg[1] === 'skill' &&
				msg[2] === attack[3] &&
				msg[3] === attack[2]
			) {
				hit = true;
			}
			if (msg[0] !== 'skill' && msg[0] !== 'miss') {
				continue;
			}
			const side = this.sides.get(attack[2]);
			const allies = side !== undefined && side === this.sides.get(msg[2]);
			return hit &&
				msg[4] === 'support' &&
				msg[3] === attack[3] &&
				msg[2] !== attack[2] &&
				allies
				? next
				: -1;
		}

		return -1;
	}
}
