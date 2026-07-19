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
        // Teto do ritmo. O ponto foi caindo a cada teste jogando: 17,5 quadros
        // por segundo na velocidade maxima (245), depois 10,8, depois 7,4 — e
        // ainda parecia adiantado. Agora 1,5 + 245*0,016 da ~5,4. O slider do
        // Phase Lab multiplica isso ao vivo para o ajuste fino.
        fps: 6,
        speedFromMotion: true,
        motionBase: 1.5,
        motionFactor: .016,
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
      // Entra rapido no golpe e CONGELA na pose de susto, em vez de correr a
      // folha inteira.
      //
      // Medido quadro a quadro: o quadro 2 e o mais largo (307px, bracos
      // abertos) e o 3 e o mais alto (pe a 53px do chao, pernas no ar). Do 4 em
      // diante e recuperacao — o menino volta ao normal enquanto ainda esta
      // invulneravel, e ai o golpe perde o peso e a animacao rapida so parece
      // defeito, ainda mais junto com o tremor e o pisca-pisca.
      //
      // Parando no 3, a pose de bracos e pernas no ar fica na tela o tempo todo
      // da invulnerabilidade, que e o que se le como "levei um susto".
      hurt: Object.freeze({
        src: 'assets/miguelito/hurt.png',
        frames: 8,
        // Rapido so ate chegar la: 3 quadros a 24fps sao 125ms de entrada.
        fps: 24,
        loop: false,
        holdFrame: 3,
        // Aqui a base varia 53px porque o personagem sai do chao no empurrao.
        // A referencia e o quadro mais baixo, onde ele esta apoiado.
        baseline: 381 / 400,
        contentHeight: 329,
      }),
      // Repete durante os 3,4s entre chegar na raiz final e a proxima fase.
      celebrate: Object.freeze({
        src: 'assets/miguelito/celebrate.png',
        frames: 8,
        fps: 6,
        baseline: 381 / 400,
        contentHeight: 337,
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
