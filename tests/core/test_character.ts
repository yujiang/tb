import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { FightMud, FightMudTables, fightMsg } from '../../src';

function initial(): fightMsg[] {
	const unit = (uid: number, character: number, name: string, weaponName: string) => ({
		uid,
		pos: uid,
		dead: false,
		display: { name, character, weaponName },
		point: { hp: 100, hpMax: 100, mp: 100, mpMax: 100 },
		buffs: [] as number[][],
	});
	return [
		['start', 10019990],
		['side', 0, [unit(0, 0, '剑客', '青钢剑')]],
		['side', 1, [unit(1, 9, '野狼', '利爪')]],
	];
}

// 行动准备优先按character取文案并轮换，空白字段继续用通用句子，与初次出场文本分别触发。
test('character: ready prose uses its own field and falls back when blank', () => {
	const tables = {
		xlsCharacter: {
			0: {
				id: 0,
				出场文本: '$N初次入场。',
				准备文本: ['$N握紧$w，静候破绽。', '$N目光一凝，蓄势待发。'],
			},
			9: { id: 9, 准备文本: '   ' },
		},
	};
	const mud = new FightMud(() => {}, false, tables);
	mud.onMsg([...initial(), ['actor', 0, 100], ['actor', 0, 100], ['actor', 1, 90]]);
	assert.match(mud.toString(), /剑客（#0）握紧青钢剑，静候破绽/);
	assert.match(mud.toString(), /剑客（#0）目光一凝，蓄势待发/);
	assert.equal((mud.toString().match(/初次入场/g) ?? []).length, 1);
	assert.match(mud.toString(), /野狼（#1）凝神应战，准备出手/);
	assert.doesNotMatch(mud.toString(), /剑客（#0）凝神应战，准备出手/);
});

// character直接按编号提供出场与受伤、死亡文本，0号有效；受伤事件的$N是受伤者而非攻击者。
test('character: direct character prose introduces units and narrates the affected unit', () => {
	const tables = {
		xlsCharacter: {
			0: { id: 0, 出场文本: '$N手弹$w，低吟一声：来吧！' },
			9: {
				id: 9,
				受伤文本: '$N受了伤，呜呜低吼，受到{伤害}点伤害。',
				死亡文本: '$N不甘地倒了下去。',
			},
		},
	} satisfies FightMudTables;
	const mud = new FightMud(() => {}, false, tables);
	mud.onMsg([...initial(), ['hurt', 'skill', 1, 0, 20, 80, []], ['die', 1]]);
	assert.match(mud.toString(), /剑客（#0）手弹青钢剑，低吟一声：来吧/);
	assert.match(mud.toString(), /野狼（#1）受了伤，呜呜低吼，受到20点伤害/);
	assert.match(mud.toString(), /野狼（#1）不甘地倒了下去/);
});

// 闪避和格挡取防守者的character，Buff取承受者；空白或缺失的专属字段仍走通用文字。
test('character: miss block and buff messages use the defender character and fall back per field', () => {
	const tables = {
		xlsCharacter: {
			9: {
				id: 9,
				未命中文本: '$N腰身一缩，避开$n，{未命中}。',
				格挡文本: '$N架住了$n的攻势。',
				添加Buff文本: '$N被施加{Buff}。',
				死亡文本: '   ',
			},
		},
	} satisfies FightMudTables;
	const mud = new FightMud(() => {}, false, tables);
	mud.onMsg([
		...initial(),
		['miss', 0, 0, 1],
		['block', 1, 0],
		['addBuff', 'skill', 1, 0, 10019991, 1, [0, 1]],
		['die', 1],
	]);
	assert.match(mud.toString(), /野狼（#1）腰身一缩，避开剑客（#0）/);
	assert.match(mud.toString(), /野狼（#1）架住了剑客（#0）的攻势/);
	assert.match(mud.toString(), /野狼（#1）被施加Buff #10019991/);
	assert.match(mud.toString(), /野狼（#1）.*倒地不起/);
});

// 召唤入场也显示新宠专属出场文本，纯展示消息不改变初始协议及输入数据。
test('character: summoned units use the same entry description', () => {
	const tables = {
		xlsCharacter: { 9: { id: 9, 出场文本: '$N抖抖皮毛，伏低身子。' } },
	} satisfies FightMudTables;
	const messages = initial();
	const pet = { ...messages[2][2][0], uid: 3 };
	const before = structuredClone(pet);
	const mud = new FightMud(() => {}, false, tables);
	mud.onMsg([...messages.slice(0, 2), ['summon', 0, 0, pet]]);
	assert.match(mud.toString(), /野狼（#3）抖抖皮毛，伏低身子/);
	assert.deepEqual(pet, before);
});
