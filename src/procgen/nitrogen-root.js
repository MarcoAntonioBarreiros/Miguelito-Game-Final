import { W } from '../core/constants.js';
import { createRandom } from './random.js';

export const NITROGEN_ROOT_BLOCK_TYPE = 'underdeveloped-nitrogen-root';

const TAU = Math.PI * 2;
const PHASE_TWO_MAX_ORDINARY_GAP = 142;
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

function shuffled(values, random) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index--) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function occupiesPlatform(entity, platform) {
  if (Number.isInteger(entity?.logicIndex)) return entity.logicIndex === platform.logicIndex;
  return Number.isFinite(entity?.x) && entity.x >= platform.x && entity.x <= platform.x + platform.w;
}

function hasCriticalContent(level, encounters, platform) {
  const collections = [
    level.exudates,
    level.crystals,
    level.enemies,
    level.allies,
    level.checkpoints,
    encounters,
  ];
  return collections.some(collection => (collection || []).some(entity => occupiesPlatform(entity, platform)));
}

function routeGapCandidates(level, encounters, route, firstExudate) {
  const candidates = [];
  for (let routeIndex = 2; routeIndex < route.length - 1; routeIndex++) {
    const targetPlatform = route[routeIndex];
    if (!colonizableRoot(targetPlatform) || hasCriticalContent(level, encounters, targetPlatform)) continue;

    const leftPlatform = route[routeIndex - 1];
    const rightPlatform = route[routeIndex + 1];
    const hostPlatform = [...route.slice(0, routeIndex)].reverse().find(platform => (
      colonizableRoot(platform) && platform.logicIndex > firstExudate
    ));
    if (!hostPlatform || hostPlatform.logicIndex >= targetPlatform.logicIndex) continue;

    const blockedGapWidth = rightPlatform.x - (leftPlatform.x + leftPlatform.w);
    const leftLandingGap = targetPlatform.x - (leftPlatform.x + leftPlatform.w);
    const rightLandingGap = rightPlatform.x - (targetPlatform.x + targetPlatform.w);
    if (
      blockedGapWidth <= PHASE_TWO_MAX_ORDINARY_GAP
      || leftLandingGap > PHASE_TWO_MAX_ORDINARY_GAP
      || rightLandingGap > PHASE_TWO_MAX_ORDINARY_GAP
    ) continue;
    candidates.push({
      hostPlatform,
      targetPlatform,
      leftPlatform,
      rightPlatform,
      blockedGapWidth,
      leftLandingGap,
      rightLandingGap,
    });
  }
  return candidates;
}

function removeGapPlatforms(level, slot) {
  const gapStart = slot.leftPlatform.x + slot.leftPlatform.w;
  const gapEnd = slot.rightPlatform.x;
  level.platforms = (level.platforms || []).filter(platform => {
    if (platform === slot.targetPlatform) return false;
    if (!platform.recovery) return true;
    const center = platform.x + platform.w / 2;
    return center <= gapStart || center >= gapEnd;
  });
}

export function generateUnderdevelopedNitrogenRoots({
  level,
  phase,
  seedValue,
  encounters = [],
  config,
} = {}) {
  level.nitrogenRoots = [];
  if (phase < 2 || !config?.enabled || config.count <= 0) return level.nitrogenRoots;

  const rhizobiumIndexes = encounters
    .filter(encounter => encounter.id === 'rhizobium' && Number.isInteger(encounter.logicIndex))
    .map(encounter => encounter.logicIndex)
    .sort((left, right) => left - right);
  if (!rhizobiumIndexes.length) return level.nitrogenRoots;

  const firstRhizobium = rhizobiumIndexes[0];
  const exudateIndexes = (level.exudates || [])
    .filter(exudate => Number.isInteger(exudate.logicIndex) && exudate.logicIndex > firstRhizobium)
    .map(exudate => exudate.logicIndex)
    .sort((left, right) => left - right);
  if (!exudateIndexes.length) return level.nitrogenRoots;

  const firstExudate = exudateIndexes[0];
  const route = routePlatforms(level);
  const candidates = routeGapCandidates(level, encounters, route, firstExudate);
  if (!candidates.length) return level.nitrogenRoots;

  const random = createRandom(`${seedValue}:nitrogen-root:p${phase}`);
  const selected = [];
  for (const candidate of shuffled(candidates, random)) {
    if (selected.some(existing => Math.abs(existing.targetPlatform.logicIndex - candidate.targetPlatform.logicIndex) < 3)) continue;
    selected.push(candidate);
    if (selected.length >= Math.min(config.count, candidates.length)) break;
  }
  level.nitrogenRoots = selected.map((slot, index) => {
    const { hostPlatform, targetPlatform, leftPlatform, rightPlatform } = slot;
    removeGapPlatforms(level, slot);
    return {
      id: `nitrogen-root-${targetPlatform.logicIndex}-${index}`,
      blockType: NITROGEN_ROOT_BLOCK_TYPE,
      hostPlatform,
      hostLogicIndex: hostPlatform.logicIndex,
      targetPlatform,
      targetLogicIndex: targetPlatform.logicIndex,
      leftPlatform,
      rightPlatform,
      blockedGapWidth: slot.blockedGapWidth,
      leftLandingGap: slot.leftLandingGap,
      rightLandingGap: slot.rightLandingGap,
      sourceRhizobiumLogicIndex: firstRhizobium,
      sourceExudateLogicIndex: firstExudate,
      x: targetPlatform.x,
      y: targetPlatform.y,
      startWidth: Math.min(38, Math.round(targetPlatform.w * .2)),
      startHeight: 8,
      targetWidth: targetPlatform.w,
      targetHeight: targetPlatform.h,
      currentWidth: Math.min(38, Math.round(targetPlatform.w * .2)),
      currentHeight: 8,
      progress: 0,
      functionalProgress: 0,
      stage: 'underdeveloped',
      developed: false,
      paused: false,
      requiredFixationRate: config.requiredFixationRate,
      growthDurationSeconds: config.growthDurationSeconds,
      phase: random() * TAU,
      collider: null,
      activeSite: null,
      announced: false,
    };
  });
  return level.nitrogenRoots;
}

