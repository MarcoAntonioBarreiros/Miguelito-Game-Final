import assert from 'node:assert/strict';
import test from 'node:test';

import { generateCampaignEncounters } from '../src/procgen/campaign-encounters.js';
import {
  campaignPhaseSeed,
  createCampaign,
  decorateCampaignLevel,
  prepareCampaignGeneration,
} from '../src/procgen/campaign-progression.js';
import {
  campaignManifest,
  getPathogensAt,
  getPersistentUnlocksBeforePhase,
  getProceduralPoolAt,
  getRoamingDebutsAt,
} from '../src/procgen/campaign-manifest.js';
import { generateLevel } from '../src/procgen/generator.js';
import { createSimulator } from '../src/procgen/simulator.js';

const SEEDS = Array.from({ length: 12 }, (_, index) => `curriculum-seed-${index + 1}`);
const ROAMING_DEBUTS = [
  { phase: 1, chunk: 6, type: 'bacillus', cardId: 'organism-bacillus' },
  { phase: 2, chunk: 4, type: 'rhizobium', cardId: 'organism-rhizobium' },
  { phase: 3, chunk: 4, type: 'azospirillum', cardId: 'organism-azospirillum' },
  { phase: 5, chunk: 4, type: 'pseudomonas', cardId: 'organism-pseudomonas' },
  { phase: 5, chunk: 18, type: 'oportunista', cardId: 'organism-opportunistic-fungus' },
  { phase: 5, chunk: 20, type: 'trichoderma', cardId: 'organism-trichoderma' },
];

function generatePhase(phase, seed) {
  const campaign = createCampaign(seed);
  campaign.phase = phase;
  Object.assign(campaign.unlocks, getPersistentUnlocksBeforePhase(phase));
  const profile = prepareCampaignGeneration(campaign);
  const phaseSeed = campaignPhaseSeed(campaign);
  const level = decorateCampaignLevel(generateLevel(phaseSeed), campaign, profile);
  const encounters = generateCampaignEncounters({
    platforms: level.platforms,
    phase,
    seedValue: phaseSeed,
  });
  return { campaign, level, encounters };
}

test('sequência global preserva a ordem pedagógica do manifesto', () => {
  const orderedIds = [
    'presentation-bacillus',
    'presentation-rhizobium',
    'presentation-azospirillum',
    'presentation-mycorrhiza',
    'presentation-pseudomonas',
    'presentation-opportunistic-fungus',
    'presentation-trichoderma',
    'presentation-mycoparasitism',
    'presentation-root-health',
    'presentation-meloidogyne-infection',
  ];
  const actual = campaignManifest
    .flatMap(phase => phase.presentations.map(presentation => ({
      phase: phase.phase,
      chunk: presentation.debutChunk,
      id: presentation.id,
    })))
    .filter(presentation => orderedIds.includes(presentation.id))
    .sort((left, right) => left.phase - right.phase || left.chunk - right.chunk)
    .map(presentation => presentation.id);
  assert.deepEqual(actual, orderedIds);
});

test('ordem curricular cobre todas as estreias vagantes e as mantém separadas', () => {
  for (const expected of ROAMING_DEBUTS) {
    assert.deepEqual(
      getRoamingDebutsAt(expected.phase, expected.chunk).map(({ type, cardId }) => ({ type, cardId })),
      [{ type: expected.type, cardId: expected.cardId }],
    );
  }

  for (const seed of SEEDS) {
    for (const phase of [1, 2, 3, 5]) {
      const { encounters } = generatePhase(phase, `${seed}:phase-${phase}`);
      const debuts = encounters.filter(encounter => encounter.source === 'debut');
      const expected = ROAMING_DEBUTS.filter(debut => debut.phase === phase);
      assert.deepEqual(
        debuts.map(debut => [debut.logicIndex, debut.id]),
        expected.map(debut => [debut.chunk, debut.type]),
      );
      for (let left = 0; left < debuts.length; left++) {
        for (let right = left + 1; right < debuts.length; right++) {
          assert.ok(
            Math.hypot(debuts[left].x - debuts[right].x, debuts[left].y - debuts[right].y) > 440,
            `estreias ${debuts[left].id}/${debuts[right].id} não podem compartilhar o raio de proximidade`,
          );
        }
      }
    }
  }
});

test('geração falha se dois organismos inéditos puderem compartilhar o raio', () => {
  const platforms = [
    { x: 100, y: 500, w: 200, logicIndex: 4 },
    { x: 520, y: 500, w: 200, logicIndex: 18 },
    { x: 650, y: 500, w: 200, logicIndex: 20 },
  ];
  assert.throws(
    () => generateCampaignEncounters({ platforms, phase: 5, seedValue: 'overlapping-debuts' }),
    /Estreias inéditas simultâneas/,
  );
});

