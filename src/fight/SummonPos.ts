import { strict as assert } from 'node:assert';

/** 宠物按前、左、右、后找空位，四邻全满时才使用传入随机源；无空位抛错，reserved用于初始组队预留主人阵位。 */
export function selectSummonPos(pos: number, map: { nx: number; ny: number }, occupied: ReadonlySet<number>, reserved: ReadonlySet<number>, random: () => number): number {
	const x = pos % map.nx;
	const y = Math.floor(pos / map.nx);
	const free = (value: number) => !occupied.has(value) && !reserved.has(value);
	for (const [px, py] of [[x, y - 1], [x - 1, y], [x + 1, y], [x, y + 1]]) {
		if (px >= 0 && px < map.nx && py >= 0 && py < map.ny) {
			const candidate = py * map.nx + px;
			if (free(candidate)) return candidate;
		}
	}
	const available = Array.from({ length: map.nx * map.ny }, (_, index) => index).filter(free);
	assert.ok(available.length > 0, 'No free position for fightSummon');
	if (available.length === 1) return available[0];

	const value = random();
	assert.ok(Number.isFinite(value) && value >= 0 && value < 1, 'Random source must return a number in [0,1)');
	return available[Math.floor(value * available.length)];
}