function removeCollider(state, root) {
  if (!root.collider) return;
  const index = (state.level.platforms || []).indexOf(root.collider);
  if (index >= 0) state.level.platforms.splice(index, 1);
  root.collider = null;
}

function updateCollider(state, root) {
  const fullyDeveloped = root.developed && root.progress >= 1;
  root.functionalProgress = fullyDeveloped ? 1 : 0;
  if (!fullyDeveloped) {
    removeCollider(state, root);
    return;
  }
  if (!root.collider) {
    root.collider = {
      ...root.targetPlatform,
      type: 'root',
      nitrogenRootCollider: true,
      nitrogenRootId: root.id,
      logicIndex: root.targetLogicIndex,
      rootHealth: 1,
      rootMaxHealth: 1,
      supportIntegrity: 1,
    };
    state.level.platforms.push(root.collider);
  }
  Object.assign(root.collider, {
    x: root.x,
    y: root.y,
    w: root.targetWidth,
    h: root.targetHeight,
    oneWay: false,
    mature: true,
  });
}

function associatedNodule(state, root) {
  return (state.level.rhizobiumNodules || []).find(site => site.platform === root.hostPlatform) || null;
}

export function createNitrogenRootDevelopment({ state, entities = null } = {}) {
  function clear() {
    for (const root of state.level.nitrogenRoots || []) removeCollider(state, root);
    state.level.nitrogenRoots = [];
  }

  function reset() {
    for (const root of state.level.nitrogenRoots || []) {
      removeCollider(state, root);
      root.progress = 0;
      root.functionalProgress = 0;
      root.currentWidth = root.startWidth;
      root.currentHeight = root.startHeight;
      root.stage = 'underdeveloped';
      root.developed = false;
      root.paused = false;
      root.activeSite = null;
      root.announced = false;
    }
  }

  function updateRoot(root, dt) {
    if (root.developed) {
      root.progress = 1;
      root.currentWidth = root.targetWidth;
      root.currentHeight = root.targetHeight;
      updateCollider(state, root);
      return;
    }

    const site = associatedNodule(state, root);
    root.activeSite = site;
    const mature = Boolean(site?.mature || site?.stage === 'mature-nodule');
    const fixationActive = mature && (site.fixationRate || 0) >= root.requiredFixationRate;
    root.paused = root.progress > 0 && !fixationActive;
    if (!fixationActive) {
      updateCollider(state, root);
      return;
    }

    const wasStarted = root.progress > 0;
    root.progress = clamp(root.progress + dt / Math.max(.1, root.growthDurationSeconds), 0, 1);
    root.currentWidth = lerp(root.startWidth, root.targetWidth, root.progress);
    root.currentHeight = lerp(root.startHeight, root.targetHeight, root.progress);
    root.stage = root.progress < .22
      ? 'receiving-nitrogen'
      : root.progress < 1 ? 'growing' : 'developed';
    root.developed = root.progress >= 1;
    root.paused = false;
    updateCollider(state, root);

    if (!wasStarted) entities?.burst?.(site.x, site.surfaceY + site.depth, '#ffd783', 18, 75);
    if (root.developed && !root.announced) {
      root.announced = true;
      state.toast = 'FBN ativa: o nitrogenio sustentou o desenvolvimento de uma nova plataforma radicular.';
      state.toastTime = 4.8;
      entities?.burst?.(root.x + root.targetWidth * .65, root.y, '#d9c48b', 34, 120);
    }
  }

  function update(dt) {
    if (state.gameState !== 'play') return;
    for (const root of state.level.nitrogenRoots || []) updateRoot(root, dt);
  }

  function drawRoot(ctx, root) {
    const progress = clamp(root.progress, 0, 1);
    const colorProgress = .18 + progress * .82;
    const width = root.currentWidth;
    const height = root.currentHeight;
    const hostX = root.hostPlatform.x + root.hostPlatform.w - 12;
    const hostY = root.hostPlatform.y + 12;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = `rgba(${Math.round(180 + colorProgress * 32)},${Math.round(174 + colorProgress * 14)},${Math.round(146 - colorProgress * 34)},${.42 + colorProgress * .5})`;
    ctx.lineWidth = 3 + progress * 8;
    ctx.beginPath();
    ctx.moveTo(hostX, hostY);
    ctx.bezierCurveTo(hostX + 22, hostY - 12, root.x - 18, root.y + height * .7, root.x + 5, root.y + height * .55);
    ctx.stroke();

    const gradient = ctx.createLinearGradient(0, root.y, 0, root.y + height);
    gradient.addColorStop(0, progress < .35 ? '#c8c3a6' : '#d9b477');
    gradient.addColorStop(.28, progress < .35 ? '#9b9786' : '#ad774e');
    gradient.addColorStop(1, progress < .35 ? '#5f5b58' : '#2b1c25');
    ctx.fillStyle = gradient;
    ctx.strokeStyle = progress >= 1 ? '#98e287' : `rgba(222,213,173,${.35 + progress * .45})`;
    ctx.lineWidth = 1.4 + progress;
    ctx.beginPath();
    ctx.roundRect(root.x, root.y, width, height, 5 + progress * 10);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = `rgba(255,235,181,${.16 + progress * .4})`;
    ctx.lineWidth = 2 + progress * 3;
    ctx.beginPath();
    ctx.moveTo(root.x + 8, root.y + 3);
    ctx.lineTo(root.x + width - 8, root.y + 3);
    ctx.stroke();

    if (progress > .38) {
      const hairProgress = clamp((progress - .38) / .62, 0, 1);
      const count = Math.floor(2 + hairProgress * 11);
      ctx.strokeStyle = `rgba(230,218,185,${.24 + hairProgress * .52})`;
      ctx.lineWidth = 1;
      for (let index = 0; index < count; index++) {
        const x = root.x + 14 + (index + .5) / count * Math.max(8, width - 28);
        const direction = index % 2 ? 1 : -1;
        ctx.beginPath();
        ctx.moveTo(x, root.y + height - 2);
        ctx.quadraticCurveTo(x + direction * 6, root.y + height + 8, x + direction * 10, root.y + height + 15 + (index % 3) * 3);
        ctx.stroke();
      }
    }

    const site = root.activeSite;
    if (site?.mature && (site.fixationRate || 0) >= root.requiredFixationRate && !root.developed) {
      const sourceY = site.surfaceY + site.depth;
      for (let index = 0; index < 7; index++) {
        const travel = (state.time * .5 + index / 7 + root.phase) % 1;
        const x = lerp(site.x, root.x + Math.min(width * .72, root.targetWidth * .6), travel);
        const y = lerp(sourceY, root.y + height * .42, travel) - Math.sin(travel * Math.PI) * 18;
        ctx.globalAlpha = .3 + .65 * Math.sin(travel * Math.PI);
        ctx.fillStyle = index % 2 ? '#ffd783' : '#8db8ff';
        ctx.beginPath();
        ctx.arc(x, y, 2.2 + (index % 2), 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  function render(ctx) {
    const roots = state.level.nitrogenRoots || [];
    if (!roots.length) return;
    ctx.save();
    ctx.translate(-state.cameraX, 0);
    for (const root of roots) {
      if (root.x + root.currentWidth < state.cameraX - 100 || root.x > state.cameraX + W + 100) continue;
      drawRoot(ctx, root);
    }
    ctx.restore();
  }

  return {
    clear,
    reset,
    update,
    render,
    get rootCount() { return (state.level.nitrogenRoots || []).length; },
    get developedCount() { return (state.level.nitrogenRoots || []).filter(root => root.developed).length; },
    get growingCount() { return (state.level.nitrogenRoots || []).filter(root => root.progress > 0 && !root.developed).length; },
  };
}
