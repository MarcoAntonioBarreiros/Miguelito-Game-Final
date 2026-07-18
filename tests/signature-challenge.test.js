import assert from 'node:assert/strict';
import test from 'node:test';

import { generateLevel } from '../src/procgen/generator.js';
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

test('fase curta demais nao recebe o desafio, em vez de gerar geometria impossivel', () => {
  const base = getPhaseManifest(3);
  const curta = { ...JSON.parse(JSON.stringify(base)), totalChunks: 6 };
  assert.ok(
    (curta.signatureChallenge?.minimumChunks || 0) > 6,
    'a fase de 6 chunks fica abaixo do minimo declarado',
  );
});
