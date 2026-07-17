import assert from 'node:assert/strict';
import test from 'node:test';

import { validateChunk } from '../src/procgen/agents.js';
import { generateCampaignEncounters } from '../src/procgen/campaign-encounters.js';
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
import { generateLevel } from '../src/procgen/generator.js';
import {
  createAzospirillumRootGrowth,
  generateAzospirillumRootLadders,
} from '../src/procgen/azospirillum-root-growth.js';
import { createAzospirillumNitrogen } from '../src/procgen/azospirillum-nitrogen.js';
import { createMycorrhizaStructures } from '../src/procgen/mycorrhiza-structures.js';

const LADDER_CONFIG = {
  enabled: true,
  count: 1,
  stepCount: 4,
  verticalSpacing: 85,
  growthDurationSeconds: 3,
};

const NORMAL_JUMP = { id: 'running-jump-long', requires: [] };
const DOUBLE_JUMP = { id: 'running-double-jump', requires: ['doubleJump'] };

function ladderFixture() {
  const platforms = [
    { x: 100, y: 500, w: 190, h: 60, type: 'root', logicIndex: 4 },
    { x: 380, y: 510, w: 185, h: 58, type: 'soil', logicIndex: 6 },
    { x: 650, y: 525, w: 190, h: 62, type: 'soil', logicIndex: 8 },
    { x: 930, y: 540, w: 210, h: 64, type: 'root', logicIndex: 9 },
    { x: 1240, y: 515, w: 195, h: 60, type: 'root', logicIndex: 10 },
    { x: 1525, y: 525, w: 205, h: 60, type: 'root', logicIndex: 11 },
    { x: 1150, y: 600, w: 88, h: 30, type: 'root', logicIndex: 10, recovery: true },
  ];
  return {
    platforms,
    exudates: [{ logicIndex: 6, x: 470, y: 470, taken: false }],
    allies: [], crystals: [], enemies: [], checkpoints: [],
    azospirillumRootLadders: [], azospirillumRoots: [], particles: [],
  };
}

function createFixtureLadder() {
  const level = ladderFixture();
  const [ladder] = generateAzospirillumRootLadders({
    level,
    phase: 3,
    seedValue: 'ladder-fixture',
    encounters: [{ id: 'azospirillum', logicIndex: 4, x: 180, y: 410 }],
    config: LADDER_CONFIG,
  });
  assert.ok(ladder, 'a fixture deve produzir uma escada');
  return { level, ladder };
}

test('desafio de Azo so e reservado depois de Azo, exsudato e raiz colonizavel', () => {
  const withoutAzo = ladderFixture();
  assert.deepEqual(generateAzospirillumRootLadders({
    level: withoutAzo, phase: 3, seedValue: 'without-azo', encounters: [], config: LADDER_CONFIG,
  }), []);

  const level = ladderFixture();
  level.exudates = [];
  const [ladder] = generateAzospirillumRootLadders({
    level,
    phase: 3,
    seedValue: 'authored-prerequisite',
    encounters: [{ id: 'azospirillum', logicIndex: 4, x: 180, y: 410 }],
    config: LADDER_CONFIG,
  });
  assert.ok(ladder);
  assert.ok(level.exudates.some(exudate => exudate.azospirillumLadderPrerequisite));
  assert.ok(ladder.sourceAzospirillumLogicIndex < ladder.sourceExudateLogicIndex);
  assert.ok(ladder.sourceExudateLogicIndex < ladder.hostLogicIndex);
  assert.equal(ladder.host.type, 'root');
  assert.ok(ladder.blockedGap > 300);
  assert.equal(level.platforms.some(platform => platform.recovery
    && platform.x > ladder.host.x + ladder.host.w
    && platform.x < ladder.destination.x), false);
});

