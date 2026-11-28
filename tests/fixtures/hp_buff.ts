import './default_skills';
import { initBuffs, OverlapEnum, type IdLevel } from '../../src';

// 自动测试使用固定魔法攻击加成验证阶段替换；比例参数仅用于迁移旧测试的数值，不是血轴配置字段。
export function hpBuff(amount: number): IdLevel {
	const attack = Math.round(amount * 100),
		id = 10019000 + attack;
	initBuffs([
		{
			id,
			name: `血轴攻击${attack}`,
			desc: '',
			magic: true,
			attackType: 'base',
			attack: { attack },
			final: {},
			status: [],
			tags: [],
			overlap: OverlapEnum.REPLACE,
			lastTurn: 0,
			times: 0,
			event: 'hurt',
			dieNotRemove: true,
		},
	]);
	return [id, 1];
}
