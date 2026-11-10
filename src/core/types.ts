export interface JsonObject { [key: string]: JsonValue }
export interface JsonArray extends Array<JsonValue> {}
export type JsonValue = null | boolean | number | string | JsonArray | JsonObject;
export type BattleStatus = 'created' | 'running' | 'waitingInput' | 'finished' | 'faulted';
export type DeepReadonly<T> = T extends (...args: never[]) => unknown ? T
  : T extends object ? { readonly [K in keyof T]: DeepReadonly<T[K]> } : T;

export interface UnitDefinition {
  id: string;
  tags: string[];
  attributes: Record<string, number>;
  resources: Record<string, number>;
  skills: string[];
}

export interface EffectDefinition {
  type: string;
  params: Record<string, JsonValue>;
  tags: string[];
}

export interface SkillDefinition {
  id: string;
  targetRule: string;
  effects: EffectDefinition[];
}

export interface DefinitionCatalog {
  units: UnitDefinition[];
  skills: SkillDefinition[];
}

export interface UnitSetup {
  id: string;
  definitionId: string;
  teamId: string;
  controllerId: string;
  position: { side: string; slot: number };
  attributes?: Record<string, number>;
  resources?: Record<string, number>;
  custom?: Record<string, JsonValue>;
}

export interface BattleSetup {
  units: UnitSetup[];
  teams: [string, string];
  maxRounds: number;
}

export interface UnitState {
  id: string;
  definitionId: string;
  creationSeq: number;
  tags: string[];
  teamId: string;
  controllerId: string;
  position: { side: string; slot: number };
  life: 'active' | 'dead' | 'removed';
  attributes: Record<string, number>;
  resources: Record<string, number>;
  skillIds: string[];
  custom: Record<string, JsonValue>;
}

export interface SkillState {
  id: string;
  definitionId: string;
  ownerId: string;
}

export interface InputRequest {
  requestId: string;
  batchId: string;
  opportunityId: string;
  actorId: string;
  controllerId: string;
  options: { actionId: string; skillDefinitionId: string | null }[];
}

export interface BattleCommand {
  commandId: string;
  requestId: string;
  actorId: string;
  /** Skill instance ID, or the built-in action "wait". */
  actionId: string;
  targetIds: string[];
  params: Record<string, JsonValue>;
}

export interface BattleOutcome {
  winners: string[];
  losers: string[];
  draw: boolean;
  reason: string;
}

export interface BattleFault {
  code: string;
  message: string;
  round: number;
  actionId: string | null;
  effectId: string | null;
}

export interface BattleView {
  status: BattleStatus;
  round: number;
  teams: [string, string];
  units: UnitState[];
  skills: SkillState[];
  outcome: BattleOutcome | null;
  fault: BattleFault | null;
}

export interface BattleEvent {
  seq: number;
  type: string;
  round: number;
  opportunityId: string | null;
  actionId: string | null;
  effectId: string | null;
  parentEffectId: string | null;
  payload: JsonValue;
}

export interface OperationResult {
  status: BattleStatus;
  events: BattleEvent[];
  fault: BattleFault | null;
}

export type SubmitResult = { ok: true; duplicate: boolean }
  | { ok: false; code: string; message: string };

export interface AdvanceResult extends OperationResult {
  reason: 'waitingInput' | 'finished' | 'budget' | 'faulted';
  steps: number;
}

export interface EffectSpec extends EffectDefinition {
  sourceId: string | null;
  targetIds: string[];
  allowDeadSource: boolean;
}

export interface EffectContext {
  readonly view: DeepReadonly<BattleView>;
  readonly effect: DeepReadonly<EffectSpec>;
  readonly command: DeepReadonly<BattleCommand>;
  unit(id: string): DeepReadonly<UnitState>;
  randomInt(min: number, maxExclusive: number): number;
  setResource(unitId: string, key: string, value: number): void;
  setAttribute(unitId: string, key: string, value: number): void;
  /** Helper for a nonnegative resource; death is decided by BattleRules.isDead. */
  damage(unitId: string, resource: string, amount: number): void;
  emit(type: string, payload: JsonValue): void;
  enqueue(effect: EffectSpec): void;
}

export interface BattleRules {
  id: string;
  version: string;
  targetRules: Readonly<Record<string, (
    view: DeepReadonly<BattleView>, actor: DeepReadonly<UnitState>,
    skill: DeepReadonly<SkillDefinition>, targets: readonly string[],
    params: DeepReadonly<Record<string, JsonValue>>,
  ) => string | null>>;
  effects: Readonly<Record<string, (context: EffectContext) => void>>;
  isDead(unit: DeepReadonly<UnitState>): boolean;
  outcome(view: DeepReadonly<BattleView>): BattleOutcome | null;
  canAct?(unit: DeepReadonly<UnitState>, view: DeepReadonly<BattleView>): boolean;
  validateSetup?(view: DeepReadonly<BattleView>, definitions: DeepReadonly<DefinitionCatalog>): void;
}

export interface BattleOptions {
  rules: BattleRules;
  definitions: DefinitionCatalog;
  setup: BattleSetup;
  seed: number;
  limits?: { maxEffectsPerAction?: number; maxEffectDepth?: number };
}
