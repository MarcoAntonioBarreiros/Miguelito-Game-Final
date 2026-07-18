import assert from 'node:assert/strict';
import test from 'node:test';

import { getPhaseManifest } from '../src/procgen/campaign-manifest.js';
import {
  createOpportunisticFungus,
  fungalResponse,
  OPPORTUNISTIC_FUNGUS_DEFAULTS,
  PSEUDOMONAS_IRON_CONTROL_DEFAULTS,
} from '../src/procgen/opportunistic-fungus.js';
import { createPseudomonasSiderophores } from '../src/procgen/pseudomonas-siderophores.js';
import {
  applyPhaseFiveTutorialEncounters,
  applyPhaseFiveTutorialGeometry,
} from '../src/procgen/phase-five-tutorial.js';

function fungalHarness(seed = 'fungus-seed') {
  const state = {
    time: 0,
    gameState: 'play',
    cameraX: 0,
    campaign: { phase: 5, seed },
    player: {
      x: 100, y: 250, w: 32, h: 48, vitality: 5,
      moveMultiplier: 1, accelerationMultiplier: 1, jumpMultiplier: 1,
      fungalContamination: 0,
    },
    level: { platforms: [], particles: [] },
  };
  const ecology = { agents: [{
    id: 'focus:0', type: 'oportunista', x: 116, y: 274,
    homeX: 116, homeY: 274, ironLimitation: 0,
  }] };
  const entities = { damagePlayer() {}, burst() {} };
  const system = createOpportunisticFungus({ state, entities, ecology });
  return { state, ecology, system };
}

function run(harness, seconds, dt = 1 / 30) {
  for (let elapsed = 0; elapsed < seconds; elapsed += dt) {
    harness.state.time += dt;
    harness.system.prepare(dt);
    harness.system.update(dt);
  }
}

test('hifas alcançam Miguelito, aderem e tornam a contaminação funcional', () => {
  const harness = fungalHarness();
  run(harness, 3.5);
  assert.ok(harness.system.contactIntensity > 0);
  assert.ok(harness.state.player.fungalContamination > .12);
  harness.state.player.moveMultiplier = 1;
  harness.state.player.jumpMultiplier = 1;
  harness.system.prepare();
  assert.ok(harness.state.player.moveMultiplier < 1);
  assert.ok(harness.state.player.accelerationMultiplier < 1);
  assert.ok(harness.state.player.jumpMultiplier < 1);
});

test('afastamento reduz contaminação e forte limitação acelera desprendimento', () => {
  const harness = fungalHarness();
  run(harness, 3);
  const contaminated = harness.state.player.fungalContamination;
  harness.state.player.x = 1200;
  harness.ecology.agents[0].ironLimitation = 1;
  run(harness, 2);
  assert.ok(harness.state.player.fungalContamination < contaminated);
});

test('controle por ferro reduz crescimento, esporulação e aderência sem eliminar o fungo', () => {
  const normal = fungalResponse(0, OPPORTUNISTIC_FUNGUS_DEFAULTS, PSEUDOMONAS_IRON_CONTROL_DEFAULTS);
  const limited = fungalResponse(1, OPPORTUNISTIC_FUNGUS_DEFAULTS, PSEUDOMONAS_IRON_CONTROL_DEFAULTS);
  assert.equal(normal.vigor, 1);
  assert.ok(limited.growth < normal.growth);
  assert.ok(limited.sporulation < normal.sporulation);
  assert.ok(limited.adhesion < normal.adhesion);

  const harness = fungalHarness();
  harness.ecology.agents[0].ironLimitation = 1;
  run(harness, 1);
  assert.equal(harness.ecology.agents.length, 1);
  assert.equal(harness.system.controlledFungalVigor, PSEUDOMONAS_IRON_CONTROL_DEFAULTS.minimumFungalVigor);
});

