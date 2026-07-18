import { W } from '../core/constants.js';
import { getPhaseManifest } from './campaign-manifest.js';
import { createRandom } from './random.js';

export const AZOSPIRILLUM_ROOT_LADDER_BLOCK_TYPE = 'azospirillum-root-ladder';

const TAU = Math.PI * 2;
const PRACTICE_WINDOW_CHUNKS = 4;
const MIN_VERTICAL_RISE = 210;
const MAX_VERTICAL_RISE = 300;
const FIRST_DEMONSTRATION_VERTICAL_SPACING = 58;
const BRANCH_WIDTH = 90;
const ROOT_SWAY_MAX = 74;
// A raiz lateral sobe, mas pode inclinar ate aqui para encontrar um bloco.
// Passando disso o destino e ignorado e ela sobe reta.
const MAX_LATERAL_REACH = 360;
// Nitrogenio necessario para a escada atingir o alcance maximo.
const STOCK_FOR_FULL_REACH = 8;
const RUNTIME_STEP_COUNT = 4;
const RUNTIME_GROWTH_SECONDS = 3;
// Sem nitrogenio a raiz lateral mal supera um salto simples; com estoque cheio
// ela alcanca alem do salto duplo. E o estoque que decide, nao a distancia.
const RUNTIME_MIN_REACH = 96;
const RUNTIME_MAX_REACH = 340;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, t) => a + (b - a) * t;

function routePlatforms(level) {
  return (level.platforms || [])
    .filter(platform => !platform.recovery && !platform.final && Number.isInteger(platform.logicIndex))
    .sort((left, right) => left.logicIndex - right.logicIndex || left.x - right.x);
}

function topPoint(platform, x) {
  return {
    x: clamp(x, platform.x + 18, platform.x + platform.w - 18),
    y: platform.y - 6,
  };
}

function occupiesPlatform(entity, platform) {
  if (Number.isFinite(entity?.x)) {
    return entity.x >= platform.x && entity.x <= platform.x + platform.w;
  }
  return Number.isInteger(entity?.logicIndex) && entity.logicIndex === platform.logicIndex;
}

function shiftContentsWithPlatform(level, encounters, platform, deltaY) {
  if (!deltaY) return;
  for (const collection of [
    level.exudates,
    level.crystals,
    level.enemies,
    level.allies,
    level.checkpoints,
    encounters,
  ]) {
    for (const entity of collection || []) {
      if (occupiesPlatform(entity, platform) && Number.isFinite(entity.y)) entity.y += deltaY;
    }
  }
}

function ladderCandidates(level, firstExudate, minimumHostChunk, maximumHostChunk, config) {
  const candidates = [];
  const platforms = (level.platforms || [])
    .filter(platform => !platform.final && Number.isInteger(platform.logicIndex));
  const mainRoute = routePlatforms(level);

  for (const host of platforms) {
    const knownSkill = Boolean(config.knownSkill);
    const recapAccess = Number.isInteger(config.recapAccessChunk)
      && host.logicIndex === config.recapAccessChunk
      && !host.recovery;
    const eligibleHost = recapAccess
      ? !host.recovery
      : knownSkill
        ? host.type === 'root' && !host.recovery
        : host.type === 'root' && Boolean(host.recovery);
    if (
      !eligibleHost
      || host.logicIndex <= firstExudate
      || host.logicIndex < minimumHostChunk
      || host.logicIndex > maximumHostChunk
    ) continue;

    const hostCenter = host.x + host.w / 2;
    const targets = mainRoute.filter(target => (
      target.logicIndex >= host.logicIndex
      && target.logicIndex <= host.logicIndex + 1
      && target !== host
      && target.y < host.y - 60
    ));
    let bestForHost = null;
    for (const destination of targets) {
      const naturalRise = host.y - destination.y;
      const destinationPoint = topPoint(destination, hostCenter);
      const dx = Math.abs(destinationPoint.x - hostCenter);
      if (naturalRise > 360 || dx > 390) continue;
      // Uma habilidade persistente só responde a um desnível que já existe.
      // Ela nunca eleva a plataforma seguinte nem cria um obstáculo artificial.
      if (knownSkill && naturalRise < MIN_VERTICAL_RISE) continue;

      const verticalSpacing = Math.min(
        Number(config.verticalSpacing) || FIRST_DEMONSTRATION_VERTICAL_SPACING,
        FIRST_DEMONSTRATION_VERTICAL_SPACING,
      );
      const desiredRise = clamp(
        verticalSpacing * (config.stepCount + 1),
        MIN_VERTICAL_RISE,
        MAX_VERTICAL_RISE,
      );
      const destinationY = (recapAccess || knownSkill) && config.preserveDestinationHeight
        ? destination.y
        : Math.min(destination.y, host.y - desiredRise);
      const following = mainRoute.find(platform => platform.logicIndex > destination.logicIndex) || null;
      const score = (host.logicIndex - minimumHostChunk) * 1000
        + Math.abs(desiredRise - naturalRise)
        + dx * .35;
      const candidate = {
        host,
        destination,
        following,
        destinationY,
        desiredRise,
        dx,
        recapAccess,
        score,
      };
      if (!bestForHost || candidate.score < bestForHost.score) bestForHost = candidate;
    }
    if (bestForHost) candidates.push(bestForHost);
  }
  return candidates;
}