test('escada cresce apenas com colonia de Azo na raiz e cada degrau so colide em 100%', () => {
  const { level, ladder } = createFixtureLadder();
  const inoculants = { colonies: [] };
  const state = {
    gameState: 'play', time: 0, level,
    player: { soil: 0, hope: 0 }, cameraX: 0,
  };
  const runtime = createAzospirillumRootGrowth({
    state,
    inoculants,
    entities: { burst() {} },
  });
  runtime.reset();
  runtime.update(10);
  assert.equal(ladder.progress, 0);
  assert.equal(runtime.platformCount, 0);

  inoculants.colonies.push({
    id: 'azo-colony', type: 'azospirillum', platform: ladder.host,
    growth: 1, vigor: 1, dormant: false, x: ladder.host.x + ladder.host.w - 45,
  });
  runtime.update(2.99);
  assert.ok(ladder.progress > .99 && ladder.progress < 1);
  assert.equal(ladder.developed, false);
  for (const step of ladder.steps) {
    assert.equal(Boolean(step.collider), step.progress >= 1);
  }
  assert.equal(ladder.steps.at(-1).collider, null);

  runtime.update(.01);
  assert.equal(ladder.progress, 1);
  assert.equal(ladder.developed, true);
  assert.equal(ladder.steps.every(step => step.mature && step.collider), true);
  assert.equal(runtime.platformCount, LADDER_CONFIG.stepCount);

  inoculants.colonies.length = 0;
  runtime.update(30);
  assert.equal(ladder.progress, 1);
  assert.equal(ladder.steps.every(step => step.collider), true);
});

test('primeira escada e atravessavel com pulo normal e elimina o bloqueio obrigatorio', () => {
  const { ladder } = createFixtureLadder();
  const route = [
    ladder.host,
    ...ladder.steps.map(step => ({
      x: step.centerX - step.targetWidth / 2,
      y: step.y,
      w: step.targetWidth,
      h: step.targetHeight,
      type: 'root',
      oneWay: true,
    })),
    ladder.destination,
  ];
  assert.equal(validateChunk(ladder.host, ladder.destination, NORMAL_JUMP), false);
  for (let index = 0; index < route.length - 1; index++) {
    assert.equal(
      validateChunk(route[index], route[index + 1], NORMAL_JUMP),
      true,
      `salto normal deve conectar o trecho ${index} da escada`,
    );
  }
  assert.equal(validateChunk(ladder.destination, ladder.following, NORMAL_JUMP), true);
});

test('geracao da escada permanece deterministica em multiplas seeds da Fase 3', () => {
  for (let index = 0; index < 12; index++) {
    const snapshot = () => {
      const campaign = createCampaign(`azo-deterministic-${index}`);
      campaign.phase = 3;
      Object.assign(campaign.unlocks, getPersistentUnlocksBeforePhase(3));
      const profile = prepareCampaignGeneration(campaign);
      const seedValue = campaignPhaseSeed(campaign);
      const level = decorateCampaignLevel(generateLevel(seedValue), campaign, profile);
      const encounters = generateCampaignEncounters({ platforms: level.platforms, phase: 3, seedValue });
      const ladders = generateAzospirillumRootLadders({
        level,
        phase: 3,
        seedValue,
        encounters,
        config: getPhaseManifest(3).azospirillumRootLadder,
      });
      for (const ladder of ladders) {
        const route = [
          ladder.host,
          ...ladder.steps.map(step => ({
            x: step.centerX - step.targetWidth / 2,
            y: step.y,
            w: step.targetWidth,
            h: step.targetHeight,
            type: 'root',
            oneWay: true,
          })),
          ladder.destination,
        ];
        assert.equal(validateChunk(ladder.host, ladder.destination, NORMAL_JUMP), false);
        for (let routeIndex = 0; routeIndex < route.length - 1; routeIndex++) {
          assert.equal(
            validateChunk(route[routeIndex], route[routeIndex + 1], NORMAL_JUMP),
            true,
            `seed ${index} deve manter atravessável o trecho ${routeIndex}`,
          );
        }
        assert.equal(
          validateChunk(ladder.destination, ladder.following, NORMAL_JUMP)
            || validateChunk(ladder.destination, ladder.following, DOUBLE_JUMP),
          true,
          `seed ${index} deve preservar a rota posterior com o salto duplo já desbloqueado`,
        );
      }
      return ladders.map(ladder => ({
        host: ladder.hostLogicIndex,
        destination: ladder.destinationLogicIndex,
        azo: ladder.sourceAzospirillumLogicIndex,
        exudate: ladder.sourceExudateLogicIndex,
        blockedRise: ladder.blockedRise,
        steps: ladder.steps.map(step => [step.centerX, step.y]),
      }));
    };
    const first = snapshot();
    assert.deepEqual(first, snapshot());
    assert.equal(first.length, 1);
    assert.ok(first[0].azo < first[0].exudate);
    assert.ok(first[0].exudate < first[0].host);
  }
});

