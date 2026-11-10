'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Battle, createBattle, Random } = require('../lib/src');
const { createSimpleRules } = require('../lib/examples/simple/rules');
const { simpleDefinitions, exampleSetup } = require('../lib/examples/simple/definitions');
const { chooseSimpleCommand } = require('../lib/examples/simple/ai');
const { runSimpleExample } = require('../lib/examples/simple/run');

const copy = value => JSON.parse(JSON.stringify(value));
function options() {
  return { rules: createSimpleRules(), definitions: copy(simpleDefinitions), setup: copy(exampleSetup), seed: 12345 };
}
function waiting(config = options()) {
  const battle = createBattle(config);
  const events = [...battle.start().events];
  events.push(...battle.advance().events);
  assert.equal(battle.getView().status, 'waitingInput');
  return { battle, events };
}
function submitAll(battle, { reverse = false, wait = false } = {}) {
  const requests = [...battle.getPendingInputs()];
  if (reverse) requests.reverse();
  for (const request of requests) {
    const command = chooseSimpleCommand(battle.getView(), request);
    if (wait) { command.actionId = 'wait'; command.targetIds = []; }
    assert.deepEqual(battle.submit(command), { ok: true, duplicate: false });
  }
}
function finish(battle, { budget = 100, reverse = false, wait = false } = {}) {
  const events = [];
  for (let i = 0; i < 10000; i++) {
    if (battle.getView().status === 'finished') return events;
    if (battle.getView().status === 'waitingInput') submitAll(battle, { reverse, wait });
    const result = battle.advance({ maxSteps: budget });
    assert.notEqual(result.reason, 'faulted', result.fault?.message);
    events.push(...result.events);
  }
  throw new Error('Test battle did not terminate');
}

test('example: A wins on round 3, overkill is not deducted, B never acts after dying', () => {
  const { battle, events, replayVerified } = runSimpleExample();
  const view = battle.getView();
  assert.equal(replayVerified, true);
  assert.equal(view.round, 3);
  assert.deepEqual(view.outcome, { winners: ['A'], losers: ['B'], draw: false, reason: 'elimination' });
  assert.deepEqual(view.units.map(unit => [unit.id, unit.resources.hp, unit.life]), [['A', 4, 'active'], ['B', 0, 'dead']]);
  assert.deepEqual(events.filter(e => e.type === 'DamageApplied').map(e => e.payload.actual), [3, 3, 3, 3, 2]);
  assert.equal(events.filter(e => e.type === 'UnitDied').length, 1);
  assert.equal(events.filter(e => e.type === 'ActionStarted' && e.payload.actorId === 'B').length, 2);
  assert.deepEqual(events.map(e => e.seq), events.map((_, i) => i + 1));
  assert.equal(events.at(-1).type, 'BattleFinished');
  assert.equal(battle.getPendingInputs().length, 0);
  assert.deepEqual(battle.advance().events, []);
});

test('single-step advancement and reversed batch arrivals preserve all battle events', () => {
  const fast = waiting(); const slow = waiting();
  fast.events.push(...finish(fast.battle));
  slow.events.push(...finish(slow.battle, { budget: 1, reverse: true }));
  assert.deepEqual(fast.events, slow.events);
  assert.deepEqual(fast.battle.getView(), slow.battle.getView());
});

test('repeat executions produce identical recordings and event streams', () => {
  const a = runSimpleExample(); const b = runSimpleExample();
  assert.deepEqual(a.events, b.events);
  assert.deepEqual(a.battle.exportRecording(), b.battle.exportRecording());
});

test('submission records intent and does not execute until every request is filled', () => {
  const { battle } = waiting();
  const before = battle.getView();
  const first = battle.getPendingInputs()[0];
  assert.equal(battle.submit(chooseSimpleCommand(before, first)).ok, true);
  assert.deepEqual(battle.getView(), before);
  const result = battle.advance();
  assert.equal(result.reason, 'waitingInput');
  assert.equal(result.steps, 0);
  assert.deepEqual(result.events, []);
  assert.equal(battle.getPendingInputs().length, 1);
});

