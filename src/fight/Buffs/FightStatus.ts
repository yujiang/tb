//自己行动
const statusForbidActions: Record<string, string[]> = {
	封印: ['attack', 'skill'],
	休息: ['action'], // 跳过主动行动（含防御），不在提交阶段禁止普攻/技能输入。
	沉默: ['skill'],
	缠绕: ['move'], // 禁止移动，只能使用nomove:1的原地技能，不跳过整个行动。
	眩晕: ['attack', 'skill', 'item', 'escapse', 'dodge', 'fback'],
};

let actionForbidByStatus: Record<string, string[]>;

// 受作用限制：attack为普通物理攻击，skill为其他技能；复活使用独立relife入口。
const statusForbidBeActions: Record<string, string[]> = {
	石化: ['attack', 'skill'],
	死亡: ['attack', 'skill'],
	禁疗: ['heal'],
	禁毒: ['poison'],
	禁复活: ['relife'],
};

let beActionForbidByStatus: Record<string, string[]>;

function initActionForbidByStatus() {
	actionForbidByStatus = {};
	for (const [status, actions] of Object.entries(statusForbidActions)) {
		for (const action of actions) {
			if (!actionForbidByStatus[action]) {
				actionForbidByStatus[action] = [];
			}
			actionForbidByStatus[action].push(status);
		}
	}
}

export function findForbidStatusByAction(action: string): string[] {
	if (!actionForbidByStatus) {
		initActionForbidByStatus();
	}
	return actionForbidByStatus[action];
}

function initBeActionForbidByStatus() {
	beActionForbidByStatus = {};
	for (const [status, actions] of Object.entries(statusForbidBeActions)) {
		for (const action of actions) {
			if (!beActionForbidByStatus[action]) {
				beActionForbidByStatus[action] = [];
			}
			beActionForbidByStatus[action].push(status);
		}
	}
}

export function findForbidStatusByBeaction(action: string): string[] {
	if (!beActionForbidByStatus) {
		initBeActionForbidByStatus();
	}
	return beActionForbidByStatus[action];
}
