import type {
  AdvanceResult, BattleCommand, BattleEvent, BattleFault, BattleOptions, BattleOutcome,
  BattleRules, BattleStatus, BattleView, DeepReadonly, EffectContext, EffectSpec, InputRequest,
  JsonValue, OperationResult, SkillDefinition, SkillState, SubmitResult, UnitState,
} from './types';
import type { BattleMetadata, BattleRecording, BattleSnapshot, BattleStateData, RecordedOperation } from './record';
import { ENGINE_VERSION } from './record';
import { assertJson, canonical, checksum, clone, frozen, identifier, integer, own } from '../runtime/json';
import { Random } from '../runtime/Random';
import { RoundTurnPolicy } from '../turn/RoundTurnPolicy';
import { SlotSpace } from '../space/SlotSpace';

interface QueuedEffect { spec: EffectSpec; id: string; parentId: string | null; depth: number }

export class Battle {
  private readonly rules: BattleRules;
  private readonly metadata: BattleMetadata;
  private readonly random: Random;
  private readonly turn = new RoundTurnPolicy();
  private readonly skillDefinitions = new Map<string, SkillDefinition>();
  private units: UnitState[] = [];
  private skills: SkillState[] = [];
  private status: BattleStatus = 'created';
  private outcome: BattleOutcome | null = null;
  private fault: BattleFault | null = null;
  private requests: InputRequest[] = [];
  private commands = new Map<string, BattleCommand>();
  private accepted = new Map<string, BattleCommand>();
  private operations: RecordedOperation[] = [];
  private idCounter = 0;
  private eventSeq = 0;
  private staging: BattleEvent[] = [];
  private busy = false;
  private context: { opportunityId: string | null; actionId: string | null; effectId: string | null; parentEffectId: string | null }
    = { opportunityId: null, actionId: null, effectId: null, parentEffectId: null };

  constructor(options: BattleOptions) {
    assertJson(options.definitions);
    assertJson(options.setup);
    identifier(options.rules.id, 'rules.id');
    identifier(options.rules.version, 'rules.version');
    this.rules = Object.freeze({ ...options.rules,
      targetRules: Object.freeze({ ...options.rules.targetRules }),
      effects: Object.freeze({ ...options.rules.effects }),
    });
    const limits = {
      maxEffectsPerAction: options.limits?.maxEffectsPerAction ?? 1000,
      maxEffectDepth: options.limits?.maxEffectDepth ?? 32,
    };
    integer(limits.maxEffectsPerAction, 'maxEffectsPerAction', 1);
    integer(limits.maxEffectDepth, 'maxEffectDepth', 0);
    this.random = new Random(options.seed);
    this.metadata = clone({
      engineVersion: ENGINE_VERSION, rulesId: this.rules.id, rulesVersion: this.rules.version,
      randomAlgorithm: Random.algorithm,
      contentChecksum: checksum(options.definitions),
      definitions: options.definitions, setup: options.setup, seed: options.seed, limits,
    });
    this.initialize();
    this.validateRuleSetup();
  }