function buildSteps(slot, config, ladderId) {
  const start = topPoint(slot.host, slot.host.x + slot.host.w / 2);
  const end = topPoint(slot.destination, start.x);
  const swayDirection = Math.sign(end.x - start.x || 1);
  const sway = swayDirection * Math.min(ROOT_SWAY_MAX, 24 + slot.dx * .22);
  return Array.from({ length: config.stepCount }, (_, index) => {
    const t = (index + 1) / (config.stepCount + 1);
    const centerX = lerp(start.x, end.x, t) + Math.sin(t * Math.PI) * sway;
    const y = lerp(start.y, end.y, t);
    return {
      id: `${ladderId}-step-${index + 1}`,
      index,
      centerX,
      y,
      startWidth: 14,
      startHeight: 4,
      targetWidth: BRANCH_WIDTH,
      targetHeight: 12,
      currentWidth: 14,
      currentHeight: 4,
      progress: 0,
      mature: false,
      collider: null,
    };
  });
}

export function generateAzospirillumRootLadders({
  level,
  phase,
  seedValue,
  encounters = [],
  config,
} = {}) {
  level.azospirillumRootLadders = [];
  level.azospirillumRoots = [];
  if (phase < 3 || !config?.enabled || config.count <= 0) return level.azospirillumRootLadders;
  const knownSkill = phase > 3 && Boolean(config.knownSkill);
  if (phase > 3 && !knownSkill && !Number.isInteger(config.recapAccessChunk)) {
    return level.azospirillumRootLadders;
  }

  const firstAzospirillum = encounters
    .filter(encounter => encounter.id === 'azospirillum' && Number.isInteger(encounter.logicIndex))
    .map(encounter => encounter.logicIndex)
    .sort((left, right) => left - right)[0];
  if (!Number.isInteger(firstAzospirillum)) return level.azospirillumRootLadders;

  const unlockChunk = getPhaseManifest(phase)?.unlockEvents
    .find(event => event.feature === 'azospirillumRoots')?.eventChunk ?? firstAzospirillum + 4;
  const recapAccessChunk = Number.isInteger(config.recapAccessChunk)
    ? config.recapAccessChunk
    : null;
  const prerequisiteDeadline = recapAccessChunk ?? unlockChunk;
  const route = routePlatforms(level);
  let firstExudate = (level.exudates || [])
    .filter(exudate => (
      Number.isInteger(exudate.logicIndex)
      && exudate.logicIndex > firstAzospirillum
      && exudate.logicIndex <= prerequisiteDeadline
    ))
    .map(exudate => exudate.logicIndex)
    .sort((left, right) => left - right)[0];
  if (!Number.isInteger(firstExudate)) {
    if (knownSkill) return level.azospirillumRootLadders;
    const prerequisitePlatform = route.find(platform => (
      platform.logicIndex > firstAzospirillum
      && platform.logicIndex <= prerequisiteDeadline
      && platform.w >= 100
    ));
    if (!prerequisitePlatform) return level.azospirillumRootLadders;
    const prerequisiteExudate = {
      logicIndex: prerequisitePlatform.logicIndex,
      x: prerequisitePlatform.x + prerequisitePlatform.w * .62,
      y: prerequisitePlatform.y - 32,
      taken: false,
      azospirillumLadderPrerequisite: true,
    };
    level.exudates = [...(level.exudates || []), prerequisiteExudate];
    firstExudate = prerequisiteExudate.logicIndex;
  }

  const minimumHostChunk = recapAccessChunk
    ?? (knownSkill ? firstExudate + 1 : Math.max(firstExudate + 1, unlockChunk + 1));
  const maximumHostChunk = recapAccessChunk
    ?? (knownSkill ? route.at(-1)?.logicIndex ?? firstExudate : unlockChunk + PRACTICE_WINDOW_CHUNKS);
  const candidates = ladderCandidates(
    level,
    firstExudate,
    minimumHostChunk,
    maximumHostChunk,
    config,
  );
  if (!candidates.length) return level.azospirillumRootLadders;

  const ordered = [...candidates].sort((left, right) => (
    left.host.logicIndex - right.host.logicIndex
    || left.score - right.score
    || left.host.x - right.host.x
  ));
  const random = createRandom(`${seedValue}:azospirillum-root-ladder:p${phase}`);
  const selected = [];
  for (const candidate of ordered) {
    if (selected.some(item => Math.abs(item.host.logicIndex - candidate.host.logicIndex) < 4)) continue;
    selected.push(candidate);
    if (selected.length >= Math.min(config.count, ordered.length)) break;
  }

  level.azospirillumRootLadders = selected
    .sort((left, right) => left.host.x - right.host.x)
    .map((slot, index) => {
      const id = `azo-ladder-${slot.host.logicIndex}-${index}`;
      const originalDestinationY = slot.destination.y;
      const originalDestinationX = slot.destination.x;
      shiftContentsWithPlatform(level, encounters, slot.destination, slot.destinationY - originalDestinationY);
      slot.destination.y = slot.destinationY;
      if (Number.isFinite(slot.destination.rootBaseY)) {
        slot.destination.rootBaseY = slot.destinationY;
      }
      slot.host.wasRecoveryRoot = Boolean(slot.host.recovery);
      slot.host.recovery = false;
      if (slot.recapAccess) slot.host.type = 'root';
      slot.host.azospirillumLadderHost = true;
      slot.host.rootHealth = Number.isFinite(slot.host.rootHealth) ? slot.host.rootHealth : 1;
      slot.host.rootMaxHealth = Number.isFinite(slot.host.rootMaxHealth) ? slot.host.rootMaxHealth : 1;
      slot.destination.azospirillumLadderDestination = true;
      const start = topPoint(slot.host, slot.host.x + slot.host.w / 2);
      const end = topPoint(slot.destination, start.x);
      const ladder = {
        id,
        blockType: AZOSPIRILLUM_ROOT_LADDER_BLOCK_TYPE,
        host: slot.host,
        parent: slot.host,
        destination: slot.destination,
        following: slot.following,
        hostLogicIndex: slot.host.logicIndex,
        destinationLogicIndex: slot.destination.logicIndex,
        originalDestinationY,
        originalDestinationX,
        blockedRise: slot.host.y - slot.destination.y,
        blockedGap: Math.abs(end.x - start.x),
        actualVerticalSpacing: (slot.host.y - slot.destination.y) / (config.stepCount + 1),
        horizontalSpacing: slot.dx,
        sourceAzospirillumLogicIndex: firstAzospirillum,
        sourceExudateLogicIndex: firstExudate,
        recapAccess: slot.recapAccess,
        knownSkill,
        growthDurationSeconds: config.growthDurationSeconds,
        progress: 0,
        visibleProgress: 0,
        mature: false,
        developed: false,
        paused: false,
        colony: null,
        announced: false,
        phase: random() * TAU,
        startX: start.x,
        startY: start.y,
        endX: end.x,
        endY: end.y,
        steps: [],
      };
      ladder.steps = buildSteps(slot, config, id);
      return ladder;
    });
  level.azospirillumRoots = level.azospirillumRootLadders;
  return level.azospirillumRootLadders;
}

