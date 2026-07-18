import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getPersistentUnlocksBeforePhase,
  getPhaseManifest,
} from '../src/procgen/campaign-manifest.js';
import {
  campaignPhaseSeed,
  createCampaign,
  decorateCampaignLevel,
  prepareCampaignGeneration,
} from '../src/procgen/campaign-progression.js';
import { generateCampaignEncounters } from '../src/procgen/campaign-encounters.js';
import { generateLevel } from '../src/procgen/generator.js';
import {
  createOpportunisticFungus,
  fungalResponse,
  MAX_HYPHAL_SEGMENTS_PER_FOCUS,
  OPPORTUNISTIC_FUNGUS_DEFAULTS,
  PSEUDOMONAS_IRON_CONTROL_DEFAULTS,
} from '../src/procgen/opportunistic-fungus.js';
import { createPseudomonasSiderophores } from '../src/procgen/pseudomonas-siderophores.js';
import { generateAzospirillumRootLadders } from '../src/procgen/azospirillum-root-growth.js';
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

function rootedFungalHarness(seed = 'rooted-fungus') {
  const root = { x: 180, y: 430, w: 360, h: 80, type: 'root', logicIndex: 2 };
  const state = {
    time: 0,
    gameState: 'play',
    cameraX: 0,
    campaign: { phase: 5, seed },
    player: {
      x: 1050, y: 360, w: 32, h: 48, vitality: 5,
      moveMultiplier: 1, accelerationMultiplier: 1, jumpMultiplier: 1,
      fungalContamination: 0,
    },
    level: { platforms: [root], particles: [] },
  };
  const ecology = {
    encounters: [{ id: 'oportunista', x: 350, y: 330 }],
    agents: Array.from({ length: 4 }, (_, index) => ({
      id: `focus:${index}`,
      type: 'oportunista',
      zoneIndex: 0,
      x: 260 + index * 70,
      y: 220 + index * 20,
      homeX: 350,
      homeY: 330,
      ironLimitation: 0,
    })),
  };
  const entities = { damagePlayer() {}, burst() {} };
  const system = createOpportunisticFungus({ state, entities, ecology });
  return { state, ecology, root, system };
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

test('um foco produz uma única rede ancorada na raiz e não persegue Miguelito', () => {
  const harness = rootedFungalHarness();
  run(harness, 5);
  assert.equal(harness.system.networks.size, 1);
  const [network] = harness.system.networks.values();
  assert.equal(network.activated, false);
  assert.equal(network.segments.length, 0);
  assert.equal(network.hostRoot, harness.root);
  assert.equal(network.anchor.y, harness.root.y - 5);

  harness.state.player.x = network.anchor.x - harness.state.player.w / 2;
  harness.state.player.y = network.anchor.y - harness.state.player.h / 2;
  run(harness, 5);
  assert.equal(network.activated, true);
  assert.deepEqual(network.segments[0].start, { x: network.anchor.x, y: network.anchor.y });
  assert.ok(network.lesions.every(lesion => lesion.root === harness.root || lesion.root === null));
  assert.ok(harness.ecology.agents.every(agent => (
    agent.rootedFungus
    && agent.x === network.anchor.x
    && agent.y === network.anchor.y
  )));

  const previousAnchor = { x: network.anchor.x, y: network.anchor.y };
  harness.state.player.x = 2400;
  harness.state.player.y = 90;
  run(harness, 3);
  assert.deepEqual(network.anchor, { ...previousAnchor, root: harness.root });
  assert.ok(network.segments.every(segment => segment.start.x < 700 && segment.end.x < 700));
});

test('fragmentos aderem somente quando Miguelito toca uma hifa', () => {
  const harness = rootedFungalHarness('contact-on-touch');
  const focusX = harness.ecology.encounters[0].x;
  harness.state.player.x = focusX + 260;
  harness.state.player.y = 300;
  run(harness, 5);
  assert.equal(harness.state.player.fungalContamination, 0);
  const [network] = harness.system.networks.values();
  const segment = network.segments[Math.floor(network.segments.length / 2)];
  harness.state.player.x = (segment.start.x + segment.end.x) / 2 - harness.state.player.w / 2;
  harness.state.player.y = (segment.start.y + segment.end.y) / 2 - harness.state.player.h / 2;
  run(harness, .6);
  assert.ok(harness.state.player.fungalContamination > 0);
  assert.ok(harness.state.player.fungalAttachmentLevel > 0);

  const attached = harness.state.player.fungalAttachmentLevel;
  harness.state.player.x = 1200;
  run(harness, 1.5);
  assert.ok(harness.state.player.fungalAttachmentLevel > 0);
  assert.ok(harness.state.player.fungalAttachmentLevel >= attached * .8);
});

test('a rede preserva a ligação basal e respeita o orçamento de segmentos', () => {
  const harness = rootedFungalHarness('segment-budget');
  harness.state.player.x = 520;
  harness.state.player.y = 350;
  run(harness, 35);
  const [network] = harness.system.networks.values();
  assert.ok(network.segments.length <= MAX_HYPHAL_SEGMENTS_PER_FOCUS);
  assert.deepEqual(network.segments[0].start, { x: network.anchor.x, y: network.anchor.y });
  assert.ok(network.spores.length <= 12);
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
    const ladders = generateAzospirillumRootLadders({
      level,
      phase: 5,
      seedValue: 'fixed-seed',
      encounters,
      config: getPhaseManifest(5).azospirillumRootLadder,
    });
    return { level, encounters, ladders };
  };
  const first = build();
  const second = build();
  assert.deepEqual(first, second);
  assert.deepEqual(first.encounters.map(item => [item.source, item.logicIndex]), [
    ['debut', 2],
    ['debut', 8],
    ['interaction-support', 13],
    ['interaction', 13],
    ['challenge', 16],
  ]);
  assert.equal(first.level.ironDeposits.length, 3);
  assert.deepEqual(first.level.ironDeposits.map(item => item.platform.logicIndex), [8, 13, 15]);
  assert.deepEqual(first.ladders, [], 'a Fase 5 nao cria uma escada de Azo artificial');
  assert.ok(first.level.platforms.filter(platform => platform.fungalChallenge).length === 3);
  const route = first.level.platforms.slice(15, 20);
  assert.ok(route.every((platform, index) => index === 0 || platform.x > route[index - 1].x + route[index - 1].w));
});

