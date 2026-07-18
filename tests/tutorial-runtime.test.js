import assert from 'node:assert/strict';
import test from 'node:test';

import { generateLevel } from '../src/procgen/generator.js';
import { createSimulator } from '../src/procgen/simulator.js';
import { tutorialPacing } from '../src/procgen/campaign-manifest.js';
import { createTutorialFlow } from '../src/procgen/tutorial-flow.js';
import {
  isHardReloadShortcut,
  isTutorialAdvanceShortcut,
  TUTORIAL_STORAGE_KEYS,
} from '../src/procgen/tutorial-manager.js';
import {
  createTutorialTriggers,
  TUTORIAL_PROXIMITY,
  TUTORIAL_SIMULTANEOUS_FIRST_ENCOUNTERS_EVENT,
} from '../src/procgen/tutorial-triggers.js';

test('simuladores auxiliares não substituem o simulador ativo exposto', () => {
  const previousWindow = globalThis.window;
  const activeSimulator = createSimulator();
  globalThis.window = { miguelitoSim: activeSimulator };

  try {
    generateLevel('tutorial-runtime-regression');
    assert.equal(globalThis.window.miguelitoSim, activeSimulator);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

function runTriggerScenario({
  agents = [],
  encounters = [],
  enemies = [],
  juveniles = [],
  galls = [],
  discovered = [],
  seen = [],
} = {}) {
  const previousWindow = globalThis.window;
  globalThis.window = new EventTarget();
  const triggered = [];
  const simultaneousDiagnostics = [];
  const seenCards = new Set(seen);
  globalThis.window.addEventListener(TUTORIAL_SIMULTANEOUS_FIRST_ENCOUNTERS_EVENT, event => {
    simultaneousDiagnostics.push(event.detail);
  });
  const state = {
    gameState: 'play',
    campaign: { transitionRequested: false },
    player: {
      x: 0, y: 0, w: 0, h: 0, exudates: 0,
      canDoubleJump: false, canDash: false, canPulse: false,
    },
    discoveredMicrobes: new Set(discovered),
    level: {
      enemies, rhizobiumNodules: [], biofilms: [],
      mycorrhizaArbuscules: [], platforms: [], azospirillumRoots: [],
    },
  };
  const sim = {
    ecology: {
      agents,
      encounters,
    },
    beneficialInoculants: { followerCount: 0 },
    trichodermaColonies: { followerCount: 0 },
    meloidogyneLifecycle: { juveniles, eggMasses: [], galls },
    pseudomonasSiderophores: { freeCount: 0, loadedCount: 0, ironRecovered: 0 },
    trichoderma: { attackCount: 0 },
  };
  const manager = {
    isOpen: false,
    hasSeen: id => seenCards.has(id),
    trigger: id => {
      triggered.push(id);
      return true;
    },
  };

  try {
    const triggers = createTutorialTriggers({
      state,
      sim,
      manager,
      ralstoniaControl: { foci: [] },
      trichodermaRhizoctoniaControl: { activeAttackCount: 0 },
    });
    triggers.update();
    return { triggered, discovered: state.discoveredMicrobes, simultaneousDiagnostics };
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
}

function runMicrobeTriggerAt(distance) {
  return runTriggerScenario({
    agents: [{ type: 'bacillus', x: distance, y: 0 }],
    encounters: [{ id: 'bacillus', x: distance, y: 0, r: 185 }],
  });
}

test('cartão de organismo não abre somente porque ele está desenhado à distância', () => {
  const result = runMicrobeTriggerAt(TUTORIAL_PROXIMITY.microbeAgent + 1);
  assert.deepEqual(result.triggered, []);
  assert.equal(result.discovered.size, 0);
});

test('cartão de organismo abre quando Miguelito chega bem perto', () => {
  const result = runMicrobeTriggerAt(TUTORIAL_PROXIMITY.microbeAgent - 1);
  assert.deepEqual(result.triggered, ['organism-bacillus']);
  assert.equal(result.discovered.has('bacillus'), true);
});

test('indivíduo na borda não antecipa cartão de uma estreia ainda tethered', () => {
  const result = runTriggerScenario({
    agents: [{ type: 'bacillus', zoneIndex: 0, x: 72, y: 0 }],
    encounters: [{
      id: 'bacillus', source: 'debut', tetherUntilSeen: true,
      x: TUTORIAL_PROXIMITY.microbeCommunity + 1, y: 0,
    }],
  });

  assert.deepEqual(result.triggered, []);
  assert.equal(result.discovered.size, 0);
});

test('estreia tethered abre pelo centro da primeira colônia', () => {
  const result = runTriggerScenario({
    agents: [{ type: 'bacillus', zoneIndex: 0, x: 400, y: 0 }],
    encounters: [{
      id: 'bacillus', source: 'debut', tetherUntilSeen: true,
      x: TUTORIAL_PROXIMITY.microbeCommunity - 1, y: 0,
    }],
  });

  assert.deepEqual(result.triggered, ['organism-bacillus']);
  assert.equal(result.discovered.has('bacillus'), true);
});

test('organismo mais próximo tem prioridade entre tipos diferentes', () => {
  const result = runTriggerScenario({
    enemies: [{ type: 'rhizoctonia', alive: true, x: 240, y: 0, w: 0, h: 0 }],
    juveniles: [{ alive: true, x: 80, y: 0 }],
  });

  assert.deepEqual(result.triggered, ['organism-meloidogyne-j2']);
  assert.equal(result.simultaneousDiagnostics.length, 1);
  assert.deepEqual(
    result.simultaneousDiagnostics[0].candidates.map(candidate => candidate.cardId),
    ['organism-meloidogyne-j2', 'organism-rhizoctonia'],
  );
});

test('descoberta lógica distante não abre cartão sem proximidade', () => {
  const result = runTriggerScenario({ discovered: ['bacillus'] });
  assert.deepEqual(result.triggered, []);
});

test('atalhos de hard reload são reconhecidos sem confundir recarga comum', () => {
  assert.equal(isHardReloadShortcut({ code: 'F5', ctrlKey: true }), true);
  assert.equal(isHardReloadShortcut({ code: 'KeyR', ctrlKey: true, shiftKey: true }), true);
  assert.equal(isHardReloadShortcut({ code: 'KeyR', metaKey: true, shiftKey: true }), true);
  assert.equal(isHardReloadShortcut({ code: 'F5' }), false);
  assert.equal(isHardReloadShortcut({ code: 'KeyR', ctrlKey: true, shiftKey: false }), false);
  assert.match(TUTORIAL_STORAGE_KEYS.seen, /:v3$/);
  assert.match(TUTORIAL_STORAGE_KEYS.unlocked, /:v3$/);
  assert.match(TUTORIAL_STORAGE_KEYS.pages, /:v3$/);
});

test('andar e pular não avançam nem fecham o cartão', () => {
  assert.equal(isTutorialAdvanceShortcut({ code: 'ArrowLeft' }), false);
  assert.equal(isTutorialAdvanceShortcut({ code: 'ArrowRight' }), false);
  assert.equal(isTutorialAdvanceShortcut({ code: 'Space' }), false);
  assert.equal(isTutorialAdvanceShortcut({ code: 'Enter' }), true);
  assert.equal(isTutorialAdvanceShortcut({ code: 'Enter', repeat: true }), false);
});

const guided = (overrides = {}) => ({
  tutorialMode: 'guided',
  phase: 1,
  chunkIndex: 4,
  worldX: 1000,
  visibleWorldWidth: 900,
  nowSeconds: 10,
  ...overrides,
});

const firstEncounter = (overrides = {}) => guided({
  source: tutorialPacing.firstAppearanceEvent,
  ...overrides,
});

test('estreia obrigatória abre por proximidade mesmo em modo silencioso e sob trava espacial', () => {
  const flow = createTutorialFlow();
  const welcome = flow.handle('system-welcome', guided({ worldX: 900, nowSeconds: 1 }));
  assert.equal(welcome.open, true);
  flow.markSeen(welcome.cardId);

  const bacillus = flow.handle('organism-bacillus', firstEncounter({
    tutorialMode: 'silent',
    phase: 1,
    chunkIndex: 6,
    worldX: 950,
    nowSeconds: 2,
  }));
  assert.equal(bacillus.open, true);
  assert.equal(bacillus.reason, 'mandatory-first-appearance');
  assert.deepEqual(bacillus.unlockedPages, [0]);
});

test('bypass obrigatório não vale para organismo conhecido, geração ou gatilho derivado', () => {
  const known = createTutorialFlow({ seen: ['organism-bacillus'], unlocked: ['organism-bacillus'] });
  const knownEncounter = known.handle('organism-bacillus', firstEncounter({ phase: 1, chunkIndex: 6 }));
  assert.equal(knownEncounter.open, false);
  assert.equal(knownEncounter.reason, 'already-seen');

  const generated = createTutorialFlow();
  const generationEvent = generated.handle('organism-bacillus', guided({ phase: 1, chunkIndex: 6 }));
  assert.equal(generationEvent.open, false);
  assert.equal(generationEvent.reason, 'proximity-required');

  const derived = generated.handle('structure-biofilm', guided({ phase: 1, chunkIndex: 6 }));
  assert.equal(derived.open, false);
  assert.equal(derived.reason, 'guide-only');
});

test('cadeias liberam páginas progressivamente no mesmo cartão sem abrir derivados', () => {
  const flow = createTutorialFlow();
  const bacillus = flow.handle('organism-bacillus', firstEncounter({ phase: 1, chunkIndex: 6 }));
  assert.deepEqual(bacillus.unlockedPages, [0]);
  flow.markSeen(bacillus.cardId);

  const biofilm = flow.handle('structure-biofilm', guided({
    tutorialMode: 'silent',
    phase: 1,
    chunkIndex: 12,
  }));
  assert.equal(biofilm.cardId, 'organism-bacillus');
  assert.equal(biofilm.open, false);
  assert.equal(biofilm.reason, 'guide-only');
  assert.deepEqual(flow.pagesFor('organism-bacillus'), [0, 1, 2, 3]);

  const rhizobium = createTutorialFlow();
  rhizobium.handle('organism-rhizobium', firstEncounter({ phase: 2, chunkIndex: 4 }));
  assert.deepEqual(rhizobium.pagesFor('organism-rhizobium'), [0]);
  rhizobium.handle('structure-nodule', guided({ phase: 2, chunkIndex: 6 }));
  assert.deepEqual(rhizobium.pagesFor('organism-rhizobium'), [0, 1, 2]);
  rhizobium.handle('process-fbn', guided({ phase: 2, chunkIndex: 8 }));
  assert.deepEqual(rhizobium.pagesFor('organism-rhizobium'), [0, 1, 2, 3]);
});

test('fungo e Pseudomonas mantêm cartões separados e competição exige ambos conhecidos', () => {
  const flow = createTutorialFlow();
  const opportunist = flow.handle('organism-opportunistic-fungus', firstEncounter({
    phase: 5, chunkIndex: 2, worldX: 4000,
  }));
  assert.equal(opportunist.cardId, 'organism-opportunistic-fungus');
  flow.markSeen(opportunist.cardId);

  const prematureProcess = flow.handle('process-iron-competition', guided({
    phase: 5, chunkIndex: 13, worldX: 4200,
  }));
  assert.equal(prematureProcess.handled, false);
  assert.equal(prematureProcess.reason, 'prerequisite');

  const pseudomonas = flow.handle('organism-pseudomonas', firstEncounter({
    phase: 5, chunkIndex: 8, worldX: 4100,
  }));
  assert.equal(pseudomonas.cardId, 'organism-pseudomonas');
  assert.notEqual(pseudomonas.cardId, opportunist.cardId);
  flow.markSeen(pseudomonas.cardId);

  const process = flow.handle('process-iron-competition', guided({
    phase: 5, chunkIndex: 13, worldX: 4200,
  }));
  assert.equal(process.handled, true);
  assert.equal(process.cardId, 'process-iron-competition');
});

test('modo silencioso e trava espacial registram no GUIA sem pausar', () => {
  const silentFlow = createTutorialFlow();
  const silent = silentFlow.handle('action-exudate', guided({ tutorialMode: 'silent' }));
  assert.equal(silent.open, false);
  assert.equal(silent.reason, 'silent');
  assert.deepEqual(silentFlow.pagesFor('action-exudate'), [0, 1, 2]);

  const spacedFlow = createTutorialFlow();
  const welcome = spacedFlow.handle('system-welcome', guided({ worldX: 0, nowSeconds: 0 }));
  assert.equal(welcome.open, true);
  spacedFlow.markSeen(welcome.cardId);
  const suppressed = spacedFlow.handle('action-exudate', guided({ worldX: 100, nowSeconds: 1 }));
  assert.equal(suppressed.open, false);
  assert.equal(suppressed.reason, 'spatial-suppression');
  assert.equal(spacedFlow.isUnlocked('action-exudate'), true);

  const releasedByTime = spacedFlow.handle('action-exudate', guided({ worldX: 100, nowSeconds: 61 }));
  assert.equal(releasedByTime.open, true);

  const distanceFlow = createTutorialFlow();
  distanceFlow.handle('system-welcome', guided({ worldX: 0, nowSeconds: 0 }));
  const releasedByDistance = distanceFlow.handle('action-exudate', guided({ worldX: 900, nowSeconds: 1 }));
  assert.equal(releasedByDistance.open, true);
});

test('poder ignora somente a trava espacial e não o modo silencioso', () => {
  const guidedFlow = createTutorialFlow();
  guidedFlow.handle('system-welcome', guided({ worldX: 0, nowSeconds: 0 }));
  const power = guidedFlow.handle('power-double-jump', guided({
    phase: 3, chunkIndex: 20, worldX: 100, nowSeconds: 1,
  }));
  assert.equal(power.open, true);
  assert.equal(power.reason, 'event-immediate');

  const silentFlow = createTutorialFlow();
  const silentPower = silentFlow.handle('power-double-jump', guided({
    tutorialMode: 'silent', phase: 3, chunkIndex: 24,
  }));
  assert.equal(silentPower.open, false);
  assert.equal(silentPower.reason, 'silent');
});

test('painel aberto não cria fila geral e preserva um encontro obrigatório como pendente', () => {
  const flow = createTutorialFlow();
  const mandatory = flow.handle('organism-bacillus', firstEncounter({
    phase: 1,
    chunkIndex: 6,
    panelOpen: true,
  }));
  assert.equal(mandatory.handled, true);
  assert.equal(mandatory.open, false);
  assert.equal(mandatory.reason, 'panel-open');
  assert.equal(mandatory.mandatoryFirstAppearance, true);

  const secondary = flow.handle('action-exudate', guided({ panelOpen: true }));
  assert.equal(secondary.open, false);
  assert.equal(secondary.reason, 'panel-open');
});
