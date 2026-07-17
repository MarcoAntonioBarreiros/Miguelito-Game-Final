import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  campaignManifest,
  getAvailableUnlocksAt,
  getPathogensAt,
  getPhaseManifest,
  getPresentationForTrigger,
  getProceduralPoolAt,
  getRequiredPracticeAbilityAt,
  getSegmentAt,
  getTutorialModeAt,
  tutorialPacing,
  validateCampaignManifest,
  validateFirstEncounterProximity,
} from '../src/procgen/campaign-manifest.js';
import { tutorialCardIds } from '../src/procgen/tutorial-registry.js';

const cloneManifest = () => JSON.parse(JSON.stringify(campaignManifest));

test('manifesto completo valida contra os cartões reais', () => {
  assert.deepEqual(validateCampaignManifest({ knownCardIds: tutorialCardIds }), []);
  assert.equal(campaignManifest.length, 9);
  assert.equal(getPhaseManifest(0)?.id, 'prologue');
  assert.equal(getPhaseManifest(8)?.id, 'phase-8');
});

test('segmentos cobrem os chunks e expõem o modo tutorial esperado', () => {
  assert.equal(getSegmentAt(1, 4)?.id, 'p1-intro');
  assert.equal(getTutorialModeAt(1, 4), 'guided');
  assert.equal(getTutorialModeAt(1, 9), 'silent');
  assert.equal(getTutorialModeAt(99, 0), 'disabled');
});

test('pool procedural respeita estreia e poolFromChunk', () => {
  assert.deepEqual(getProceduralPoolAt(1, 8), []);
  assert.deepEqual(getProceduralPoolAt(1, 9), ['bacillus']);
  assert.equal(getProceduralPoolAt(5, 22).includes('trichoderma'), false);
  assert.equal(getProceduralPoolAt(5, 23).includes('trichoderma'), true);
});

test('unlock do chunk N só fica disponível a partir do chunk N+1', () => {
  assert.equal(getAvailableUnlocksAt(3, 20).doubleJump, false);
  assert.equal(getAvailableUnlocksAt(3, 21).doubleJump, true);
  assert.equal(getRequiredPracticeAbilityAt(3, 21), 'doubleJump');
  assert.equal(getAvailableUnlocksAt(6, 20).pulse, false);
  assert.equal(getAvailableUnlocksAt(6, 21).pulse, true);
});

test('Ralstonia permanece fora do MVP', () => {
  for (let phase = 0; phase <= 8; phase++) {
    for (let chunk = 0; chunk < 40; chunk++) {
      assert.equal(getPathogensAt(phase, chunk).includes('ralstonia'), false);
    }
  }
});

test('primeiro encontro é proximidade, não criação distante', () => {
  assert.deepEqual(validateFirstEncounterProximity({ nearbyOrganismCardIds: [] }), []);
  assert.deepEqual(validateFirstEncounterProximity({
    nearbyOrganismCardIds: ['organism-bacillus'],
  }), []);
  assert.equal(tutorialPacing.firstAppearanceEvent, 'first-proximity-encounter');
  assert.equal(tutorialPacing.organismFirstAppearanceBypassesSpatialGate, true);
});

test('dois organismos ainda não explicados no mesmo raio são rejeitados', () => {
  const errors = validateFirstEncounterProximity({
    nearbyOrganismCardIds: ['organism-bacillus', 'organism-trichoderma'],
  });
  assert.equal(errors.length, 1);

  assert.deepEqual(validateFirstEncounterProximity({
    nearbyOrganismCardIds: ['organism-bacillus', 'organism-trichoderma'],
    explainedCardIds: ['organism-bacillus'],
  }), []);
});

test('zonas de estreia não podem compartilhar organismos novos', () => {
  const manifest = cloneManifest();
  const phase = manifest.find(entry => entry.phase === 5);
  const opportunist = phase.presentations.find(p => p.id === 'presentation-opportunistic-fungus');
  const trichoderma = phase.presentations.find(p => p.id === 'presentation-trichoderma');
  trichoderma.debutZoneId = opportunist.debutZoneId;

  assert.match(
    validateCampaignManifest({ manifest, knownCardIds: tutorialCardIds }).join('\n'),
    /mais de um organismo novo na mesma zona de estreia/,
  );
});

test('organismos diferentes não podem compartilhar apresentação', () => {
  const manifest = cloneManifest();
  const presentation = manifest[1].presentations.find(p => p.id === 'presentation-bacillus');
  presentation.triggerIds.push('organism-trichoderma');

  assert.match(
    validateCampaignManifest({ manifest, knownCardIds: tutorialCardIds }).join('\n'),
    /organismos diferentes não podem compartilhar apresentação inicial/,
  );
});

test('cadeias agrupadas desbloqueiam páginas progressivamente', () => {
  const bacillus = getPresentationForTrigger('organism-bacillus');
  assert.deepEqual(bacillus.pageUnlocks, [
    { triggerId: 'organism-bacillus', pages: [0] },
    { triggerId: 'structure-biofilm', pages: [1, 2, 3] },
  ]);
  assert.equal(bacillus.derivedTriggerBehavior, 'guide-only');

  const manifest = cloneManifest();
  const invalid = manifest[1].presentations.find(p => p.id === 'presentation-bacillus');
  invalid.pageUnlocks[0].pages = [0, 1];
  invalid.pageUnlocks[1].pages = [2, 3];
  assert.match(
    validateCampaignManifest({ manifest, knownCardIds: tutorialCardIds }).join('\n'),
    /primeiro encontro deve desbloquear somente a página 0/,
  );
});

test('Trichoderma, oportunista e micoparasitismo são apresentações separadas', () => {
  assert.equal(getPresentationForTrigger('organism-trichoderma')?.id, 'presentation-trichoderma');
  assert.equal(getPresentationForTrigger('organism-opportunistic-fungus')?.id, 'presentation-opportunistic-fungus');
  assert.deepEqual(
    getPresentationForTrigger('process-mycoparasitism')?.prerequisitePresentationIds,
    ['presentation-opportunistic-fungus', 'presentation-trichoderma'],
  );
});

test('integração permanece limitada a progressão e gating', () => {
  assert.match(readFileSync('src/procgen/campaign-progression.js', 'utf8'), /campaign-manifest/);
  assert.match(readFileSync('src/procgen/logic.js', 'utf8'), /campaign-manifest/);

  for (const file of ['src/procgen/tutorial-manager.js', 'src/procgen/tutorial-triggers.js']) {
    assert.doesNotMatch(readFileSync(file, 'utf8'), /campaign-manifest/);
  }
  assert.doesNotMatch(
    readFileSync('src/procgen/app.js', 'utf8'),
    /getProceduralPoolAt|getTetheredDebutsAt|getTutorialModeAt/,
  );
});