test('invalid inputs leave the full state, random state and recording unchanged', () => {
  const { battle } = waiting();
  const request = battle.getPendingInputs()[0];
  const good = chooseSimpleCommand(battle.getView(), request);
  const invalid = [
    { ...good, requestId: 'old' }, { ...good, actorId: 'B' }, { ...good, actionId: 'missing' },
    { ...good, targetIds: ['A'] }, { ...good, targetIds: ['unknown'] },
    { ...good, targetIds: ['B', 'B'] }, { ...good, params: { x: NaN } },
    { ...good, params: { x: undefined } }, { ...good, params: { x: 1 } },
    { ...good, actionId: 'wait', targetIds: ['B'] },
  ];
  for (const command of invalid) {
    const before = battle.snapshot();
    assert.equal(battle.submit(command).ok, false);
    assert.deepEqual(battle.snapshot(), before);
  }
});

test('command IDs are idempotent before and after restore, conflicts are rejected', () => {
  const { battle } = waiting();
  const command = chooseSimpleCommand(battle.getView(), battle.getPendingInputs()[0]);
  assert.deepEqual(battle.submit(command), { ok: true, duplicate: false });
  const before = battle.snapshot();
  assert.deepEqual(battle.submit(copy(command)), { ok: true, duplicate: true });
  assert.deepEqual(battle.snapshot(), before);
  assert.equal(battle.submit({ ...command, targetIds: [] }).code, 'COMMAND_ID_CONFLICT');
  const restored = Battle.restore(copy(before), createSimpleRules());
  assert.deepEqual(restored.submit(command), { ok: true, duplicate: true });
  const suffix = finish(restored);
  assert.ok(suffix.length);
  assert.deepEqual(restored.submit(command), { ok: true, duplicate: true });
});

test('a second command for the same request is rejected', () => {
  const { battle } = waiting();
  const command = chooseSimpleCommand(battle.getView(), battle.getPendingInputs()[0]);
  battle.submit(command);
  assert.equal(battle.submit({ ...command, commandId: 'second' }).code, 'ALREADY_SUBMITTED');
});

test('snapshot at partial batch restores requests, accepted input, counters and event suffix', () => {
  const { battle } = waiting();
  const command = chooseSimpleCommand(battle.getView(), battle.getPendingInputs()[0]);
  battle.submit(command);
  const snapshot = JSON.parse(JSON.stringify(battle.snapshot()));
  const restored = Battle.restore(snapshot, createSimpleRules());
  assert.equal(restored.getPendingInputs().length, 1);
  assert.deepEqual(finish(restored), finish(battle));
  assert.deepEqual(restored.snapshot(), battle.snapshot());
});

test('created, between-actions and finished snapshots all restore', () => {
  const created = createBattle(options());
  const fresh = Battle.restore(created.snapshot(), createSimpleRules());
  assert.deepEqual(fresh.start(), created.start());
  const { battle } = waiting();
  submitAll(battle);
  battle.advance({ maxSteps: 1 });
  assert.equal(battle.getView().status, 'running');
  const restored = Battle.restore(battle.snapshot(), createSimpleRules());
  assert.deepEqual(finish(restored), finish(battle));
  const terminal = Battle.restore(battle.snapshot(), createSimpleRules());
  assert.deepEqual(terminal.getView(), battle.getView());
  assert.equal(terminal.advance().reason, 'finished');
});

test('recording can be JSON round-tripped and replayed after snapshot restore', () => {
  const { battle, events } = waiting();
  submitAll(battle);
  const restored = Battle.restore(battle.snapshot(), createSimpleRules());
  events.push(...finish(restored, { budget: 1 }));
  const recording = JSON.parse(JSON.stringify(restored.exportRecording()));
  const replay = Battle.replay(recording, createSimpleRules());
  assert.deepEqual(replay.events, events);
  assert.deepEqual(replay.battle.snapshot(), restored.snapshot());
});

test('snapshots and recordings reject version changes, corruption and divergent replay', () => {
  const { battle } = waiting();
  const snapshot = battle.snapshot();
  assert.throws(() => Battle.restore(snapshot, { ...createSimpleRules(), version: '2' }), /metadata mismatch/);
  const broken = copy(snapshot); broken.data.units[0].resources.hp = 0;
  assert.throws(() => Battle.restore(broken, createSimpleRules()), /checksum mismatch/);
  const changed = copy(snapshot); changed.metadata.definitions.units[0].attributes.attack++;
  assert.throws(() => Battle.restore(changed, createSimpleRules()), /metadata mismatch/);
  const recording = battle.exportRecording(); recording.expectedState = '{}';
  assert.throws(() => Battle.replay(recording, createSimpleRules()), /diverged/);
});

