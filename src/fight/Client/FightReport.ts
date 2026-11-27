// 因为没有画面，根据战斗消息来生成一份人可以阅读的简报
// 暂时用中文简报
// 用一点小小的标注来改善阅读，
// 1. 技能用[技能名] #1 => [黑虎掏心]，bufff也一样
// 2. 数字：加血用绿色，伤害用红色，暴击伤害用橙色，未命中三个字用蓝色
// 3. 死亡整句用暗红色，复活用亮绿色
// 4. 每个 行动 前多一个换行
// 5. 技能名青色，Buff 名紫色
// 6. 仅行首人名按阵营着色（攻击方绿、防守方红），跳过连击等行首标注

import { FightLoop } from '../Loop/FightLoop';
import { PropEnum, WeaponEnum } from '../FightAttr';
import { fightMsg } from '../struct';
import { FightClient } from './FightClient';
import { FightResultEnum } from '../struct';
import { getBuffData } from '../Datas/BuffDatas';
import { getSkillData } from '../Datas/SkillDatas';
import { FightPreParse, FightSupportGroup } from './FightPreParse';

const colors = {
	red: '\x1b[31m',
	orange: '\x1b[38;5;208m',
	green: '\x1b[32m',
	darkRed: '\x1b[38;5;88m',
	brightGreen: '\x1b[92m',
	blue: '\x1b[34m',
	cyan: '\x1b[36m',
	purple: '\x1b[35m',
};
export type ReportColor = keyof typeof colors;

export class FightReport {
	readonly lines: string[] = [];
	protected client = new FightClient();
	protected preParser = new FightPreParse();

	// 默认直接打印，也可传入自己的输出函数；lines 始终保存当前战斗的简报。
	constructor(
		private output: (line: string) => void = (line) => console.log(line),
		private color = true,
	) {}

	toString(): string {
		return this.lines.join('\n');
	}

	protected name(id: number): string {
		const unit = this.client.getUnitById(id);
		return unit ? `${unit.display.name}（#${id}）` : `单位 #${id}`;
	}

	protected buffName(id: number): string {
		const name = getBuffData(id)?.name;
		return this.paint(name ? `[${name}]` : `Buff #${id}`, 'purple');
	}

	protected skillName(id: number): string {
		const name = id === 0 ? '普通攻击' : getSkillData(id)?.name;
		return this.paint(name ? `[${name}]` : `技能 #${id}`, 'cyan');
	}

	protected paint(text: string, color: ReportColor): string {
		return this.color ? `${colors[color]}${text}\x1b[0m` : text;
	}

	private paintLeadingName(line: string): string {
		const offset = line.match(/^(?:【[^】]*】)*/)[0].length;
		for (const side of [0, 1] as const) {
			for (const unit of this.client.sides[side]) {
				const name = this.name(unit.uid);
				if (line.startsWith(name, offset)) {
					return (
						line.slice(0, offset) +
						this.paint(name, side === 0 ? 'green' : 'red') +
						line.slice(offset + name.length)
					);
				}
			}
		}

		return line;
	}

