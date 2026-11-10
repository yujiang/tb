import type { BattleCommand, BattleView, DeepReadonly, InputRequest } from '../../src';

/** Uses only a read-only view and the normal command API. No hidden random state. */
export function chooseSimpleCommand(view: DeepReadonly<BattleView>, request: DeepReadonly<InputRequest>): BattleCommand {
  const actor = view.units.find(unit => unit.id === request.actorId);
  if (!actor) throw new Error('AI actor is missing');
  const target = view.units.find(unit => unit.life === 'active' && unit.teamId !== actor.teamId);
  const attack = request.options.find(option => option.skillDefinitionId === 'normal_attack');
  return {
    commandId: `ai:${request.requestId}`, requestId: request.requestId, actorId: request.actorId,
    actionId: target && attack ? attack.actionId : 'wait',
    targetIds: target && attack ? [target.id] : [], params: {},
  };
}
