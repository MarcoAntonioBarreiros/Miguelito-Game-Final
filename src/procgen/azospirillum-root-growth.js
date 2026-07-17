import { W } from '../core/constants.js';
import { getPhaseManifest } from './campaign-manifest.js';
import { createRandom } from './random.js';

export const AZOSPIRILLUM_ROOT_LADDER_BLOCK_TYPE = 'azospirillum-root-ladder';

const TAU = Math.PI * 2;
const FIRST_DEMONSTRATION_VERTICAL_SPACING = 74;
const MIN_VERTICAL_SPACING = 50;
const WALL_OFFSET = 86;
const WALL_WIDTH = 62;
const BRANCH_WIDTH = 104;
const BRANCH_STAGGER = 18;
const EXIT_GAP = 74;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, t) => a + (b - a) * t;

function routePlatforms(level) {
  return (level.platforms || [])
    .filter(platform => !platform.recovery && !platform.final && Number.isInteger(platform.logicIndex))
    .sort((left, right) => left.logicIndex - right.logicIndex || left.x - right.x);
}

function colonizableRoot(platform) {
  return Boolean(
    platform
    && platform.type === 'root'
    && !platform.mycorrhizaStructure
    && !platform.azospirillumStructure
    && !platform.nitrogenRootCollider
    && !platform.fixedObjective,
  );
}

function occupiesPlatform(entity, platform) {
  if (Number.isInteger(entity?.logicIndex)) return entity.logicIndex === platform.logicIndex;
  return Number.isFinite(entity?.x) && entity.x >= platform.x && entity.x <= platform.x + platform.w;
}

function hasCriticalContent(level, encounters, platform) {
  return [
    level.exudates,
    level.crystals,
    level.enemies,
    level.checkpoints,
    encounters,
  ].some(collection => (collection || []).some(entity => occupiesPlatform(entity, platform)));
}

function shuffled(values, random) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index--) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function removeRecoveryPlatforms(level, host, destination) {
  const start = host.x + host.w;
  const end = destination.x + Math.min(destination.w, 80);
  level.platforms = (level.platforms || []).filter(platform => {
    if (!platform.recovery) return true;
    const center = platform.x + platform.w / 2;
    return center <= start || center >= end;
  });
}

function shiftRouteAfter(level, encounters, thresholdX, deltaX) {
  if (deltaX <= 0) return;
  for (const platform of level.platforms || []) {
    if (platform.x >= thresholdX) platform.x += deltaX;
  }
  for (const collection of [
    level.exudates,
    level.crystals,
    level.enemies,
    level.allies,
    level.checkpoints,
    encounters,
  ]) {
    for (const entity of collection || []) {
      if (Number.isFinite(entity.x) && entity.x >= thresholdX) entity.x += deltaX;
      if (Number.isFinite(entity.left) && entity.left >= thresholdX) entity.left += deltaX;
      if (Number.isFinite(entity.right) && entity.right >= thresholdX) entity.right += deltaX;
    }
  }
  if (Number.isFinite(level.endX)) level.endX += deltaX;
  if (Number.isFinite(level.cameraMaxX)) level.cameraMaxX += deltaX;
  const hazardWidth = 500;
  const requiredHazards = Math.ceil((level.endX || 0) / hazardWidth);
  if (!Array.isArray(level.hazards)) level.hazards = [];
  while (level.hazards.length < requiredHazards) {
    const index = level.hazards.length;
    level.hazards.push({ x: index * hazardWidth, y: 674, w: hazardWidth, h: 46 });
  }
}

function shiftAlliesWithPlatform(level, platform, deltaY) {
  if (!deltaY) return;
  for (const ally of level.allies || []) {
    if (occupiesPlatform(ally, platform) && Number.isFinite(ally.y)) ally.y += deltaY;
  }
}

