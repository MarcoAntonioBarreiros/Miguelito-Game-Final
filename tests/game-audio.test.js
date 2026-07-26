// Controlador de áudio — comportamento, sem alto-falante
// ======================================================
//
// Tudo aqui roda com fakes injetados: um AudioContext falso que registra os nós
// criados e um `document` falso que devolve elementos de mídia de mentira. O
// objetivo é o COMPORTAMENTO — desbloqueio, crossfade, mute, gotas, destroy —
// não a saída sonora.

import assert from 'node:assert/strict';
import test from 'node:test';

import { createGameAudio, createNoopAudio } from '../src/game-audio.js';
import {
  AMBIENCE_LAYER_GAINS,
  AUDIO_DEFAULTS,
  AUDIO_STORAGE_KEY,
  AUDIO_TRACKS,
  DROP_SCHEDULE,
  migrateAudioSettings,
} from '../src/audio-manifest.js';

// ---------------------------------------------------------------------------
// Bancada
// ---------------------------------------------------------------------------

function fakeParam(value = 0) {
  return {
    value,
    setTargetAtTime(target) { this.value = target; },
    setValueAtTime(target) { this.value = target; },
  };
}

function fakeNode(kind) {
  return {
    kind,
    gain: fakeParam(1),
    pan: fakeParam(0),
    playbackRate: fakeParam(1),
    threshold: fakeParam(0),
    knee: fakeParam(0),
    ratio: fakeParam(1),
    attack: fakeParam(0),
    release: fakeParam(0),
    connect() {},
    disconnect() {},
    start() { this.started = true; },
    stop() {},
  };
}

function fakeAudioContext() {
  const criados = [];
  const context = {
    state: 'suspended',
    currentTime: 0,
    resumeCount: 0,
    suspendCount: 0,
    closeCount: 0,
    createGain() { const node = fakeNode('gain'); criados.push(node); return node; },
    createDynamicsCompressor() { const node = fakeNode('compressor'); criados.push(node); return node; },
    createStereoPanner() { const node = fakeNode('panner'); criados.push(node); return node; },
    createBufferSource() { const node = fakeNode('bufferSource'); criados.push(node); return node; },
    createMediaElementSource(element) {
      const node = fakeNode('mediaSource');
      node.element = element;
      criados.push(node);
      return node;
    },
    decodeAudioData() { return Promise.resolve({ duration: 1 }); },
    resume() { this.resumeCount++; this.state = 'running'; return Promise.resolve(); },
    suspend() { this.suspendCount++; this.state = 'suspended'; return Promise.resolve(); },
    close() { this.closeCount++; this.state = 'closed'; return Promise.resolve(); },
  };
  context.criados = criados;
  return context;
}

function fakeMediaElement() {
  return {
    src: '',
    loop: false,
    preload: '',
    crossOrigin: '',
    currentTime: 0,
    playbackRate: 1,
    paused: true,
    playCount: 0,
    _listeners: new Map(),
    play() { this.paused = false; this.playCount++; return Promise.resolve(); },
    pause() { this.paused = true; },
    addEventListener(type, handler) {
      if (!this._listeners.has(type)) this._listeners.set(type, []);
      this._listeners.get(type).push(handler);
    },
    removeEventListener() {},
    emit(type) { for (const handler of this._listeners.get(type) || []) handler(); },
  };
}

// `unlock()` é assíncrono de verdade: espera o `resume()` resolver, depois os
// ambientes, depois a música. Um `emit()` não espera nada, então os testes
// precisam drenar as microtarefas antes de observar o estado.
async function flush(vezes = 8) {
  for (let i = 0; i < vezes; i++) await new Promise(resolve => setTimeout(resolve, 0));
}

