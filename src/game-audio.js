// Controlador de áudio do jogo
// ============================
//
// Um único AudioContext, quatro barramentos e um compressor suave no fim. Música
// e ambiente são `HTMLAudioElement` ligados ao grafo por `createMediaElementSource`
// (streaming, loop, crossfade, pouca memória no celular); efeitos curtos são
// AudioBuffer decodificados uma vez e disparados por `BufferSource`.
//
// Nada toca antes da primeira interação do usuário: o navegador bloqueia, e o
// silêncio inicial é o comportamento correto. O `unlock()` acontece no primeiro
// pointerdown/touchstart/keydown e a partir dali música, ambientes e o scheduler
// de gotas começam.
//
// O controlador NUNCA lê ou altera dados biológicos para decidir som, e o sorteio
// das gotas usa um RNG próprio — o RNG da campanha decide geometria, e puxar
// números dele para escolher uma gota mudaria o nível gerado.
//
// O bundler aceita apenas `export const` / `export function`.

import {
  AMBIENCE_LAYERS,
  AUDIO_DEFAULTS,
  AUDIO_STORAGE_KEY,
  AUDIO_TRACKS,
  DROP_SCHEDULE,
  DROP_TRACK_IDS,
  DUCK_LEVELS,
  INTERNAL_ROOT_FLOW,
  MUSIC_CROSSFADE_SECONDS,
  MUSIC_FIRST_FADE_SECONDS,
  musicTrackForPhase,
} from './audio-manifest.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

// Adaptador silencioso: mesma API, nenhum efeito. É o que o simulador usa nos
// testes Node, onde não existe AudioContext nem document.
export function createNoopAudio() {
  return {
    init() {},
    unlock() {},
    update() {},
    setPhase() {},
    playFx() { return false; },
    playStinger() { return false; },
    toggleMute() { return false; },
    setMuted() {},
    isMuted() { return false; },
    isUnlocked() { return false; },
    suspend() {},
    resume() {},
    destroy() {},
    toneNow() {},
    debugSnapshot() {
      return {
        available: false, unlocked: false, contextState: 'noop', muted: false,
        musicTrackId: null, crossfadingTo: null, musicPhase: null,
        ambienceLayers: [], internalRootFlow: 0,
        currentDrop: null, nextDropIn: null, lastFx: null, errors: [],
      };
    },
  };
}