test('halo sem ferro capturado não produz supressão máxima', () => {
  const state = {
    time: 0,
    gameState: 'play',
    campaign: { phase: 5, seed: 'empty-halo' },
    player: { soil: 0, hope: 0 },
    level: {
      platforms: [], particles: [], siderophores: [],
      ironDeposits: [{ id: 'empty', x: 120, y: 200, stock: 0, maxStock: 5, radius: 10 }],
    },
  };
  const agent = { id: 'fungus', type: 'oportunista', x: 120, y: 200, vx: 0, vy: 0 };
  const colony = { id: 'pseudo', type: 'pseudomonas', x: 120, y: 200, radius: 90, vigor: 1, growth: 1 };
  const system = createPseudomonasSiderophores({
    state,
    entities: { burst() {} },
    ecology: { agents: [agent] },
    inoculants: { colonies: [colony] },
  });
  system.update(.2);
  assert.equal(agent.ironLimitation || 0, 0);
  assert.equal(system.ironRecovered, 0);
});

test('Fase 5 ensina fungo, Pseudomonas e somente depois a interação', () => {
  const manifest = getPhaseManifest(5);
  const ids = manifest.presentations.map(item => item.id);
  assert.deepEqual(ids, [
    'presentation-opportunistic-fungus',
    'presentation-pseudomonas',
    'presentation-iron-competition',
  ]);
  assert.ok(manifest.presentations[0].debutChunk < manifest.presentations[1].debutChunk);
  assert.ok(manifest.presentations[1].debutChunk < manifest.presentations[2].debutChunk);
  assert.deepEqual(manifest.presentations[2].prerequisitePresentationIds, [
    'presentation-opportunistic-fungus',
    'presentation-pseudomonas',
  ]);
  assert.deepEqual(manifest.finalTest.requires.map(condition => condition.key), [
    'pseudomonasIronReserve',
    'opportunisticFungusVigor',
    'reachedFinalRoot',
  ]);
  assert.equal(manifest.totalChunks, 20);
});

test('rede hifal e resultados são determinísticos pela seed', () => {
  const first = fungalHarness('same-seed');
  const second = fungalHarness('same-seed');
  run(first, 2);
  run(second, 2);
  const snapshot = harness => [...harness.system.networks.values()].map(network => ({
    segments: network.segments.slice(-12),
    spores: network.spores,
    contamination: harness.state.player.fungalContamination,
  }));
  assert.deepEqual(snapshot(first), snapshot(second));
});

test('tutorial curto cria encontro, controle e corredor final determinísticos', () => {
  const base = {
    platforms: Array.from({ length: 20 }, (_, chunk) => ({
      x: 100 + chunk * 275,
      y: 470,
      w: 180,
      h: 64,
      type: 'root',
      logicIndex: chunk,
    })),
    exudates: [],
    ironDeposits: [],
  };
  const build = () => {
    const level = structuredClone(base);
    applyPhaseFiveTutorialGeometry(level, 5);
    const encounters = applyPhaseFiveTutorialEncounters(level, [
      { id: 'oportunista', source: 'debut', logicIndex: 2, x: 600, y: 350 },
      { id: 'pseudomonas', source: 'debut', logicIndex: 8, x: 2200, y: 350 },
      { id: 'oportunista', source: 'procedural', logicIndex: 12, x: 3300, y: 350 },
    ], 5, 'fixed-seed');
    return { level, encounters };
  };
  const first = build();
  const second = build();
  assert.deepEqual(first, second);
  assert.deepEqual(first.encounters.map(item => [item.source, item.logicIndex]), [
    ['debut', 2], ['debut', 8], ['interaction', 13], ['challenge', 16],
  ]);
  assert.equal(first.level.ironDeposits.length, 2);
  assert.ok(first.level.platforms.filter(platform => platform.fungalChallenge).length === 3);
  const route = first.level.platforms.slice(15, 20);
  assert.ok(route.every((platform, index) => index === 0 || platform.x > route[index - 1].x + route[index - 1].w));
});
