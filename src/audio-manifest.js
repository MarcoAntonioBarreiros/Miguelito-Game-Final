// Manifesto de áudio — Pacote 01
// ==============================
//
// Só dados: caminhos, categorias e volumes. O controlador
// (`src/game-audio.js`) lê daqui, então trocar uma faixa por outra editada
// depois é mudar uma linha, sem tocar em lógica.
//
// O bundler do projeto aceita apenas `export const` / `export function` e
// `import { A, B }` — nada de default export, `export { X }`, `import { X as Y }`
// nem import de JSON. Por isso o manifesto é um módulo JS comum.
//
// Todos os caminhos são relativos à raiz publicada e usam barra normal: o build
// copia `assets/` inteiro para `dist/assets/`, e barra invertida do Windows
// quebraria a URL no navegador.

export const AUDIO_STORAGE_KEY = 'miguelito:audio:v2';
export const AUDIO_STORAGE_VERSION = 2;
// Chave da versão anterior, lida uma vez para migrar quem já abriu o jogo.
export const AUDIO_STORAGE_KEY_V1 = 'miguelito:audio:v1';

// Volumes por barramento. `master` multiplica todos.
//
// A primeira mixagem deixava a caverna quase inaudível e as gotas na frente de
// tudo. O ambiente subiu, as gotas caíram bastante, e o stinger ganhou barramento
// próprio para a vitória não depender do volume dos efeitos comuns.
export const AUDIO_DEFAULTS = Object.freeze({
  master: 1,
  music: 0.35,
  ambience: 0.28,
  drops: 0.055,
  fx: 0.35,
  stinger: 0.55,
});

// Valores da v1, usados só para reconhecer quem NUNCA personalizou o volume.
// Quem mexeu no slider (quando existir) mantém a própria escolha.
export const AUDIO_DEFAULTS_V1 = Object.freeze({
  master: 1,
  music: 0.35,
  ambience: 0.20,
  drops: 0.15,
  fx: 0.35,
});

// Ganhos RELATIVOS das camadas de ambiente. Elas tocam juntas o tempo todo, e
// somar quatro loops em ganho 1.0 vira ruído: a caverna é a base, o resto entra
// como detalhe. `internalRootFlow` é dinâmico (sobe quando Miguelito está sobre
// uma raiz), por isso nasce baixo.
export const AMBIENCE_LAYER_GAINS = Object.freeze({
  caveBase: 0.85,
  caveActivity: 0.35,
  rhizosphereBase: 0.65,
  rhizosphereDetail: 0.28,
  internalRootFlow: 0.035,
});

// Alvos do fluxo interno da raiz.
export const INTERNAL_ROOT_FLOW = Object.freeze({
  onRoot: 0.10,
  offRoot: 0.035,
  phaseNineBonus: 0.03,
  maximum: 0.12,
  rampSeconds: 0.5,
});

// Janela entre gotas e variações permitidas. A variação é estética e usa um RNG
// próprio do controlador — nunca o RNG da campanha, que decide geometria.
export const DROP_SCHEDULE = Object.freeze({
  minimumSeconds: 7,
  maximumSeconds: 20,
  // A primeira gota espera: cair logo no primeiro segundo, junto com o fade-in
  // da música, soava como um erro de reprodução.
  firstDelaySeconds: 5,
  gainMinimum: 0.65,
  gainMaximum: 0.85,
  panMinimum: -0.40,
  panMaximum: 0.40,
  rateMinimum: 0.97,
  rateMaximum: 1.03,
});

export const MUSIC_CROSSFADE_SECONDS = 1.5;
export const MUSIC_FIRST_FADE_SECONDS = 0.8;
// Redução aplicada a música e ambiente quando um cartão de tutorial está aberto,
// durante o respawn e no encerramento.
export const DUCK_LEVELS = Object.freeze({
  tutorial: 0.65,
  respawning: 0.45,
  end: 0.35,
  // Durante a vitória o ambiente fica discreto, mas não some: o silêncio total
  // faria a transição parecer um travamento.
  victoryAmbience: 0.60,
});

