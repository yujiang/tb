import { FightReport } from './FightReport';
import type { FightClientUnit } from './FightClient';
import type { fightMsg } from '../struct';
import type { FightMudTables } from './FightMudDatas';
import { FightRenderUnit, FightRenderContext } from './FightRenderUnit';
import { FightMudUnit, FightMudOutput } from './FightMudUnit';

interface PendingAction {
	actor: number;
	target: number;
	skill: number;
}

/** 协议派发与单位表现分离；客户端先更新状态，再调用unit.miss/hurt/die等方法。 */
export class FightMud extends FightReport {
	private readonly units = new Map<number, FightRenderUnit>();
	private pending: PendingAction[] = [];
	private readonly fatal = new Map<number, FightRenderContext>();
	private readonly unitOutput: FightMudOutput;
	private readonly mitigationDamage = new Map<fightMsg, FightRenderContext>();

	override onMsg(msgs: fightMsg | fightMsg[]) {
		this.mitigationDamage.clear();
		const batch: fightMsg[] =
			typeof msgs?.[0] === 'string' ? [msgs as fightMsg] : (msgs as fightMsg[]);
		const pending = new Map<number, fightMsg>();
		for (const msg of batch ?? []) {
			if (['start', 'turn', 'actor', 'skill', 'end', 'side', 'dismiss'].includes(msg[0]))
				pending.clear();
			if (msg[0] === 'mitigate') pending.set(msg[1], msg);
			if (msg[0] === 'hurt') {
				const mitigation = pending.get(msg[2]);
				if (mitigation?.[2] === msg[3]) {
					this.mitigationDamage.set(mitigation, {
						actualDamage: msg[4],
						hp: msg[5],
						effects: msg[6] ?? [],
						reason: msg[1],
					});
				}
				pending.delete(msg[2]);
			}
		}
		super.onMsg(msgs);
		this.mitigationDamage.clear();
	}

	constructor(
		output: (line: string) => void = console.log,
		color = true,
		tables: FightMudTables = {},
	) {
		super(output, color);
		this.unitOutput = {
			client: this.client,
			tables,
			name: (id) => this.name(id),
			skillName: (id) => this.skillName(id),
			buffName: (id) => this.buffName(id),
			paint: (text, tone) => this.paint(text, tone),
			write: (text, tone, highlight) => this.write(text, tone, highlight),
		};
	}

	/** 动画宿主可重写工厂，返回继承FightRenderUnit的表现单位，不必改协议派发。 */
	protected createRenderUnit(data: FightClientUnit): FightRenderUnit {
		return new FightMudUnit(data, this.unitOutput);
	}

	/** 按运行UID查询表现单位；data是客户端快照，不是服务端FightUnit。 */
	getRenderUnit(uid: number): FightRenderUnit | undefined {
		const existing = this.units.get(uid),
			data = this.client.getUnitById(uid);
		if (existing && (!data || existing.data === data)) {
			return existing;
		}

		// 缺少初始化消息时仍通过同一入口显示“单位 #uid”，新side到达后替换占位表现单位。
		const unit = this.createRenderUnit(
			data ?? {
				uid,
				pos: 0,
				dead: false,
				display: { name: '', wugong: 0, neigong: 0, qinggong: 0 },
				point: { hp: 0, hpMax: 0, mp: 0, mpMax: 0 },
				buffs: [],
			},
		);
		this.units.set(uid, unit);
		return unit;
	}

	private hurtContext(msg: fightMsg): FightRenderContext {
		let skill: number | undefined;
		if (msg[1] === 'skill') {
			for (let i = this.pending.length - 1; i >= 0; i--) {
				const action = this.pending[i];
				if (action.actor !== msg[3] || action.target !== msg[2]) {
					continue;
				}

				skill = this.pending.splice(i, 1)[0].skill;
				break;
			}
		}
		return { actor: msg[3], reason: msg[1], hp: msg[5], effects: msg[6] ?? [], skill };
	}

