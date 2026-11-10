import { clone, integer } from '../runtime/json';

export interface RoundTurnState {
  phase: 'roundStart' | 'collect' | 'actions' | 'roundEnd';
  round: number;
  roster: string[];
  cursor: number;
}

/** Batch input, frozen creation order, one opportunity per round-start participant. */
export class RoundTurnPolicy {
  private state: RoundTurnState = { phase: 'roundStart', round: 0, roster: [], cursor: 0 };
  get phase(): RoundTurnState['phase'] { return this.state.phase; }
  get round(): number { return this.state.round; }

  beginRound(roster: string[]): void {
    this.state = { phase: 'collect', round: this.state.round + 1, roster: [...roster], cursor: 0 };
  }
  collected(): void { this.state.phase = 'actions'; }
  nextActor(): string | null {
    const actor = this.state.roster[this.state.cursor];
    if (actor === undefined) { this.state.phase = 'roundEnd'; return null; }
    this.state.cursor++;
    return actor;
  }
  endRound(): void { this.state.phase = 'roundStart'; }
  snapshot(): RoundTurnState { return clone(this.state); }
  restore(state: RoundTurnState): void {
    if (!['roundStart', 'collect', 'actions', 'roundEnd'].includes(state.phase)) throw new Error('Invalid turn phase');
    integer(state.round, 'round', 0);
    integer(state.cursor, 'cursor', 0);
    if (state.cursor > state.roster.length || new Set(state.roster).size !== state.roster.length) {
      throw new Error('Invalid turn roster');
    }
    this.state = clone(state);
  }
}