function bancada({ stored = null, random = null, contexts = [] } = {}) {
  const elementos = [];
  const storage = new Map();
  if (stored) storage.set(AUDIO_STORAGE_KEY, JSON.stringify(stored));

  const documentListeners = new Map();
  const documentRef = {
    hidden: false,
    createElement() { const element = fakeMediaElement(); elementos.push(element); return element; },
    addEventListener(type, handler) {
      if (!documentListeners.has(type)) documentListeners.set(type, []);
      documentListeners.get(type).push(handler);
    },
    removeEventListener(type, handler) {
      const lista = documentListeners.get(type) || [];
      const index = lista.indexOf(handler);
      if (index >= 0) lista.splice(index, 1);
    },
    emit(type) { for (const handler of documentListeners.get(type) || []) handler(); },
    get listenerCount() {
      return [...documentListeners.values()].reduce((sum, lista) => sum + lista.length, 0);
    },
  };

  const windowListeners = new Map();
  const windowRef = {
    AudioContext: function FakeAudioContext() {
      const context = fakeAudioContext();
      contexts.push(context);
      return context;
    },
    localStorage: {
      getItem: key => (storage.has(key) ? storage.get(key) : null),
      setItem: (key, value) => storage.set(key, value),
    },
    fetch: () => Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) }),
    addEventListener(type, handler) {
      if (!windowListeners.has(type)) windowListeners.set(type, []);
      windowListeners.get(type).push(handler);
    },
    removeEventListener(type, handler) {
      const lista = windowListeners.get(type) || [];
      const index = lista.indexOf(handler);
      if (index >= 0) lista.splice(index, 1);
    },
    emit(type) { for (const handler of [...(windowListeners.get(type) || [])]) handler(); },
    get listenerCount() {
      return [...windowListeners.values()].reduce((sum, lista) => sum + lista.length, 0);
    },
  };

  let valores = [0.5];
  let indice = 0;
  const rng = random || (() => {
    const valor = valores[indice % valores.length];
    indice++;
    return valor;
  });

  const state = {
    gameState: 'play',
    tutorialOpen: false,
    player: { supportPlatform: null },
    campaign: { phase: 1 },
  };
  const campaign = { phase: 1 };

  const audio = createGameAudio({
    documentRef,
    windowRef,
    getState: () => state,
    getCampaign: () => campaign,
    random: rng,
  });

  return {
    audio, documentRef, windowRef, state, campaign, elementos, contexts, storage,
    setRandomSequence(lista) { valores = lista; indice = 0; },
    get storedSettings() {
      const raw = storage.get(AUDIO_STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    },
  };
}

// ---------------------------------------------------------------------------
// Ciclo de vida
// ---------------------------------------------------------------------------

test('o controlador nasce bloqueado e silencioso', () => {
  const b = bancada();
  b.audio.init();
  assert.equal(b.audio.isUnlocked(), false, 'nada toca antes da interação');
  const snapshot = b.audio.debugSnapshot();
  assert.equal(snapshot.available, true);
  assert.equal(snapshot.unlocked, false);
  assert.equal(snapshot.musicTrackId, null, 'nenhuma música iniciada');
});

test('init chamado duas vezes não cria um segundo AudioContext', () => {
  const contexts = [];
  const b = bancada({ contexts });
  b.audio.init();
  b.audio.init();
  b.audio.init();
  assert.equal(contexts.length, 1, 'um único AudioContext');
});

test('a primeira interação desbloqueia e inicia música e ambientes', async () => {
  const b = bancada();
  b.audio.init();
  assert.equal(b.audio.isUnlocked(), false);

  b.windowRef.emit('pointerdown');
  await flush();

  assert.equal(b.audio.isUnlocked(), true);
  const snapshot = b.audio.debugSnapshot();
  assert.equal(snapshot.contextState, 'running');
  assert.equal(snapshot.musicTrackId, 'musicTitle', 'fase 1 usa o tema geral');
  assert.equal(snapshot.ambienceLayers.length, 5, 'as cinco camadas entram juntas');
});

test('os listeners de desbloqueio são removidos depois de usados', async () => {
  const b = bancada();
  b.audio.init();
  const antes = b.windowRef.listenerCount;
  assert.ok(antes >= 3, 'pointerdown, touchstart e keydown');
  b.windowRef.emit('keydown');
  await flush();
  assert.ok(b.windowRef.listenerCount < antes, 'os temporários saem após o unlock');
});

// ---------------------------------------------------------------------------
// Música e crossfade
// ---------------------------------------------------------------------------

test('a mesma fase não reinicia a música', async () => {
  const b = bancada();
  b.audio.init();
  await b.audio.unlock();
  const deck = b.elementos.find(element => element.src.includes('music_title'));
  const reproducoes = deck.playCount;

  await b.audio.setPhase(1);
  await b.audio.setPhase(1);
  assert.equal(deck.playCount, reproducoes, 'nenhum replay da mesma faixa');
  assert.equal(b.audio.debugSnapshot().musicTrackId, 'musicTitle');
});

test('fase 1 → 2 troca para Rhizobium com crossfade', async () => {
  const b = bancada();
  b.audio.init();
  await b.audio.unlock();
  assert.equal(b.audio.debugSnapshot().musicTrackId, 'musicTitle');

  await b.audio.setPhase(2);
  const snapshot = b.audio.debugSnapshot();
  assert.equal(snapshot.musicTrackId, 'musicRhizobium');
  assert.equal(snapshot.crossfadingTo, 'musicRhizobium', 'o crossfade está em curso');
  assert.ok(
    b.elementos.some(element => element.src.includes('music_rhizobium_symbiosis_loop.ogg')),
    'a faixa nova foi carregada num deck',
  );
});

