import type { BattleCommand, BattleSetup, DefinitionCatalog } from './types';
import type { RoundTurnState } from '../turn/RoundTurnPolicy';
import type { BattleFault, BattleOutcome, BattleStatus, InputRequest, SkillState, UnitState } from './types';

export const ENGINE_VERSION = 'tb-0.1.0';

export interface BattleMetadata {
  engineVersion: string;
  rulesId: string;
  rulesVersion: string;
  randomAlgorithm: string;
  contentChecksum: string;
  definitions: DefinitionCatalog;
  setup: BattleSetup;
  seed: number;
  limits: { maxEffectsPerAction: number; maxEffectDepth: number };
}

export type RecordedOperation = { type: 'start' }
  | { type: 'submit'; command: BattleCommand }
  | { type: 'advance'; maxSteps: number };

export interface BattleStateData {
  status: BattleStatus;
  units: UnitState[];
  skills: SkillState[];
  turn: RoundTurnState;
  requests: InputRequest[];
  commands: BattleCommand[];
  accepted: BattleCommand[];
  outcome: BattleOutcome | null;
  fault: BattleFault | null;
  randomState: number;
  idCounter: number;
  eventSeq: number;
  operations: RecordedOperation[];
}

export interface BattleSnapshot {
  format: 'tb-snapshot-v1';
  metadata: BattleMetadata;
  data: BattleStateData;
  checksum: string;
}

export interface BattleRecording {
  format: 'tb-recording-v1';
  metadata: BattleMetadata;
  operations: RecordedOperation[];
  /** Canonical final snapshot data, used for exact replay verification. */
  expectedState: string;
}
