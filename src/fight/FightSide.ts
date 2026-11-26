import { Fight } from './Fight';
import { BaseAttack, FightAttr, FinalAttack } from './FightAttr';
import { FightUnit } from './Unit/FightUnit';
import { FightUnitMonster } from './Unit/FightUnitMonster';
import { FightSideEnum } from './struct';
import { FightUltimate } from './FightUltimate';

export interface simpleData {
	/** 简单示例单位名称。 */
	name: string;
	/** 运行单位 uid，不是怪物模板 ID；由宿主保证本场唯一。 */
	id: number;
	/** 地图平面位置，从0开始，pos=y*nx+x；此辅助函数不校验地图边界。 */
	pos: number;

	/** 覆盖示例物理属性；部分字段缺省或0仍会被随机默认值替换，正式配置建议用 MonsterData。 */
	physic?: BaseAttack;
	/** 覆盖示例魔法属性；攻击/防御采用随机默认值，显式暴击0保留。 */
	magic?: BaseAttack;
	/** 覆盖示例治疗属性；attack 缺省或0时随机30～40，critP 和 defend 在辅助函数中固定为0。 */
	heal?: BaseAttack;
	/** 覆盖示例毒属性；缺省使用 defaultBaseAttack，不在此额外随机毒攻击力。 */
	poison?: BaseAttack;
}

function defaultBaseAttack(): BaseAttack {
	return {
		rand: 0.5,
		hit: 100,
		dodge: 0,
		parry: 0,
		attack: 0,
		defend: 0,
		hurt: 0,
		hurtP: 0,
		hurtAnti: 0,
		hurtPAnti: 0,
		critP: 0,
		critPAnit: 0,
		critDeep: 1,
		critDeepAnit: 0,
	};
}

export class FightSide {
	/** 表格阵法的地图尺寸[宽,高]；省略沿用宿主地图，配置时Fight.createSide校验双方一致并自动建图。 */
	mapsize?: readonly [number, number];
	units: FightUnit[] = [];
	/** 本阵营破盾大招状态：每回合一次、单个待放记录；由Fight在完整动作后协调施放。 */
	readonly ultimate = new FightUltimate(this);
	/** 本阵营成员造成的实际扣血，按来源运行UID累计；0号有效，死亡或离场不删除，单位为生命点。 */
	readonly hurt = new Map<number, number>();
	/** 本阵营成员造成的实际回血，按来源运行UID累计；含自疗，不含溢出，死亡或离场不删除，单位为生命点。 */
	readonly heal = new Map<number, number>();

	recordHurt(uid: number, amount: number) {
		if (amount > 0) this.hurt.set(uid, (this.hurt.get(uid) ?? 0) + amount);
	}
	recordHeal(uid: number, amount: number) {
		if (amount > 0) this.heal.set(uid, (this.heal.get(uid) ?? 0) + amount);
	}
	clearContributions() {
		this.hurt.clear();
		this.heal.clear();
	}
	/** 返回独立的个人贡献列表，含当前零贡献成员和有贡献的离场成员；便于宿主战后展示，不重排阵营。 */
	getContributions(): { uid: number; hurt: number; heal: number }[] {
		const ids = new Set([
			...this.units.map((unit) => unit.uid),
			...this.hurt.keys(),
			...this.heal.keys(),
		]);
		return [...ids].map((uid) => ({
			uid,
			hurt: this.hurt.get(uid) ?? 0,
			heal: this.heal.get(uid) ?? 0,
		}));
	}

	createSimpleMonster(f: Fight, datas: simpleData[]): void {
		for (const data of datas) {
			const attr = new FightAttr();
			const point = {
				hp: 100,
				hpMax: 100,
				mp: 100,
				mpMax: 100,
			};
			attr.point = point;
			const physic: BaseAttack = { ...defaultBaseAttack(), ...data.physic };
			const magic: BaseAttack = { ...defaultBaseAttack(), ...data.magic };
			const heal: BaseAttack = { ...defaultBaseAttack(), ...data.heal };
			const poison: BaseAttack = { ...defaultBaseAttack(), ...data.poison };

			physic.critP = data.physic?.critP ?? 0.2 + f.random() * 0.1;
			physic.attack = data.physic?.attack || 50 + f.random() * 20;
			physic.defend = data.physic?.defend || 50 - f.random() * 20;
			physic.hit = data.physic?.hit || 80 + f.random() * 10;
			physic.dodge = data.physic?.dodge || 20 + f.random() * 10;

			const fa: FinalAttack = {
				dbackP: 0,
				bloodP: 0,
				immunity: 0,
				immunityP: 0,

				// dbackPAnti: 0,
				// bloodPAnti: 0,
				// immunityAnti: 0,
				// immunityPAnti: 0,
			};

			attr.physic = {
				base: { ...physic, rand: 0.5 },
				kill: { ...physic, rand: 0.5 },
				next: { ...physic, rand: 0.5 },
				spread: { ...physic, rand: 0.5 },
				fback: { ...physic, rand: 0.5 },
				final: { ...fa },
			};

			magic.critP = data.magic?.critP ?? 0.1 + f.random() * 0.05;
			magic.attack = data.magic?.attack || 30 + f.random() * 10;
			magic.defend = data.magic?.defend || 30 - f.random() * 10;

			attr.magic = {
				base: { ...magic, rand: 0.5 },
				kill: { ...magic, rand: 0.5 },
				next: { ...magic, rand: 0.5 },
				spread: { ...magic, rand: 0.5 },
				fback: { ...magic, rand: 0.5 },
				final: { ...fa },
			};

			heal.critP = 0;
			heal.attack = data.heal?.attack || 30 + f.random() * 10;
			heal.defend = 0;

			attr.heal = heal;
			attr.poison = poison;

			attr.speed = 100 + Math.floor(f.random() * 20);
			const u = new FightUnitMonster(data.id, attr, { name: data.name });
			this.units.push(u);
			u.setPos(data.pos);
		}
	}

	//实际上必须交给上层完成
	deathPenalty(penalty: number) {
		for (const unit of this.units) {
			// unit.deathPenalty(dp);
		}
	}

	onWin(reward: number, recover: number) {}
}