function ladderCandidates(level, encounters, route, firstExudate, minimumHostChunk, maximumHostChunk, config) {
  const candidates = [];
  for (let index = 1; index < route.length - 2; index++) {
    const host = route[index];
    const destination = route[index + 1];
    const following = route[index + 2];
    if (
      !colonizableRoot(host)
      || host.logicIndex <= firstExudate
      || host.logicIndex < minimumHostChunk
      || host.logicIndex > maximumHostChunk
    ) continue;
    if (hasCriticalContent(level, encounters, destination)) continue;
    if (destination.x <= host.x + host.w) continue;

    const availableSpacing = (host.y - 112) / config.stepCount;
    const verticalSpacing = Math.min(
      config.verticalSpacing,
      FIRST_DEMONSTRATION_VERTICAL_SPACING,
      availableSpacing,
    );
    if (verticalSpacing < MIN_VERTICAL_SPACING) continue;

    const wallX = host.x + host.w + WALL_OFFSET;
    const topStepY = host.y - verticalSpacing * config.stepCount;
    const wallTopY = topStepY - 18;
    // A saida permanece em uma altura intermediaria para reconectar a rota
    // procedural sem transformar os degraus numa passarela horizontal.
    const destinationY = Math.min(destination.y, host.y - verticalSpacing * 2);
    const wallBottomY = Math.max(host.y + host.h, destinationY + destination.h);

    candidates.push({
      host,
      destination,
      following,
      verticalSpacing,
      destinationY,
      wallX,
      wallTopY,
      wallBottomY,
    });
  }
  return candidates;
}

