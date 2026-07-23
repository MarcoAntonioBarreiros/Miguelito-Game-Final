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
  // A geometria macro pertence ao desafio. Elementos apoiados nas plataformas
  // sao sincronizados uma unica vez ao final do pipeline por seu vinculo
  // explicito/logicIndex; move-los aqui por faixa de x criava deslocamentos
  // duplos e falhava quando o sprite estava fora da largura atual do bloco.
  for (const platform of level.platforms || []) {
    if (!Number.isFinite(platform.x) || platform.x < fromX) continue;
    if (deltaY && Number.isFinite(platform.y)) {
      platform.y += deltaY;
      if (Number.isFinite(platform.rootBaseY)) platform.rootBaseY += deltaY;
    }
    if (deltaX) platform.x += deltaX;
  }

  // As raizes de fundo nao carregam logicIndex. Elas pertencem ao trecho por
  // coordenada e precisam acompanhar a transformacao para nao ficarem
  // suspensas na posicao anterior.
  for (const root of level.roots || []) {
    if (!Number.isFinite(root.x) || root.x < fromX) continue;
    if (deltaY && Number.isFinite(root.y)) root.y += deltaY;
    if (deltaX) root.x += deltaX;
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

// O gerador espalha plataformas de recuperacao dentro dos vaos comuns, para
// perdoar um pulo errado. Num vao criado de proposito para exigir a mecanica da
// fase, essa gentileza desmonta o desafio: uma plataformazinha de 82px no meio
// transforma o vao de 330px em dois pulinhos que o salto duplo vence sem
// pensar. Era o caso em 12 de 12 seeds da fase 4 — o jogador atravessava a fase
// inteira sem nunca precisar da ponte, e por isso a prova final nunca
// registrava.
//
// A validacao por fisica nao pegava isso porque validateChunk monta um nivel com
// apenas as duas plataformas da travessia: o vao era medido isolado, sem o que
// havia no meio dele.
function clearRecoveryInside(level, fromX, toX) {
  let removed = 0;
  level.platforms = (level.platforms || []).filter(platform => {
    if (!platform.recovery) return true;
    const center = platform.x + platform.w / 2;
    if (center <= fromX || center >= toX) return true;
    removed++;
    return false;
  });
  return removed;
}

function record(level, config, target, previous, alreadyPresent) {
  clearRecoveryInside(level, previous.x + previous.w, target.x);
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
