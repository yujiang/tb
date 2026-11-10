import type { BattleSetup, DefinitionCatalog } from '../../src';

export const simpleDefinitions: DefinitionCatalog = {
  units: [
    { id: 'fighter_a', tags: [], attributes: { attack: 5, defense: 1, maxHp: 10 }, resources: { hp: 10 }, skills: ['normal_attack'] },
    { id: 'fighter_b', tags: [], attributes: { attack: 4, defense: 2, maxHp: 8 }, resources: { hp: 8 }, skills: ['normal_attack'] },
  ],
  skills: [{ id: 'normal_attack', targetRule: 'one_living_enemy',
    effects: [{ type: 'damage', params: { formula: 'attack_minus_defense' }, tags: ['attack'] }] }],
};

export const exampleSetup: BattleSetup = {
  teams: ['A', 'B'], maxRounds: 100,
  units: [
    { id: 'A', definitionId: 'fighter_a', teamId: 'A', controllerId: 'player_a', position: { side: 'A', slot: 0 } },
    { id: 'B', definitionId: 'fighter_b', teamId: 'B', controllerId: 'player_b', position: { side: 'B', slot: 0 } },
  ],
};