test('dead target at execution is not automatically replaced with a different enemy', () => {
  const config = options();
  config.setup.units[0].attributes = { attack: 100 };
  config.setup.units.splice(1, 0, { ...copy(config.setup.units[0]), id: 'A2', position: { side: 'A', slot: 1 } });
  config.setup.units.push({ ...copy(config.setup.units[2]), id: 'B2', position: { side: 'B', slot: 1 } });
  const { battle } = waiting(config);
  submitAll(battle);
  const result = battle.advance();
  const failed = result.events.find(event => event.type === 'ActionFailed' && event.payload.actorId === 'A2');
  assert.ok(failed);
  assert.equal(battle.getView().units.find(unit => unit.id === 'B2').resources.hp, 8);
  assert.ok(result.events.some(event => event.type === 'OpportunitySkipped' && event.payload.actorId === 'B'));
});

test('wait is legal and round cap ends a stagnant battle at RoundEnd', () => {
  const config = options(); config.setup.maxRounds = 2;
  const { battle } = waiting(config);
  const events = finish(battle, { wait: true });
  assert.equal(battle.getView().round, 2);
  assert.equal(battle.getView().outcome.reason, 'max_rounds');
  assert.equal(battle.getView().outcome.draw, true);
  assert.equal(events.at(-2).type, 'RoundEnded');
  assert.equal(events.filter(event => event.type === 'DamageApplied').length, 0);
});

test('elimination takes precedence over the round cap', () => {
  const config = options(); config.setup.maxRounds = 1;
  config.setup.units[0].attributes = { attack: 100 };
  const { battle } = waiting(config);
  finish(battle);
  assert.equal(battle.getView().outcome.reason, 'elimination');
});

test('empty setup and zero-life opening resolve immediately without input', () => {
  const empty = options(); empty.setup.units = [];
  const draw = createBattle(empty); const started = draw.start();
  assert.equal(started.status, 'finished');
  assert.equal(draw.getView().outcome.reason, 'both_eliminated');
  const single = options(); single.setup.units.pop();
  const win = createBattle(single); win.start();
  assert.deepEqual(win.getView().outcome.winners, ['A']);
  const dead = options(); dead.setup.units[0].resources = { hp: 0 };
  const defeat = createBattle(dead); const result = defeat.start();
  assert.equal(result.events.filter(event => event.type === 'UnitDied').length, 1);
  assert.deepEqual(defeat.getView().outcome.winners, ['B']);
});

test('definition and setup validation fail before starting', () => {
  const mutations = [
    config => { config.setup.units[0].resources = { hp: 11 }; },
    config => { config.setup.units[0].attributes = { attack: NaN }; },
    config => { config.setup.units[0].attributes = { defense: -1 }; },
    config => { config.setup.units[1].id = 'A'; },
    config => { config.setup.units.push(copy(config.setup.units[0])); config.setup.units[2].id = 'third'; },
    config => { config.setup.units[0].position.slot = -1; },
    config => { config.setup.units[0].definitionId = 'missing'; },
    config => { config.definitions.units[0].skills = ['missing']; },
    config => { config.definitions.skills[0].targetRule = 'missing'; },
    config => { config.definitions.skills[0].effects[0].type = 'missing'; },
    config => { config.setup.teams = ['A', 'A']; },
    config => { config.setup.maxRounds = 0; },
    config => { config.seed = -1; },
    config => { config.limits = { maxEffectsPerAction: 0 }; },
  ];
  for (const mutate of mutations) { const config = options(); mutate(config); assert.throws(() => createBattle(config)); }
});

test('configuration, state views, requests and snapshots cannot mutate live battle state', () => {
  const config = options(); const { battle } = waiting(config);
  config.setup.units[0].resources = { hp: 0 };
  config.definitions.units[0].attributes.attack = 1000;
  assert.throws(() => { battle.getView().units[0].resources.hp = 0; }, TypeError);
  assert.throws(() => { battle.getPendingInputs()[0].options.pop(); }, TypeError);
  const snapshot = battle.snapshot(); snapshot.data.units[0].resources.hp = 0;
  assert.equal(battle.getView().units[0].resources.hp, 10);
  finish(battle);
  assert.equal(battle.getView().units[0].resources.hp, 4);
});

