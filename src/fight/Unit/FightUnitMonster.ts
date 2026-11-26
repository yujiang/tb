import { Fight, FightContex } from '../Fight';
import { FightCmdEnum, FightInput, SkillCost, SpeedSkill } from '../struct';
import { FightUnit } from './FightUnit';
import { FightAI } from '../AI/FightAI';
import { FightRule, createRule } from '../Rules/FightRule';
import { FightAttr } from '../FightAttr';
import { strict as assert } from 'node:assert';
import type { AIData } from '../AI/AIDatas';
import type { RuleData } from '../Rules/RuleDatas';
import { createAI } from '../AI/AIFactory';

export class FightUnitMonster extends FightUnit {
	monsterId?: number;
	extraAction: SpeedSkill[] = [];
	override getExtraActions(): readonly SpeedSkill[] {
		return this.extraAction;
	}
	setExtraActions(actions: readonly SpeedSkill[]) {
		assert.ok(actions.length <= 64, 'extraAction must contain at most 64 entries');
		this.extraAction = actions.map(([rate, skill]) => {
			assert.ok(
				Number.isFinite(rate) && rate >= 0,
				'extraAction speed rate must be finite and nonnegative',
			);
			assert.ok(
				Number.isSafeInteger(skill) && skill >= 0,
				'extraAction skill must be a nonnegative safe integer',
			);
			assert.ok(
				skill === 0 || (this.findSkill(skill) && skill !== this.ultimateSkill),
				'extraAction skill must be learned and must not use the ultimate slot',
			);
			return [rate, skill];
		});
	}
	private decisionAI: FightAI | undefined;
	private ruleEntries: { rule: FightRule; prior: number; order: number }[] = [];
	private nextRuleOrder = 0;
	get ai(): FightAI | undefined {
		return this.decisionAI;
	}
	set ai(value: FightAI | undefined) {
		assert.ok(value === undefined || value instanceof FightAI, 'ai must be a FightAI');
		if (this.decisionAI === value) return;

		value?.bind(this); // 先确认新实例可绑定，失败时保留原 AI。
		this.decisionAI?.unbind(this);
		this.decisionAI = value;
		this.attrDirty = true;
	}
	setAI(value?: FightAI | AIData) {
		this.ai =
			value instanceof FightAI ? value : value === undefined ? undefined : createAI(value);
	}
	get rules(): readonly FightRule[] {
		return this.ruleEntries.map((entry) => entry.rule);
	}
	// 可直接使用表里的规则配置；传入已有实例时保留其计数、阶段和监听。
	setRules(values: readonly (FightRule | RuleData)[], ctx?: FightContex) {
		const entries = values.map((value, index) => {
			assert.ok(!(value instanceof FightAI), 'Assign decision AI through ai, not setRules');
			return {
				rule: value instanceof FightRule ? value : createRule(value),
				prior: value instanceof FightRule ? 0 : (value.prior ?? 0),
				order: this.nextRuleOrder + index,
			};
		});
		for (const entry of entries) {
			assert.ok(Number.isFinite(entry.prior), 'Rule prior must be finite');
		}
		const next = new Set(entries.map((entry) => entry.rule));
		assert.equal(next.size, entries.length, 'Rules must not contain duplicate instances');
		const bound: FightRule[] = [];
		try {
			for (const entry of entries) if (entry.rule.bind(this)) bound.push(entry.rule);
		} catch (error) {
			for (const rule of bound.reverse()) rule.unbind(this);
			throw error;
		}
		for (const entry of this.ruleEntries)
			if (!next.has(entry.rule)) entry.rule.remove(this, ctx);
		this.ruleEntries = entries.sort((a, b) => a.prior - b.prior || a.order - b.order);
		this.nextRuleOrder += entries.length;
		for (const rule of bound) rule.startFight(this, ctx);
		this.attrDirty = true;
	}
	clearRules(ctx?: FightContex) {
		this.setRules([], ctx);
	}
	addRule(rule: FightRule, prior = 0, ctx?: FightContex): boolean {
		assert.ok(
			rule instanceof FightRule,
			'rule must be a FightRule; assign AI through ai, not addRule',
		);
		assert.ok(Number.isFinite(prior), 'Rule prior must be finite');
		if (this.ruleEntries.some((entry) => entry.rule === rule)) {
			return false;
		}

		rule.bind(this);
		this.ruleEntries.push({ rule, prior, order: this.nextRuleOrder++ });
		this.ruleEntries.sort((a, b) => a.prior - b.prior || a.order - b.order);
		rule.startFight(this, ctx);
		this.attrDirty = true;
		return true;
	}
	removeRule(rule: FightRule, ctx?: FightContex): boolean {
		const index = this.ruleEntries.findIndex((entry) => entry.rule === rule);
		if (index < 0) return false;

		this.ruleEntries.splice(index, 1);
		rule.remove(this, ctx);
		this.attrDirty = true;
		return true;
	}
	override startFight(fight: Fight) {
		super.startFight(fight);
		this.ai?.bind(this);
		this.ai?.startFight(this);
		for (const entry of [...this.ruleEntries]) {
			entry.rule.bind(this);
			entry.rule.startFight(this);
		}
		if (this.ai || this.ruleEntries.length) {
			this.attrDirty = true;
		}
	}
	override endFight() {
		this.ai?.unbind(this);
		for (const entry of this.ruleEntries) entry.rule.unbind(this);
	}
	protected override modifyAttr(attr: FightAttr) {
		this.ai?.modifyAttr(this, attr);
		for (const entry of [...(this.ruleEntries ?? [])]) {
			if (this.ruleEntries.includes(entry)) entry.rule.modifyAttr(this, attr);
		}
	}
	override processBeforeTurn(turn: number, ctx: FightContex) {
		super.processBeforeTurn(turn, ctx);
		for (const entry of [...this.ruleEntries]) {
			if (this.ruleEntries.includes(entry)) entry.rule.beforeTurn(this, turn, ctx);
		}
	}
	override isMonster() {
		return true;
	}
	inputSkill = 0;
	override inputStart(turn: number, ctx: FightContex, deferDecision = false) {
		super.inputStart(turn, ctx);
		if (!deferDecision) this.input = this.getActionInput(turn, ctx);
	}
	override getActionInput(turn: number, ctx: FightContex, automatic = false): FightInput {
		if (automatic && !this.ai) {
			return { cmd: FightCmdEnum.attack };
		}

		if (this.ai || this.ruleEntries.length) {
			const input = this.ai?.waitInput(this, turn, ctx);
			return { ...(input ?? { cmd: FightCmdEnum.attack }) };
		}

		// 无 AI、无规则时保留原固定技能和技能首项的处理。
		if (this.inputSkill) {
			return { cmd: FightCmdEnum.skill, skill: this.inputSkill };
		}

		if (this.skills.size > 0) {
			return { cmd: FightCmdEnum.skill, skill: this.skills.keys().next().value };
		}

		return { cmd: FightCmdEnum.none };
	}
	// monster不消耗
	costSkill(cost: SkillCost) {
		return true;
	}
}