test('Azo fornece N associativo pequeno, nao cria nodulo e so potencializa Rhizobium no mesmo sistema', () => {
  const rootA = { type: 'root', rootSystemId: 'system-a' };
  const rootB = { type: 'root', rootSystemId: 'system-b' };
  const colony = {
    id: 'azo-1', type: 'azospirillum', platform: rootA,
    growth: 1, vigor: 1, rechargeIntensity: 1, dormant: false,
  };
  const site = {
    id: 'nodule-1', platform: rootB, mature: true,
    stage: 'mature-nodule', fixationRate: .2,
  };
  const state = {
    gameState: 'play', campaign: { phase: 3 },
    level: { campaignPhase: 3, rhizobiumNodules: [site] },
    player: { soil: 0, hope: 0 }, toast: '', toastTime: 0,
  };
  const inoculants = { colonies: [colony] };
  const nitrogen = createAzospirillumNitrogen({ state, inoculants });
  nitrogen.update(1);
  assert.equal(state.level.rhizobiumNodules.length, 1, 'Azo nao deve criar nodulos');
  assert.ok(nitrogen.associativeNitrogenRate > 0);
  assert.ok(nitrogen.associativeNitrogenRate < site.fixationRate);
  assert.equal(site.fixationRate, .2);
  assert.equal(site.azospirillumSynergyActive, false);

  rootB.rootSystemId = 'system-a';
  nitrogen.update(1);
  assert.equal(site.fixationRate, .24);
  assert.equal(site.azospirillumSynergyActive, true);
  assert.equal(state.toast, 'Co-inoculação: FBN potencializada');

  colony.dormant = true;
  nitrogen.update(1);
  assert.equal(site.fixationRate, .2);
  assert.equal(site.azospirillumSynergyActive, false);
});

test('micorriza gera somente pontes predominantemente horizontais', () => {
  const source = { x: 100, y: 500, w: 200, h: 60, type: 'root', logicIndex: 4 };
  const target = { x: 430, y: 520, w: 210, h: 60, type: 'root', logicIndex: 5 };
  const upper = { x: 210, y: 245, w: 180, h: 55, type: 'root', logicIndex: 6 };
  const cloud = { id: 'myco-cloud', x: 282, y: 475, radius: 95, maxLife: 10, life: 9 };
  const state = {
    gameState: 'play', time: 0, cameraX: 0,
    campaign: { phase: 4 }, player: { soil: 0, hope: 0, canDash: true },
    level: { campaignPhase: 4, platforms: [source, target, upper], exudateClouds: [cloud] },
  };
  const structures = createMycorrhizaStructures({ state, entities: { burst() {} } });
  structures.update(.8);
  assert.equal(structures.structureCount, 1);
  assert.equal(structures.ladderCount, 0);
  assert.equal(structures.bridgeCount, 1);
  assert.equal(structures.structures.every(structure => structure.type === 'bridge'), true);
  assert.equal(structures.structures.every(structure => Math.abs(structure.end.y - structure.start.y) <= 68), true);
});
