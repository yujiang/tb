import type { SkillData } from './SkillDatas';
import { TargetSelectEnum } from '../struct';

const childFields = ['next', 'combo', 'kill', 'spread'] as const;

// 只诊断填表建议，不修改配置、不参与运行时结算。
export function warnSkillConfigs(datas: SkillData[], skills: ReadonlyMap<number, SkillData>) {
	const incoming = new Set(datas.map((data) => data.id));
	const checking = new Set(incoming);
	const children = new Set<number>();
	const spreads = new Set<number>();
	const supportRoots = new Set<number>();
	const affectedSupportRoots = new Set<number>();
	const ultimates = new Set<number>();

	for (const data of skills.values()) {
		for (const field of childFields) {
			if (data[field] != null) children.add(data[field]);
		}
		if (data.fbackSkill) children.add(data.fbackSkill);
		if (data.spread != null) {
			spreads.add(data.spread);
			if (incoming.has(data.id)) checking.add(data.spread);
		}
		if (data.supportSkill) {
			supportRoots.add(data.supportSkill);
			if (incoming.has(data.id)) affectedSupportRoots.add(data.supportSkill);
		}
		if (data.ultimateSkill) {
			ultimates.add(data.ultimateSkill);
			if (incoming.has(data.id)) checking.add(data.ultimateSkill);
		}
	}

	function descendants(roots: Iterable<number>) {
		const visited = new Set<number>();
		const pending = [...roots];
		while (pending.length) {
			const id = pending.pop();
			if (visited.has(id)) continue;
			visited.add(id);
			const data = skills.get(id);
			if (!data) continue;
			for (const field of childFields) {
				if (data[field] != null) pending.push(data[field]);
			}
		}
		return visited;
	}

	const supports = descendants(supportRoots);
	for (const id of incoming) if (supports.has(id)) affectedSupportRoots.add(id);
	for (const id of descendants(affectedSupportRoots)) checking.add(id);

	for (const id of checking) {
		const data = skills.get(id);
		if (!data) continue; // 允许宿主分批注册，尚未加载的引用留到后续批次检查。
		const prefix = `技能填表提醒：[${data.name}]（#${id}）`;
		const messages: string[] = [];
		const recommend = (
			role: string,
			fields: ('nosupport' | 'noprotect' | 'nofback' | 'nodback')[],
		) => {
			const missing = fields.filter((field) => data[field] !== true);
			if (missing.length)
				messages.push(
					`${role}建议填写 ${missing.map((field) => `${field}: true`).join('、')}`,
				);
		};
		if ((data.sel?.num ?? 1) > 1) {
			if (
				data.sel.target !== TargetSelectEnum.friend &&
				data.sel.target !== TargetSelectEnum.enemy &&
				data.sel.target !== TargetSelectEnum.any
			) {
				messages.push(
					`群攻技能 sel.num > 1 时，sel.target 只能为 friend、enemy 或 any，当前为 ${TargetSelectEnum[data.sel.target] ?? data.sel.target}`,
				);
			}
			recommend('群攻技能', ['nosupport', 'noprotect']);
		}
		if (spreads.has(id)) recommend('溅射子技能', ['nosupport', 'noprotect']);
		if (supports.has(id)) recommend('协战及其后续技能', ['nofback', 'nodback']);
		if (supportRoots.has(id) && (data.func ?? 'normal') !== 'normal') {
			messages.push('协战技能应使用攻击类 func: normal');
		}
		if (ultimates.has(id)) recommend('大招技能', ['noprotect']);
		if (
			['heal', 'poison', 'relife', 'nohurt', 'observe', 'entrust', 'mimic'].includes(
				data.func,
			) &&
			(data.rand ?? 1) !== 1
		) {
			messages.push('非攻击技能一般建议填写 rand: 1，避免施放时未发动');
		}
		if (
			!children.has(id) &&
			!supports.has(id) &&
			(data.func ?? 'normal') === 'normal' &&
			(data.rand ?? 1) !== 1
		) {
			messages.push('主攻击技能建议填写 rand: 1，避免行动时未发动');
		}
		if (data.next != null && data.combo != null) {
			messages.push('同时填写了 next 和 combo，当前实际优先使用 next，请确认配置意图');
		}
		if (messages.length) console.warn(`${prefix}：${messages.join('；')}。`);
	}
}