test('fase 2 → 3 troca para Azospirillum', async () => {
  const b = bancada();
  b.audio.init();
  await b.audio.unlock();
  await b.audio.setPhase(2);
  await b.audio.setPhase(3);
  assert.equal(b.audio.debugSnapshot().musicTrackId, 'musicAzospirillum');
  assert.ok(b.elementos.some(element => element.src.includes('music_azospirillum_growth_loop.ogg')));
});

test('só existem dois decks de música, por mais trocas que aconteçam', async () => {
  const b = bancada();
  b.audio.init();
  await b.audio.unlock();
  for (const fase of [2, 3, 1, 2, 3, 4, 2]) await b.audio.setPhase(fase);
  const decks = b.elementos.filter(element => element.src.includes('/music/'));
  assert.ok(decks.length <= 2, `esperava no máximo 2 decks, veio ${decks.length}`);
});

// ---------------------------------------------------------------------------
// Mute e persistência
// ---------------------------------------------------------------------------

test('mute zera o master e desmutar restaura', async () => {
  const b = bancada();
  b.audio.init();
  await b.audio.unlock();

  assert.equal(b.audio.isMuted(), false);
  assert.equal(await b.audio.toggleMute(), true);
  assert.equal(b.audio.isMuted(), true);
  assert.equal(b.audio.debugSnapshot().muted, true);

  assert.equal(await b.audio.toggleMute(), false);
  assert.equal(b.audio.isMuted(), false);
});

test('o mute é persistido e relido na próxima sessão', async () => {
  const b = bancada();
  b.audio.init();
  await b.audio.setMuted(true);
  assert.equal(b.storedSettings.muted, true, 'gravou no localStorage');

  const outra = bancada({ stored: b.storedSettings });
  outra.audio.init();
  assert.equal(outra.audio.isMuted(), true, 'a preferência sobrevive ao recarregar');
});

test('localStorage indisponível não quebra o controlador', async () => {
  const b = bancada();
  b.windowRef.localStorage = {
    getItem() { throw new Error('bloqueado'); },
    setItem() { throw new Error('bloqueado'); },
  };
  const audio = createGameAudio({
    documentRef: b.documentRef,
    windowRef: b.windowRef,
    getState: () => b.state,
    getCampaign: () => b.campaign,
  });
  audio.init();
  await assert.doesNotReject(() => audio.setMuted(true));
  assert.equal(audio.isMuted(), true);
});

test('mutado, nenhum FX é disparado', async () => {
  const b = bancada();
  b.audio.init();
  await b.audio.unlock();
  await b.audio.setMuted(true);
  assert.equal(b.audio.playFx('playerJump'), false);
  assert.equal(b.audio.playStinger('phaseVictory'), false);
});

// ---------------------------------------------------------------------------
// Gotas
// ---------------------------------------------------------------------------

test('o scheduler mantém no máximo uma gota ativa', async () => {
  const b = bancada();
  b.audio.init();
  await b.audio.unlock();

  // Avança bem além da janela máxima: mesmo assim, uma só.
  for (let i = 0; i < 400; i++) b.audio.update(0.1);
  const tocando = b.elementos.filter(element => element.src.includes('/drops/') && !element.paused);
  assert.equal(tocando.length, 1, 'uma gota por vez');
});

test('a gota não repete imediatamente a mesma amostra', async () => {
  const b = bancada();
  b.audio.init();
  await b.audio.unlock();

  const sequencia = [];
  for (let ciclo = 0; ciclo < 6; ciclo++) {
    for (let i = 0; i < 200 && !b.audio.debugSnapshot().currentDrop; i++) b.audio.update(0.1);
    const atual = b.audio.debugSnapshot().currentDrop;
    if (!atual) break;
    sequencia.push(atual);
    // Termina a gota para liberar a próxima.
    const element = b.elementos.find(el => el.src.includes(atual.replace('dropEco', 'gota_eco_')));
    element?.emit('ended');
  }
  assert.ok(sequencia.length >= 3, `esperava várias gotas, veio ${sequencia.length}`);
  for (let i = 1; i < sequencia.length; i++) {
    assert.notEqual(sequencia[i], sequencia[i - 1], 'nenhuma gota repete em seguida');
  }
});

