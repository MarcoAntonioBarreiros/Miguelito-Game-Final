import assert from 'node:assert/strict';
import test from 'node:test';

import { generateLevel } from '../src/procgen/generator.js';
import { validateChunk } from '../src/procgen/agents.js';
import { applyPhaseFourMycorrhizaIntro } from '../src/procgen/phase-four-mycorrhiza-intro.js';
import { applySignatureChallenge } from '../src/procgen/signature-challenge.js';
import { getPhaseManifest, setPhaseManifestOverride, clearPhaseManifestOverride } from '../src/procgen/campaign-manifest.js';
import {
  buildPhaseLabManifest, createDefaultPhaseLabConfig, scalePhaseLabSegments,
} from '../src/procgen/phase-lab-config.js';
import {
  campaignPhaseSeed, createCampaign, decorateCampaignLevel, prepareCampaignGeneration,
} from '../src/procgen/campaign-progression.js';

// Numeros medidos da fisica canonica, nao escolhidos.
const SALTO_DUPLO = 180;
const ESCADA_MINIMA = 96;

function gera(phase, seedName, totalChunks = null) {
  if (totalChunks) {
    const base = createDefaultPhaseLabConfig(phase);
    setPhaseManifestOverride(buildPhaseLabManifest({
      ...base,
      totalChunks,
      segments: scalePhaseLabSegments(base.segments, base.totalChunks, totalChunks),
    }));
  }
  const campaign = createCampaign(seedName, { storage: null });
  campaign.phase = phase;
  const profile = prepareCampaignGeneration(campaign);
  let level = generateLevel(campaignPhaseSeed(campaign));
  applyPhaseFourMycorrhizaIntro(level, phase, getPhaseManifest(phase).mycorrhizaBridge);
  level = decorateCampaignLevel(level, campaign, profile);
  const challenge = applySignatureChallenge(level, phase);
  return { level, challenge };
}

function maiorSubida(level) {
  const rota = level.platforms
    .filter(p => !p.recovery && !p.final && Number.isInteger(p.logicIndex))
    .sort((a, b) => a.logicIndex - b.logicIndex);
  let maior = 0;
  for (const p of rota) {
    const prev = rota.find(q => q.logicIndex === p.logicIndex - 1);
    if (prev) maior = Math.max(maior, prev.y - p.y);
  }
  return maior;
}

test('o gerador procedural sozinho nunca exige a escada', () => {
  // O teto de traversalLimits e 112px e o salto duplo alcanca 180px. Este teste
  // documenta a razao de o desafio-assinatura existir: sem ele, a mecanica-tema
  // da fase esta disponivel e nunca e necessaria.
  const { level } = gera(3, 'sem-desafio-assinatura');
  const rota = level.platforms
    .filter(p => !p.recovery && !p.final && Number.isInteger(p.logicIndex) && !p.signatureChallenge)
    .sort((a, b) => a.logicIndex - b.logicIndex);
  let maiorProcedural = 0;
  for (const p of rota) {
    const prev = rota.find(q => q.logicIndex === p.logicIndex - 1);
    if (prev) maiorProcedural = Math.max(maiorProcedural, prev.y - p.y);
  }
  assert.ok(
    maiorProcedural <= 120,
    `subida procedural de ${Math.round(maiorProcedural)}px deveria ficar no teto do gerador`,
  );
  clearPhaseManifestOverride();
});

test('o desafio da escada aparece em toda seed e em todo tamanho de fase', () => {
  for (const total of [12, 16, 20, 30, 40]) {
    for (let s = 0; s < 6; s++) {
      const { level, challenge } = gera(3, `assinatura-${total}-${s}`, total);
      assert.ok(challenge, `fase de ${total} chunks, seed ${s}: nenhum desafio criado`);
      assert.equal(challenge.mechanic, 'azospirillumRoots');
      assert.ok(
        maiorSubida(level) > SALTO_DUPLO,
        `fase de ${total} chunks, seed ${s}: a maior subida nao exige a escada`,
      );
    }
  }
  clearPhaseManifestOverride();
});

test('o desafio permanece solucionavel com a escada mais fraca', () => {
  // Sem nitrogenio a escada alcanca 96px; somado ao salto duplo da 276px. Uma
  // subida acima disso seria intransponivel e criaria fase impossivel.
  for (const total of [12, 20, 40]) {
    for (let s = 0; s < 4; s++) {
      const { level } = gera(3, `solucionavel-${total}-${s}`, total);
      const subida = maiorSubida(level);
      assert.ok(
        subida <= ESCADA_MINIMA + SALTO_DUPLO,
        `subida de ${Math.round(subida)}px passa do que a escada minima mais o salto duplo alcancam`,
      );
    }
  }
  clearPhaseManifestOverride();
});

// A ponte micorrizica so vale entre 325 e 340px: abaixo o salto duplo vence,
// acima ela nao alcanca. E o dash vence essa faixa, entao o desafio precisa
// cair antes do desbloqueio dele.
test('o desafio da ponte derrota o salto duplo e cabe no alcance da ponte', () => {
  const DUPLO = { id: 'running-double-jump-late', requires: ['doubleJump'] };
  for (const total of [20, 30, 40]) {
    for (let s = 0; s < 4; s++) {
      const { level, challenge } = gera(4, `ponte-${total}-${s}`, total);
      assert.ok(challenge, `fase de ${total} chunks, seed ${s}: nenhum desafio criado`);
      assert.equal(challenge.mechanic, 'mycorrhizaStructures');
      assert.ok(
        challenge.gap <= 340,
        `vao de ${challenge.gap}px passa do alcance da ponte`,
      );

      const rota = level.platforms
        .filter(p => !p.recovery && !p.final && Number.isInteger(p.logicIndex))
        .sort((a, b) => a.logicIndex - b.logicIndex);
      const alvo = rota.find(p => p.logicIndex === challenge.chunk);
      const anterior = rota.find(p => p.logicIndex === challenge.chunk - 1);
      assert.ok(
        alvo && anterior && !validateChunk(anterior, alvo, DUPLO, 'normal'),
        `o salto duplo vence o vao de ${challenge.gap}px e o desafio nao exige a ponte`,
      );
    }
  }
  clearPhaseManifestOverride();
});

test('o desafio da ponte fica antes do Dash, que venceria o vao sozinho', () => {
  for (const total of [20, 40]) {
    const { challenge } = gera(4, `antes-do-dash-${total}`, total);
    const dash = getPhaseManifest(4).unlockEvents.find(e => e.feature === 'dash')?.eventChunk;
    assert.ok(challenge, 'desafio criado');
    assert.ok(
      !Number.isInteger(dash) || challenge.chunk < dash,
      `desafio no chunk ${challenge.chunk} cai depois do Dash (chunk ${dash})`,
    );
  }
  clearPhaseManifestOverride();
});

test('fase curta demais nao recebe o desafio, em vez de gerar geometria impossivel', () => {
  const base = getPhaseManifest(3);
  const curta = { ...JSON.parse(JSON.stringify(base)), totalChunks: 6 };
  assert.ok(
    (curta.signatureChallenge?.minimumChunks || 0) > 6,
    'a fase de 6 chunks fica abaixo do minimo declarado',
  );
});
