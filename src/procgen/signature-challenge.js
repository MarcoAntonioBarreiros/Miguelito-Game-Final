import { getPhaseManifest } from './campaign-manifest.js';

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

function shiftFrom(level, fromX, deltaY) {
  if (!deltaY) return;
  for (const name of ['platforms', 'exudates', 'crystals', 'enemies', 'allies', 'checkpoints']) {
    for (const entity of level[name] || []) {
      if (!Number.isFinite(entity.x) || entity.x < fromX) continue;
      if (Number.isFinite(entity.y)) entity.y += deltaY;
    }
  }
}

function candidateWindow(level, config, totalChunks) {
  // A janela acompanha o tamanho da fase: um fromChunk fixo em 9 nao sobra
  // candidato nenhum quando a fase e encurtada para 12 chunks.
  const declared = Number.isInteger(config.fromChunk) ? config.fromChunk : 0;
  const from = Math.min(declared, Math.floor(totalChunks * .4));
  const to = Number.isInteger(config.toChunk) ? config.toChunk : totalChunks - 1;
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

  const candidates = candidateWindow(level, config, totalChunks);
  if (candidates.length < 2) return null;

  const route = routePlatforms(level);
  const desiredRise = clamp(Number(config.rise) || 230, 120, 260);
  const highest = 96;

  // Prefere o meio da janela — cedo demais atropela a estreia, tarde demais o
  // jogador ja passou pela pratica sem precisar da mecanica — mas percorre os
  // vizinhos quando o alvo escolhido nao tem altura livre para receber a subida.
  const middle = Math.floor(candidates.length / 2);
  const ordered = [...candidates].sort((a, b) => (
    Math.abs(candidates.indexOf(a) - middle) - Math.abs(candidates.indexOf(b) - middle)
  ));

  for (const target of ordered) {
    const previous = route.find(platform => platform.logicIndex === target.logicIndex - 1);
    if (!previous) continue;

    const currentRise = previous.y - target.y;
    if (currentRise >= desiredRise) {
      level.signatureChallenge = {
        mechanic: config.mechanic || null,
        chunk: target.logicIndex,
        rise: Math.round(currentRise),
        alreadyPresent: true,
      };
      target.signatureChallenge = config.mechanic || true;
      return level.signatureChallenge;
    }

    const deltaY = -(desiredRise - currentRise);
    if (target.y + deltaY < highest) continue;

    // Sobe o destino e tudo que vem depois, para nao quebrar a continuidade da
    // rota nem deixar o resto da fase pendurado.
    shiftFrom(level, target.x, deltaY);
    return finish(level, config, target, previous);
  }
  return null;
}

function finish(level, config, target, previous) {

  target.signatureChallenge = config.mechanic || true;
  level.signatureChallenge = {
    mechanic: config.mechanic || null,
    chunk: target.logicIndex,
    rise: Math.round(previous.y - target.y),
  };
  return level.signatureChallenge;
}