test('o scheduler usa o RNG injetado, não o da campanha', async () => {
  let chamadas = 0;
  const b = bancada({ random: () => { chamadas++; return 0.42; } });
  b.audio.init();
  await b.audio.unlock();
  for (let i = 0; i < 300; i++) b.audio.update(0.1);
  assert.ok(chamadas > 0, 'o controlador consome o próprio RNG');
});

test('a janela entre gotas respeita o intervalo declarado', async () => {
  const b = bancada({ random: () => 0 });
  b.audio.init();
  await b.audio.unlock();
  const snapshot = b.audio.debugSnapshot();
  assert.ok(
    snapshot.nextDropIn === null || snapshot.nextDropIn <= DROP_SCHEDULE.maximumSeconds,
    'a próxima gota nunca é agendada além do máximo',
  );
});

test('gotas não tocam em respawning, end ou documento oculto', () => {
  for (const cenario of ['respawning', 'end']) {
    const b = bancada();
    b.audio.init();
    b.windowRef.emit('pointerdown');
    b.state.gameState = cenario;
    for (let i = 0; i < 300; i++) b.audio.update(0.1);
    assert.equal(b.audio.debugSnapshot().currentDrop, null, `nenhuma gota em ${cenario}`);
  }

  const oculto = bancada();
  oculto.audio.init();
  oculto.windowRef.emit('pointerdown');
  oculto.documentRef.hidden = true;
  for (let i = 0; i < 300; i++) oculto.audio.update(0.1);
  assert.equal(oculto.audio.debugSnapshot().currentDrop, null, 'nenhuma gota com a aba oculta');
});

// ---------------------------------------------------------------------------
// Ambiente dinâmico
// ---------------------------------------------------------------------------

test('o fluxo interno sobe sobre raiz e desce fora dela', async () => {
  const b = bancada();
  b.audio.init();
  await b.audio.unlock();

  for (let i = 0; i < 60; i++) b.audio.update(1 / 60);
  const fora = b.audio.debugSnapshot().internalRootFlow;

  b.state.player.supportPlatform = { type: 'root' };
  for (let i = 0; i < 120; i++) b.audio.update(1 / 60);
  const sobre = b.audio.debugSnapshot().internalRootFlow;

  assert.ok(sobre > fora, `sobre a raiz o fluxo aumenta (${fora} → ${sobre})`);

  b.state.player.supportPlatform = { type: 'soil' };
  for (let i = 0; i < 180; i++) b.audio.update(1 / 60);
  assert.ok(b.audio.debugSnapshot().internalRootFlow < sobre, 'e volta a cair fora da raiz');
});

test('os ambientes não são reiniciados a cada troca de fase', async () => {
  const b = bancada();
  b.audio.init();
  await b.audio.unlock();
  const camada = b.elementos.find(element => element.src.includes('ambience_cave_base_loop'));
  const reproducoes = camada.playCount;

  await b.audio.setPhase(2);
  await b.audio.setPhase(3);
  assert.equal(camada.playCount, reproducoes, 'o ambiente é contínuo entre fases');
});

// ---------------------------------------------------------------------------
// Visibilidade e destruição
// ---------------------------------------------------------------------------

test('esconder o documento suspende o contexto', async () => {
  const contexts = [];
  const b = bancada({ contexts });
  b.audio.init();
  await b.audio.unlock();
  assert.equal(contexts[0].state, 'running');

  b.documentRef.hidden = true;
  b.documentRef.emit('visibilitychange');
  b.audio.suspend();
  assert.equal(contexts[0].state, 'suspended');

  b.documentRef.hidden = false;
  b.documentRef.emit('visibilitychange');
  assert.equal(contexts[0].state, 'running', 'voltar retoma sem reiniciar a música');
  assert.equal(b.audio.debugSnapshot().musicTrackId, 'musicTitle');
});

test('destroy fecha o contexto e remove os listeners', async () => {
  const contexts = [];
  const b = bancada({ contexts });
  b.audio.init();
  await b.audio.unlock();
  const listenersAntes = b.documentRef.listenerCount;
  assert.ok(listenersAntes > 0);

  b.audio.destroy();
  assert.equal(contexts[0].closeCount, 1, 'o contexto é fechado');
  assert.equal(b.documentRef.listenerCount, 0, 'nenhum listener sobra');
  assert.doesNotThrow(() => b.audio.update(0.1), 'update após destroy é inofensivo');
});

// ---------------------------------------------------------------------------
// Robustez
// ---------------------------------------------------------------------------

