import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createBacillusBioprotection } from '../src/procgen/bacillus-bioprotection.js';
import { createCampaignObjectiveEvaluator } from '../src/procgen/campaign-objectives.js';
import { PHOSPHATE_SOLUBILIZATION_DEFAULTS, getPhaseManifest } from '../src/procgen/campaign-manifest.js';
import { createInoculumSelection } from '../src/procgen/inoculum-selection.js';
import { createPhosphateSolubilization } from '../src/procgen/phosphate-solubilization.js';

function deposit(id, x = 180, amount = 1) {
  return {
    id, phosphateDeposit: true, x, y: 70, w: 30, h: 60,
    remainingPhosphate: amount, initialPhosphate: amount,
    localAvailablePhosphate: 0, broken: false,
  };
}

function harness({ deposits = [deposit('p1')], route = null, reserve = 1, solubilizer = true } = {}) {
  const player = {
    x: 80, y: 70, w: 32, h: 48, facing: 1,
    canPhosphateSolubilization: true, phosphateCharge: 0, soil: 0, hope: 0,
  };
  const state = {
    gameState: 'play', time: 0, cameraX: 0, player,
    level: {
      phaseProfile: { phosphateSolubilization: { ...PHOSPHATE_SOLUBILIZATION_DEFAULTS, chargeTimeSeconds: 1 } },
      phosphateDeposits: deposits,
      availablePhosphatePools: [],
      phosphateTransportParticles: [],
      authoredPhosphateRoute: route,
    },
  };
  const input = { keys: { KeyE: false } };
  const entry = {
    mode: 'mature', maturity: 1, phosphateMetaboliteReserve: reserve,
    colony: { x: 90, y: 94, solubilizerStrain: solubilizer },
  };
  const bacillus = { get solubilizerEntries() { return solubilizer ? [entry] : []; } };
  const selection = { isSelected: kind => kind === 'phosphate-solubilization' };
  const system = createPhosphateSolubilization({
    state, input, selection, bacillus,
    entities: { burst() {} },
  });
  const charge = amount => {
    input.keys.KeyE = true;
    system.prepare(amount);
    input.keys.KeyE = false;
    system.prepare(0);
  };
  const advance = (seconds = 1) => {
    for (let elapsed = 0; elapsed < seconds; elapsed += .05) system.update(.05);
  };
  return { state, input, entry, system, charge, advance };
}

test('1-2. Solubilizacao P aparece apos desbloqueio e ArrowDown a seleciona', () => {
  const state = { time: 0, gameState: 'play', player: { exudates: 1, canPhosphateSolubilization: false } };
  const input = { keys: { ArrowDown: false } };
  const selection = createInoculumSelection({
    state, input,
    inoculants: { followerGroups: () => new Map() },
    trichodermaColonies: { followerCount: 0 },
  });
  assert.equal(selection.options().some(option => option.kind === 'phosphate-solubilization'), false);
  state.player.canPhosphateSolubilization = true;
  assert.equal(selection.options().some(option => option.kind === 'phosphate-solubilization'), true);
  input.keys.ArrowDown = true;
  selection.prepare();
  assert.equal(selection.current.kind, 'phosphate-solubilization');
});

test('3-4. somente a opcao selecionada carrega ao segurar E e dispara ao soltar', () => {
  const h = harness();
  h.input.keys.KeyE = true;
  h.system.prepare(.5);
  assert.equal(h.system.charge, .5);
  assert.equal(h.system.shotCount, 0);
  h.input.keys.KeyE = false;
  h.system.prepare(0);
  assert.equal(h.system.charge, 0);
  assert.equal(h.system.shotCount, 1);
});

test('5-7. outras acoes continuam instantaneas, K nao dispara e touch usa TROCAR/hold E', () => {
  const h = harness();
  h.input.keys.KeyK = true;
  h.system.prepare(1);
  assert.equal(h.system.charge, 0);
  assert.equal(h.system.shotCount, 0);
  const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(index, /data-key="ArrowDown"[^>]*>↓ TROCAR/);
  assert.doesNotMatch(index, /data-key="KeyK"/);
  assert.match(index, /data-key="KeyE" aria-label=/);
  assert.doesNotMatch(index, /data-key="KeyE"[^>]*data-mode="tap"/);
  const selectionSource = readFileSync(new URL('../src/procgen/inoculum-selection.js', import.meta.url), 'utf8');
  assert.match(selectionSource, /kind: 'exudate'/);
  assert.match(selectionSource, /kind: 'organism'/);
});

function bacillusHarness(colony) {
  const state = {
    time: 10,
    gameState: 'play',
    player: { x: 0, y: 0, w: 32, h: 48, infection: 0, soil: 0 },
    level: { biofilms: [], platforms: [colony.platform], phaseProfile: { phosphateSolubilization: PHOSPHATE_SOLUBILIZATION_DEFAULTS } },
  };
  const inoculants = { colonies: [colony] };
  const system = createBacillusBioprotection({
    state, inoculants,
    ecology: { agents: [] },
    entities: { burst() {} },
  });
  system.update(1);
  return { state, system, entry: system.entries[0] };
}

