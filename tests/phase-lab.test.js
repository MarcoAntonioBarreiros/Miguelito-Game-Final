import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import {
  clearPhaseManifestOverride,
  getPathogensAt,
  getPhaseManifest,
  getProceduralPoolAt,
  setPhaseManifestOverride,
} from '../src/procgen/campaign-manifest.js';
import {
  applyPhaseLabResources,
  buildPhaseLabManifest,
  createDefaultPhaseLabConfig,
  isPhaseLabEnabled,
  scalePhaseLabSegments,
  validatePhaseLabConfig,
} from '../src/procgen/phase-lab-config.js';

afterEach(() => clearPhaseManifestOverride());

test('Phase Lab so e ativado explicitamente pela query string', () => {
  assert.equal(isPhaseLabEnabled({ search: '?phaseLab=1' }), true);
  assert.equal(isPhaseLabEnabled({ search: '?test=1&phaseLab=1' }), true);
  assert.equal(isPhaseLabEnabled({ search: '?phaseLab=0' }), false);
  assert.equal(isPhaseLabEnabled({ search: '' }), false);
});

test('configuracao altera perfil, segmentos, organismos, recursos e prova final no manifesto real', () => {
  const config = createDefaultPhaseLabConfig(5);
  config.seed = 'laboratorio-curricular';
  config.totalChunks = 28;
  config.segments = scalePhaseLabSegments(config.segments, 40, config.totalChunks);
  config.title = 'Fase experimental';
  config.theme = 'controle experimental';
  config.mission = 'Compare duas comunidades microbianas.';
  config.allowedOrganisms = ['pseudomonas', 'trichoderma'];
  config.allowedPathogens = ['rhizoctonia'];
  config.resources = { exudates: 7, crystals: 2, checkpoints: 1 };
  config.finalGoal = 'Neutralizar um foco e alcancar a raiz.';
  config.finalConditions = [
    { type: 'worldState', key: 'neutralizedOpportunisticFungusCount', operator: '>=', value: 1 },
    { type: 'worldState', key: 'reachedFinalRoot', operator: '===', value: true },
  ];

  const result = validatePhaseLabConfig(config);
  assert.equal(result.valid, true, result.errors.join('\n'));
  const active = setPhaseManifestOverride(result.manifest);
  assert.equal(getPhaseManifest(5), active);
  assert.equal(active.totalChunks, 28);
  assert.equal(active.title, 'Fase experimental');
  assert.equal(active.mission, config.mission);
  assert.deepEqual(getProceduralPoolAt(5, 0), ['pseudomonas', 'trichoderma']);
  assert.deepEqual(getPathogensAt(5, 0), ['rhizoctonia']);
  assert.deepEqual(active.phaseLab.resources, config.resources);
  assert.equal(active.finalTest.goal, config.finalGoal);
});

test('distribuicao de recursos usa a geometria real e e deterministica por seed', () => {
  const config = createDefaultPhaseLabConfig(2);
  config.resources = { exudates: 6, crystals: 3, checkpoints: 2 };
  const manifest = buildPhaseLabManifest(config);
  const baseLevel = {
    platforms: Array.from({ length: 12 }, (_, index) => ({
      x: 100 + index * 260, y: 470 - (index % 3) * 25, w: 190, h: 60,
      type: 'root', logicIndex: index,
    })),
    exudates: [], crystals: [], checkpoints: [],
  };
  const first = applyPhaseLabResources(structuredClone(baseLevel), manifest, 'seed-fixa');
  const second = applyPhaseLabResources(structuredClone(baseLevel), manifest, 'seed-fixa');
  assert.deepEqual(first, second);
  assert.equal(first.exudates.length, 6);
  assert.equal(first.crystals.length, 3);
  assert.equal(first.checkpoints.length, 2);
  assert.ok(first.crystals.every(crystal => crystal.requiredFeature === 'pulse'));
});

test('exporta uma entrada completa compativel com o formato do manifesto', () => {
  const config = createDefaultPhaseLabConfig(3);
  config.allowedOrganisms = ['azospirillum'];
  const manifest = buildPhaseLabManifest(config);
  const exported = JSON.parse(JSON.stringify(manifest));
  assert.equal(exported.id, 'phase-3');
  assert.ok(Array.isArray(exported.segments));
  assert.ok(Array.isArray(exported.presentations));
  assert.ok(Array.isArray(exported.finalTest.requires));
  assert.deepEqual(exported.phaseLab.allowedOrganisms, ['azospirillum']);
});
