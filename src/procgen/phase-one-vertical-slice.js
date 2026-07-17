import { getPhaseManifest } from './campaign-manifest.js';

const BLOCK_LAYOUTS = Object.freeze({
  'phase1-intro-v1': Object.freeze({
    roles: ['coleta', 'gradiente', 'encontro', 'inoculacao', 'observacao'],
    yOffsets: [0, -24, -42, -12, 8],
    targetChunk: 7,
    targetId: 'p1-intro-root',
    exudateChunks: [4, 5, 7],
  }),
  'phase1-final-v1': Object.freeze({
    roles: ['coleta-final', 'bacillus-conhecido', 'recrutamento-final', 'inoculacao-final', 'raiz-prova'],
    yOffsets: [8, -18, -34, -12, 4],
    targetChunk: 39,
    targetId: 'p1-exit-root',
    exudateChunks: [35, 37, 39],
  }),
});

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function mainPlatform(level, logicIndex) {
  return (level.platforms || []).find(platform => (
    !platform.recovery && !platform.final && platform.logicIndex === logicIndex
  ));
}

function authorGeometry(level, segment, template) {
  const platforms = [];
  for (let chunk = segment.from; chunk <= segment.to; chunk++) {
    const platform = mainPlatform(level, chunk);
    if (!platform) throw new Error(`${segment.id}: plataforma principal ausente no chunk ${chunk}.`);
    platforms.push(platform);
  }

  const left = platforms[0].x;
  const right = platforms[platforms.length - 1].x + platforms[platforms.length - 1].w;
  const slot = (right - left) / platforms.length;
  const startY = platforms[0].y;
  const endY = platforms[platforms.length - 1].y;

  platforms.forEach((platform, index) => {
    const progress = index / Math.max(1, platforms.length - 1);
    const authoredOffset = index === 0 || index === platforms.length - 1
      ? 0
      : template.yOffsets[index] * .15;
    platform.x = left + slot * index;
    platform.y = clamp(startY + (endY - startY) * progress + authoredOffset, 285, 545);
    platform.w = index === platforms.length - 1
      ? right - platform.x
      : Math.max(122, slot - 58);
    platform.h = 64;
    platform.type = 'root';
    platform.authored = true;
    platform.fixedBlockId = segment.id;
    platform.fixedRole = template.roles[index];
  });

  const target = mainPlatform(level, template.targetChunk);
  if (template.targetId) {
    target.objectiveTarget = template.targetId;
    target.fixedObjective = true;
  }

  const last = platforms[platforms.length - 1];
  const next = mainPlatform(level, segment.to + 1);
  const gateX = next
    ? last.x + last.w + Math.max(26, (next.x - (last.x + last.w)) / 2)
    : last.x + last.w + 39;

  return {
    platforms,
    target,
    startX: platforms[0].x,
    endX: last.x + last.w,
    gateX,
  };
}

function addAuthoredExudates(level, chunks) {
  for (const chunk of chunks) {
    const platform = mainPlatform(level, chunk);
    if (!platform) continue;
    level.exudates.push({
      logicIndex: chunk,
      x: platform.x + platform.w * .5,
      y: platform.y - 34,
      taken: false,
      authored: true,
    });
  }
}

export function applyPhaseOneVerticalSlice(level, phase = level.campaignPhase) {
  if (phase !== 1) return level;
  const manifest = getPhaseManifest(1);
  const authoredSegments = manifest.segments.filter(segment => segment.fixedBlock);

  level.fixedBlocks = [];
  level.authoredEncounters = [];
  // Na primeira fase, o primeiro biofilme deve ser uma ação do jogador.
  // Checkpoints procedurais criavam biofilmes naturais e antecipavam Bacillus.
  level.checkpoints = [];
  level.platforms = level.platforms.filter(platform => (
    !platform.recovery
    || !authoredSegments.some(segment => platform.logicIndex >= segment.from && platform.logicIndex <= segment.to)
  ));
  level.exudates = (level.exudates || []).filter(exudate => (
    Number.isInteger(exudate.logicIndex)
    && exudate.logicIndex >= 9
    && !authoredSegments.some(segment => exudate.logicIndex >= segment.from && exudate.logicIndex <= segment.to)
  ));

  for (const segment of authoredSegments) {
    const template = BLOCK_LAYOUTS[segment.fixedBlock.template];
    if (!template) throw new Error(`${segment.id}: template fixo desconhecido ${segment.fixedBlock.template}.`);
    const geometry = authorGeometry(level, segment, template);
    addAuthoredExudates(level, template.exudateChunks);
    const completion = segment.fixedBlock.completionRef === 'finalTest'
      ? manifest.finalTest.requires
      : segment.fixedBlock.completion;
    level.fixedBlocks.push({
      id: segment.id,
      kind: segment.kind,
      template: segment.fixedBlock.template,
      objective: segment.fixedBlock.objective,
      completion: completion.map(condition => ({ ...condition })),
      exitGate: segment.fixedBlock.exitGate === true,
      startX: geometry.startX,
      endX: geometry.endX,
      gateX: geometry.gateX,
      targetPlatform: geometry.target,
      completed: false,
    });
    for (let chunk = segment.from; chunk <= segment.to; chunk++) {
      if (level.debugInfo?.[chunk]) {
        level.debugInfo[chunk].authored = true;
        level.debugInfo[chunk].fixedBlockId = segment.id;
      }
    }
  }

  const finalBacillusPlatform = mainPlatform(level, 36);
  if (finalBacillusPlatform) {
    level.authoredEncounters.push({
      id: 'bacillus',
      x: finalBacillusPlatform.x + finalBacillusPlatform.w / 2,
      y: Math.max(95, finalBacillusPlatform.y - 104),
      r: 155,
      territory: 360,
      collect: false,
      logicIndex: 36,
      source: 'fixed-practice',
    });
  }
  return level;
}

