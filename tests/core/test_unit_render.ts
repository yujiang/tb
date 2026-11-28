import '../fixtures/default_skills';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { FightMud, FightRenderUnit, FightClientUnit, fightMsg } from '../../src';

// 替换单位表现方法即可接管出场、出招、闪避、受伤和死亡，仍先更新客户端状态，不走原文字效果。
test('unit render: protocol dispatch can replace individual unit presentation methods', () => {
	const calls: unknown[][] = [];
	class AnimatedUnit extends FightRenderUnit {
		override enter() {
			calls.push(['enter', this.uid]);
		}
		override ready() {
			calls.push(['ready', this.uid]);
		}
		override action(skill: number, target: number) {
			calls.push(['action', this.uid, skill, target]);
		}
		override miss(source: number) {
			calls.push(['miss', this.uid, source]);
		}
		override hurt(damage: number) {
			calls.push(['hurt', this.uid, damage, this.data.point.hp]);
		}
		override die() {
			calls.push(['die', this.uid, this.data.dead]);
		}
	}
	class AnimatedFight extends FightMud {
		protected override createRenderUnit(data: FightClientUnit) {
			return new AnimatedUnit(data);
		}
	}
	const mud = new AnimatedFight(() => {}, false);
	const unit = (uid: number) => ({
		uid,
		pos: uid,
		dead: false,
		display: { name: `人物${uid}` },
		point: { hp: 100, hpMax: 100, mp: 0, mpMax: 0 },
		buffs: [] as number[][],
	});
	const messages: fightMsg[] = [
		['start', 1],
		['side', 0, [unit(0)]],
		['side', 1, [unit(1)]],
		['actor', 0, 100],
		['skill', 0, 0, 1],
		['hurt', 'skill', 1, 0, 15, 85, []],
		['miss', 0, 0, 1],
		['die', 1],
	];
	mud.onMsg(messages);
	assert.deepEqual(calls, [
		['enter', 0],
		['enter', 1],
		['ready', 0],
		['action', 0, 0, 1],
		['hurt', 1, 15, 85],
		['miss', 1, 0],
		['die', 1, true],
	]);
	assert.doesNotMatch(mud.toString(), /受到 15 点伤害|倒地不起/);
});