  private initialize(): void {
    const { definitions, setup } = this.metadata;
    if (setup.teams.length !== 2) throw new Error('P0 requires exactly two teams');
    setup.teams.forEach(team => identifier(team, 'team'));
    if (new Set(setup.teams).size !== 2) throw new Error('Duplicate team');
    integer(setup.maxRounds, 'maxRounds', 1);
    const unitDefs = new Map<string, typeof definitions.units[number]>();
    for (const definition of definitions.skills) {
      identifier(definition.id, 'skill definition ID');
      if (definition.id === 'wait' || this.skillDefinitions.has(definition.id)) throw new Error('Duplicate/reserved skill definition ID');
      if (typeof own(this.rules.targetRules, definition.targetRule) !== 'function') throw new Error(`Unknown target rule: ${definition.targetRule}`);
      for (const effect of definition.effects) {
        if (typeof own(this.rules.effects, effect.type) !== 'function') throw new Error(`Unknown effect: ${effect.type}`);
        this.validateEffectData(effect);
      }
      this.skillDefinitions.set(definition.id, clone(definition));
    }
    for (const definition of definitions.units) {
      identifier(definition.id, 'unit definition ID');
      if (unitDefs.has(definition.id)) throw new Error('Duplicate unit definition ID');
      this.validateNumbers(definition.attributes);
      this.validateNumbers(definition.resources);
      if (!Array.isArray(definition.tags) || definition.tags.some(tag => typeof tag !== 'string')) throw new Error('Invalid tags');
      if (new Set(definition.skills).size !== definition.skills.length) throw new Error('Duplicate skill reference');
      for (const id of definition.skills) if (!this.skillDefinitions.has(id)) throw new Error(`Unknown skill: ${id}`);
      unitDefs.set(definition.id, definition);
    }
    const ids = new Set<string>();
    for (const [index, entry] of setup.units.entries()) {
      identifier(entry.id, 'unit ID');
      // Generated IDs use @tb/; reserve that namespace across entity kinds.
      if (entry.id === 'wait' || entry.id.startsWith('@tb/') || ids.has(entry.id)) throw new Error('Duplicate/reserved unit ID');
      ids.add(entry.id);
      const definition = unitDefs.get(entry.definitionId);
      if (!definition) throw new Error(`Unknown unit definition: ${entry.definitionId}`);
      if (!setup.teams.includes(entry.teamId)) throw new Error(`Unknown team: ${entry.teamId}`);
      identifier(entry.controllerId, 'controller ID');
      if (entry.position.side !== entry.teamId) throw new Error('Slot side must match team');
      const skillIds = definition.skills.map(definitionId => {
        const id = this.id('skill');
        this.skills.push({ id, definitionId, ownerId: entry.id });
        return id;
      });
      const unit: UnitState = {
        id: entry.id, definitionId: entry.definitionId, creationSeq: index + 1,
        tags: clone(definition.tags), teamId: entry.teamId, controllerId: entry.controllerId,
        position: clone(entry.position), life: 'active',
        attributes: { ...definition.attributes, ...entry.attributes },
        resources: { ...definition.resources, ...entry.resources },
        skillIds, custom: clone(entry.custom ?? {}),
      };
      this.validateNumbers(unit.attributes);
      this.validateNumbers(unit.resources);
      this.units.push(unit);
    }
    SlotSpace.validate(this.units.map(unit => unit.position));
  }

  private validateNumbers(values: Record<string, number>): void {
    if (values === null || typeof values !== 'object' || Array.isArray(values)) throw new Error('Expected numeric dictionary');
    for (const [key, value] of Object.entries(values)) { identifier(key, 'numeric key'); integer(value, key); }
  }

  private validateRuleSetup(): void {
    const result: unknown = this.rules.validateSetup?.(this.getView(), frozen(this.metadata.definitions));
    if (result !== undefined) throw new Error('Setup validators must be synchronous and return undefined');
  }

  private validateEffectData(effect: { type: string; tags: readonly string[]; params: unknown }): void {
    identifier(effect.type, 'effect type');
    if (!Array.isArray(effect.tags) || effect.tags.some(tag => typeof tag !== 'string')) throw new Error('Invalid effect tags');
    this.validateParams(effect.params);
  }

  private validateParams(params: unknown): void {
    assertJson(params);
    if (params === null || typeof params !== 'object' || Array.isArray(params)) throw new Error('params must be an object');
  }

  private id(kind: string): string {
    integer(this.idCounter + 1, 'ID counter', 1);
    return `@tb/${kind}/${++this.idCounter}`;
  }

  /** Trusted-host view. Every call returns an isolated, deeply frozen projection. */
  getView(): DeepReadonly<BattleView> {
    return frozen({ status: this.status, round: this.turn.round, teams: this.metadata.setup.teams,
      units: this.units, skills: this.skills, outcome: this.outcome, fault: this.fault });
  }

  getPendingInputs(): DeepReadonly<InputRequest[]> {
    return frozen(this.requests.filter(request => !this.commands.has(request.requestId)));
  }

  start(): OperationResult {
    this.enter();
    try {
      if (this.status !== 'created') throw new Error('Battle has already started');
      this.operations.push({ type: 'start' });
      const events = this.boundary(() => {
        this.status = 'running';
        this.emit('BattleStarted', { teams: this.metadata.setup.teams });
        this.checkDeaths();
        this.checkOutcome();
      });
      return this.result(events);
    } finally { this.busy = false; }
  }