test('rules may use resources unrelated to hp; core lifecycle has no hp dependency', () => {
  const config = options();
  for (const unit of config.definitions.units) unit.resources = { spirit: 3 };
  config.definitions.skills[0].effects = [{ type: 'drain', params: {}, tags: [] }];
  config.rules = { ...createSimpleRules(), id: 'spirit', validateSetup: () => {},
    isDead: unit => unit.resources.spirit === 0,
    effects: { drain: context => { for (const targetId of context.effect.targetIds) context.damage(targetId, 'spirit', 3); } },
  };
  const { battle } = waiting(config); finish(battle);
  assert.deepEqual(battle.getView().outcome.winners, ['A']);
  assert.equal(battle.getView().units[1].resources.spirit, 0);
});

test('canAct is checked on execution and consumes a skipped opportunity', () => {
  const config = options(); config.setup.maxRounds = 1;
  config.rules.canAct = unit => unit.id !== 'A';
  const { battle } = waiting(config); const events = finish(battle);
  assert.ok(events.some(event => event.type === 'OpportunitySkipped' && event.payload.reason === 'cannot_act'));
  assert.equal(battle.getView().units[1].resources.hp, 8);
});

test('effect errors fault the battle and discard only the failed boundary event batch', () => {
  const config = options();
  config.rules.effects = { damage: context => { context.damage('B', 'hp', 2); throw new Error('broken rule'); } };
  const { battle } = waiting(config); submitAll(battle);
  const result = battle.advance();
  assert.equal(result.reason, 'faulted');
  assert.match(result.fault.message, /broken rule/);
  assert.ok(result.fault.actionId); assert.ok(result.fault.effectId);
  assert.deepEqual(result.events, []);
  assert.equal(battle.getPendingInputs().length, 0);
  assert.throws(() => battle.snapshot(), /safe boundary/);
  assert.equal(battle.advance().reason, 'faulted');
});

test('invalid resource writes and unsafe damage fault instead of corrupting normal results', () => {
  for (const execute of [
    context => context.setResource('B', 'hp', NaN),
    context => context.setResource('B', 'missing', 1),
    context => context.damage('B', 'hp', -1),
    context => context.damage('B', 'hp', Number.MAX_SAFE_INTEGER + 1),
  ]) {
    const config = options(); config.rules.effects = { damage: execute };
    const { battle } = waiting(config); submitAll(battle);
    assert.equal(battle.advance().reason, 'faulted');
  }
});

test('reaction effects execute depth-first, preserving sibling order and parent IDs', () => {
  const config = options(); config.setup.maxRounds = 1;
  config.definitions.skills[0].effects = [{ type: 'tree', params: { node: 'root' }, tags: [] }];
  const visited = [];
  config.rules = { ...createSimpleRules(), validateSetup: () => {}, effects: {
    tree: context => {
      const node = context.effect.params.node;
      visited.push(node);
      context.emit('custom:node', { node });
      const children = node === 'root' ? ['a', 'b'] : node === 'a' ? ['leaf'] : [];
      for (const child of children) context.enqueue({ ...copy(context.effect), params: { node: child } });
    },
  } };
  const { battle } = waiting(config); submitAll(battle);
  const result = battle.advance({ maxSteps: 1 });
  assert.deepEqual(visited, ['root', 'a', 'leaf', 'b']);
  const effects = result.events.filter(event => event.type === 'EffectStarted');
  assert.equal(effects[1].parentEffectId, effects[0].effectId);
  assert.equal(effects[2].parentEffectId, effects[1].effectId);
  assert.equal(effects[3].parentEffectId, effects[0].effectId);
});

test('effect count and depth budgets stop infinite reaction chains', () => {
  for (const limits of [{ maxEffectsPerAction: 4 }, { maxEffectDepth: 2 }]) {
    const config = options(); config.limits = limits;
    config.rules.effects = { damage: context => { context.enqueue(copy(context.effect)); } };
    const { battle } = waiting(config); submitAll(battle);
    const result = battle.advance();
    assert.equal(result.reason, 'faulted');
    assert.match(result.fault.message, /EFFECT_LIMIT/);
    assert.deepEqual(result.events, []);
  }
});