	protected override describe(msg: fightMsg): boolean {
		switch (msg[0]) {
			case 'start':
				this.units.clear();
				this.pending.length = 0;
				this.fatal.clear();
				return false;
			case 'turn':
			case 'end':
				this.pending.length = 0;
				this.fatal.clear();
				return false;
			case 'side': {
				const units = this.client.sides[msg[1] as 0 | 1];
				this.write(
					`${msg[1] === 0 ? '攻击方' : '防守方'}：${units.map((unit) => this.name(unit.uid)).join('、') || '无人应战'}。`,
				);
				for (const data of units) {
					const unit = this.getRenderUnit(data.uid);
					unit.enter();
					for (const buff of data.buffs) unit.addBuff(buff[0], data.uid, true);
				}
				return true;
			}
			case 'summon':
				this.write(`${this.name(msg[1])} 召唤 ${this.name(msg[3].uid)}，加入战斗。`);
				this.getRenderUnit(msg[3].uid)?.enter();
				return true;
			case 'dismiss':
				this.getRenderUnit(msg[2])?.dismiss(msg[1]);
				this.units.delete(msg[2]);
				this.fatal.delete(msg[2]);
				this.pending = this.pending.filter(
					(action) => action.actor !== msg[2] && action.target !== msg[2],
				);
				return true;
			case 'sort':
				return true;
			case 'actor':
				this.pending.length = 0;
				this.getRenderUnit(msg[1])?.ready();
				return true;
			case 'skill':
				this.pending.push({ actor: msg[2], target: msg[3], skill: msg[1] });
				this.getRenderUnit(msg[2])?.action(msg[1], msg[3], msg[4]);
				return true;
			case 'miss':
				this.getRenderUnit(msg[3])?.miss(msg[2], msg[1], msg[4]);
				return true;
			case 'block':
				this.getRenderUnit(msg[1])?.block(msg[2]);
				return true;
			case 'mitigate':
				this.getRenderUnit(msg[1])?.mitigate(msg[3] - msg[4], {
					actor: msg[2],
					originalDamage: msg[3],
					damage: msg[4],
					...this.mitigationDamage.get(msg),
				});
				return true;
			case 'hurt': {
				const ctx = this.hurtContext(msg);
				if (msg[4] > 0) {
					this.fatal.delete(msg[2]);
					if (msg[5] <= 0) this.fatal.set(msg[2], ctx);
				}
				this.getRenderUnit(msg[2])?.hurt(msg[4], ctx);
				return true;
			}
			case 'heal': {
				const unit = this.getRenderUnit(msg[2]);
				const hp = this.client.getUnitById(msg[2])?.point.hp ?? msg[5] + msg[4];
				if (unit)
					unit.heal(hp - msg[5], {
						actor: msg[3],
						reason: msg[1],
						hp,
						effects: msg[6] ?? [],
					});
				return true;
			}
			case 'die':
				this.getRenderUnit(msg[1])?.die(this.fatal.get(msg[1]));
				this.fatal.delete(msg[1]);
				return true;
			case 'relife':
				this.fatal.delete(msg[1]);
				this.getRenderUnit(msg[1])?.relife();
				return true;
			case 'addBuff':
				if (msg[6]) this.getRenderUnit(msg[2])?.addBuff(msg[4], msg[3]);
				return true;
			case 'removeBuff':
				this.getRenderUnit(msg[2])?.removeBuff(msg[4], msg[3], msg[1]);
				return true;
			case 'buffTimes':
				this.getRenderUnit(msg[1])?.buffTimes(msg[2], msg[3]);
				return true;
			case 'defend':
				this.getRenderUnit(msg[1])?.defend();
				return true;
			case 'protect':
				this.getRenderUnit(msg[1])?.protect(msg[2]);
				return true;
			case 'skillFailed':
				this.getRenderUnit(msg[1])?.skillFailed(msg[3]);
				return true;
			case 'skipAction':
				this.getRenderUnit(msg[1])?.skipAction(msg[2], msg[3]);
				return true;
			default:
				return false;
		}
	}
}