test('falha ao carregar um FX não lança exceção nem repete o fetch do mesmo arquivo', async () => {
  const b = bancada();
  const porArquivo = new Map();
  b.windowRef.fetch = url => {
    porArquivo.set(url, (porArquivo.get(url) || 0) + 1);
    return Promise.resolve({ ok: false, status: 404 });
  };
  b.audio.init();
  await b.audio.unlock();
  await flush();

  assert.doesNotThrow(() => b.audio.playFx('playerJump'));
  await flush();
  assert.doesNotThrow(() => b.audio.playFx('playerJump'));
  await flush();

  // O preload já busca os quatro efeitos curtos — o que não pode acontecer é o
  // MESMO arquivo ser buscado de novo depois de falhar.
  for (const [url, vezes] of porArquivo) {
    assert.equal(vezes, 1, `${url} foi buscado ${vezes} vezes`);
  }
  assert.ok(
    b.audio.debugSnapshot().errors.some(mensagem => mensagem.includes('playerJump')),
    'o erro aparece no debug',
  );
  assert.ok(b.audio.debugSnapshot().lastPlaybackError, 'e fica registrado como último erro');
});

test('sem AudioContext no navegador, o controlador vira silencioso', () => {
  const b = bancada();
  const audio = createGameAudio({
    documentRef: b.documentRef,
    windowRef: { ...b.windowRef, AudioContext: undefined, webkitAudioContext: undefined },
  });
  audio.init();
  assert.equal(audio.debugSnapshot().available, false);
  assert.doesNotThrow(() => { audio.update(0.1); audio.setPhase(3); audio.playFx('playerJump'); });
});

test('disabled cria um controlador silencioso com a API completa', () => {
  const audio = createGameAudio({ disabled: true });
  for (const metodo of [
    'init', 'unlock', 'update', 'setPhase', 'playFx', 'playStinger',
    'toggleMute', 'setMuted', 'isMuted', 'isUnlocked', 'suspend', 'resume',
    'destroy', 'debugSnapshot',
  ]) {
    assert.equal(typeof audio[metodo], 'function', `método ausente: ${metodo}`);
  }
  assert.equal(audio.isUnlocked(), false);
  assert.equal(audio.playFx('playerJump'), false);
});

test('createNoopAudio expõe a mesma superfície', () => {
  const noop = createNoopAudio();
  assert.equal(noop.debugSnapshot().available, false);
  assert.doesNotThrow(() => { noop.update(0.1); noop.toneNow(440); noop.destroy(); });
});

test('toneNow não produz mais a trilha sintetizada antiga', async () => {
  const b = bancada();
  b.audio.init();
  await b.audio.unlock();
  const criadosAntes = b.contexts[0].criados.length;
  b.audio.toneNow(330, 0.1, 'triangle', 0.07);
  assert.equal(
    b.contexts[0].criados.length, criadosAntes,
    'nenhum oscilador é criado: a trilha do protótipo não briga com a música real',
  );
});

// ---------------------------------------------------------------------------
// DESBLOQUEIO ASSÍNCRONO
// ---------------------------------------------------------------------------

test('unlock não marca unlocked antes de a Promise do resume resolver', async () => {
  const b = bancada();
  let liberar = null;
  b.audio.init();
  const context = b.contexts[0];
  context.resume = function () {
    return new Promise(resolve => {
      liberar = () => { this.state = 'running'; resolve(); };
    });
  };

  const promessa = b.audio.unlock();
  await flush(2);
  assert.equal(b.audio.isUnlocked(), false, 'ainda esperando o resume');
  assert.equal(b.audio.debugSnapshot().musicTrackId, null, 'nenhuma mídia iniciada antes');

  liberar();
  assert.equal(await promessa, true);
  assert.equal(b.audio.isUnlocked(), true);
  assert.ok(b.audio.debugSnapshot().musicTrackId, 'só então a música começa');
});

test('resume rejeitado deixa o áudio bloqueado e registra o erro', async () => {
  const b = bancada();
  b.audio.init();
  b.contexts[0].resume = () => Promise.reject(new Error('recusado pelo navegador'));

  assert.equal(await b.audio.unlock(), false);
  assert.equal(b.audio.isUnlocked(), false, 'não finge que desbloqueou');
  assert.ok(
    b.audio.debugSnapshot().errors.some(m => m.includes('recusado pelo navegador')),
    'o motivo fica no debug',
  );
});

test('contexto que continua suspenso não conta como desbloqueado', async () => {
  const b = bancada();
  b.audio.init();
  b.contexts[0].resume = function () { this.state = 'suspended'; return Promise.resolve(); };

  assert.equal(await b.audio.unlock(), false);
  assert.equal(b.audio.isUnlocked(), false);
  assert.ok(b.audio.debugSnapshot().errors.some(m => m.includes('permaneceu em suspended')));
});