  submit(command: BattleCommand): SubmitResult {
    this.enter();
    try {
      try { this.validateCommandShape(command); }
      catch (error) { return this.reject('INVALID_COMMAND', this.message(error)); }
      const previous = this.accepted.get(command.commandId);
      if (previous) return canonical(previous) === canonical(command)
        ? { ok: true, duplicate: true } : this.reject('COMMAND_ID_CONFLICT', 'Command ID was used with different content');
      if (this.status !== 'waitingInput') return this.reject('NOT_WAITING', 'Battle is not waiting for input');
      const request = this.requests.find(item => item.requestId === command.requestId);
      if (!request) return this.reject('STALE_REQUEST', 'Input request is not open');
      if (this.commands.has(request.requestId)) return this.reject('ALREADY_SUBMITTED', 'Request already has a command');
      if (command.actorId !== request.actorId) return this.reject('WRONG_ACTOR', 'Actor does not own this request');
      if (!request.options.some(option => option.actionId === command.actionId)) return this.reject('UNKNOWN_ACTION', 'Action is not offered by this request');
      let error: string | null;
      try { error = this.validateIntent(command); }
      catch (cause) {
        this.fail(cause, 'RULE_ERROR');
        return this.reject('RULE_ERROR', this.fault!.message);
      }
      if (error !== null) return this.reject('INVALID_INTENT', error);
      const saved = clone(command);
      this.commands.set(saved.requestId, saved);
      this.accepted.set(saved.commandId, saved);
      this.operations.push({ type: 'submit', command: clone(saved) });
      return { ok: true, duplicate: false };
    } finally { this.busy = false; }
  }

  private validateCommandShape(command: BattleCommand): void {
    assertJson(command);
    identifier(command.commandId, 'commandId'); identifier(command.requestId, 'requestId');
    identifier(command.actorId, 'actorId'); identifier(command.actionId, 'actionId');
    if (!Array.isArray(command.targetIds) || command.targetIds.some(id => typeof id !== 'string' || !id)) throw new Error('Invalid targetIds');
    if (new Set(command.targetIds).size !== command.targetIds.length) throw new Error('Duplicate targets');
    this.validateParams(command.params);
  }

  private reject(code: string, message: string): SubmitResult { return { ok: false, code, message }; }

  private validateIntent(command: BattleCommand): string | null {
    const actor = this.unit(command.actorId);
    if (actor.life !== 'active') return 'Actor is not active';
    if (command.actionId === 'wait') {
      return command.targetIds.length === 0 && Object.keys(command.params).length === 0 ? null : 'Wait takes no targets or params';
    }
    const skill = this.skills.find(item => item.id === command.actionId && item.ownerId === actor.id);
    if (!skill) return 'Skill is not owned by actor';
    const definition = this.skillDefinitions.get(skill.definitionId)!;
    const handler = own(this.rules.targetRules, definition.targetRule)!;
    const result = handler(this.getView(), frozen(actor), frozen(definition), frozen(command.targetIds), frozen(command.params));
    if (result !== null && typeof result !== 'string') throw new Error('Target rule must return string or null');
    return result;
  }

  advance(options: { maxSteps?: number } = {}): AdvanceResult {
    this.enter();
    try {
      const maxSteps = options.maxSteps ?? 100;
      integer(maxSteps, 'maxSteps', 1);
      if (this.status === 'created') throw new Error('Call start() before advance()');
      // Terminal polling is deliberately absent from the replay stream.
      if (this.status === 'finished' || this.status === 'faulted') return this.advanceResult([], 0, this.status);
      this.operations.push({ type: 'advance', maxSteps });
      const events: BattleEvent[] = [];
      let steps = 0;
      while (steps < maxSteps) {
        if (this.status === 'waitingInput') {
          if (this.requests.some(request => !this.commands.has(request.requestId))) {
            return this.advanceResult(events, steps, 'waitingInput');
          }
          this.status = 'running';
          this.turn.collected();
        }
        events.push(...this.boundary(() => this.step()));
        steps++;
        const status = this.status as BattleStatus;
        if (status === 'finished' || status === 'faulted') return this.advanceResult(events, steps, status);
        if (status === 'waitingInput') return this.advanceResult(events, steps, 'waitingInput');
      }
      return this.advanceResult(events, steps, 'budget');
    } finally { this.busy = false; }
  }

