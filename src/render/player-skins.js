// Catalogo de skins do jogador.
//
// "astronaut" nao tem folha: e o desenho a mao que sempre existiu, e continua
// sendo o padrao. Nenhuma skin nova pode tira-lo do caminho — ele e a rede de
// seguranca de todas as outras.
//
// Para experimentar o Miguelito: ?player=miguelito
// Para voltar:                    ?player=astronaut
// A escolha fica guardada, entao da para testar varias fases sem repetir o
// parametro.

export const PLAYER_SKIN_STORAGE_KEY = 'miguelito:player-skin:v1';

export const PLAYER_SKINS = Object.freeze({
  astronaut: Object.freeze({
    id: 'astronaut',
    label: 'Astronauta (desenhado)',
    states: null,
  }),

  miguelito: Object.freeze({
    id: 'miguelito',
    label: 'Miguelito (sprites)',
    // A arte e mais alta que a caixa de colisao de 32x48 — cabeca e mochila
    // passam do corpo fisico, como em quase todo personagem de plataforma. A
    // caixa nao muda: a fisica ja esta medida e validada em cima dela.
    heightScale: 1.32,
    offsetX: 0,
    offsetY: 2,
    states: Object.freeze({
      // Enquanto so existir a tira de corrida, ela responde por tudo: parado
      // usa o primeiro quadro, pulo e dash caem nela pela cadeia de fallback.
      run: Object.freeze({
        src: 'assets/miguelito/run.png',
        frames: 9,
        fps: 12,
        speedFromMotion: true,
      }),
      // Quando as outras folhas chegarem, e so descomentar e ajustar frames:
      // idle:      { src: 'assets/miguelito/idle.png', frames: 4, fps: 6 },
      // jump:      { src: 'assets/miguelito/jump.png', frames: 4, fps: 10, loop: false },
      // dash:      { src: 'assets/miguelito/dash.png', frames: 3, fps: 14, loop: false },
      // hurt:      { src: 'assets/miguelito/hurt.png', frames: 3, fps: 10, loop: false },
      // celebrate: { src: 'assets/miguelito/celebrate.png', frames: 6, fps: 10 },
      // pulse:     { src: 'assets/miguelito/pulse.png', frames: 5, fps: 12, loop: false },
    }),
  }),
});

export function resolvePlayerSkin({ locationLike = null, storage = null } = {}) {
  const requested = new URLSearchParams(locationLike?.search || '').get('player');
  if (requested && PLAYER_SKINS[requested]) {
    try { storage?.setItem(PLAYER_SKIN_STORAGE_KEY, requested); } catch (_) {}
    return PLAYER_SKINS[requested];
  }
  let saved = null;
  try { saved = storage?.getItem(PLAYER_SKIN_STORAGE_KEY); } catch (_) {}
  // Um valor guardado que nao existe mais no catalogo nao pode deixar o jogo
  // sem personagem: cai no astronauta.
  return PLAYER_SKINS[saved] || PLAYER_SKINS.astronaut;
}