test('winner is checked after the whole action effect chain, allowing mutual destruction', () => {
  const config = options();
  config.rules.effects = { damage: context => {
    if (context.effect.params.deathReaction === true) {
      context.damage('A', 'hp', 100);
    } else {
      context.damage('B', 'hp', 100);
      context.enqueue({ type: 'damage', sourceId: 'B', targetIds: ['A'], allowDeadSource: true,
        params: { deathReaction: true }, tags: ['death'] });
    }
  } };
  const { battle } = waiting(config); const events = finish(battle);
  assert.equal(battle.getView().outcome.reason, 'both_eliminated');
  assert.equal(events.filter(event => event.type === 'UnitDied').length, 2);
  assert.equal(events.at(-1).type, 'BattleFinished');
});

test('rule cannot retain a live effect context or reenter battle operations', () => {
  const config = options(); let retained; let current;
  config.rules.effects = { damage: context => {
    retained = context;
    assert.throws(() => current.advance(), /reentered/);
    assert.throws(() => current.snapshot(), /safe boundary/);
  } };
  const { battle } = waiting(config); current = battle; submitAll(battle);
  battle.advance({ maxSteps: 1 });
  assert.throws(() => retained.damage('B', 'hp', 1), /expired/);
  assert.throws(() => retained.randomInt(0, 10), /expired/);
});

test('throwing target validators fault explicitly instead of accepting or rejecting silently', () => {
  const config = options();
  config.rules.targetRules = { one_living_enemy: () => { throw new Error('validator failed'); } };
  const { battle } = waiting(config);
  const result = battle.submit(chooseSimpleCommand(battle.getView(), battle.getPendingInputs()[0]));
  assert.equal(result.code, 'RULE_ERROR');
  assert.equal(battle.getView().status, 'faulted');
});

test('random state survives a snapshot after an action that consumes random numbers', () => {
  const config = options();
  config.rules.effects = { damage: context => { context.damage(context.effect.targetIds[0], 'hp', context.randomInt(1, 4)); } };
  const { battle } = waiting(config); submitAll(battle); battle.advance({ maxSteps: 1 });
  const restored = Battle.restore(battle.snapshot(), config.rules);
  assert.deepEqual(finish(restored), finish(battle));
  assert.deepEqual(restored.getView(), battle.getView());
});

test('xorshift32-v1 has fixed reference vectors and validated unbiased integer ranges', () => {
  const random = new Random(1);
  assert.deepEqual(Array.from({ length: 5 }, () => random.nextUint32()), [270369, 67634689, 2647435461, 307599695, 2398689233]);
  const state = random.snapshot(); const next = random.nextUint32(); random.restore(state);
  assert.equal(random.nextUint32(), next);
  assert.notEqual(new Random(0).snapshot(), 0);
  for (let i = 0; i < 1000; i++) { const value = random.int(-3, 8); assert.ok(value >= -3 && value < 8); }
  assert.equal(random.int(5, 6), 5);
  assert.throws(() => random.int(0, 0)); assert.throws(() => random.restore(0));
  assert.throws(() => new Random(0x100000000));
});

test('operation misuse is rejected without making the instance reentrancy-locked', () => {
  const battle = createBattle(options());
  assert.throws(() => battle.advance(), /start/);
  battle.start();
  assert.throws(() => battle.start(), /already started/);
  assert.throws(() => battle.advance({ maxSteps: 0 }), /safe integer/);
  assert.equal(battle.advance().reason, 'waitingInput');
});

test('custom effects receive validated command params as isolated immutable data', () => {
  const config = options();
  config.rules.targetRules = { one_living_enemy: (_view, _actor, _skill, targets, params) =>
    targets.length === 1 && params.amount === 2 ? null : 'Invalid amount' };
  config.rules.effects = { damage: context => {
    assert.throws(() => { context.command.params.amount = 100; }, TypeError);
    context.damage(context.effect.targetIds[0], 'hp', context.command.params.amount);
  } };
  const { battle } = waiting(config);
  for (const request of battle.getPendingInputs()) {
    const command = chooseSimpleCommand(battle.getView(), request);
    command.params = { amount: 2 };
    assert.equal(battle.submit(command).ok, true);
  }
  const result = battle.advance({ maxSteps: 1 });
  assert.equal(result.reason, 'budget');
  assert.equal(battle.getView().units[1].resources.hp, 6);
});

test('non-boolean canAct results are extension faults', () => {
  const config = options(); config.rules.canAct = () => 'yes';
  const { battle } = waiting(config); submitAll(battle);
  const result = battle.advance();
  assert.equal(result.reason, 'faulted');
  assert.match(result.fault.message, /canAct must return boolean/);
});