  private step(): void {
    switch (this.turn.phase) {
      case 'roundStart': {
        const roster = this.units.filter(unit => unit.life === 'active').map(unit => unit.id);
        this.turn.beginRound(roster);
        this.emit('RoundStarted', { round: this.turn.round });
        this.requests = [];
        this.commands.clear();
        const batchId = this.id('batch');
        for (const actorId of roster) {
          const actor = this.unit(actorId);
          const request: InputRequest = {
            requestId: this.id('request'), batchId, opportunityId: this.id('opportunity'),
            actorId, controllerId: actor.controllerId,
            options: [...actor.skillIds.map(actionId => ({ actionId,
              skillDefinitionId: this.skills.find(skill => skill.id === actionId)!.definitionId })),
            { actionId: 'wait', skillDefinitionId: null }],
          };
          this.requests.push(request);
          this.emit('InputRequested', clone(request) as unknown as JsonValue);
        }
        if (this.requests.length === 0) {
          this.checkOutcome();
          if (this.status !== 'finished') throw new Error('NO_PROGRESS: no active participants and no outcome');
        } else this.status = 'waitingInput';
        return;
      }
      case 'collect': throw new Error('Collect phase requires completed inputs');
      case 'actions': {
        const actorId = this.turn.nextActor();
        if (actorId !== null) this.executeOpportunity(actorId);
        return;
      }
      case 'roundEnd': {
        this.emit('RoundEnded', { round: this.turn.round });
        this.checkOutcome();
        if (this.status !== 'finished' && this.turn.round >= this.metadata.setup.maxRounds) {
          this.finish({ winners: [], losers: [], draw: true, reason: 'max_rounds' });
        }
        if (this.status !== 'finished') this.turn.endRound();
        return;
      }
    }
  }

  private executeOpportunity(actorId: string): void {
    const request = this.requests.find(item => item.actorId === actorId)!;
    const command = this.commands.get(request.requestId)!;
    const actor = this.unit(actorId);
    this.context.opportunityId = request.opportunityId;
    this.emit('OpportunityStarted', { actorId });
    let canAct = actor.life === 'active';
    if (canAct && this.rules.canAct) {
      const allowed = this.rules.canAct(frozen(actor), this.getView());
      if (typeof allowed !== 'boolean') throw new Error('canAct must return boolean');
      canAct = allowed;
    }
    if (!canAct) {
      this.emit('OpportunitySkipped', { actorId, reason: actor.life !== 'active' ? 'inactive' : 'cannot_act' });
    } else {
      const error = this.validateIntent(command);
      if (error !== null) this.emit('ActionFailed', { actorId, commandId: command.commandId, reason: error });
      else {
        this.context.actionId = this.id('action');
        this.emit('ActionStarted', { actorId, commandId: command.commandId, actionId: command.actionId, targetIds: command.targetIds });
        if (command.actionId !== 'wait') {
          const skill = this.skills.find(item => item.id === command.actionId)!;
          const definition = this.skillDefinitions.get(skill.definitionId)!;
          this.runEffects(definition.effects.map(effect => ({ ...clone(effect), sourceId: actorId,
            targetIds: [...command.targetIds], allowDeadSource: false })), command);
        }
        this.emit('ActionEnded', { actorId, commandId: command.commandId });
      }
    }
    this.emit('OpportunityEnded', { actorId });
    this.context = { opportunityId: null, actionId: null, effectId: null, parentEffectId: null };
    this.checkOutcome();
  }

