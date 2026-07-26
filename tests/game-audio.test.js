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
  AUDIO_STORAGE_KEY,
  DROP_SCHEDULE,
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

test('a primeira interação desbloqueia e inicia música e ambientes', () => {
  const b = bancada();
  b.audio.init();
  assert.equal(b.audio.isUnlocked(), false);

  b.windowRef.emit('pointerdown');

  assert.equal(b.audio.isUnlocked(), true);
  const snapshot = b.audio.debugSnapshot();
  assert.equal(snapshot.contextState, 'running');
  assert.equal(snapshot.musicTrackId, 'musicTitle', 'fase 1 usa o tema geral');
  assert.equal(snapshot.ambienceLayers.length, 5, 'as cinco camadas entram juntas');
});

test('os listeners de desbloqueio são removidos depois de usados', () => {
  const b = bancada();
  b.audio.init();
  const antes = b.windowRef.listenerCount;
  assert.ok(antes >= 3, 'pointerdown, touchstart e keydown');
  b.windowRef.emit('keydown');
  assert.ok(b.windowRef.listenerCount < antes, 'os temporários saem após o unlock');
});

// ---------------------------------------------------------------------------
// Música e crossfade
// ---------------------------------------------------------------------------

test('a mesma fase não reinicia a música', () => {
  const b = bancada();
  b.audio.init();
  b.windowRef.emit('pointerdown');
  const deck = b.elementos.find(element => element.src.includes('music_title'));
  const reproducoes = deck.playCount;

  b.audio.setPhase(1);
  b.audio.setPhase(1);
  assert.equal(deck.playCount, reproducoes, 'nenhum replay da mesma faixa');
  assert.equal(b.audio.debugSnapshot().musicTrackId, 'musicTitle');
});

test('fase 1 → 2 troca para Rhizobium com crossfade', () => {
  const b = bancada();
  b.audio.init();
  b.windowRef.emit('pointerdown');
  assert.equal(b.audio.debugSnapshot().musicTrackId, 'musicTitle');

  b.audio.setPhase(2);
  const snapshot = b.audio.debugSnapshot();
  assert.equal(snapshot.musicTrackId, 'musicRhizobium');
  assert.equal(snapshot.crossfadingTo, 'musicRhizobium', 'o crossfade está em curso');
  assert.ok(
    b.elementos.some(element => element.src.includes('music_rhizobium_symbiosis_loop.ogg')),
    'a faixa nova foi carregada num deck',
  );
});

test('fase 2 → 3 troca para Azospirillum', () => {
  const b = bancada();
  b.audio.init();
  b.windowRef.emit('pointerdown');
  b.audio.setPhase(2);
  b.audio.setPhase(3);
  assert.equal(b.audio.debugSnapshot().musicTrackId, 'musicAzospirillum');
  assert.ok(b.elementos.some(element => element.src.includes('music_azospirillum_growth_loop.ogg')));
});

test('só existem dois decks de música, por mais trocas que aconteçam', () => {
  const b = bancada();
  b.audio.init();
  b.windowRef.emit('pointerdown');
  for (const fase of [2, 3, 1, 2, 3, 4, 2]) b.audio.setPhase(fase);
  const decks = b.elementos.filter(element => element.src.includes('/music/'));
  assert.ok(decks.length <= 2, `esperava no máximo 2 decks, veio ${decks.length}`);
});

// ---------------------------------------------------------------------------
// Mute e persistência
// ---------------------------------------------------------------------------

test('mute zera o master e desmutar restaura', () => {
  const b = bancada();
  b.audio.init();
  b.windowRef.emit('pointerdown');

  assert.equal(b.audio.isMuted(), false);
  assert.equal(b.audio.toggleMute(), true);
  assert.equal(b.audio.isMuted(), true);
  assert.equal(b.audio.debugSnapshot().muted, true);

  assert.equal(b.audio.toggleMute(), false);
  assert.equal(b.audio.isMuted(), false);
});

test('o mute é persistido e relido na próxima sessão', () => {
  const b = bancada();
  b.audio.init();
  b.audio.setMuted(true);
  assert.equal(b.storedSettings.muted, true, 'gravou no localStorage');

  const outra = bancada({ stored: b.storedSettings });
  outra.audio.init();
  assert.equal(outra.audio.isMuted(), true, 'a preferência sobrevive ao recarregar');
});

