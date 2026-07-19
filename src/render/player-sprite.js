// Skin de sprite para o jogador.
//
// O astronauta e desenhado a mao no canvas e funciona. Esta camada nao o
// substitui: ela se oferece como alternativa e some sozinha se qualquer coisa
// der errado. Sem folha configurada, folha que nao carrega, folha com medida
// impossivel — em todos os casos isFallback() responde true e o renderer
// continua desenhando o astronauta. Trocar de skin nunca pode ser um jeito de
// ficar sem personagem.
//
// A folha e uma tira horizontal de quadros de largura igual. A largura de cada
// quadro sai de image.width / frames, entao basta declarar quantos quadros a
// tira tem.

const STATE_FALLBACK = Object.freeze({
  idle: ['idle', 'run'],
  run: ['run', 'idle'],
  jump: ['jump', 'run', 'idle'],
  fall: ['fall', 'jump', 'run', 'idle'],
  dash: ['dash', 'run', 'idle'],
  hurt: ['hurt', 'idle', 'run'],
  celebrate: ['celebrate', 'idle', 'run'],
  pulse: ['pulse', 'idle', 'run'],
});

function loadSheet(definition) {
  const sheet = {
    ...definition,
    image: null,
    ready: false,
    failed: false,
  };
  if (typeof Image === 'undefined') {
    sheet.failed = true;
    return sheet;
  }
  const image = new Image();
  image.onload = () => {
    // Uma folha sem largura util e tao inutil quanto uma que nao carregou, e
    // deixar passar renderiza um quadro de largura zero — personagem invisivel.
    if (!image.naturalWidth || !image.naturalHeight) { sheet.failed = true; return; }
    sheet.image = image;
    sheet.ready = true;
  };
  image.onerror = () => { sheet.failed = true; };
  image.src = definition.src;
  return sheet;
}

export function createPlayerSprite(skin) {
  if (!skin?.states) return null;

  const sheets = new Map();
  for (const [name, definition] of Object.entries(skin.states)) {
    sheets.set(name, loadSheet({ frames: 1, fps: 12, loop: true, ...definition }));
  }

  // Escala: a arte se ajusta pela altura da caixa de colisao, nunca o
  // contrario. A fisica ja esta medida e calibrada em 32x48 — mudar a caixa
  // para caber num desenho invalidaria todas as travessias validadas.
  const heightScale = Number(skin.heightScale) || 1;
  const offsetX = Number(skin.offsetX) || 0;
  const offsetY = Number(skin.offsetY) || 0;

  function resolve(requested) {
    const chain = STATE_FALLBACK[requested] || [requested, 'idle', 'run'];
    for (const name of chain) {
      const sheet = sheets.get(name);
      if (sheet?.ready) return sheet;
    }
    for (const sheet of sheets.values()) if (sheet.ready) return sheet;
    return null;
  }

  function stateFor(player) {
    if (!player.alive) return 'hurt';
    if (player.invuln > 0) return 'hurt';
    if (player.dashTime > 0) return 'dash';
    if (!player.onGround) return player.vy < 0 ? 'jump' : 'fall';
    if (Math.abs(player.vx) > 12) return 'run';
    return 'idle';
  }

  function frameIndex(sheet, player, time) {
    const frames = Math.max(1, Math.floor(sheet.frames));
    if (frames === 1) return 0;
    // A corrida acompanha a velocidade: a passada acelera junto com o
    // personagem em vez de patinar num compasso fixo.
    const rate = sheet.speedFromMotion
      ? Math.min(sheet.fps * 1.6, 4 + Math.abs(player.vx) * .055)
      : sheet.fps;
    const raw = Math.floor(time * rate);
    return sheet.loop === false ? Math.min(frames - 1, raw) : ((raw % frames) + frames) % frames;
  }

  function draw(ctx, player, time) {
    const sheet = resolve(stateFor(player));
    if (!sheet) return false;

    const frames = Math.max(1, Math.floor(sheet.frames));
    const frameWidth = sheet.image.naturalWidth / frames;
    const frameHeight = sheet.image.naturalHeight;
    if (!(frameWidth > 0) || !(frameHeight > 0)) return false;

    const drawHeight = player.h * heightScale;
    const drawWidth = frameWidth * (drawHeight / frameHeight);
    const index = frameIndex(sheet, player, time);

    // O renderer ja aplicou translate para o centro do jogador e o scale do
    // facing, entao aqui basta desenhar em torno da origem. Os pes encostam na
    // base da caixa de colisao: e o pe que precisa bater na plataforma.
    const footY = player.h / 2;
    ctx.drawImage(
      sheet.image,
      index * frameWidth, 0, frameWidth, frameHeight,
      -drawWidth / 2 + offsetX, footY - drawHeight + offsetY, drawWidth, drawHeight,
    );
    return true;
  }

  return {
    draw,
    // Enquanto nenhuma folha estiver pronta o astronauta continua no comando.
    // Isso cobre tanto a falha permanente quanto os primeiros quadros, antes de
    // a imagem terminar de carregar.
    isFallback: () => ![...sheets.values()].some(sheet => sheet.ready),
    debug: () => [...sheets.entries()].map(([name, sheet]) => ({
      name, src: sheet.src, ready: sheet.ready, failed: sheet.failed, frames: sheet.frames,
    })),
  };
}