// Fade da supressão da música quando a fase termina.
export const MUSIC_SUPPRESSION_SECONDS = 0.5;
// Fade do stinger ao entrar na próxima fase.
export const STINGER_FADE_SECONDS = 0.5;

// Espera entre concluir a fase e carregar a próxima.
//
// Eram 3,4 s — e o stinger de vitória tem 10,24 s, então ele era cortado logo no
// começo. 7,5 s deixa a frase musical respirar sem parar o jogo por muito tempo.
// O arquivo NÃO foi editado; só a espera mudou.
export const PHASE_VICTORY_TRANSITION_SECONDS = 7.5;
export const PHASE_VICTORY_TOAST_SECONDS = 7.0;

const MUSIC = 'assets/audio/music/';
const AMBIENCE = 'assets/audio/ambience/';
const DROPS = 'assets/audio/ambience/drops/';
const FX = 'assets/audio/fx/';

// Faixas do Pacote 01.
//
// Só as versões `_loop` entram no runtime: as `_full` ficam guardadas no ZIP
// como fonte de edição e não são publicadas nesta etapa. Nenhum WAV entra.
export const AUDIO_TRACKS = Object.freeze({
  // ---- Música (streaming, uma por vez, com crossfade) ---------------------
  musicTitle: Object.freeze({
    id: 'musicTitle',
    src: `${MUSIC}music_title_menino_da_rizosfera_loop.ogg`,
    kind: 'music',
    loop: true,
    defaultGain: 1,
    preload: 'metadata',
  }),
  musicRhizobium: Object.freeze({
    id: 'musicRhizobium',
    src: `${MUSIC}music_rhizobium_symbiosis_loop.ogg`,
    kind: 'music',
    loop: true,
    defaultGain: 1,
    preload: 'metadata',
  }),
  musicAzospirillum: Object.freeze({
    id: 'musicAzospirillum',
    src: `${MUSIC}music_azospirillum_growth_loop.ogg`,
    kind: 'music',
    loop: true,
    defaultGain: 1,
    preload: 'metadata',
  }),

  // ---- Ambiente (camadas contínuas, nunca reiniciadas por fase) -----------
  ambienceCaveBase: Object.freeze({
    id: 'ambienceCaveBase',
    src: `${AMBIENCE}ambience_cave_base_loop.ogg`,
    kind: 'ambience',
    loop: true,
    defaultGain: AMBIENCE_LAYER_GAINS.caveBase,
    preload: 'auto',
  }),
  ambienceCaveActivity: Object.freeze({
    id: 'ambienceCaveActivity',
    src: `${AMBIENCE}ambience_cave_activity_loop.ogg`,
    kind: 'ambience',
    loop: true,
    defaultGain: AMBIENCE_LAYER_GAINS.caveActivity,
    preload: 'auto',
  }),
  ambienceRhizosphereBase: Object.freeze({
    id: 'ambienceRhizosphereBase',
    src: `${AMBIENCE}ambience_rhizosphere_base_loop.ogg`,
    kind: 'ambience',
    loop: true,
    defaultGain: AMBIENCE_LAYER_GAINS.rhizosphereBase,
    preload: 'auto',
  }),
  ambienceRhizosphereDetail: Object.freeze({
    id: 'ambienceRhizosphereDetail',
    src: `${AMBIENCE}ambience_rhizosphere_detail_loop.ogg`,
    kind: 'ambience',
    loop: true,
    defaultGain: AMBIENCE_LAYER_GAINS.rhizosphereDetail,
    preload: 'auto',
  }),
  ambienceInternalRootFlow: Object.freeze({
    id: 'ambienceInternalRootFlow',
    src: `${AMBIENCE}ambience_internal_root_flow_loop.ogg`,
    kind: 'ambience',
    loop: true,
    defaultGain: AMBIENCE_LAYER_GAINS.internalRootFlow,
    preload: 'auto',
  }),

  // ---- Gotas com eco (uma por vez, sorteadas) ----------------------------
  dropEco01: Object.freeze({ id: 'dropEco01', src: `${DROPS}gota_eco_01.ogg`, kind: 'drop', loop: false, defaultGain: 1, preload: 'auto' }),
  dropEco02: Object.freeze({ id: 'dropEco02', src: `${DROPS}gota_eco_02.ogg`, kind: 'drop', loop: false, defaultGain: 1, preload: 'auto' }),
  dropEco03: Object.freeze({ id: 'dropEco03', src: `${DROPS}gota_eco_03.ogg`, kind: 'drop', loop: false, defaultGain: 1, preload: 'auto' }),
  dropEco04: Object.freeze({ id: 'dropEco04', src: `${DROPS}gota_eco_04.ogg`, kind: 'drop', loop: false, defaultGain: 1, preload: 'auto' }),
  dropEco05: Object.freeze({ id: 'dropEco05', src: `${DROPS}gota_eco_05.ogg`, kind: 'drop', loop: false, defaultGain: 1, preload: 'auto' }),
  dropEco06: Object.freeze({ id: 'dropEco06', src: `${DROPS}gota_eco_06.ogg`, kind: 'drop', loop: false, defaultGain: 1, preload: 'auto' }),
  dropEco07: Object.freeze({ id: 'dropEco07', src: `${DROPS}gota_eco_07.ogg`, kind: 'drop', loop: false, defaultGain: 1, preload: 'auto' }),
  dropEco08: Object.freeze({ id: 'dropEco08', src: `${DROPS}gota_eco_08.ogg`, kind: 'drop', loop: false, defaultGain: 1, preload: 'auto' }),

  // ---- Efeitos curtos (AudioBuffer, decodificados uma vez) ---------------
  playerJump: Object.freeze({
    id: 'playerJump',
    src: `${FX}fx_player_jump.ogg`,
    kind: 'fx',
    loop: false,
    // ~7 dB abaixo do original. O salto é a ação mais repetida do jogo: em
    // ganho 1 ele cansava depois de poucos minutos. O arquivo não foi tocado.
    defaultGain: 0.45,
    preload: 'auto',
  }),
  playerDamage: Object.freeze({
    id: 'playerDamage',
    src: `${FX}fx_player_damage_arcade.ogg`,
    kind: 'fx',
    loop: false,
    defaultGain: 1,
    preload: 'auto',
  }),
  // Alternativo de 6s: fica disponível para comparação no Phase Lab, mas NÃO é
  // tocado junto com o arcade. Empilhar os dois a cada contato vira ruído.
  playerDamageAlt: Object.freeze({
    id: 'playerDamageAlt',
    src: `${FX}fx_player_damage_alt.ogg`,
    kind: 'stinger',
    loop: false,
    defaultGain: 1,
    preload: 'none',
  }),
  healthLost: Object.freeze({
    id: 'healthLost',
    src: `${FX}fx_health_lost.ogg`,
    kind: 'fx',
    loop: false,
    defaultGain: 1,
    preload: 'auto',
  }),
  gameOver: Object.freeze({
    id: 'gameOver',
    src: `${FX}fx_game_over.ogg`,
    kind: 'fx',
    loop: false,
    defaultGain: 1,
    preload: 'auto',
  }),

  // ---- Stingers longos (mídia, não AudioBuffer) --------------------------
  // 10,24 s e 35,84 s: decodificar isso como buffer curto desperdiça memória no
  // celular sem ganho nenhum de latência.
  phaseVictory: Object.freeze({
    id: 'phaseVictory',
    src: `${FX}fx_phase_victory_short.ogg`,
    kind: 'stinger',
    loop: false,
    defaultGain: 1,
    preload: 'metadata',
  }),
  campaignVictory: Object.freeze({
    id: 'campaignVictory',
    src: `${FX}fx_results_victory_long.ogg`,
    kind: 'stinger',
    loop: false,
    defaultGain: 1,
    preload: 'none',
  }),
});