function readStoredSettings(windowRef) {
  try {
    const raw = windowRef?.localStorage?.getItem(AUDIO_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    // localStorage indisponível (modo privado, iframe restrito): segue sem persistir.
    return null;
  }
}

function writeStoredSettings(windowRef, settings) {
  try {
    windowRef?.localStorage?.setItem(AUDIO_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Sem persistência: o jogo continua normalmente.
  }
}

export function createGameAudio({
  documentRef = typeof document !== 'undefined' ? document : null,
  windowRef = typeof window !== 'undefined' ? window : null,
  getState = () => null,
  getCampaign = () => null,
  disabled = false,
  random = Math.random,
} = {}) {
  if (disabled || !windowRef || !documentRef) return createNoopAudio();

  const AudioContextClass = windowRef.AudioContext || windowRef.webkitAudioContext;
  if (typeof AudioContextClass !== 'function') return createNoopAudio();

  // ---- estado -------------------------------------------------------------
  const stored = readStoredSettings(windowRef);
  const settings = {
    muted: Boolean(stored?.muted),
    master: Number.isFinite(stored?.master) ? stored.master : AUDIO_DEFAULTS.master,
    music: Number.isFinite(stored?.music) ? stored.music : AUDIO_DEFAULTS.music,
    ambience: Number.isFinite(stored?.ambience) ? stored.ambience : AUDIO_DEFAULTS.ambience,
    drops: Number.isFinite(stored?.drops) ? stored.drops : AUDIO_DEFAULTS.drops,
    fx: Number.isFinite(stored?.fx) ? stored.fx : AUDIO_DEFAULTS.fx,
  };

  let context = null;
  let initialized = false;
  let unlocked = false;
  let destroyed = false;
  const errors = [];
  const timers = new Set();
  const listeners = [];

  let masterGain = null;
  let musicGain = null;
  let ambienceGain = null;
  let dropGain = null;
  let fxGain = null;

  const decks = [];
  let activeDeck = 0;
  let currentMusicId = null;
  let crossfadingTo = null;
  let musicPhase = null;

  const ambienceNodes = new Map();
  let internalFlowGainNow = INTERNAL_ROOT_FLOW.offRoot;

  const fxBuffers = new Map();
  const fxPending = new Map();
  const fxFailed = new Set();
  let lastFxId = null;
  let lastJumpAt = -Infinity;

  const dropNodes = new Map();
  let currentDropId = null;
  let lastDropId = null;
  let nextDropIn = 0;
  let dropActive = false;

  let stingerElement = null;
  let stingerGain = null;
  let stingerId = null;

  let duck = 1;
  let duckTarget = 1;

  function note(message) {
    if (errors.length > 12) errors.shift();
    errors.push(message);
  }

  function addTimer(id) { timers.add(id); return id; }
  function clearTimers() {
    for (const id of timers) clearTimeout(id);
    timers.clear();
  }

  function assetUrl(src) {
    // Caminho relativo à página. Em `dist/` o HTML e `assets/` são irmãos, e em
    // desenvolvimento também — então o relativo funciona nos dois.
    return src;
  }

  // ---- grafo --------------------------------------------------------------

  function init() {
    if (initialized || destroyed) return;
    initialized = true;
    try {
      context = new AudioContextClass();
    } catch (error) {
      note(`AudioContext indisponível: ${error?.message || error}`);
      context = null;
      return;
    }

    masterGain = context.createGain();
    // Compressor SUAVE: existe só para impedir que a soma de música, ambiente,
    // gotas e efeitos estoure. Não é para achatar a dinâmica.
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -12;
    compressor.knee.value = 24;
    compressor.ratio.value = 2.5;
    compressor.attack.value = 0.01;
    compressor.release.value = 0.25;

    masterGain.connect(compressor);
    compressor.connect(context.destination);

    musicGain = context.createGain();
    ambienceGain = context.createGain();
    dropGain = context.createGain();
    fxGain = context.createGain();
    for (const bus of [musicGain, ambienceGain, dropGain, fxGain]) bus.connect(masterGain);

    applyBusVolumes();

    for (let index = 0; index < 2; index++) {
      const element = documentRef.createElement('audio');
      element.preload = 'none';
      element.loop = true;
      element.crossOrigin = 'anonymous';
      const gain = context.createGain();
      gain.gain.value = 0;
      let source = null;
      try {
        source = context.createMediaElementSource(element);
        source.connect(gain);
        gain.connect(musicGain);
      } catch (error) {
        note(`deck de música ${index} falhou: ${error?.message || error}`);
      }
      decks.push({ element, gain, source, trackId: null });
    }

    stingerElement = documentRef.createElement('audio');
    stingerElement.preload = 'none';
    stingerElement.crossOrigin = 'anonymous';
    stingerGain = context.createGain();
    stingerGain.gain.value = 1;
    try {
      const source = context.createMediaElementSource(stingerElement);
      source.connect(stingerGain);
      stingerGain.connect(fxGain);
    } catch (error) {
      note(`deck de stinger falhou: ${error?.message || error}`);
    }

    registerUnlockListeners();
    registerVisibilityListener();
  }

  function applyBusVolumes() {
    if (!context) return;
    const muted = settings.muted ? 0 : 1;
    setGain(masterGain, settings.master * muted);
    setGain(musicGain, settings.music * duck);
    setGain(ambienceGain, settings.ambience * duck);
    setGain(dropGain, settings.drops * duck);
    setGain(fxGain, settings.fx);
  }

  function setGain(node, value, seconds = 0.08) {
    if (!node || !context) return;
    const target = clamp(value, 0, 4);
    // Não reprograma se o alvo não mudou: evita rampas por quadro.
    if (Math.abs((node.gain.value ?? 0) - target) < 0.0005) return;
    try {
      node.gain.setTargetAtTime(target, context.currentTime, Math.max(0.01, seconds / 3));
    } catch {
      node.gain.value = target;
    }
  }

  // ---- desbloqueio --------------------------------------------------------

  function registerUnlockListeners() {
    const handler = () => unlock();
    for (const type of ['pointerdown', 'touchstart', 'keydown']) {
      windowRef.addEventListener(type, handler, { passive: true });
      listeners.push([windowRef, type, handler]);
    }
  }

  function removeUnlockListeners() {
    for (let index = listeners.length - 1; index >= 0; index--) {
      const [target, type, handler] = listeners[index];
      if (!['pointerdown', 'touchstart', 'keydown'].includes(type)) continue;
      target.removeEventListener(type, handler);
      listeners.splice(index, 1);
    }
  }

  function unlock() {
    if (destroyed || unlocked) return;
    if (!initialized) init();
    if (!context) return;
    unlocked = true;
    removeUnlockListeners();
    try {
      const resumed = context.resume?.();
      if (resumed?.catch) resumed.catch(error => note(`resume falhou: ${error?.message || error}`));
    } catch (error) {
      note(`resume falhou: ${error?.message || error}`);
    }
    startAmbience();
    const phase = currentPhase();
    setPhase(phase, { immediate: true });
    scheduleNextDrop(1.5);
  }

  function currentPhase() {
    const campaign = getCampaign?.();
    if (Number.isFinite(campaign?.phase)) return campaign.phase;
    const state = getState?.();
    return Number.isFinite(state?.campaign?.phase) ? state.campaign.phase : 0;
  }

  // ---- mídia --------------------------------------------------------------

  function makeMediaNode(track, destination, gainValue) {
    const element = documentRef.createElement('audio');
    element.src = assetUrl(track.src);
    element.loop = Boolean(track.loop);
    element.preload = track.preload || 'auto';
    element.crossOrigin = 'anonymous';
    const gain = context.createGain();
    gain.gain.value = gainValue;
    try {
      const source = context.createMediaElementSource(element);
      source.connect(gain);
      gain.connect(destination);
    } catch (error) {
      note(`${track.id}: grafo falhou (${error?.message || error})`);
    }
    element.addEventListener('error', () => {
      note(`${track.id}: falha ao carregar ${track.src}`);
    });
    return { element, gain, track };
  }

  function play(element) {
    try {
      const promise = element.play?.();
      if (promise?.catch) promise.catch(() => {});
    } catch {
      // Chamada antes do desbloqueio: silêncio é o comportamento correto.
    }
  }

  // ---- ambiente -----------------------------------------------------------

  function startAmbience() {
    if (!context) return;
    for (const id of AMBIENCE_LAYERS) {
      if (ambienceNodes.has(id)) continue;
      const track = AUDIO_TRACKS[id];
      if (!track) continue;
      const node = makeMediaNode(track, ambienceGain, track.defaultGain);
      ambienceNodes.set(id, node);
      play(node.element);
    }
  }

  // O fluxo interno da raiz sobe quando Miguelito está apoiado numa raiz. Só lê
  // `supportPlatform.type`, que a física já mantém — nenhum dado biológico.
  function updateInternalRootFlow(dt) {
    const node = ambienceNodes.get('ambienceInternalRootFlow');
    if (!node) return;
    const state = getState?.();
    const onRoot = state?.player?.supportPlatform?.type === 'root';
    let target = onRoot ? INTERNAL_ROOT_FLOW.onRoot : INTERNAL_ROOT_FLOW.offRoot;
    if (currentPhase() === 9) target = Math.min(INTERNAL_ROOT_FLOW.maximum, target + INTERNAL_ROOT_FLOW.phaseNineBonus);

    const passo = dt / Math.max(0.05, INTERNAL_ROOT_FLOW.rampSeconds);
    internalFlowGainNow += (target - internalFlowGainNow) * clamp(passo, 0, 1);
    setGain(node.gain, internalFlowGainNow, INTERNAL_ROOT_FLOW.rampSeconds);
  }

  // ---- música e crossfade -------------------------------------------------

  function setPhase(phase, { immediate = false } = {}) {
    if (destroyed) return;
    musicPhase = phase;
    if (!unlocked || !context) return;
    const trackId = musicTrackForPhase(phase);
    // Mesma faixa: NÃO reinicia nem volta ao começo.
    if (trackId === currentMusicId) return;
    crossfadeTo(trackId, immediate ? MUSIC_FIRST_FADE_SECONDS : MUSIC_CROSSFADE_SECONDS);
  }

  function crossfadeTo(trackId, seconds) {
    const track = AUDIO_TRACKS[trackId];
    if (!track || !decks.length) return;
    const incoming = decks[1 - activeDeck];
    const outgoing = decks[activeDeck];

    if (incoming.trackId !== trackId) {
      incoming.element.src = assetUrl(track.src);
      incoming.element.loop = true;
      incoming.trackId = trackId;
    }
    incoming.element.currentTime = 0;
    setGain(incoming.gain, 0, 0.01);
    play(incoming.element);
    setGain(incoming.gain, track.defaultGain, seconds);

    if (outgoing.trackId) {
      setGain(outgoing.gain, 0, seconds);
      const element = outgoing.element;
      addTimer(setTimeout(() => {
        try { element.pause(); element.currentTime = 0; } catch { /* elemento já descartado */ }
      }, seconds * 1000 + 120));
    }

    activeDeck = 1 - activeDeck;
    currentMusicId = trackId;
    crossfadingTo = trackId;
    addTimer(setTimeout(() => { crossfadingTo = null; }, seconds * 1000 + 60));
  }

  // ---- efeitos ------------------------------------------------------------

  function loadFxBuffer(track) {
    if (fxBuffers.has(track.id) || fxPending.has(track.id) || fxFailed.has(track.id)) return;
    const promise = windowRef.fetch(assetUrl(track.src))
      .then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.arrayBuffer();
      })
      .then(data => context.decodeAudioData(data))
      .then(buffer => { fxBuffers.set(track.id, buffer); fxPending.delete(track.id); })
      .catch(error => {
        // Um arquivo que falha não pode derrubar o jogo — e não é buscado de novo.
        fxPending.delete(track.id);
        fxFailed.add(track.id);
        note(`${track.id}: ${error?.message || error}`);
      });
    fxPending.set(track.id, promise);
  }

  function playFx(id, { gain = 1, rate = 1, pan = 0 } = {}) {
    if (destroyed || !unlocked || !context || settings.muted) return false;
    const track = AUDIO_TRACKS[id];
    if (!track) { note(`FX desconhecido: ${id}`); return false; }
    if (track.kind === 'stinger') return playStinger(id, { gain });

    const buffer = fxBuffers.get(id);
    if (!buffer) { loadFxBuffer(track); return false; }

    try {
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = clamp(rate, 0.5, 2);
      const nodeGain = context.createGain();
      nodeGain.gain.value = clamp(track.defaultGain * gain, 0, 2);
      let tail = nodeGain;
      if (pan && typeof context.createStereoPanner === 'function') {
        const panner = context.createStereoPanner();
        panner.pan.value = clamp(pan, -1, 1);
        nodeGain.connect(panner);
        tail = panner;
      }
      source.connect(nodeGain);
      tail.connect(fxGain);
      source.onended = () => { try { source.disconnect(); tail.disconnect(); } catch { /* já desconectado */ } };
      source.start();
      lastFxId = id;
      return true;
    } catch (error) {
      note(`${id}: ${error?.message || error}`);
      return false;
    }
  }

  // Stingers longos rodam como mídia. Um por vez: o curto de vitória de fase e o
  // longo de fim de campanha nunca tocam juntos.
  function playStinger(id, { gain = 1 } = {}) {
    if (destroyed || !unlocked || !context || settings.muted || !stingerElement) return false;
    const track = AUDIO_TRACKS[id];
    if (!track) { note(`stinger desconhecido: ${id}`); return false; }
    try {
      stingerElement.pause();
      stingerElement.src = assetUrl(track.src);
      stingerElement.currentTime = 0;
      setGain(stingerGain, clamp(track.defaultGain * gain, 0, 2), 0.05);
      play(stingerElement);
      stingerId = id;
      lastFxId = id;
      return true;
    } catch (error) {
      note(`${id}: ${error?.message || error}`);
      return false;
    }
  }

  function stopStinger(seconds = 0.4) {
    if (!stingerElement || !stingerId) return;
    setGain(stingerGain, 0, seconds);
    const element = stingerElement;
    addTimer(setTimeout(() => {
      try { element.pause(); element.currentTime = 0; } catch { /* já parado */ }
    }, seconds * 1000 + 80));
    stingerId = null;
  }

  // ---- gotas --------------------------------------------------------------

  function scheduleNextDrop(seconds = null) {
    const janela = DROP_SCHEDULE;
    nextDropIn = Number.isFinite(seconds)
      ? seconds
      : janela.minimumSeconds + random() * (janela.maximumSeconds - janela.minimumSeconds);
  }

  function dropAllowed() {
    if (!unlocked || settings.muted || destroyed || !context) return false;
    if (documentRef.hidden) return false;
    const state = getState?.();
    const gameState = state?.gameState;
    return gameState !== 'end' && gameState !== 'respawning';
  }

  function playDrop() {
    // Uma gota por vez, e nunca a mesma duas vezes seguidas.
    const disponiveis = DROP_TRACK_IDS.filter(id => id !== lastDropId && !fxFailed.has(id));
    const pool = disponiveis.length ? disponiveis : DROP_TRACK_IDS;
    const id = pool[Math.min(pool.length - 1, Math.floor(clamp(random(), 0, 0.999) * pool.length))];
    const track = AUDIO_TRACKS[id];
    if (!track) return;

    let node = dropNodes.get(id);
    if (!node) {
      node = makeMediaNode(track, dropGain, track.defaultGain);
      node.element.loop = false;
      node.element.addEventListener('ended', () => {
        if (currentDropId === id) { currentDropId = null; dropActive = false; scheduleNextDrop(); }
      });
      if (typeof context.createStereoPanner === 'function') {
        node.panner = context.createStereoPanner();
        try {
          node.gain.disconnect();
          node.gain.connect(node.panner);
          node.panner.connect(dropGain);
        } catch (error) {
          note(`${id}: panner falhou (${error?.message || error})`);
        }
      }
      dropNodes.set(id, node);
    }

    const janela = DROP_SCHEDULE;
    node.gain.gain.value = clamp(
      janela.gainMinimum + random() * (janela.gainMaximum - janela.gainMinimum),
      0, 2,
    );
    if (node.panner) {
      node.panner.pan.value = janela.panMinimum + random() * (janela.panMaximum - janela.panMinimum);
    }
    node.element.playbackRate = janela.rateMinimum + random() * (janela.rateMaximum - janela.rateMinimum);
    try { node.element.currentTime = 0; } catch { /* mídia ainda carregando */ }
    play(node.element);

    currentDropId = id;
    lastDropId = id;
    dropActive = true;
    // Rede de segurança: se o `ended` não vier (mídia que falhou), destrava.
    addTimer(setTimeout(() => {
      if (currentDropId === id) { currentDropId = null; dropActive = false; scheduleNextDrop(); }
    }, 12000));
  }

  function updateDrops(dt) {
    if (!dropAllowed()) return;
    if (dropActive) return;
    nextDropIn -= dt;
    if (nextDropIn > 0) return;
    playDrop();
  }

  // ---- mixagem por estado do jogo ----------------------------------------

  function updateDuck(dt) {
    const state = getState?.();
    const gameState = state?.gameState;
    if (state?.tutorialOpen === true) duckTarget = DUCK_LEVELS.tutorial;
    else if (gameState === 'respawning') duckTarget = DUCK_LEVELS.respawning;
    else if (gameState === 'end') duckTarget = DUCK_LEVELS.end;
    else duckTarget = 1;

    const passo = clamp(dt / 0.4, 0, 1);
    const anterior = duck;
    duck += (duckTarget - duck) * passo;
    if (Math.abs(duck - anterior) > 0.002) applyBusVolumes();
  }

  function update(dt) {
    if (destroyed || !unlocked || !context) return;
    const passo = Number.isFinite(dt) ? clamp(dt, 0, 0.25) : 0;
    updateDuck(passo);
    updateInternalRootFlow(passo);
    updateDrops(passo);
  }

  // ---- mute e persistência ------------------------------------------------

  function persist() {
    writeStoredSettings(windowRef, { ...settings });
  }

  function setMuted(value) {
    settings.muted = Boolean(value);
    applyBusVolumes();
    persist();
    if (settings.muted) stopStinger(0.2);
  }

  function toggleMute() {
    setMuted(!settings.muted);
    return settings.muted;
  }

  // ---- visibilidade -------------------------------------------------------

  function registerVisibilityListener() {
    const handler = () => {
      if (!unlocked || !context) return;
      if (documentRef.hidden) {
        setGain(masterGain, 0, 0.15);
        addTimer(setTimeout(() => {
          if (documentRef.hidden) suspend();
        }, 220));
      } else {
        resume();
      }
    };
    documentRef.addEventListener('visibilitychange', handler);
    listeners.push([documentRef, 'visibilitychange', handler]);
  }

  function suspend() {
    if (!context) return;
    try {
      const promise = context.suspend?.();
      if (promise?.catch) promise.catch(() => {});
    } catch { /* contexto já suspenso */ }
  }

  function resume() {
    if (!context || !unlocked) return;
    try {
      const promise = context.resume?.();
      if (promise?.catch) promise.catch(() => {});
    } catch { /* nada a fazer */ }
    applyBusVolumes();
  }

  // ---- destruição ---------------------------------------------------------

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    clearTimers();
    for (const [target, type, handler] of listeners) target.removeEventListener(type, handler);
    listeners.length = 0;
    for (const node of ambienceNodes.values()) {
      try { node.element.pause(); node.element.src = ''; } catch { /* já descartado */ }
    }
    ambienceNodes.clear();
    for (const node of dropNodes.values()) {
      try { node.element.pause(); node.element.src = ''; } catch { /* já descartado */ }
    }
    dropNodes.clear();
    for (const deck of decks) {
      try { deck.element.pause(); deck.element.src = ''; } catch { /* já descartado */ }
    }
    try { stingerElement?.pause(); } catch { /* já parado */ }
    try { context?.close?.(); } catch { /* já fechado */ }
    context = null;
  }

  // ---- compatibilidade ----------------------------------------------------

  // Mantido só para chamadas antigas não quebrarem. NÃO produz som: a trilha
  // sintetizada do protótipo brigaria com as músicas reais.
  function toneNow() {}

  function debugSnapshot() {
    return {
      available: true,
      unlocked,
      contextState: context?.state || 'closed',
      muted: settings.muted,
      musicTrackId: currentMusicId,
      crossfadingTo,
      musicPhase,
      ambienceLayers: [...ambienceNodes.keys()],
      internalRootFlow: internalFlowGainNow,
      currentDrop: currentDropId,
      nextDropIn: dropActive ? null : Math.max(0, nextDropIn),
      lastFx: lastFxId,
      stinger: stingerId,
      errors: [...errors],
    };
  }

  return {
    init,
    unlock,
    update,
    setPhase,
    playFx,
    playStinger,
    stopStinger,
    toggleMute,
    setMuted,
    isMuted: () => settings.muted,
    isUnlocked: () => unlocked,
    suspend,
    resume,
    destroy,
    toneNow,
    debugSnapshot,
    // Cooldown do salto: defesa contra repeat de teclado disparando o mesmo FX.
    canPlayJump(now) {
      if (now - lastJumpAt < 0.05) return false;
      lastJumpAt = now;
      return true;
    },
  };
}
