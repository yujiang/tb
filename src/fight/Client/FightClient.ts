// 客户端跟服务器对应的战斗
// ai修改不要删我的注释

import { strict as assert } from 'node:assert';
import { isDeepStrictEqual } from 'node:util';
import { fightMsg, FightActionDisplay } from '../struct';
import { Fight } from '../Fight';
import { FightLoop } from '../FightLoop';
import { FightUnit } from '../Unit/FightUnit';
import { FightResultEnum, FightSideEnum } from '../struct';

export type FightClientUnit = ReturnType<FightUnit['getUnitMsg']>;

export class FightClient {
	fid: number;
	turn = 0;
	win = FightResultEnum.ongoing;
	sides: [FightClientUnit[], FightClientUnit[]] = [[], []];
	sort: number[] = [];
	actions: FightActionDisplay[] = [];
	actor: number | undefined;
	ultimateReady: [boolean, boolean] = [false, false];
	private boundLoops = new WeakMap<FightLoop, { autocheck: boolean }>();

	getUnitById(id: number): FightClientUnit | undefined {
		return this.sides.flat().find((u) => u.uid === id);
	}

	bindFightLoop(fl: FightLoop, autocheck = true) {
		const existing = this.boundLoops.get(fl);
		if (existing) {
			existing.autocheck = autocheck;
			return;
		}
		const binding = { autocheck };
		this.boundLoops.set(fl, binding);
		// 跳过网络，直接导入消息
		fl.onMsg((msgs: fightMsg | fightMsg[]) => {
			this.onMsg(msgs);
			// 每个回合检测一次
			const batch = this.toBatch(msgs);
			if (binding.autocheck && batch.some((msg) => msg[0] === 'turn' || msg[0] === 'end')) {
				assert.ok(this.checkSame(fl.fight), 'FightClient state differs from server');
			}
		});
	}

	private toBatch(msgs: fightMsg | fightMsg[]): fightMsg[] {
		if (!msgs?.length) return [];
		return typeof msgs[0] === 'string' ? [msgs as fightMsg] : (msgs as fightMsg[]);
	}

	// 接收消息
	onMsg(msgs: fightMsg | fightMsg[]) {
		for (const msg of this.toBatch(msgs)) {
			switch (msg[0]) {
				case 'start':
					this.ultimateReady = [false, false];
					this.fid = msg[1];
					this.turn = 0;
					this.win = FightResultEnum.ongoing;
					this.sides = [[], []];
					this.sort = [];
					this.actions = [];
					this.actor = undefined;
					break;
				case 'side':
					this.sides[msg[1] as FightSideEnum] = structuredClone(msg[2]);
					break;
				case 'turn':
					this.turn = msg[1];
					this.actor = undefined;
					break;
				case 'end':
					this.win = msg[1];
					if (this.win !== FightResultEnum.ongoing) this.ultimateReady = [false, false];
					this.actor = undefined;
					this.sort = [];
					this.actions = [];
					break;
				case 'sort':
					this.sort = [...msg[1]];
					this.actions = msg[2]
						? structuredClone(msg[2])
						: this.sort.map((uid, id) => ({ id, uid }));
					break;
				case 'actor':
					this.actor = msg[1];
					if (msg[3] !== 'skill' && msg[3] !== 'ultimate') {
						const index =
							msg[4] !== undefined
								? this.actions.findIndex((action) => action.id === msg[4])
								: this.sort.indexOf(this.actor);
						if (index >= 0) {
							this.sort.splice(index, 1);
							this.actions.splice(index, 1);
						}
					}
					break;
				case 'ultimateReady':
					this.ultimateReady[msg[1] as 0 | 1] = msg[2];
					break;
				case 'hurt': {
					const unit = this.getUnitById(msg[2]);
					if (unit) unit.point.hp = msg[5];
					break;
				}
				case 'heal': {
					const unit = this.getUnitById(msg[2]);
					// 现有 heal 消息携带的是治疗前血量。
					if (unit) unit.point.hp = Math.min(msg[5] + msg[4], unit.point.hpMax);
					break;
				}
				case 'costHp':
				case 'costMp': {
					const unit = this.getUnitById(msg[1]);
					if (unit) unit.point[msg[0] === 'costHp' ? 'hp' : 'mp'] = msg[3];
					break;
				}
				case 'skillCd': {
					const unit = this.getUnitById(msg[1]);
					if (unit) {
						const cds = new Map(unit.skillCds ?? []);
						cds.set(msg[2], msg[3]);
						unit.skillCds = [...cds];
					}
					break;
				}
				case 'die': {
					const unit = this.getUnitById(msg[1]);
					if (unit) unit.dead = true;
					break;
				}
				case 'shield': {
					const unit = this.getUnitById(msg[1]);
					if (unit) unit.shield = msg[2];
					break;
				}
				case 'relife': {
					const unit = this.getUnitById(msg[1]);
					if (unit) unit.dead = false;
					break;
				}
				case 'addBuff': {
					const unit = this.getUnitById(msg[2]);
					if (unit) {
						// 替换同编号旧实例，包括可见实例被隐藏实例替换的情况。
						unit.buffs = unit.buffs.filter((buff) => buff[0] !== msg[4]);
						if (msg[6]) {
							unit.buffs.push([msg[4], msg[5], ...msg[6]]);
						}
					}
					break;
				}
				case 'buffTimes': {
					const buff = this.getUnitById(msg[1])?.buffs.find((buff) => buff[0] === msg[2]);
					if (buff) buff[4] = msg[3];
					break;
				}
				case 'removeBuff': {
					const unit = this.getUnitById(msg[2]);
					if (unit) {
						unit.buffs = unit.buffs.filter((buff) => buff[0] !== msg[4]);
					}
					break;
				}
				// 技能、特效等消息留给绘制层。
			}
		}
	}

	// 检测是否跟服务器的战况完全一致，包括位置，display，point, buffs
	checkSame(f: Fight): boolean {
		if (this.fid !== f.fid || !f.Sides) return false;
		if (
			!isDeepStrictEqual(this.ultimateReady, [f.hasUltimateChance(0), f.hasUltimateChance(1)])
		)
			return false;
		for (const side of [FightSideEnum.attack, FightSideEnum.defend]) {
			const units = this.sides[side];
			const expected = f.getSide(side).units;
			if (units.length !== expected.length) return false;
			const byId = new Map(units.map((u) => [u.uid, u]));
			if (byId.size !== units.length) return false;
			for (const unit of expected) {
				const actual = byId.get(unit.uid);
				const snapshot = unit.getUnitMsg();
				if (
					!actual ||
					actual.pos !== snapshot.pos ||
					actual.dead !== snapshot.dead ||
					!isDeepStrictEqual(actual.display, snapshot.display) ||
					!isDeepStrictEqual(actual.point, snapshot.point) ||
					!isDeepStrictEqual(actual.buffs, snapshot.buffs) ||
					actual.shield !== snapshot.shield ||
					actual.shieldMax !== snapshot.shieldMax ||
					!isDeepStrictEqual(actual.skillCds ?? [], snapshot.skillCds ?? [])
				)
					return false;
			}
		}
		return true;
	}
}