test('play recusado é registrado sem travar o jogo', async () => {
  const b = bancada();
  b.audio.init();
  const originalCreate = b.documentRef.createElement;
  b.documentRef.createElement = () => {
    const element = originalCreate.call(b.documentRef);
    element.play = () => Promise.reject(new Error('NotAllowedError'));
    return element;
  };

  assert.equal(await b.audio.unlock(), true, 'o contexto retomou; a mídia é que falhou');
  const snapshot = b.audio.debugSnapshot();
  assert.ok(snapshot.errors.some(m => m.includes('NotAllowedError')), 'a recusa aparece no debug');
  assert.ok(snapshot.lastPlaybackError, 'e fica em lastPlaybackError');
  assert.doesNotThrow(() => b.audio.update(0.1));
});

test('unlock chamado duas vezes não duplica ambientes nem schedulers', async () => {
  const contexts = [];
  const b = bancada({ contexts });
  b.audio.init();
  await b.audio.unlock();
  const ambientesAntes = b.elementos.filter(e => e.src.includes('/ambience/') && !e.src.includes('/drops/')).length;
  const proximaGota = b.audio.debugSnapshot().nextDropIn;

  await b.audio.unlock();
  await b.audio.unlock();

  assert.equal(contexts.length, 1, 'um único AudioContext');
  const ambientesDepois = b.elementos.filter(e => e.src.includes('/ambience/') && !e.src.includes('/drops/')).length;
  assert.equal(ambientesDepois, ambientesAntes, 'nenhuma camada duplicada');
  assert.equal(
    b.audio.debugSnapshot().nextDropIn, proximaGota,
    'o scheduler não é rearmado do zero',
  );
});

test('desmutar repara uma reprodução que havia falhado', async () => {
  const b = bancada();
  b.audio.init();
  await b.audio.unlock();
  // Simula mídia que parou (o navegador recusou no primeiro unlock).
  for (const element of b.elementos) element.paused = true;
  await b.audio.setMuted(true);

  await b.audio.setMuted(false);
  const tocando = b.elementos.filter(e => !e.paused);
  assert.ok(tocando.length > 0, 'desmutar volta a tocar, não só sobe o ganho');
});

test('ensureExpectedMediaPlayback não cria um segundo MediaElementSource', async () => {
  const contexts = [];
  const b = bancada({ contexts });
  b.audio.init();
  await b.audio.unlock();
  const fontesAntes = contexts[0].criados.filter(n => n.kind === 'mediaSource').length;

  for (const element of b.elementos) element.paused = true;
  await b.audio.ensureExpectedMediaPlayback();

  const fontesDepois = contexts[0].criados.filter(n => n.kind === 'mediaSource').length;
  assert.equal(fontesDepois, fontesAntes, 'reaproveita os nós existentes');
});

// ---------------------------------------------------------------------------
// ESTADO PARA A INTERFACE
// ---------------------------------------------------------------------------

test('getUiState distingue bloqueado, audível, mudo e indisponível', async () => {
  const b = bancada();
  b.audio.init();

  const bloqueado = b.audio.getUiState();
  assert.deepEqual(bloqueado, { available: true, unlocked: false, muted: false, audible: false });

  await b.audio.unlock();
  assert.deepEqual(b.audio.getUiState(), { available: true, unlocked: true, muted: false, audible: true });

  await b.audio.setMuted(true);
  const mudo = b.audio.getUiState();
  assert.equal(mudo.muted, true);
  assert.equal(mudo.audible, false, 'mudo não é audível');

  const indisponivel = createGameAudio({
    documentRef: b.documentRef,
    windowRef: { ...b.windowRef, AudioContext: undefined, webkitAudioContext: undefined },
  });
  assert.equal(indisponivel.getUiState().available, false);
});

// ---------------------------------------------------------------------------
// MIGRAÇÃO v1 → v2
// ---------------------------------------------------------------------------

test('configuração v1 no padrão antigo é migrada para os novos volumes', () => {
  const migrada = migrateAudioSettings({ muted: false, master: 1, music: 0.35, ambience: 0.20, drops: 0.15, fx: 0.35 });
  assert.equal(migrada.ambience, AUDIO_DEFAULTS.ambience, 'ambiente sobe');
  assert.equal(migrada.drops, AUDIO_DEFAULTS.drops, 'gotas descem');
  assert.equal(migrada.version, 2);
});