  private runEffects(specs: EffectSpec[], command: BattleCommand): void {
    const queue: QueuedEffect[] = specs.map(spec => ({ spec, id: this.id('effect'), parentId: null, depth: 0 }));
    let count = 0;
    while (queue.length > 0) {
      const current = queue.shift()!;
      this.context.effectId = current.id;
      this.context.parentEffectId = current.parentId;
      if (++count > this.metadata.limits.maxEffectsPerAction || current.depth > this.metadata.limits.maxEffectDepth) {
        throw new Error(`EFFECT_LIMIT: count=${count}, depth=${current.depth}, parent=${current.parentId}`);
      }
      const { spec } = current;
      if (spec.sourceId !== null && !spec.allowDeadSource && this.unit(spec.sourceId).life !== 'active') {
        this.emit('EffectSkipped', { reason: 'inactive_source', type: spec.type });
        continue;
      }
      const handler = own(this.rules.effects, spec.type);
      if (!handler) throw new Error(`Unknown effect: ${spec.type}`);
      this.emit('EffectStarted', { type: spec.type, sourceId: spec.sourceId, targetIds: spec.targetIds, tags: spec.tags });
      const children: QueuedEffect[] = [];
      let open = true;
      const guard = (): void => { if (!open) throw new Error('Effect context has expired'); };
      const context: EffectContext = {
        view: this.getView(), effect: frozen(spec), command: frozen(command),
        unit: id => { guard(); return frozen(this.unit(id)); },
        randomInt: (min, max) => { guard(); return this.random.int(min, max); },
        setResource: (id, key, value) => { guard(); this.setNumber(id, 'resources', key, value); },
        setAttribute: (id, key, value) => { guard(); this.setNumber(id, 'attributes', key, value); },
        damage: (id, resource, amount) => { guard(); this.damage(spec.sourceId, id, resource, amount); },
        emit: (type, payload) => {
          guard(); identifier(type, 'custom event type');
          if (!type.startsWith('custom:')) throw new Error('Rule events must use the custom: namespace');
          this.emit(type, payload);
        },
        enqueue: effect => {
          guard(); assertJson(effect); this.validateEffectData(effect);
          if (typeof effect.allowDeadSource !== 'boolean') throw new Error('allowDeadSource must be boolean');
          if (effect.sourceId !== null) this.unit(effect.sourceId);
          if (!Array.isArray(effect.targetIds) || new Set(effect.targetIds).size !== effect.targetIds.length) throw new Error('Invalid effect targets');
          effect.targetIds.forEach(id => this.unit(id));
          if (typeof own(this.rules.effects, effect.type) !== 'function') throw new Error(`Unknown effect: ${effect.type}`);
          // Bound queued work as well as executed work.
          if (count + queue.length + children.length >= this.metadata.limits.maxEffectsPerAction) throw new Error('EFFECT_LIMIT: queued work');
          children.push({ spec: clone(effect), id: this.id('effect'), parentId: current.id, depth: current.depth + 1 });
        },
      };
      try {
        const returned: unknown = handler(context);
        if (returned !== undefined) throw new Error('Effect handlers must be synchronous and return undefined');
      } finally { open = false; }
      this.checkDeaths();
      this.emit('EffectEnded', { type: spec.type });
      queue.unshift(...children);
    }
    this.context.effectId = null;
    this.context.parentEffectId = null;
  }

  private setNumber(id: string, field: 'attributes' | 'resources', key: string, value: number): void {
    identifier(key, 'numeric key'); integer(value, key);
    const unit = this.unit(id);
    const before = own(unit[field], key);
    if (before === undefined) throw new Error(`Unknown ${field} key: ${key}`);
    unit[field][key] = value;
    this.emit(field === 'resources' ? 'ResourceChanged' : 'AttributeChanged', { unitId: id, key, before, after: value });
  }

  private damage(sourceId: string | null, unitId: string, resource: string, amount: number): void {
    integer(amount, 'damage', 0);
    const target = this.unit(unitId);
    if (target.life !== 'active') { this.emit('DamageSkipped', { unitId, reason: 'inactive_target' }); return; }
    const before = own(target.resources, resource);
    if (before === undefined || before < 0) throw new Error('Damage requires an existing nonnegative resource');
    const actual = Math.min(before, amount);
    this.setNumber(unitId, 'resources', resource, before - actual);
    this.emit('DamageApplied', { sourceId, targetId: unitId, resource, requested: amount,
      absorbed: 0, reduced: 0, actual, overkill: amount - actual, before, after: before - actual });
  }

  private checkDeaths(): void {
    for (const unit of this.units) {
      if (unit.life !== 'active') continue;
      const dead = this.rules.isDead(frozen(unit));
      if (typeof dead !== 'boolean') throw new Error('isDead must return boolean');
      if (dead) { unit.life = 'dead'; this.emit('UnitDied', { unitId: unit.id }); }
    }
  }