// Camadas ambientais que tocam continuamente após o desbloqueio, na ordem em que
// entram. `ambienceInternalRootFlow` está aqui, mas seu ganho é dirigido pelo
// contexto (sobre raiz ou não).
export const AMBIENCE_LAYERS = Object.freeze([
  'ambienceCaveBase',
  'ambienceCaveActivity',
  'ambienceRhizosphereBase',
  'ambienceRhizosphereDetail',
  'ambienceInternalRootFlow',
]);

export const DROP_TRACK_IDS = Object.freeze([
  'dropEco01', 'dropEco02', 'dropEco03', 'dropEco04',
  'dropEco05', 'dropEco06', 'dropEco07', 'dropEco08',
]);

// Mapeamento PROVISÓRIO de música por fase.
//
// O Pacote 01 traz três temas editados. Fase 2 é Rhizobium e fase 3 é
// Azospirillum porque é exatamente o organismo que cada uma ensina; as demais
// usam o tema geral como música de exploração até os temas próprios existirem.
// Não há tema inventado, e Rhizobium/Azospirillum não aparecem em fases onde
// seriam biologicamente errados.
export const PHASE_MUSIC = Object.freeze({
  0: 'musicTitle',
  1: 'musicTitle',
  2: 'musicRhizobium',
  3: 'musicAzospirillum',
  4: 'musicTitle',
  5: 'musicTitle',
  6: 'musicTitle',
  7: 'musicTitle',
  8: 'musicTitle',
  9: 'musicTitle',
  10: 'musicTitle',
});