test('8-10. Bacillus comum nao carrega; cepa ativa carrega; endosporo interrompe producao', () => {
  const platform = { x: 0, y: 300, w: 180, h: 60 };
  const common = bacillusHarness({ id: 'common', type: 'bacillus', x: 80, y: 290, platform, sourceCount: 4, vigor: 1, growth: 1, authored: true, rechargeIntensity: .5 });
  assert.equal(common.entry.phosphateMetaboliteReserve, 0);
  const strain = bacillusHarness({ id: 'strain', type: 'bacillus', x: 80, y: 290, platform, sourceCount: 4, vigor: 1, growth: 1, authored: true, rechargeIntensity: .5, solubilizerStrain: true });
  assert.ok(strain.entry.phosphateMetaboliteReserve > .7);
  strain.entry.mode = 'spores';
  strain.entry.colony.dormant = true;
  strain.entry.colony.rechargeIntensity = 0;
  const before = strain.entry.phosphateMetaboliteReserve;
  strain.system.update(1);
  assert.ok(strain.entry.phosphateMetaboliteReserve <= before);
});

test('11. reserva da colonia diminui durante a absorcao', () => {
  const h = harness();
  h.input.keys.KeyE = true;
  h.system.prepare(.4);
  assert.equal(h.entry.phosphateMetaboliteReserve, .6);
});

test('12. disparo e direcional', () => {
  const h = harness();
  h.state.player.facing = -1;
  h.charge(1);
  h.advance(1);
  assert.equal(h.state.level.phosphateDeposits[0].remainingPhosphate, 1);
});

test('13. carga maior solubiliza mais e pode conservar energia para outro deposito', () => {
  const low = harness({ deposits: [deposit('low')] });
  low.charge(.25); low.advance(1);
  const lowReleased = 1 - low.state.level.phosphateDeposits[0].remainingPhosphate;
  const high = harness({ deposits: [deposit('a', 180), deposit('b', 280)] });
  high.charge(1); high.advance(1);
  const highReleased = high.state.level.phosphateDeposits.reduce((sum, item) => sum + (1 - item.remainingPhosphate), 0);
  assert.ok(highReleased > lowReleased);
  assert.equal(high.state.level.phosphateDeposits.filter(item => item.broken).length, 2);
});

test('14. disparo afeta exclusivamente depositos de fosfato', () => {
  const h = harness();
  h.state.player.fungalContamination = .8;
  h.state.level.enemies = [{ hp: 3 }];
  h.charge(1); h.advance(1);
  assert.equal(h.state.player.fungalContamination, .8);
  assert.equal(h.state.level.enemies[0].hp, 3);
});

test('15-16. disparos parciais acumulam e o collider so libera na deplecao', () => {
  const h = harness();
  h.charge(.25); h.advance(1);
  const target = h.state.level.phosphateDeposits[0];
  assert.equal(target.broken, false);
  assert.ok(target.remainingPhosphate < target.initialPhosphate);
  h.entry.phosphateMetaboliteReserve = 1;
  h.charge(.25); h.advance(1);
  assert.equal(target.remainingPhosphate, 0);
  assert.equal(target.broken, true);
  assert.equal(h.system.solubilizedDepositCount, 1);
});

test('17-18. P permanece local sem micorriza e fosfato insoluvel nao e absorvido', () => {
  const h = harness();
  h.charge(.25); h.advance(1);
  const available = h.state.level.availablePhosphatePools[0].amount;
  h.system.update(4);
  assert.equal(h.state.level.availablePhosphatePools[0].amount, available);
  const untouched = harness({ deposits: [deposit('raw')], route: { functional: true, arbuscule: { maturity: 1 }, depositId: 'raw', rootPlatform: {}, points: [] } });
  untouched.system.update(4);
  assert.equal(untouched.system.transportedPhosphate, 0);
});

test('19-22. micorriza capta P disponivel pela rota hifal, passa pelo arbusculo e aumenta estoque da raiz', () => {
  const root = { rootHealth: .5, maxRootHealth: .7, phosphateStock: 0 };
  const route = {
    functional: true, depositId: 'p1', rootPlatform: root,
    arbuscule: { maturity: 1 }, points: [{ x: 180, y: 90 }, { x: 260, y: 40 }, { x: 340, y: 90 }],
  };
  const h = harness({ route });
  h.charge(.5); h.advance(1);
  const poolBefore = h.state.level.availablePhosphatePools[0].amount;
  h.system.update(1);
  assert.ok(h.state.level.availablePhosphatePools[0].amount < poolBefore);
  assert.ok(h.system.transportedPhosphate > 0);
  assert.ok(h.state.level.phosphateTransportParticles.length > 0);
  assert.ok(root.phosphateStock > 0);
  assert.ok(root.rootHealth > .5 && root.rootHealth <= .7);
});

test('23. objetivo final da Fase 7 exige solubilizacao, transporte, estoque e saida', () => {
  const requirements = getPhaseManifest(7).finalTest.requires;
  assert.deepEqual(requirements.map(item => item.key), [
    'solubilizedPhosphateDepositCount',
    'mycorrhizalPhosphateTransported',
    'rootPhosphateStock',
    'reachedFinalRoot',
  ]);
  const state = { level: { goal: { completed: true } }, campaign: { unlocks: {} } };
  const evaluator = createCampaignObjectiveEvaluator({
    state,
    systems: { phosphate: { solubilizedDepositCount: 1, transportedPhosphate: 1, rootPhosphateStock: 1 } },
  });
  assert.equal(evaluator.evaluate(requirements).passed, true);
});
