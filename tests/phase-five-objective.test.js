import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulator } from '../src/procgen/simulator.js';
import { getPhaseManifest } from '../src/procgen/campaign-manifest.js';

// Reproduz o caso comum da fase 5: UMA colonia madura de Pseudomonas com ferro
// a vontade. A fase gera de zero a uma ocorrencia procedural do organismo, entao
// e com uma colonia que o objetivo precisa fechar.
function reservaDeUmaColonia(segundos = 120) {
  const sim = createSimulator();
  const state = sim.state;
  state.gameState = 'play';
  state.campaign = { phase: 5, unlocks: {} };
  state.level.campaignPhase = 5;

  const raiz = { x: 400, y: 500, w: 300, h: 60, type: 'root', logicIndex: 5, rootHealth: 1 };
  state.level.platforms = [raiz];
  state.level.ironDeposits = [0, 1, 2].map(index => ({
    id: `fe-${index}`, platform: raiz,
    x: 440 + index * 90, y: raiz.y + 28,
    stock: 7, maxStock: 7, radius: 13, phase: index * 1.7, exposed: true, authored: true,
  }));

  sim.beneficialInoculants.createAuthoredColony({
    type: 'pseudomonas', platform: raiz, x: 550, y: 492,
    sourceCount: 5, vigor: 1, growth: 1,
  });

  let pico = 0;
  for (let frame = 0; frame < 60 * segundos; frame++) {
    sim.beneficialInoculants.update(1 / 60);
    sim.pseudomonasSiderophores.update(1 / 60);
    state.time += 1 / 60;
    pico = Math.max(pico, sim.pseudomonasSiderophores.ironReserve);
  }
  return { pico, recuperado: sim.pseudomonasSiderophores.ironRecovered };
}

test('a reserva de ferro exigida pela fase 5 cabe no que uma colonia alcanca', () => {
  // O defeito: o objetivo exigia >= 1, mas a colonia deixa de lancar sideroforos
  // quando a reserva passa de 0,92 e a ultima entrega para em ~0,97. A fase
  // ficava impossivel de registrar, mesmo com o ferro visivelmente sendo
  // absorvido — que foi exatamente o relato.
  const exigido = getPhaseManifest(5).finalTest.requires
    .find(condition => condition.key === 'pseudomonasIronReserve').value;

  const { pico, recuperado } = reservaDeUmaColonia();
  assert.ok(recuperado > 0, 'a colonia precisa realmente recolher ferro no cenario do teste');
  assert.ok(
    pico >= exigido,
    `uma colonia chega a ${pico.toFixed(3)} e o objetivo exige ${exigido}: inalcancavel`,
  );
});

test('o objetivo ainda exige forrageamento de verdade', () => {
  // O oposto do defeito: baixar demais o numero faria a fase passar sozinha.
  const exigido = getPhaseManifest(5).finalTest.requires
    .find(condition => condition.key === 'pseudomonasIronReserve').value;
  assert.ok(exigido > .5, `exigir ${exigido} de reserva seria passar sem trabalho`);
});

test('sem colonia nenhuma a reserva e zero, e o objetivo nao passa', () => {
  // Guarda contra o inverso: um objetivo que fecha porque nada aconteceu.
  const sim = createSimulator();
  sim.state.gameState = 'play';
  sim.state.level.platforms = [{ x: 400, y: 500, w: 300, h: 60, type: 'root', logicIndex: 5 }];
  for (let frame = 0; frame < 600; frame++) sim.pseudomonasSiderophores.update(1 / 60);

  const exigido = getPhaseManifest(5).finalTest.requires
    .find(condition => condition.key === 'pseudomonasIronReserve').value;
  assert.equal(sim.pseudomonasSiderophores.ironReserve, 0);
  assert.ok(exigido > 0, 'o objetivo nao pode ser satisfeito por reserva zero');
});