test('pipeline real do Phase Lab 5 mantém a rota natural e reúne ferro, Pseudomonas e fungo', () => {
  const campaign = createCampaign('phase-lab-5');
  campaign.phase = 5;
  campaign.unlocks = getPersistentUnlocksBeforePhase(5);
  const profile = prepareCampaignGeneration(campaign);
  const seedValue = campaignPhaseSeed(campaign);
  const rawLevel = generateLevel(seedValue);
  applyPhaseFiveTutorialGeometry(rawLevel, 5);
  const level = decorateCampaignLevel(rawLevel, campaign, profile);
  let encounters = generateCampaignEncounters({
    platforms: level.platforms,
    phase: 5,
    seedValue,
  });
  encounters = applyPhaseFiveTutorialEncounters(level, encounters, 5, seedValue);
  const ladders = generateAzospirillumRootLadders({
    level,
    phase: 5,
    seedValue,
    encounters,
    config: getPhaseManifest(5).azospirillumRootLadder,
  });

  assert.deepEqual(ladders, []);

  const interactionFungus = encounters.find(item => item.source === 'interaction');
  const interactionPseudomonas = encounters.find(item => item.source === 'interaction-support');
  const interactionIron = level.ironDeposits.find(item => item.platform.logicIndex === 13);
  assert.ok(interactionFungus && interactionPseudomonas && interactionIron);
  assert.ok(Math.hypot(
    interactionFungus.x - interactionPseudomonas.x,
    interactionFungus.y - interactionPseudomonas.y,
  ) < 60);
  assert.equal(interactionIron.platform.logicIndex, interactionFungus.logicIndex);
  assert.ok(Math.abs(interactionIron.x - interactionFungus.x) < 8);
  assert.ok(Math.abs(interactionIron.x - interactionPseudomonas.x) < 8);
});