test('pool por fase/chunk nunca antecipa organismo e exige cartão visto na fase de estreia', () => {
  for (const seed of SEEDS) {
    for (let phase = 0; phase <= 8; phase++) {
      const { encounters } = generatePhase(phase, `${seed}:pool-${phase}`);
      for (const encounter of encounters.filter(zone => zone.source === 'procedural')) {
        assert.ok(
          getProceduralPoolAt(phase, encounter.logicIndex).includes(encounter.id),
          `${encounter.id} não pertence ao pool da fase ${phase}/chunk ${encounter.logicIndex}`,
        );
        const currentDebut = ROAMING_DEBUTS.find(debut => debut.phase === phase && debut.type === encounter.id);
        assert.equal(encounter.requiresSeenCardId, currentDebut?.cardId || null);
      }
    }
  }

  assert.equal(getProceduralPoolAt(1, 8).includes('bacillus'), false);
  assert.equal(getProceduralPoolAt(1, 9).includes('bacillus'), true);
  assert.equal(getProceduralPoolAt(5, 8).includes('pseudomonas'), false);
  assert.equal(getProceduralPoolAt(5, 9).includes('pseudomonas'), true);
  assert.equal(getProceduralPoolAt(5, 22).includes('oportunista'), false);
  assert.equal(getProceduralPoolAt(5, 23).includes('oportunista'), true);
  assert.equal(getProceduralPoolAt(5, 22).includes('trichoderma'), false);
  assert.equal(getProceduralPoolAt(5, 23).includes('trichoderma'), true);
});

test('organismos conhecidos reaparecem e os seis vagantes integram a síntese', () => {
  for (const seed of SEEDS) {
    const procedural = generatePhase(8, `${seed}:known-reappearance`).encounters
      .filter(encounter => encounter.source === 'procedural');
    const types = new Set(procedural.map(encounter => encounter.id));
    for (const debut of ROAMING_DEBUTS) {
      assert.ok(types.has(debut.type), `${debut.type} deve reaparecer na fase 8`);
    }
  }
});

test('micorriza e solubilizador têm estreias fixas, sem entrar no pool vagante', () => {
  for (const seed of SEEDS) {
    const mycorrhiza = generatePhase(4, `${seed}:myco`);
    const mycoDebut = mycorrhiza.level.allies.find(ally => ally.presentationOnly && ally.id === 'myco');
    assert.equal(mycoDebut?.logicIndex, 4);
    assert.equal(mycoDebut?.cardId, 'organism-mycorrhiza');

    const phosphate = generatePhase(6, `${seed}:phos`);
    const phosDebut = phosphate.level.allies.find(ally => ally.presentationOnly && ally.id === 'phos');
    assert.equal(phosDebut?.logicIndex, 18);
    assert.equal(phosDebut?.cardId, 'organism-phosphate-solubilizer');

    for (let phase = 0; phase <= 8; phase++) {
      const pool = getProceduralPoolAt(phase, 39);
      assert.equal(pool.includes('myco'), false);
      assert.equal(pool.includes('phos'), false);
    }
  }
});

test('recorrência procedural fica dormente até o primeiro encontro e a estreia não foge', () => {
  for (const expected of ROAMING_DEBUTS) {
    const { level, encounters } = generatePhase(expected.phase, `runtime-${expected.type}`);
    assert.ok(encounters.some(zone => zone.source === 'procedural' && zone.id === expected.type));

    const seen = new Set();
    const sim = createSimulator();
    sim.reset();
    Object.assign(sim.state.level, level);
    sim.state.gameState = 'play';
    sim.ecology.setTutorialCardSeenResolver(cardId => seen.has(cardId));
    sim.resetEcology(encounters);

    assert.equal(
      sim.ecology.encounters.some(zone => zone.source === 'procedural' && zone.id === expected.type),
      false,
      `${expected.type} procedural deve aguardar o cartão`,
    );
    const debut = sim.ecology.encounters.find(zone => zone.source === 'debut' && zone.id === expected.type);
    assert.ok(debut);
    const debutAgents = sim.ecology.agents.filter(agent => agent.zoneIndex === debut.index);
    const anchor = { x: debut.x, y: debut.y };
    for (let step = 0; step < 240; step++) {
      sim.state.time += 1 / 60;
      sim.ecology.update(1 / 60);
    }
    assert.ok(debutAgents.every(agent => Math.hypot(agent.x - anchor.x, agent.y - anchor.y) <= 205));

    seen.add(expected.cardId);
    sim.ecology.update(1 / 60);
    assert.equal(
      sim.ecology.encounters.some(zone => zone.source === 'procedural' && zone.id === expected.type),
      true,
      `${expected.type} procedural deve ativar após o encontro`,
    );
  }
});

test('Rhizoctonia e Meloidogyne respeitam a agenda dos subsistemas próprios', () => {
  for (const seed of SEEDS) {
    for (let phase = 0; phase <= 5; phase++) {
      assert.deepEqual(generatePhase(phase, `${seed}:pathogen-${phase}`).level.enemies, []);
    }

    const phase6 = generatePhase(6, `${seed}:rhizo`).level;
    assert.ok(phase6.enemies.some(enemy => enemy.type === 'rhizoctonia' && enemy.logicIndex === 4 && enemy.debut));
    assert.ok(phase6.enemies.every(enemy => enemy.logicIndex >= 4));
    assert.equal(getPathogensAt(6, 3).includes('rhizoctonia'), false);
    assert.equal(getPathogensAt(6, 4).includes('rhizoctonia'), true);

    for (let phase = 0; phase <= 8; phase++) {
      const { level } = generatePhase(phase, `${seed}:melo-${phase}`);
      const sim = createSimulator();
      sim.reset();
      Object.assign(sim.state.level, level);
      sim.meloidogyneLifecycle.reset();
      const masses = sim.meloidogyneLifecycle.eggMasses;
      if (phase < 7) assert.equal(masses.length, 0);
      if (phase === 7) assert.ok(masses.length > 0 && masses.every(mass => mass.platform.logicIndex >= 4));
      if (phase === 8) assert.ok(masses.length > 0 && masses.every(mass => mass.platform.logicIndex >= 0));
    }
  }
});