test('localStorage indisponível não quebra o controlador', () => {
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
  assert.doesNotThrow(() => audio.setMuted(true));
  assert.equal(audio.isMuted(), true);
});

test('mutado, nenhum FX é disparado', () => {
  const b = bancada();
  b.audio.init();
  b.windowRef.emit('pointerdown');
  b.audio.setMuted(true);
  assert.equal(b.audio.playFx('playerJump'), false);
  assert.equal(b.audio.playStinger('phaseVictory'), false);
});

// ---------------------------------------------------------------------------
// Gotas
// ---------------------------------------------------------------------------

test('o scheduler mantém no máximo uma gota ativa', () => {
  const b = bancada();
  b.audio.init();
  b.windowRef.emit('pointerdown');

  // Avança bem além da janela máxima: mesmo assim, uma só.
  for (let i = 0; i < 400; i++) b.audio.update(0.1);
  const tocando = b.elementos.filter(element => element.src.includes('/drops/') && !element.paused);
  assert.equal(tocando.length, 1, 'uma gota por vez');
});

test('a gota não repete imediatamente a mesma amostra', () => {
  const b = bancada();
  b.audio.init();
  b.windowRef.emit('pointerdown');

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

test('o scheduler usa o RNG injetado, não o da campanha', () => {
  let chamadas = 0;
  const b = bancada({ random: () => { chamadas++; return 0.42; } });
  b.audio.init();
  b.windowRef.emit('pointerdown');
  for (let i = 0; i < 300; i++) b.audio.update(0.1);
  assert.ok(chamadas > 0, 'o controlador consome o próprio RNG');
});

test('a janela entre gotas respeita o intervalo declarado', () => {
  const b = bancada({ random: () => 0 });
  b.audio.init();
  b.windowRef.emit('pointerdown');
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

test('o fluxo interno sobe sobre raiz e desce fora dela', () => {
  const b = bancada();
  b.audio.init();
  b.windowRef.emit('pointerdown');

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

test('os ambientes não são reiniciados a cada troca de fase', () => {
  const b = bancada();
  b.audio.init();
  b.windowRef.emit('pointerdown');
  const camada = b.elementos.find(element => element.src.includes('ambience_cave_base_loop'));
  const reproducoes = camada.playCount;

  b.audio.setPhase(2);
  b.audio.setPhase(3);
  assert.equal(camada.playCount, reproducoes, 'o ambiente é contínuo entre fases');
});

// ---------------------------------------------------------------------------
// Visibilidade e destruição
// ---------------------------------------------------------------------------

test('esconder o documento suspende o contexto', () => {
  const contexts = [];
  const b = bancada({ contexts });
  b.audio.init();
  b.windowRef.emit('pointerdown');
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

test('destroy fecha o contexto e remove os listeners', () => {
  const contexts = [];
  const b = bancada({ contexts });
  b.audio.init();
  b.windowRef.emit('pointerdown');
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

test('falha ao carregar um FX não lança exceção nem repete o fetch', async () => {
  const b = bancada();
  let tentativas = 0;
  b.windowRef.fetch = () => { tentativas++; return Promise.resolve({ ok: false, status: 404 }); };
  b.audio.init();
  b.windowRef.emit('pointerdown');

  assert.doesNotThrow(() => b.audio.playFx('playerJump'));
  await new Promise(resolve => setImmediate(resolve));
  assert.doesNotThrow(() => b.audio.playFx('playerJump'));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(tentativas, 1, 'um arquivo que falhou não é buscado de novo em loop');
  assert.ok(
    b.audio.debugSnapshot().errors.some(mensagem => mensagem.includes('playerJump')),
    'o erro aparece no debug',
  );
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

test('toneNow não produz mais a trilha sintetizada antiga', () => {
  const b = bancada();
  b.audio.init();
  b.windowRef.emit('pointerdown');
  const criadosAntes = b.contexts[0].criados.length;
  b.audio.toneNow(330, 0.1, 'triangle', 0.07);
  assert.equal(
    b.contexts[0].criados.length, criadosAntes,
    'nenhum oscilador é criado: a trilha do protótipo não briga com a música real',
  );
});
