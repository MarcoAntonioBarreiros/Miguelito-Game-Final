import { getPhaseManifest } from './campaign-manifest.js';
import { validateChunk } from './agents.js';

const DOUBLE_JUMP = Object.freeze({ id: 'running-double-jump-late', requires: ['doubleJump'] });

// Estimar pelo numero do vao nao basta: uma queda de poucos pixels alonga o
// salto e devolve a travessia ao alcance do salto duplo. Quem decide e a fisica.
function defeatsDoubleJump(previous, target) {
  return !validateChunk(previous, target, DOUBLE_JUMP, 'normal');
}

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

// O gerador limita a subida de qualquer travessia a 112px, e o salto duplo
// alcanca 180px. Ou seja: nenhuma subida procedural jamais exige a escada de
// Azospirillum, em nenhuma seed e em nenhum tamanho de fase. O mesmo vale para a
// ponte micorrizica no eixo horizontal. A mecanica-tema da fase existia,
// funcionava, e nunca era necessaria.
//
// Este passo cria a necessidade: depois da rota pronta, eleva (ou afasta) um
// destino ate a faixa em que so a mecanica da fase resolve. O valor vem do
// manifesto, entao cada fase declara o proprio desafio e fases curtas demais
// simplesmente nao recebem nenhum.

function routePlatforms(level) {
  return (level.platforms || [])
    .filter(platform => !platform.recovery && !platform.final && Number.isInteger(platform.logicIndex))
    .sort((a, b) => a.logicIndex - b.logicIndex || a.x - b.x);
}

function shiftFrom(level, fromX, deltaY, deltaX = 0) {
  if (!deltaY && !deltaX) return;
  for (const name of ['platforms', 'exudates', 'crystals', 'enemies', 'allies', 'checkpoints']) {
    for (const entity of level[name] || []) {
      if (!Number.isFinite(entity.x) || entity.x < fromX) continue;
      if (deltaY && Number.isFinite(entity.y)) entity.y += deltaY;
      if (deltaX) entity.x += deltaX;
    }
  }
  if (deltaX) {
    if (Number.isFinite(level.endX)) level.endX += deltaX;
    if (Number.isFinite(level.cameraMaxX)) level.cameraMaxX += deltaX;
  }
}

function candidateWindow(level, config, totalChunks, manifest) {
  // A janela acompanha o tamanho da fase: um fromChunk fixo em 9 nao sobra
  // candidato nenhum quando a fase e encurtada para 12 chunks.
  // O inicio da janela acompanha a estreia da mecanica quando o manifesto a
  // aponta: um fromChunk fixo nao sobrevive ao reescalonamento da fase.
  const debut = config.afterPresentation
    ? manifest?.presentations?.find(item => item.id === config.afterPresentation)
    : null;
  const declared = Number.isInteger(debut?.debutChunk)
    ? debut.debutChunk + 1
    : Number.isInteger(config.fromChunk) ? config.fromChunk : 0;
  const from = Math.min(declared, Math.floor(totalChunks * .4));

  // Um poder adquirido depois pode tornar o desafio trivial — o dash vence o
  // vao que so a ponte deveria vencer. Quando o manifesto aponta esse poder, a
  // janela termina antes dele, e acompanha o reescalonamento da fase.
  const blocking = config.beforeUnlock
    ? manifest?.unlockEvents?.find(event => event.feature === config.beforeUnlock)
    : null;
  const ceiling = Number.isInteger(blocking?.eventChunk)
    ? blocking.eventChunk - 1
    : totalChunks - 1;
  const to = Math.min(
    Number.isInteger(config.toChunk) ? config.toChunk : totalChunks - 1,
    ceiling,
  );
  return routePlatforms(level).filter(platform => (
    platform.logicIndex > from
    && platform.logicIndex <= to
    && platform.w >= (config.minimumWidth || 130)
    && !platform.mycorrhizaIntroDestination
    && !platform.fixedObjective
    && !platform.authoredPhaseFive
  ));
}

export function applySignatureChallenge(level, phase) {
  const manifest = getPhaseManifest(phase);
  const config = manifest?.signatureChallenge;
  if (!config?.enabled) return null;

  const totalChunks = manifest.totalChunks || level.debugInfo?.length || 0;
  // Fase curta demais nao comporta o desafio sem atropelar a apresentacao.
  if (totalChunks < (config.minimumChunks || 8)) return null;

  const candidates = candidateWindow(level, config, totalChunks, manifest);
  if (candidates.length < 2) return null;

  const route = routePlatforms(level);
  const horizontal = config.kind === 'gap';
  const highest = 96;

  // Prefere o meio da janela — cedo demais atropela a estreia, tarde demais o
  // jogador ja passou pela pratica sem precisar da mecanica — mas percorre os
  // vizinhos quando o alvo escolhido nao comporta a mudanca.
  const middle = Math.floor(candidates.length / 2);
  const ordered = [...candidates].sort((a, b) => (
    Math.abs(candidates.indexOf(a) - middle) - Math.abs(candidates.indexOf(b) - middle)
  ));

  for (const target of ordered) {
    const previous = route.find(platform => platform.logicIndex === target.logicIndex - 1);
    if (!previous) continue;

    if (horizontal) {
      // A ponte micorrizica so vale entre 325 e 340px: abaixo o salto duplo
      // vence, acima a propria ponte nao alcanca. E o dash passa nessa faixa,
      // por isso o desafio precisa ficar antes do desbloqueio dele.
      // A ponte e horizontal, e uma queda ate o destino alonga o salto. O
      // desnivel precisa ser quase nulo para o vao valer o que promete.
      if (Math.abs(target.y - previous.y) > 22) continue;

      const currentGap = target.x - (previous.x + previous.w);
      const desired = clamp(Number(config.gap) || 330, 300, 340);
      let applied = 0;
      let venceu = false;
      // Sobe o vao dentro do alcance da ponte ate a fisica confirmar que o salto
      // duplo nao vence. Acima de 340px a propria ponte deixa de alcancar.
      for (const alvo of [desired, 335, 340]) {
        if (alvo <= currentGap + applied) continue;
        const passo = alvo - (currentGap + applied);
        shiftFrom(level, target.x, 0, passo);
        applied += passo;
        if (defeatsDoubleJump(previous, target)) { venceu = true; break; }
      }
      if (venceu) return record(level, config, target, previous, false);
      // Nao deu: devolve a geometria e tenta o proximo candidato.
      if (applied) shiftFrom(level, target.x, 0, -applied);
      continue;
    }

    const desiredRise = clamp(Number(config.rise) || 230, 120, 260);
    const currentRise = previous.y - target.y;
    if (currentRise >= desiredRise) return record(level, config, target, previous, true);

    const deltaY = -(desiredRise - currentRise);
    if (target.y + deltaY < highest) continue;

    // Sobe o destino e tudo que vem depois, para nao quebrar a continuidade da
    // rota nem deixar o resto da fase pendurado.
    shiftFrom(level, target.x, deltaY);
    return record(level, config, target, previous, false);
  }
  return null;
}

function record(level, config, target, previous, alreadyPresent) {
  target.signatureChallenge = config.mechanic || true;
  level.signatureChallenge = {
    mechanic: config.mechanic || null,
    kind: config.kind || 'rise',
    chunk: target.logicIndex,
    rise: Math.round(previous.y - target.y),
    gap: Math.round(target.x - (previous.x + previous.w)),
    alreadyPresent,
  };
  return level.signatureChallenge;
}
