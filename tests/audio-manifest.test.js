// Manifesto de áudio: IDs, caminhos e presença dos arquivos
// ========================================================
//
// Este arquivo é a rede que impede o manifesto de apontar para um arquivo que
// não existe — o erro mais silencioso da integração de áudio, porque o jogo
// continua rodando e só falta som.

import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  AUDIO_DEFAULTS,
  AUDIO_STORAGE_KEY,
  AUDIO_TRACKS,
  AMBIENCE_LAYERS,
  DROP_TRACK_IDS,
  PHASE_MUSIC,
  musicTrackForPhase,
} from '../src/audio-manifest.js';
import { campaignManifest } from '../src/procgen/campaign-manifest.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const faixas = Object.values(AUDIO_TRACKS);

test('os IDs são únicos e batem com a chave do manifesto', () => {
  const ids = faixas.map(track => track.id);
  assert.equal(new Set(ids).size, ids.length, 'nenhum ID repetido');
  for (const [chave, track] of Object.entries(AUDIO_TRACKS)) {
    assert.equal(chave, track.id, `a chave ${chave} precisa bater com o id`);
  }
});

test('todo caminho começa em assets/audio/ e usa barra normal', () => {
  for (const track of faixas) {
    assert.ok(
      track.src.startsWith('assets/audio/'),
      `${track.id}: caminho fora de assets/audio/ (${track.src})`,
    );
    assert.equal(
      track.src.includes('\\'), false,
      `${track.id}: barra invertida do Windows quebraria a URL`,
    );
  }
});

test('nenhum WAV e nenhuma versão _full entram no runtime', () => {
  for (const track of faixas) {
    assert.ok(track.src.endsWith('.ogg'), `${track.id}: só OGG no runtime`);
    assert.equal(
      /_full\.ogg$/.test(track.src), false,
      `${track.id}: as versões _full ficam no ZIP como fonte, não no build`,
    );
  }
});

test('faixas em loop usam arquivos _loop', () => {
  for (const track of faixas) {
    if (!track.loop) continue;
    assert.ok(
      track.src.endsWith('_loop.ogg'),
      `${track.id}: faixa em loop precisa apontar para o arquivo _loop`,
    );
  }
});

test('as oito gotas estão declaradas', () => {
  assert.equal(DROP_TRACK_IDS.length, 8);
  for (const id of DROP_TRACK_IDS) {
    assert.ok(AUDIO_TRACKS[id], `gota ausente: ${id}`);
    assert.equal(AUDIO_TRACKS[id].kind, 'drop');
  }
});

test('as cinco camadas de ambiente estão declaradas', () => {
  assert.equal(AMBIENCE_LAYERS.length, 5);
  for (const id of AMBIENCE_LAYERS) {
    assert.ok(AUDIO_TRACKS[id], `camada ausente: ${id}`);
    assert.equal(AUDIO_TRACKS[id].loop, true, `${id}: ambiente precisa de loop`);
  }
});

test('os efeitos obrigatórios existem', () => {
  for (const id of ['playerJump', 'playerDamage', 'healthLost', 'gameOver', 'phaseVictory', 'campaignVictory']) {
    assert.ok(AUDIO_TRACKS[id], `FX obrigatório ausente: ${id}`);
  }
  // O alternativo de dano fica disponível, mas não é o padrão.
  assert.equal(AUDIO_TRACKS.playerDamage.src.includes('arcade'), true);
  assert.ok(AUDIO_TRACKS.playerDamageAlt, 'o alternativo continua declarado para comparação');
});

test('toda fase da campanha tem música mapeada', () => {
  for (const fase of campaignManifest) {
    const id = musicTrackForPhase(fase.phase);
    assert.ok(AUDIO_TRACKS[id], `fase ${fase.phase}: música ${id} não existe no manifesto`);
    assert.equal(AUDIO_TRACKS[id].kind, 'music');
  }
  // Prólogo também.
  assert.ok(AUDIO_TRACKS[musicTrackForPhase(0)]);
  // O mapeamento biológico do Pacote 01.
  assert.equal(PHASE_MUSIC[2], 'musicRhizobium', 'a fase do Rhizobium usa o tema do Rhizobium');
  assert.equal(PHASE_MUSIC[3], 'musicAzospirillum', 'a fase do Azospirillum usa o tema dele');
  // E nenhuma outra fase usa esses dois temas específicos.
  for (const [fase, id] of Object.entries(PHASE_MUSIC)) {
    if (fase === '2' || fase === '3') continue;
    assert.equal(
      id === 'musicRhizobium' || id === 'musicAzospirillum', false,
      `fase ${fase}: tema de organismo em fase que não é dele`,
    );
  }
});

test('os volumes-padrão e a chave de persistência estão declarados', () => {
  assert.equal(AUDIO_STORAGE_KEY, 'miguelito:audio:v1');
  for (const chave of ['master', 'music', 'ambience', 'drops', 'fx']) {
    assert.ok(Number.isFinite(AUDIO_DEFAULTS[chave]), `volume ${chave} ausente`);
    assert.ok(AUDIO_DEFAULTS[chave] >= 0 && AUDIO_DEFAULTS[chave] <= 1);
  }
});

test('todos os arquivos declarados existem no disco', () => {
  const faltando = faixas
    .filter(track => !fs.existsSync(path.join(raiz, track.src)))
    .map(track => track.src);
  assert.deepEqual(
    faltando, [],
    'arquivos ausentes — extraia o Pacote 01 para assets/audio/:\n  ' + faltando.join('\n  '),
  );
});