export function createFixedBlockRuntime({ state, evaluator, entities }) {
  let lastBlockedAt = -Infinity;

  function activeBlocks() {
    return state.level.fixedBlocks || [];
  }

  function missingText(block, result) {
    const missing = result.results.find(entry => !entry.passed);
    if (!missing) return '';
    if (missing.condition.key === 'deployedExudateCount') return 'libere pelo menos um exsudato com E';
    if (missing.condition.key === 'functionalBiofilmCount') {
      return block.kind === 'final'
        ? 'volte à raiz da prova com halo amarelo e forme o biofilme nela'
        : 'volte à raiz de treinamento com halo amarelo e inocule Bacillus nela';
    }
    return 'complete o objetivo ecológico indicado';
  }

  function completeBlock(block) {
    block.completed = true;
    block.completedAt = state.time;
    state.toast = block.kind === 'final'
      ? 'Prova final concluída: a raiz de saída recebeu um biofilme funcional.'
      : 'Módulo concluído: recrutamento, inoculação e biofilme confirmados.';
    state.toastTime = 5.2;
    entities.burst(block.gateX, block.targetPlatform.y - 70, '#8ff2c1', 34, 150);
  }

  function holdAtGate(block, result) {
    const player = state.player;
    const right = player.x + player.w;
    if (!block.exitGate || block.completed || right <= block.gateX) return;
    player.x = block.gateX - player.w - 2;
    player.vx = Math.min(0, player.vx);
    if (state.time - lastBlockedAt < 2.4) return;
    lastBlockedAt = state.time;
    state.toast = `Saída bloqueada: ${missingText(block, result)}.`;
    state.toastTime = 4.2;
  }

  function update() {
    if (state.gameState !== 'play') return;
    const centerX = state.player.x + state.player.w / 2;
    for (const block of activeBlocks()) {
      const result = evaluator.evaluate(block.completion);
      if (!block.completed && result.passed) completeBlock(block);
      holdAtGate(block, result);
      if (centerX >= block.startX - 260 && centerX <= block.gateX + 80) {
        state.mission = block.completed
          ? `${block.objective} Objetivo concluído; prossiga.`
          : centerX > block.targetPlatform.x + block.targetPlatform.w
            ? `${block.objective} ← Volte à raiz com halo amarelo.`
            : block.objective;
      }
    }
  }

  function render(ctx) {
    ctx.save();
    ctx.translate(-(state.cameraX || 0), 0);
    for (const block of activeBlocks()) {
      const target = block.targetPlatform;
      if (!target?.objectiveTarget) continue;
      const x = target.x + target.w / 2;
      const y = target.y - 72;
      const label = block.completed
        ? 'BIOFILME CONFIRMADO'
        : block.kind === 'final'
          ? '↓ ALVO DA PROVA — FORME O BIOFILME AQUI'
          : '↓ ALVO DA MISSÃO — INOCULE BACILLUS AQUI';

      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '900 13px Inter,system-ui';
      const width = ctx.measureText(label).width + 30;
      ctx.fillStyle = 'rgba(3,18,24,.9)';
      ctx.strokeStyle = block.completed ? '#9bea8f' : '#ffd56f';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(x - width / 2, y - 16, width, 32, 16);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = block.completed ? '#bff5b7' : '#ffe58f';
      ctx.fillText(label, x, y + .5);
      ctx.restore();
    }
    ctx.restore();
  }

  function finalBlockCompleted() {
    const block = activeBlocks().find(candidate => candidate.kind === 'final');
    return !block || block.completed;
  }

  return { update, render, finalBlockCompleted };
}