test('a migração preserva o mute salvo', () => {
  assert.equal(migrateAudioSettings({ muted: true, ambience: 0.20, drops: 0.15 }).muted, true);
  assert.equal(migrateAudioSettings({ muted: false, ambience: 0.20, drops: 0.15 }).muted, false);
});

test('a migração preserva volumes que o jogador realmente personalizou', () => {
  const migrada = migrateAudioSettings({ muted: false, ambience: 0.40, drops: 0.02, music: 0.5, master: 0.8 });
  assert.equal(migrada.ambience, 0.40, 'escolha do jogador não é sobrescrita');
  assert.equal(migrada.drops, 0.02);
  assert.equal(migrada.music, 0.5);
  assert.equal(migrada.master, 0.8);
});

test('configuração já em v2 passa intacta', () => {
  const original = { version: 2, muted: true, master: 0.9, music: 0.3, ambience: 0.5, drops: 0.1, fx: 0.4, stinger: 0.7 };
  assert.deepEqual(migrateAudioSettings(original), { ...AUDIO_DEFAULTS, ...original });
});

test('o controlador lê a configuração v1 gravada e aplica os novos volumes', () => {
  const b = bancada();
  b.storage.set('miguelito:audio:v1', JSON.stringify({ muted: true, ambience: 0.20, drops: 0.15 }));
  const audio = createGameAudio({
    documentRef: b.documentRef,
    windowRef: b.windowRef,
    getState: () => b.state,
    getCampaign: () => b.campaign,
  });
  audio.init();
  assert.equal(audio.isMuted(), true, 'o mute antigo é respeitado');
  assert.equal(audio.debugSnapshot().ambienceBus, AUDIO_DEFAULTS.ambience, 'e o ambiente já vem no valor novo');
  assert.equal(audio.debugSnapshot().dropBus, AUDIO_DEFAULTS.drops);
  assert.equal(audio.debugSnapshot().storageVersion, 2);
});

// ---------------------------------------------------------------------------
// MIXAGEM
// ---------------------------------------------------------------------------

test('a base da caverna tem ganho efetivo ambience × caveBase', async () => {
  const b = bancada();
  b.audio.init();
  await b.audio.unlock();
  const snapshot = b.audio.debugSnapshot();
  assert.ok(
    Math.abs(snapshot.caveBaseEffectiveGain - AUDIO_DEFAULTS.ambience * AMBIENCE_LAYER_GAINS.caveBase) < 1e-9,
    `esperava ${AUDIO_DEFAULTS.ambience * AMBIENCE_LAYER_GAINS.caveBase}, veio ${snapshot.caveBaseEffectiveGain}`,
  );
  // E a caverna precisa ser mais presente que os detalhes.
  assert.ok(AMBIENCE_LAYER_GAINS.caveBase > AMBIENCE_LAYER_GAINS.rhizosphereDetail);
});

test('as gotas ficam bem abaixo da música e dos efeitos', () => {
  assert.ok(AUDIO_DEFAULTS.drops < AUDIO_DEFAULTS.music, 'gota não compete com a música');
  assert.ok(AUDIO_DEFAULTS.drops < AUDIO_DEFAULTS.fx, 'nem com os efeitos');
  assert.ok(AUDIO_DEFAULTS.drops <= 0.06, `gotas precisam estar discretas, veio ${AUDIO_DEFAULTS.drops}`);
});

test('o ambiente sobe mas continua abaixo da música', () => {
  assert.ok(AUDIO_DEFAULTS.ambience > 0.20, 'a caverna era quase inaudível');
  assert.ok(AUDIO_DEFAULTS.ambience < AUDIO_DEFAULTS.music, 'e não pode passar a música');
});

test('o salto usa ganho reduzido no manifesto, não um corte escondido no barramento', () => {
  assert.equal(AUDIO_TRACKS.playerJump.defaultGain, 0.45);
  // O barramento de FX continua no valor comum: dano, morte e vitória não foram
  // reduzidos junto com o salto.
  assert.equal(AUDIO_DEFAULTS.fx, 0.35);
  assert.equal(AUDIO_TRACKS.playerDamage.defaultGain, 1);
  assert.equal(AUDIO_TRACKS.gameOver.defaultGain, 1);
});

test('o stinger tem barramento próprio, separado do de efeitos', async () => {
  const contexts = [];
  const b = bancada({ contexts });
  b.audio.init();
  await b.audio.unlock();
  // Cinco barramentos + master + compressor: música, ambiente, gotas, fx, stinger.
  const ganhos = contexts[0].criados.filter(n => n.kind === 'gain');
  assert.ok(ganhos.length >= 6, `esperava ao menos 6 nós de ganho, veio ${ganhos.length}`);
  assert.ok(Number.isFinite(AUDIO_DEFAULTS.stinger), 'o stinger tem volume próprio');
});