	protected write(
		line: string,
		color?: ReportColor,
		highlight?: { start: number; length: number },
	) {
		const plain = line.replace(/\x1b\[[0-9;]*m/g, '');
		this.lines.push(plain);
		if (this.color && color) {
			// 整句着色覆盖局部颜色；局部着色保留前缀中的技能和 Buff 颜色。
			const rendered = highlight ? line : plain;
			const start = highlight?.start ?? 0;
			const end = highlight ? start + highlight.length : rendered.length;
			const output = `${rendered.slice(0, start)}${colors[color]}${rendered.slice(start, end)}\x1b[0m${rendered.slice(end)}`;
			this.output(highlight ? this.paintLeadingName(output) : output);
		} else {
			this.output(this.color ? this.paintLeadingName(line) : plain);
		}
	}

	// 子类可接管文字描写；状态更新、颜色和日志保存仍走公共流程。
	protected describe(_msg: fightMsg): boolean {
		return false;
	}

	private hurtResult(msg: fightMsg): string {
		const reason =
			msg[1] === 'dback'
				? '反伤'
				: msg[1] === 'share'
					? '分担伤害'
					: msg[1] === 'reflect'
						? '反射伤害'
						: msg[1] === 'poison'
							? '中毒'
							: '伤害';
		const effects = (msg[6] ?? []).map((effect: string) =>
			effect === 'crit' ? '暴击' : effect,
		);
		const amount = this.paint(
			String(msg[4]),
			(msg[6] ?? []).includes('crit') ? 'orange' : 'red',
		);
		return `${amount} 点${reason}${effects.length ? `（${effects.join('、')}）` : ''}，剩余生命 ${msg[5]}`;
	}

	bindFightLoop(fl: FightLoop) {
		// 跳过网络，直接导入消息
		fl.onMsg((msgs: fightMsg | fightMsg[]) => {
			this.onMsg(msgs);
		});
	}

	// 接收消息
	onMsg(msgs: fightMsg | fightMsg[]) {
		if (!msgs?.length) return;

		const parsed = this.preParser.parse(msgs);
		const batch = parsed.messages;
		const supportStarts = new Map<number, FightSupportGroup>();
		const announcedSupport = new Set<number>();
		const sharedDamage = new Map<number, fightMsg>();
		const sharedStarts = new Set<number>();
		for (const group of parsed.groups) {
			if (group.kind === 'support') {
				supportStarts.set(group.attack.index, group);
				announcedSupport.add(group.support.index);
			} else {
				sharedStarts.add(group.share.index);
				sharedDamage.set(group.target.index, group.share.message);
			}
		}
		for (let index = 0; index < batch.length; index++) {
			const msg = batch[index];
			if (msg[0] === 'start') {
				this.lines.length = 0;
			}
			// 复用客户端的消息处理，仅从消息累计展示状态，不读取服务端战斗。
			const dismissal =
				msg[0] === 'dismiss'
					? `${this.name(msg[1])} 移除 ${this.name(msg[2])}，使其离场`
					: undefined;
			this.client.onMsg(msg);
			if (this.describe(msg)) continue;
			const name = (id: number) => this.name(id);
			if (announcedSupport.has(index)) {
				// 出手已在主攻处一起描述，未命中结果仍留在原结算位置。
				if (msg[0] === 'miss') {
					const prefix = `【协战】${name(msg[2])} 对 ${name(msg[3])}，`;
					this.write(`${prefix}未命中`, 'blue', { start: prefix.length, length: 3 });
				}
				continue;
			}
			const supportGroup = supportStarts.get(index);
			if (supportGroup) {
				const support = supportGroup.support.message;
				const reaction =
					msg[4] === 'next'
						? '【连击】'
						: msg[4] === 'combo'
							? '【连招】'
							: msg[4] === 'kill'
								? '【追击】'
								: msg[4] === 'fback'
									? '【反击】'
									: '';
				this.write(
					`${reaction}【协战】${name(msg[2])} 使用${this.skillName(msg[1])}，` +
						`${name(support[2])} 使用${this.skillName(support[1])}，同时攻击 ${name(msg[3])}`,
				);
				continue;
			}
			switch (msg[0]) {
				case 'start':
					this.write(`战斗 #${msg[1]} 开始`);
					break;
				case 'side': {
					const side = msg[1] === 0 ? '攻击方' : '防守方';
					const units = this.client.sides[msg[1] as 0 | 1];
					this.write(
						`${side}：${units.map((u) => `${name(u.uid)}，位置 ${u.pos ?? '未设置'}，生命 ${u.point.hp}/${u.point.hpMax}，法力 ${u.point.mp}/${u.point.mpMax}${u.shield !== undefined ? `，护盾 ${u.shield}/${u.shieldMax}` : ''}${u.dead ? '，已死亡' : ''}`).join('；') || '无单位'}`,
					);
					for (const unit of units) {
						for (const buff of unit.buffs) {
							this.write(
								`${name(unit.uid)} 初始携带 ${this.buffName(buff[0])}（等级 ${buff[1]}）`,
							);
						}
					}
					break;
				}
				case 'turn':
					this.write('');
					this.write(`第 ${msg[1]} 回合`);
					break;
				case 'sort':
					this.write(
						`剩余行动顺序：${
							(msg[1] as number[])
								.map((uid, index) => {
									const action = msg[2]?.[index];
									return (
										name(uid) +
										(action?.inserted
											? `（追加${action.skill !== undefined ? this.skillName(action.skill) : '行动'}）`
											: '')
									);
								})
								.join(' → ') || '无'
						}`,
					);
					break;
				case 'actor':
					this.write('');
					this.write(
						msg[3] === 'ultimate'
							? `${name(msg[1])} 施放大招`
							: msg[3] === 'skill'
								? `${name(msg[1])} 施放即时技能`
								: msg[3] === 'insert'
									? `${name(msg[1])} 追加行动`
									: `${name(msg[1])} 行动（速度 ${msg[2]}）`,
					);
					break;
				case 'aiHp':
					this.write(
						`${name(msg[1])} 触发 ${Math.round(msg[2] * 100)}% 血线，进入${this.buffName(msg[3])}阶段（等级 ${msg[4]}）`,
					);
					break;
				case 'aiAttack':
					this.write(`${name(msg[1])} 触发受伤计次攻击，目标为 ${name(msg[2])}`);
					break;
				case 'skillFailed':
					this.write(
						`${name(msg[1])} 的${this.skillName(msg[3])}未发动（发动概率判定失败）`,
					);
					break;
				case 'skipAction':
					this.write(
						`${name(msg[1])} 因${msg[2] != null ? this.buffName(msg[2]) : msg[3]}跳过行动`,
					);
					break;
				case 'defend':
					this.write(`${name(msg[1])} 进入防御姿态`);
					break;
				case 'protect':
					this.write(`${name(msg[1])} 保护 ${name(msg[2])}`);
					break;
				case 'weakness':
					this.write(
						`${name(msg[1])} 揭示弱点：${msg[2] === 'prop' ? PropEnum[msg[3]] : WeaponEnum[msg[3]]}`,
					);
					break;
				case 'weaknessAll': {
					const props = (msg[2] as PropEnum[]).map((prop) => PropEnum[prop]);
					const weapons = (msg[3] as WeaponEnum[]).map((weapon) => WeaponEnum[weapon]);
					this.write(
						`${name(msg[1])} 的全部弱点：${[...props, ...weapons].join('、') || '无'}`,
					);
					break;
				}
				case 'shield':
					this.write(
						msg[3] === 'recover'
							? `${name(msg[1])} 护盾恢复至 ${msg[2]}，破盾眩晕解除`
							: msg[2] === 0
								? `${name(msg[1])} 护盾被击破，陷入眩晕`
								: `${name(msg[1])} 护盾剩余 ${msg[2]}`,
					);
					break;
				case 'hurt': {
					if (sharedStarts.has(index)) {
						// 暂存本句描写，等下一条客户端伤害也处理完后一起输出。
						break;
					}
					const share = sharedDamage.get(index);
					if (share) {
						this.write(
							`${name(msg[3])} 对 ${name(share[2])} 造成 ${this.hurtResult(share)}；` +
								`对 ${name(msg[2])} 造成 ${this.hurtResult(msg)}`,
						);
						break;
					}
					const prefix = `${name(msg[3])} 对 ${name(msg[2])} 造成 `;
					this.write(`${prefix}${this.hurtResult(msg)}`);
					break;
				}
				case 'heal': {
					const unit = this.client.getUnitById(msg[2]);
					const after = unit?.point.hp ?? msg[5] + msg[4];
					const reason =
						msg[1] === 'blood'
							? '吸血'
							: msg[1] === 'relife'
								? '复活治疗'
								: msg[1] === 'reflect'
									? '反射治疗'
									: '治疗';
					const effects = (msg[6] ?? []).map((effect: string) =>
						effect === 'crit' ? '暴击' : effect,
					);
					const prefix = `${name(msg[3])} 为 ${name(msg[2])} 恢复 `;
					const amount = String(after - msg[5]);
					this.write(
						`${prefix}${amount} 点生命（${reason}${effects.length ? `，${effects.join('、')}` : ''}），当前生命 ${after}/${unit?.point.hpMax ?? '未知'}`,
						'green',
						{ start: prefix.length, length: amount.length },
					);
					break;
				}
				case 'costHp':
				case 'costMp':
				case 'costSp':
				case 'costJp': {
					const resource = {
						costHp: '生命',
						costMp: '法力',
						costSp: '怒气',
						costJp: '集气',
					}[msg[0]];
					this.write(
						`${name(msg[1])} 消耗 ${msg[2]} 点${resource}，剩余${resource} ${msg[3]}`,
					);
					break;
				}
				case 'addPoint': {
					const resource = { mp: '法力', sp: '怒气', jp: '集气' }[
						msg[2] as 'mp' | 'sp' | 'jp'
					];
					this.write(
						`${name(msg[1])} 增加 ${msg[3]} 点${resource}，当前${resource} ${msg[4]}`,
					);
					break;
				}
				case 'addBuff':
					if (msg[6])
						this.write(
							`${name(msg[3])} 为 ${name(msg[2])} 添加 ${this.buffName(msg[4])}（等级 ${msg[5]}）`,
						);
					break;
				case 'buffTimes':
					this.write(`${name(msg[1])} 的 ${this.buffName(msg[2])} 剩余 ${msg[3]} 次`);
					break;
				case 'removeBuff':
					this.write(
						`${name(msg[2])} 移除 ${this.buffName(msg[4])}${msg[1] === 'die' ? '（死亡清除）' : msg[1] === 'turn' ? '（持续时间结束）' : msg[1] === 'times' ? '（次数耗尽）' : ''}`,
					);
					break;
				case 'buffTrigger': {
					const detail =
						msg[3] === 'buqu'
							? '保留 1 点生命'
							: msg[3] === 'relife'
								? '自动复活'
								: msg[3] === 'reflectHurt'
									? `向 ${name(msg[4])}反射伤害`
									: msg[3] === 'protect'
										? `由 ${name(msg[4])}分担伤害`
										: msg[3] === 'reflectHeal'
											? `将治疗转移给 ${name(msg[4])}`
											: '';
					this.write(
						`${name(msg[1])} 的${this.buffName(msg[2])}触发${detail ? `（${detail}）` : ''}`,
					);
					break;
				}
				case 'die':
					this.write(`${name(msg[1])}死亡`, 'darkRed');
					break;
				case 'relife':
					this.write(`${name(msg[1])}复活`, 'brightGreen');
					break;
				case 'spread':
					this.write(`溅射目标：${(msg[1] as number[]).map(name).join('、')}`);
					break;
				case '禁疗':
				case '百毒不侵':
				case '无效':
				case '无法复活':
					this.write(`${name(msg[1])}：${msg[0]}`);
					break;
				case 'skillCd': // 冷却状态供客户端技能栏使用，无须逐次写入简报。
					break;
				case 'end': {
					const result =
						msg[1] === FightResultEnum.attack
							? '攻击方获胜'
							: msg[1] === FightResultEnum.defend
								? '防守方获胜'
								: msg[1] === FightResultEnum.draw
									? '平局'
									: msg[1] === FightResultEnum.outoftime
										? '超过回合上限，防守方获胜'
										: `结果 ${msg[1]}`;
					this.write(`战斗结束：${msg[3] ? '逃跑，' : ''}${result}`);
					break;
				}
				case 'block':
					this.write(`${name(msg[1])} 招架住 ${name(msg[2])} 的攻势`);
					break;
				case 'mitigate':
					this.write(`${name(msg[1])} 减免 ${msg[3] - msg[4]} 点伤害`);
					break;
				case 'summon':
					this.write(`${name(msg[1])} 召唤 ${name(msg[3].uid)}，加入战斗`);
					break;
				case 'dismiss':
					this.write(dismissal);
					break;
				case 'runaway':
					this.write(`${name(msg[1])} 逃跑${msg[2] ? '成功' : '失败'}`);
					break;
				case 'skill':
				case 'miss':
				default: {
					const reaction =
						msg[4] === 'next'
							? '连击'
							: msg[4] === 'combo'
								? '连招'
								: msg[4] === 'kill'
									? '追击'
									: msg[4] === 'fback'
										? '反击'
										: msg[4] === 'support'
											? '协战'
											: '';
					const prefix = reaction ? `【${reaction}】` : '';
					const skill = this.skillName(msg[1]);
					if (msg.length >= 4 && (msg[0] === 'miss' || msg[1] === 'miss')) {
						const beforeMiss = `${prefix}${name(msg[2])} ${msg[0] === 'miss' ? `使用${skill}攻击` : '攻击'} ${name(msg[3])}，`;
						this.write(`${beforeMiss}未命中`, 'blue', {
							start: beforeMiss.length,
							length: 3,
						});
					} else if (msg.length >= 4 && typeof msg[1] === 'number') {
						this.write(`${prefix}${name(msg[2])} 对 ${name(msg[3])} 使用${skill}`);
					} else {
						this.write(`未识别消息：${JSON.stringify(msg)}`);
					}
					break;
				}
			}
		}
	}
}
