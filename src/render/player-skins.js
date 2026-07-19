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
    // Altura visivel do personagem em pixels de jogo. A caixa de colisao
    // continua 32x48 — cabeca e mochila passam dela, como em quase todo
    // personagem de plataforma. Este e o numero para mexer se ele parecer
    // pequeno ou grande demais; nada aqui altera a fisica.
    characterHeight: 64,
    offsetX: 0,
    // Medido quadro a quadro, o pe ficava de 1 a 3px acima da plataforma. Esses
    // 2px encostam o passo mais baixo no chao; a variacao que sobra e o balanco
    // natural da corrida, nao erro de encaixe.
    offsetY: 2,
    states: Object.freeze({
      run: Object.freeze({
        src: 'assets/miguelito/run.png',
        // Medido na folha: 2560x400, oito quadros de exatamente 320px.
        frames: 8,
        // Teto do ritmo. A primeira versao chegava a 17,5 quadros por segundo
        // na velocidade maxima (245) e depois a 10,8 — as duas ainda pareciam
        // adiantadas jogando. Agora 2 + 245*0,022 da ~7,4, e o slider do Phase
        // Lab multiplica isso ao vivo para achar o ponto no olho.
        fps: 8,
        speedFromMotion: true,
        motionBase: 2,
        motionFactor: .022,
        // O pe mais baixo da folha esta na linha 379 de 400: sobra 20px de
        // vazio embaixo. Sem isto o personagem flutua essa sobra inteira.
        baseline: 379 / 400,
        // Quanto do quadro o personagem ocupa. Serve para as duas folhas
        // renderizarem do mesmo tamanho, apesar de a arte ter sido desenhada em
        // escalas diferentes.
        contentHeight: 347,
      }),
      idle: Object.freeze({
        src: 'assets/miguelito/idle.png',
        frames: 8,
        // Respiracao, nao caminhada: devagar de proposito.
        fps: 6,
        baseline: 379 / 400,
        // Nesta folha o menino foi desenhado bem menor: 224 dos 400px, contra
        // 347 na corrida. Sem normalizar, ele encolheria ao parar de andar.
        contentHeight: 224,
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