  private checkOutcome(): void {
    const outcome = this.rules.outcome(this.getView());
    if (outcome !== null) this.finish(outcome);
  }

  private finish(outcome: BattleOutcome): void {
    assertJson(outcome);
    if (!Array.isArray(outcome.winners) || !Array.isArray(outcome.losers)
      || typeof outcome.draw !== 'boolean' || typeof outcome.reason !== 'string'
      || [...outcome.winners, ...outcome.losers].some(team => !this.metadata.setup.teams.includes(team))
      || new Set([...outcome.winners, ...outcome.losers]).size !== outcome.winners.length + outcome.losers.length
      || (outcome.draw && outcome.winners.length > 0)) throw new Error('Invalid outcome');
    this.outcome = clone(outcome);
    this.status = 'finished';
    this.requests = [];
    this.commands.clear();
    this.emit('BattleFinished', clone(outcome) as unknown as JsonValue);
  }

  private unit(id: string): UnitState {
    const result = this.units.find(item => item.id === id);
    if (!result) throw new Error(`Unknown unit: ${id}`);
    return result;
  }

  private emit(type: string, payload: JsonValue): void {
    assertJson(payload);
    integer(this.eventSeq + 1, 'event sequence', 1);
    this.staging.push(clone({ seq: ++this.eventSeq, type, round: this.turn.round, ...this.context, payload }));
  }

  private boundary(work: () => void): BattleEvent[] {
    this.staging = [];
    const seq = this.eventSeq;
    try { work(); return this.staging; }
    catch (error) {
      this.eventSeq = seq;
      this.fail(error, 'EXECUTION_ERROR');
      return [];
    } finally { this.staging = []; }
  }

  private fail(error: unknown, code: string): void {
    this.fault = { code, message: this.message(error), round: this.turn.round,
      actionId: this.context.actionId, effectId: this.context.effectId };
    this.status = 'faulted';
    this.requests = [];
    this.commands.clear();
  }

  private message(error: unknown): string { return error instanceof Error ? error.message : String(error); }
  private enter(): void {
    if (this.busy) throw new Error('Battle operations cannot be reentered');
    this.busy = true;
  }
  private result(events: BattleEvent[]): OperationResult { return { status: this.status, events: clone(events), fault: clone(this.fault) }; }
  private advanceResult(events: BattleEvent[], steps: number, reason: AdvanceResult['reason']): AdvanceResult {
    return { ...this.result(events), steps, reason };
  }

  snapshot(): BattleSnapshot {
    if (this.busy || this.status === 'faulted') throw new Error('Snapshot requires a successful safe boundary');
    const data = this.stateData();
    return clone({ format: 'tb-snapshot-v1', metadata: this.metadata, data, checksum: checksum(data) });
  }

  private stateData(): BattleStateData {
    return clone({ status: this.status, units: this.units, skills: this.skills, turn: this.turn.snapshot(),
      requests: this.requests, commands: [...this.commands.values()], accepted: [...this.accepted.values()],
      outcome: this.outcome, fault: this.fault, randomState: this.random.snapshot(), idCounter: this.idCounter,
      eventSeq: this.eventSeq, operations: this.operations });
  }

  exportRecording(): BattleRecording {
    if (this.busy || this.status === 'faulted') throw new Error('Recording requires a successful safe boundary');
    return clone({ format: 'tb-recording-v1', metadata: this.metadata,
      operations: this.operations, expectedState: canonical(this.stateData()) });
  }

  static restore(snapshot: BattleSnapshot, rules: BattleRules): Battle {
    assertJson(snapshot);
    if (snapshot.format !== 'tb-snapshot-v1') throw new Error('Unsupported snapshot format');
    const battle = Battle.fromMetadata(snapshot.metadata, rules);
    if (checksum(snapshot.data) !== snapshot.checksum) throw new Error('Snapshot checksum mismatch');
    battle.loadState(snapshot.data);
    return battle;
  }