// ---------------------------------------------------------------------------
// VITÓRIA
// ---------------------------------------------------------------------------

test('a vitória suprime a música, abaixa o ambiente e para as gotas', async () => {
  const b = bancada();
  b.audio.init();
  await b.audio.unlock();
  assert.equal(b.audio.debugSnapshot().musicSuppression, 1);

  b.audio.beginPhaseVictory();
  for (let i = 0; i < 90; i++) b.audio.update(1 / 60);

  const snapshot = b.audio.debugSnapshot();
  assert.ok(snapshot.musicSuppression < 0.05, `a música da fase precisa sumir (${snapshot.musicSuppression})`);
  assert.equal(snapshot.activeStinger, 'phaseVictory');
  // Gotas interrompidas durante a vitória.
  for (let i = 0; i < 400; i++) b.audio.update(0.1);
  assert.equal(b.audio.debugSnapshot().currentDrop, null, 'nenhuma gota sobre a vitória');
});

test('a vitória de fase não toca duas vezes', async () => {
  const b = bancada();
  b.audio.init();
  await b.audio.unlock();
  assert.equal(b.audio.beginPhaseVictory(), true);
  assert.equal(b.audio.beginPhaseVictory(), false, 'o quadro seguinte não repete');
});

test('a próxima fase encerra a vitória e devolve a música', async () => {
  const b = bancada();
  b.audio.init();
  await b.audio.unlock();
  b.audio.beginPhaseVictory();
  for (let i = 0; i < 90; i++) b.audio.update(1 / 60);

  b.audio.endPhaseVictory();
  // O scheduler é rearmado na hora, com a espera longa: nenhuma gota cai em cima
  // do crossfade da música nova.
  assert.ok(
    b.audio.debugSnapshot().nextDropIn >= DROP_SCHEDULE.firstDelaySeconds - 0.01,
    'as gotas voltam só depois de alguns segundos',
  );

  await b.audio.setPhase(2);
  for (let i = 0; i < 120; i++) b.audio.update(1 / 60);

  const snapshot = b.audio.debugSnapshot();
  assert.ok(snapshot.musicSuppression > 0.95, 'a música da fase nova volta ao volume');
  assert.equal(snapshot.musicTrackId, 'musicRhizobium');
  assert.equal(snapshot.currentDrop, null, 'e nenhuma gota tocou durante a transição');
});

test('a vitória de campanha não toca junto com a de fase', async () => {
  const b = bancada();
  b.audio.init();
  await b.audio.unlock();
  b.audio.beginPhaseVictory({ campaign: true });
  assert.equal(b.audio.debugSnapshot().activeStinger, 'campaignVictory');
  // Um stinger por vez: pedir de novo não sobrepõe.
  assert.equal(b.audio.beginPhaseVictory({ campaign: true }), false);
});

test('a primeira gota espera alguns segundos', async () => {
  const b = bancada();
  b.audio.init();
  await b.audio.unlock();
  const snapshot = b.audio.debugSnapshot();
  assert.ok(
    snapshot.nextDropIn >= DROP_SCHEDULE.firstDelaySeconds - 0.01,
    `a primeira gota não pode cair junto com o fade-in (${snapshot.nextDropIn})`,
  );
});

test('preloadShortFx roda no unlock e carrega os efeitos curtos', async () => {
  const b = bancada();
  const buscados = [];
  b.windowRef.fetch = url => {
    buscados.push(url);
    return Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) });
  };
  b.audio.init();
  await b.audio.unlock();
  await flush();

  for (const id of ['playerJump', 'playerDamage', 'healthLost', 'gameOver']) {
    assert.ok(
      buscados.some(url => url === AUDIO_TRACKS[id].src),
      `${id} precisa ser precarregado — senão o primeiro uso sai sem som`,
    );
  }
  // Stingers longos NÃO viram AudioBuffer obrigatório.
  assert.equal(buscados.includes(AUDIO_TRACKS.campaignVictory.src), false);
  assert.ok(b.audio.debugSnapshot().fxLoaded.includes('playerJump'));
});

test('o primeiro salto encontra o buffer já carregado', async () => {
  const b = bancada();
  b.audio.init();
  await b.audio.unlock();
  await flush();
  assert.equal(b.audio.playFx('playerJump', { gain: 1, rate: 1 }), true, 'toca de imediato');
});