export const FALLBACK_MUSIC_ID = 'musicTitle';

export function musicTrackForPhase(phase) {
  const key = Number.isFinite(phase) ? phase : 0;
  return PHASE_MUSIC[key] || FALLBACK_MUSIC_ID;
}

// Migração v1 → v2.
//
// Sem isso, quem já abriu o jogo continuaria com `ambience: 0.20` e
// `drops: 0.15` gravados no localStorage, e os novos padrões não teriam efeito
// nenhum. A regra é conservadora: só sobe o que estava EXATAMENTE no default
// antigo — um valor personalizado é escolha do jogador e permanece.
export function migrateAudioSettings(stored) {
  if (!stored || typeof stored !== 'object') return { ...AUDIO_DEFAULTS, muted: false, version: AUDIO_STORAGE_VERSION };
  if (stored.version === AUDIO_STORAGE_VERSION) {
    return { ...AUDIO_DEFAULTS, ...stored, version: AUDIO_STORAGE_VERSION };
  }

  const numero = (valor, padrao) => (Number.isFinite(valor) ? valor : padrao);
  const noPadraoAntigo = (valor, antigo) => (
    Number.isFinite(valor) && Math.abs(valor - antigo) < 1e-9
  );

  return {
    version: AUDIO_STORAGE_VERSION,
    muted: Boolean(stored.muted),
    master: numero(stored.master, AUDIO_DEFAULTS.master),
    music: numero(stored.music, AUDIO_DEFAULTS.music),
    fx: numero(stored.fx, AUDIO_DEFAULTS.fx),
    ambience: noPadraoAntigo(stored.ambience, AUDIO_DEFAULTS_V1.ambience)
      ? AUDIO_DEFAULTS.ambience
      : numero(stored.ambience, AUDIO_DEFAULTS.ambience),
    drops: noPadraoAntigo(stored.drops, AUDIO_DEFAULTS_V1.drops)
      ? AUDIO_DEFAULTS.drops
      : numero(stored.drops, AUDIO_DEFAULTS.drops),
    stinger: numero(stored.stinger, AUDIO_DEFAULTS.stinger),
  };
}

export function audioTracksOfKind(kind) {
  return Object.values(AUDIO_TRACKS).filter(track => track.kind === kind);
}