  static replay(recording: BattleRecording, rules: BattleRules): { battle: Battle; events: BattleEvent[] } {
    assertJson(recording);
    if (recording.format !== 'tb-recording-v1') throw new Error('Unsupported recording format');
    const battle = Battle.fromMetadata(recording.metadata, rules);
    const events: BattleEvent[] = [];
    for (const operation of recording.operations) {
      if (operation.type === 'start') events.push(...battle.start().events);
      else if (operation.type === 'advance') events.push(...battle.advance({ maxSteps: operation.maxSteps }).events);
      else if (operation.type === 'submit') {
        const result = battle.submit(operation.command);
        if (!result.ok || result.duplicate) throw new Error('Replay input diverged');
      } else throw new Error('Unknown recorded operation');
      if (battle.status === 'faulted') throw new Error(`Replay faulted: ${battle.fault!.message}`);
    }
    if (canonical(battle.stateData()) !== recording.expectedState) throw new Error('Replay final state diverged');
    return { battle, events };
  }

  private static fromMetadata(metadata: BattleMetadata, rules: BattleRules): Battle {
    const battle = new Battle({ rules, definitions: metadata.definitions, setup: metadata.setup,
      seed: metadata.seed, limits: metadata.limits });
    // Compare full canonical metadata, not merely a short hash.
    if (canonical(metadata) !== canonical(battle.metadata)) throw new Error('Engine, rules or content metadata mismatch');
    return battle;
  }

  private loadState(data: BattleStateData): void {
    if (!['created', 'running', 'waitingInput', 'finished'].includes(data.status) || data.fault !== null) throw new Error('Invalid snapshot status');
    integer(data.idCounter, 'idCounter', this.idCounter);
    integer(data.eventSeq, 'eventSeq', 0);
    if (data.units.length !== this.units.length || canonical(data.skills) !== canonical(this.skills)) throw new Error('Snapshot entity mismatch');
    for (const [index, unit] of data.units.entries()) {
      const initial = this.units[index]!;
      for (const key of ['id', 'definitionId', 'creationSeq', 'tags', 'teamId', 'controllerId', 'position', 'skillIds'] as const) {
        if (canonical(unit[key]) !== canonical(initial[key])) throw new Error(`Snapshot unit mismatch: ${key}`);
      }
      if (!['active', 'dead', 'removed'].includes(unit.life)) throw new Error('Invalid unit life');
      this.validateNumbers(unit.attributes); this.validateNumbers(unit.resources);
    }
    this.turn.restore(data.turn);
    for (const id of data.turn.roster) this.unit(id);
    const accepted = new Map<string, BattleCommand>();
    for (const command of data.accepted) {
      this.validateCommandShape(command);
      if (accepted.has(command.commandId)) throw new Error('Duplicate accepted command');
      accepted.set(command.commandId, clone(command));
    }
    const requests = new Map<string, InputRequest>();
    for (const request of data.requests) {
      if (requests.has(request.requestId)) throw new Error('Duplicate request');
      const unit = this.unit(request.actorId);
      if (unit.controllerId !== request.controllerId) throw new Error('Invalid request owner');
      requests.set(request.requestId, request);
    }
    const commands = new Map<string, BattleCommand>();
    for (const command of data.commands) {
      if (!requests.has(command.requestId) || commands.has(command.requestId)
        || canonical(accepted.get(command.commandId) ?? null) !== canonical(command)) throw new Error('Invalid saved command');
      commands.set(command.requestId, clone(command));
    }
    if (data.status !== 'finished' && (data.status === 'waitingInput') !== (data.turn.phase === 'collect')) throw new Error('Inconsistent waiting phase');
    if ((data.status === 'finished') !== (data.outcome !== null)) throw new Error('Inconsistent outcome');
    if (data.status === 'finished' && (data.requests.length || data.commands.length)) throw new Error('Finished battle has inputs');
    this.random.restore(data.randomState);
    this.units = clone(data.units);
    this.status = data.status; this.outcome = clone(data.outcome);
    this.requests = clone(data.requests); this.commands = commands; this.accepted = accepted;
    this.idCounter = data.idCounter; this.eventSeq = data.eventSeq; this.operations = clone(data.operations);
    this.validateRuleSetup();
  }
}

export function createBattle(options: BattleOptions): Battle { return new Battle(options); }