function activeAzospirillumColony(inoculants, ladder) {
  return (inoculants.colonies || []).find(colony => (
    colony.type === 'azospirillum'
    && colony.platform === ladder.host
    && colony.growth >= .68
    && colony.vigor > .05
    && !colony.dormant
  )) || null;
}

export function createAzospirillumRootGrowth({ state, entities, inoculants }) {
  let lastToastAt = -Infinity;

  function ladders() {
    return state.level.azospirillumRootLadders || [];
  }

  function removeStepCollider(step) {
    if (!step.collider) return;
    const position = (state.level.platforms || []).indexOf(step.collider);
    if (position >= 0) state.level.platforms.splice(position, 1);
    step.collider = null;
  }

  function removeStepPlatforms() {
    state.level.platforms = (state.level.platforms || [])
      .filter(platform => !platform.azospirillumLadderStep);
    for (const ladder of ladders()) {
      for (const step of ladder.steps || []) step.collider = null;
    }
  }

  function clear() {
    state.level.platforms = (state.level.platforms || [])
      .filter(platform => !platform.azospirillumStructure);
    state.level.azospirillumRootLadders = [];
    state.level.azospirillumRoots = [];
    lastToastAt = -Infinity;
  }

  function reset() {
    removeStepPlatforms();
    for (const ladder of ladders()) {
      ladder.progress = 0;
      ladder.visibleProgress = 0;
      ladder.mature = false;
      ladder.developed = false;
      ladder.paused = false;
      ladder.colony = null;
      ladder.announced = false;
      ladder.host.azospirillumHairDensity = 0;
      for (const step of ladder.steps || []) {
        step.progress = 0;
        step.currentWidth = step.startWidth;
        step.currentHeight = step.startHeight;
        step.mature = false;
        step.collider = null;
      }
    }
    state.level.azospirillumRoots = ladders();
    lastToastAt = -Infinity;
  }

  function announce(text, seconds = 4.6) {
    if (state.time - lastToastAt < 1.6) return;
    state.toast = text;
    state.toastTime = seconds;
    lastToastAt = state.time;
  }

  function activateStepCollider(ladder, step) {
    if (step.collider || !step.mature) return;
    step.collider = {
      x: step.centerX - step.targetWidth / 2,
      y: step.y,
      w: step.targetWidth,
      h: step.targetHeight,
      type: 'root',
      oneWay: true,
      azospirillumStructure: true,
      azospirillumLadderStep: true,
      azospirillumRootLadder: true,
      ladderId: ladder.id,
      stepId: step.id,
      logicIndex: ladder.hostLogicIndex,
      mature: true,
      rootHealth: 1,
      rootMaxHealth: 1,
    };
    state.level.platforms.push(step.collider);
  }

  function updateStep(ladder, step) {
    const localProgress = clamp(ladder.progress * ladder.steps.length - step.index, 0, 1);
    step.progress = Math.max(step.progress, localProgress);
    step.currentWidth = lerp(step.startWidth, step.targetWidth, step.progress);
    step.currentHeight = lerp(step.startHeight, step.targetHeight, step.progress);
    step.mature = step.progress >= 1;
    if (step.mature) activateStepCollider(ladder, step);
    else removeStepCollider(step);
  }

  function updateLadder(ladder, dt) {
    if (ladder.developed) {
      ladder.progress = 1;
      ladder.visibleProgress = 1;
      ladder.mature = true;
      ladder.host.azospirillumHairDensity = 1;
      for (const step of ladder.steps) {
        step.progress = 1;
        step.currentWidth = step.targetWidth;
        step.currentHeight = step.targetHeight;
        step.mature = true;
        activateStepCollider(ladder, step);
      }
      return;
    }

    const colony = activeAzospirillumColony(inoculants, ladder);
    ladder.colony = colony;
    ladder.paused = ladder.progress > 0 && !colony;
    if (!colony) return;

    if (ladder.progress === 0 && !ladder.knownSkill) {
      announce('Azospirillum inoculado: fitormônios iniciaram a escada de ramificações radiculares.');
      entities?.burst?.(colony.x, ladder.host.y, '#72e8dd', 22, 90);
    }
    ladder.progress = clamp(
      ladder.progress + dt / Math.max(.1, ladder.growthDurationSeconds),
      0,
      1,
    );
    ladder.visibleProgress = ladder.progress;
    ladder.host.azospirillumHairDensity = Math.max(
      ladder.host.azospirillumHairDensity || 0,
      ladder.progress,
    );
    colony.stage = ladder.progress < 1 ? 'formando escada radicular' : 'escada radicular madura';
    for (const step of ladder.steps) updateStep(ladder, step);

    ladder.developed = ladder.progress >= 1 && ladder.steps.every(step => step.mature);
    ladder.mature = ladder.developed;
    ladder.paused = false;
    if (ladder.developed && !ladder.announced) {
      ladder.announced = true;
      // Uma escada sem bloco alvo sobe reta: ganha altura, mas nao ha destino
      // com quem compartilhar o sistema radicular.
      if (ladder.destination) {
        ladder.destination.rootSystemId = ladder.host.rootSystemId || `root-system-${ladder.hostLogicIndex}`;
        ladder.host.rootSystemId = ladder.destination.rootSystemId;
      }
      state.player.soil += 4.5;
      state.player.hope += 3.2;
      entities?.burst?.(ladder.endX, ladder.endY, '#d7ba7d', 34, 140);
      announce('Escada radicular madura: todos os degraus agora sustentam Miguelito.', 5.2);
    }
  }

  let runtimeLadderId = 0;

  // A escada e efeito da inoculacao, nao recurso do nivel: onde a colonia de
  // Azospirillum amadurece sobre uma raiz, a raiz lateral sai dali.
  function createRuntimeLadder(host, destination, reach) {
    const start = topPoint(host, host.x + host.w / 2);
    const end = destination
      ? topPoint(destination, start.x)
      : { x: start.x, y: Math.max(70, host.y - reach) };
    if (end.y >= start.y - 40) return null;

    const id = `azo-ladder-runtime-${++runtimeLadderId}`;
    const swayDirection = Math.sign(end.x - start.x || 1);
    const sway = swayDirection * Math.min(ROOT_SWAY_MAX, 18 + Math.abs(end.x - start.x) * .2);
    const steps = Array.from({ length: RUNTIME_STEP_COUNT }, (_, index) => {
      const t = (index + 1) / (RUNTIME_STEP_COUNT + 1);
      return {
        id: `${id}-step-${index + 1}`,
        index,
        centerX: lerp(start.x, end.x, t) + Math.sin(t * Math.PI) * sway,
        y: lerp(start.y, end.y, t),
        startWidth: 14,
        startHeight: 4,
        targetWidth: BRANCH_WIDTH,
        targetHeight: 12,
        currentWidth: 14,
        currentHeight: 4,
        progress: 0,
        mature: false,
        collider: null,
      };
    });

    return {
      id,
      host,
      hostLogicIndex: host.logicIndex ?? -1,
      destination,
      startX: start.x,
      startY: start.y,
      endX: end.x,
      endY: end.y,
      reach,
      steps,
      growthDurationSeconds: RUNTIME_GROWTH_SECONDS,
      phase: (host.x % 97) / 97 * TAU,
      progress: 0,
      visibleProgress: 0,
      mature: false,
      developed: false,
      paused: false,
      announced: false,
      colony: null,
    };
  }

  // O nitrogenio disponivel governa quanto a raiz lateral cresce: fixacao
  // associativa do proprio Azospirillum mais a simbiotica dos nodulos. Trocar a
  // fonte aqui e suficiente para trocar a regra de alcance.
  function nitrogenStock() {
    const associative = state.azospirillumNitrogen?.associativeNitrogenRate || 0;
    const symbiotic = (state.level.rhizobiumNodules || [])
      .reduce((sum, site) => sum + (site.fixationRate || 0), 0);
    return associative + symbiotic;
  }

  function reachFromStock() {
    const supply = clamp(nitrogenStock() / STOCK_FOR_FULL_REACH, 0, 1);
    return RUNTIME_MIN_REACH + supply * (RUNTIME_MAX_REACH - RUNTIME_MIN_REACH);
  }

  // A plataforma e a parede da raiz: a raiz lateral sai dela para cima. Havendo
  // bloco alcancavel, a escada inclina em direcao a ele; senao sobe reta.
  function destinationFor(host, reach) {
    const hostCenter = host.x + host.w / 2;
    let best = null;
    for (const candidate of state.level.platforms || []) {
      if (candidate === host || candidate.azospirillumStructure || candidate.mycorrhizaStructure) continue;
      if (candidate.mycorrhizaIntroDestination) continue;
      const rise = host.y - candidate.y;
      if (rise < 60 || rise > reach) continue;
      const point = topPoint(candidate, hostCenter);
      const dx = Math.abs(point.x - hostCenter);
      if (dx > MAX_LATERAL_REACH) continue;
      const score = dx + rise * .4;
      if (!best || score < best.score) best = { platform: candidate, score };
    }
    return best?.platform || null;
  }

  function spawnLaddersFromColonies() {
    for (const colony of inoculants.colonies || []) {
      if (colony.type !== 'azospirillum' || colony.dormant) continue;
      if (colony.growth < .68 || colony.vigor <= .05) continue;
      const host = colony.platform;
      if (!host || host.type !== 'root' || host.final) continue;
      if (host.azospirillumStructure || host.mycorrhizaStructure) continue;
      if (ladders().some(ladder => ladder.host === host)) continue;

      const reach = reachFromStock();
      const ladder = createRuntimeLadder(host, destinationFor(host, reach), reach);
      if (ladder) state.level.azospirillumRootLadders.push(ladder);
    }
  }

  function update(dt) {
    if (state.gameState !== 'play') return;
    if (!state.level.azospirillumRootLadders) state.level.azospirillumRootLadders = [];
    spawnLaddersFromColonies();
    for (const ladder of ladders()) updateLadder(ladder, dt);
    state.level.azospirillumRoots = ladders();
  }

  function drawLadder(ctx, ladder) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const points = [
      { x: ladder.startX, y: ladder.startY },
      ...ladder.steps.map(step => ({ x: step.centerX, y: step.y + step.currentHeight / 2 })),
      { x: ladder.endX, y: ladder.endY },
    ];
    const visibleSegments = clamp(
      Math.ceil(ladder.visibleProgress * (points.length - 1)),
      0,
      points.length - 1,
    );

    // Mesma topologia da antiga ponte vertical da micorriza: a estrutura
    // detecta a raiz superior e cresce do bloco inferior até ela. Aqui o
    // traço é radicular, não hifal.
    if (visibleSegments > 0) {
      ctx.strokeStyle = ladder.developed ? '#a7784f' : '#c3a172';
      ctx.lineWidth = 5 + ladder.visibleProgress * 2;
      ctx.shadowColor = '#72e8dd';
      ctx.shadowBlur = ladder.developed ? 3 : 8;
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let index = 1; index <= visibleSegments; index++) {
        const previous = points[index - 1];
        const point = points[index];
        ctx.quadraticCurveTo(
          lerp(previous.x, point.x, .55) + Math.sin(index * 1.8 + ladder.phase) * 5,
          lerp(previous.y, point.y, .5),
          point.x,
          point.y,
        );
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    if (ladder.progress === 0) {
      ctx.font = '700 12px Inter,system-ui';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#f3ce68';
      ctx.fillText(
        'Inocule Azospirillum nesta raiz',
        ladder.host.x + ladder.host.w / 2,
        ladder.host.y - 30,
      );
    }
    for (const step of ladder.steps) {
      if (step.progress <= 0) continue;
      const half = step.currentWidth / 2;
      ctx.strokeStyle = step.mature ? '#d6b67d' : '#d8c69d';
      ctx.lineWidth = step.currentHeight;
      ctx.shadowColor = step.mature ? '#9bea8f' : '#72e8dd';
      ctx.shadowBlur = step.mature ? 5 : 11;
      ctx.beginPath();
      ctx.moveTo(step.centerX - half, step.y + step.currentHeight / 2);
      ctx.quadraticCurveTo(
        step.centerX,
        step.y - 3,
        step.centerX + half,
        step.y + step.currentHeight / 2,
      );
      ctx.stroke();
      ctx.shadowBlur = 0;

      const hairCount = Math.floor(step.progress * 5);
      ctx.strokeStyle = 'rgba(238,220,185,.64)';
      ctx.lineWidth = 1;
      for (let hair = 0; hair < hairCount; hair++) {
        const x = step.centerX - half + (hair + 1) / (hairCount + 1) * step.currentWidth;
        ctx.beginPath();
        ctx.moveTo(x, step.y + 1);
        ctx.lineTo(x + (hair % 2 ? 4 : -4), step.y - 8 - (hair % 3));
        ctx.stroke();
      }
    }

    const rootHairCount = Math.floor(ladder.visibleProgress * 12);
    ctx.strokeStyle = 'rgba(214,239,190,.6)';
    ctx.lineWidth = 1;
    for (let index = 0; index < rootHairCount; index++) {
      const t = (index + 1) / (rootHairCount + 1);
      const segment = Math.min(points.length - 2, Math.floor(t * (points.length - 1)));
      const local = t * (points.length - 1) - segment;
      const x = lerp(points[segment].x, points[segment + 1].x, local);
      const y = lerp(points[segment].y, points[segment + 1].y, local);
      const side = index % 2 === 0 ? -1 : 1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + side * (8 + index % 4 * 2), y - 4);
      ctx.stroke();
    }

    if (!ladder.developed && ladder.progress > 0) {
      ctx.font = '700 10px Inter,system-ui';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#a8f0ea';
      ctx.fillText(`Escada radicular ${Math.round(ladder.progress * 100)}%`, ladder.startX, ladder.host.y - 28);
    }
    ctx.restore();
  }

  function render(ctx) {
    if (!ladders().length) return;
    ctx.save();
    ctx.translate(-state.cameraX, 0);
    for (const ladder of ladders()) {
      const minX = Math.min(ladder.startX, ladder.endX) - 100;
      const maxX = Math.max(ladder.startX, ladder.endX) + 100;
      if (maxX < state.cameraX || minX > state.cameraX + W) continue;
      drawLadder(ctx, ladder);
    }
    ctx.restore();
  }

  return {
    get siteCount() { return ladders().filter(ladder => ladder.colony).length; },
    get rootCount() { return ladders().length; },
    get matureCount() { return ladders().filter(ladder => ladder.developed).length; },
    get growingCount() { return ladders().filter(ladder => ladder.progress > 0 && !ladder.developed).length; },
    get pausedCount() { return ladders().filter(ladder => ladder.paused).length; },
    get platformCount() {
      return ladders().reduce((sum, ladder) => sum + ladder.steps.filter(step => step.collider).length, 0);
    },
    get ladders() { return ladders(); },
    clear,
    reset,
    update,
    render,
  };
}