function buildSteps(slot, config, ladderId) {
  return Array.from({ length: config.stepCount }, (_, index) => {
    const side = index % 2 === 0 ? -1 : 1;
    const centerX = slot.wallX + WALL_WIDTH / 2 + side * BRANCH_STAGGER;
    const y = slot.host.y - slot.verticalSpacing * (index + 1);
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

  const firstAzospirillum = encounters
    .filter(encounter => encounter.id === 'azospirillum' && Number.isInteger(encounter.logicIndex))
    .map(encounter => encounter.logicIndex)
    .sort((left, right) => left - right)[0];
  if (!Number.isInteger(firstAzospirillum)) return level.azospirillumRootLadders;

  const unlockChunk = getPhaseManifest(phase)?.unlockEvents
    .find(event => event.feature === 'azospirillumRoots')?.eventChunk ?? firstAzospirillum + 4;
  const route = routePlatforms(level);
  let firstExudate = (level.exudates || [])
    .filter(exudate => (
      Number.isInteger(exudate.logicIndex)
      && exudate.logicIndex > firstAzospirillum
      && exudate.logicIndex <= unlockChunk
    ))
    .map(exudate => exudate.logicIndex)
    .sort((left, right) => left - right)[0];
  if (!Number.isInteger(firstExudate)) {
    const prerequisitePlatform = route.find(platform => (
      platform.logicIndex > firstAzospirillum
      && platform.logicIndex <= unlockChunk
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

  const minimumHostChunk = Math.max(firstExudate + 1, unlockChunk + 1);
  const maximumHostChunk = unlockChunk + 12;
  const candidates = ladderCandidates(
    level,
    encounters,
    route,
    firstExudate,
    minimumHostChunk,
    maximumHostChunk,
    config,
  );
  if (!candidates.length) return level.azospirillumRootLadders;

  const ordered = [...candidates].sort((left, right) => (
    left.host.logicIndex - right.host.logicIndex || left.host.x - right.host.x
  ));
  const window = ordered.slice(0, Math.min(ordered.length, Math.max(3, config.count * 3)));
  const random = createRandom(`${seedValue}:azospirillum-root-ladder:p${phase}`);
  const selected = [];
  for (const candidate of shuffled(window, random)) {
    if (selected.some(item => Math.abs(item.host.logicIndex - candidate.host.logicIndex) < 4)) continue;
    selected.push(candidate);
    if (selected.length >= Math.min(config.count, window.length)) break;
  }

  level.azospirillumRootLadders = selected
    .sort((left, right) => left.host.x - right.host.x)
    .map((slot, index) => {
      const id = `azo-ladder-${slot.host.logicIndex}-${index}`;
      const originalDestinationY = slot.destination.y;
      const originalDestinationX = slot.destination.x;
      const desiredDestinationX = slot.wallX + WALL_WIDTH + EXIT_GAP;
      shiftRouteAfter(level, encounters, originalDestinationX, desiredDestinationX - originalDestinationX);
      shiftAlliesWithPlatform(level, slot.destination, slot.destinationY - originalDestinationY);
      slot.destination.y = slot.destinationY;
      if (Number.isFinite(slot.destination.rootBaseY)) {
        slot.destination.rootBaseY = slot.destinationY;
      }
      slot.host.azospirillumLadderHost = true;
      slot.destination.azospirillumLadderDestination = true;
      removeRecoveryPlatforms(level, slot.host, slot.destination);
      const wall = {
        x: slot.wallX,
        y: slot.wallTopY,
        w: WALL_WIDTH,
        h: slot.wallBottomY - slot.wallTopY,
        type: 'root',
        oneWay: false,
        azospirillumStructure: true,
        azospirillumRootWall: true,
        ladderId: id,
        logicIndex: slot.host.logicIndex,
        rootHealth: 1,
        rootMaxHealth: 1,
      };
      level.platforms.push(wall);
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
        blockedRise: slot.host.y - slot.wallTopY,
        blockedGap: slot.destination.x - (slot.host.x + slot.host.w),
        actualVerticalSpacing: slot.verticalSpacing,
        horizontalSpacing: BRANCH_STAGGER * 2,
        wall,
        sourceAzospirillumLogicIndex: firstAzospirillum,
        sourceExudateLogicIndex: firstExudate,
        growthDurationSeconds: config.growthDurationSeconds,
        progress: 0,
        visibleProgress: 0,
        mature: false,
        developed: false,
        paused: false,
        colony: null,
        announced: false,
        phase: random() * TAU,
        startX: slot.wallX + WALL_WIDTH / 2,
        startY: slot.host.y,
        endX: slot.wallX + WALL_WIDTH / 2,
        endY: slot.wallTopY,
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

    if (ladder.progress === 0) {
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
      ladder.destination.rootSystemId = ladder.host.rootSystemId || `root-system-${ladder.hostLogicIndex}`;
      ladder.host.rootSystemId = ladder.destination.rootSystemId;
      state.player.soil += 4.5;
      state.player.hope += 3.2;
      entities?.burst?.(ladder.endX, ladder.endY, '#d7ba7d', 34, 140);
      announce('Escada radicular madura: todos os degraus agora sustentam Miguelito.', 5.2);
    }
  }

  function update(dt) {
    if (state.gameState !== 'play') return;
    for (const ladder of ladders()) updateLadder(ladder, dt);
    state.level.azospirillumRoots = ladders();
  }

  function drawLadder(ctx, ladder) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const wall = ladder.wall;
    const wallCenter = wall.x + wall.w / 2;
    const wallGradient = ctx.createLinearGradient(wall.x, 0, wall.x + wall.w, 0);
    wallGradient.addColorStop(0, '#72513c');
    wallGradient.addColorStop(.45, '#bb8c5c');
    wallGradient.addColorStop(1, '#5f4235');
    ctx.fillStyle = wallGradient;
    ctx.shadowColor = 'rgba(126,224,157,.35)';
    ctx.shadowBlur = 8;
    ctx.fillRect(wall.x, wall.y, wall.w, wall.h);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(151,232,158,.72)';
    ctx.lineWidth = 2;
    ctx.strokeRect(wall.x, wall.y, wall.w, wall.h);
    ctx.strokeStyle = 'rgba(238,213,169,.28)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(wall.x + wall.w * .33, wall.y + 8);
    ctx.bezierCurveTo(
      wall.x + wall.w * .18,
      wall.y + wall.h * .35,
      wall.x + wall.w * .7,
      wall.y + wall.h * .68,
      wall.x + wall.w * .52,
      wall.y + wall.h - 8,
    );
    ctx.stroke();

    // A ligação com a raiz hospedeira é curta; a navegação cresce para cima,
    // nunca como uma passarela horizontal até a próxima plataforma.
    ctx.strokeStyle = '#9b704c';
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(ladder.host.x + ladder.host.w - 18, ladder.host.y + 12);
    ctx.quadraticCurveTo(wall.x - 18, ladder.host.y + 18, wallCenter, ladder.host.y + 8);
    ctx.stroke();

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

    const wallHairCount = Math.floor(ladder.visibleProgress * 14);
    ctx.strokeStyle = 'rgba(214,239,190,.6)';
    ctx.lineWidth = 1;
    for (let index = 0; index < wallHairCount; index++) {
      const y = ladder.host.y - 18 - index / Math.max(1, wallHairCount - 1)
        * Math.max(20, ladder.host.y - wall.y - 34);
      const side = index % 2 === 0 ? -1 : 1;
      const x = side < 0 ? wall.x : wall.x + wall.w;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + side * (8 + index % 4 * 2), y - 5);
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
