import { Battle, createBattle } from '../../src';
import type { BattleEvent } from '../../src';
import { chooseSimpleCommand } from './ai';
import { exampleSetup, simpleDefinitions } from './definitions';
import { createSimpleRules } from './rules';

export function runSimpleExample(): { battle: Battle; events: BattleEvent[]; replayVerified: boolean } {
  const battle = createBattle({ rules: createSimpleRules(), definitions: simpleDefinitions, setup: exampleSetup, seed: 12345 });
  const events: BattleEvent[] = [...battle.start().events];
  while (battle.getView().status !== 'finished') {
    const result = battle.advance({ maxSteps: 100 });
    events.push(...result.events);
    if (result.reason === 'faulted') throw new Error(result.fault!.message);
    if (result.reason === 'waitingInput') {
      for (const request of battle.getPendingInputs()) {
        const accepted = battle.submit(chooseSimpleCommand(battle.getView(), request));
        if (!accepted.ok) throw new Error(accepted.message);
      }
    }
  }
  const replay = Battle.replay(battle.exportRecording(), createSimpleRules());
  if (JSON.stringify(replay.events) !== JSON.stringify(events)) throw new Error('Replay event mismatch');
  return { battle, events, replayVerified: true };
}
