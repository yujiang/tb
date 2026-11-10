import type { BattleRules, DeepReadonly, UnitState } from '../../src';

function stat(unit: DeepReadonly<UnitState>, key: string): number {
  const value = unit.attributes[key];
  if (value === undefined) throw new Error(`Missing ${key} on ${unit.id}`);
  return value;
}

export function createSimpleRules(): BattleRules {
  return {
    id: 'simple-atk-def-hp', version: '1',
    targetRules: {
      one_living_enemy: (view, actor, _skill, targets, params) => {
        if (Object.keys(params).length !== 0) return 'Normal attack takes no params';
        if (targets.length !== 1) return 'Choose exactly one enemy';
        const target = view.units.find(unit => unit.id === targets[0]);
        if (!target || target.life !== 'active' || target.teamId === actor.teamId) return 'Target is not a living enemy';
        return null;
      },
    },
    effects: {
      damage: context => {
        if (context.effect.params.formula !== 'attack_minus_defense') throw new Error('Unknown damage formula');
        if (context.effect.sourceId === null) throw new Error('Attack needs a source');
        const source = context.unit(context.effect.sourceId);
        for (const targetId of context.effect.targetIds) {
          const target = context.unit(targetId);
          const amount = Math.max(1, stat(source, 'attack') - stat(target, 'defense'));
          if (!Number.isSafeInteger(amount)) throw new Error('Damage overflow');
          context.damage(targetId, 'hp', amount);
        }
      },
    },
    isDead: unit => unit.resources.hp === 0,
    outcome: view => {
      const alive = view.teams.filter(team => view.units.some(unit => unit.teamId === team && unit.life === 'active'));
      if (alive.length === 2) return null;
      if (alive.length === 0) return { winners: [], losers: [], draw: true, reason: 'both_eliminated' };
      return { winners: [...alive], losers: view.teams.filter(team => !alive.includes(team)), draw: false, reason: 'elimination' };
    },
    validateSetup: (view, definitions) => {
      for (const unit of view.units) {
        for (const key of ['attack', 'defense', 'maxHp']) {
          const value = stat(unit, key);
          if (!Number.isSafeInteger(value) || value < (key === 'maxHp' ? 1 : 0)) throw new Error(`Invalid ${key}`);
        }
        const hp = unit.resources.hp;
        if (hp === undefined || hp < 0 || hp > stat(unit, 'maxHp')) throw new Error('Invalid hp');
      }
      for (const skill of definitions.skills) {
        for (const effect of skill.effects) {
          if (effect.type !== 'damage' || effect.params.formula !== 'attack_minus_defense') throw new Error('Invalid simple effect');
        }
      }
    },
  };
}
