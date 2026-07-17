import { H, W } from '../core/constants.js';

const TAU = Math.PI * 2;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, t) => a + (b - a) * t;

function topPoint(platform, x) {
  return {
    x: clamp(x, platform.x + 18, platform.x + platform.w - 18),
    y: platform.y - 6,
  };
}

function platformDistance(platform, x, y) {
  const point = topPoint(platform, x);
  return { point, distance: Math.hypot(point.x - x, point.y - y) };
}

function nearestSourcePlatform(state, cloud, maxDistance = 165) {
  let best = null;
  let bestDistance = maxDistance;
  for (const platform of state.level.platforms || []) {
    if (platform.final || platform.mycorrhizaStructure) continue;
    const { point, distance } = platformDistance(platform, cloud.x, cloud.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = { platform, point, distance };
    }
  }
  return best;
}

function horizontalGap(source, target) {
  if (target.x >= source.x + source.w) return target.x - (source.x + source.w);
  if (source.x >= target.x + target.w) return source.x - (target.x + target.w);
  return 0;
}

function findLadderTarget(state, sourceInfo) {
  const source = sourceInfo.platform;
  const sourceCenter = source.x + source.w / 2;
  let best = null;
  let bestScore = Infinity;

  for (const target of state.level.platforms || []) {
    if (target === source || target.final || target.recovery || target.mycorrhizaStructure) continue;
    const rise = source.y - target.y;
    if (rise < 78 || rise > 360) continue;
    const targetPoint = topPoint(target, sourceCenter);
    const dx = Math.abs(targetPoint.x - sourceInfo.point.x);
    if (dx > 390) continue;
    const score = rise + dx * .78 + (target.type === 'root' ? -18 : 0);
    if (score < bestScore) {
      bestScore = score;
      best = { target, targetPoint, rise, dx };
    }
  }
  return best;
}

function findBridgeTarget(state, sourceInfo, cloud) {
  const source = sourceInfo.platform;
  const sourceCenter = source.x + source.w / 2;
  const direction = cloud.x >= sourceCenter ? 1 : -1;
  let best = null;
  let bestScore = Infinity;

  for (const target of state.level.platforms || []) {
    if (target === source || target.final || target.recovery || target.mycorrhizaStructure) continue;
    const targetCenter = target.x + target.w / 2;
    if ((targetCenter - sourceCenter) * direction <= 0) continue;
    const gap = horizontalGap(source, target);
    if (gap < 58 || gap > 340) continue;
    const dy = Math.abs(target.y - source.y);
    if (dy > 105) continue;
    const score = gap + dy * 2.2 + (target.type === 'root' ? -12 : 0);
    if (score < bestScore) {
      bestScore = score;
      const startX = direction > 0 ? source.x + source.w - 12 : source.x + 12;
      const endX = direction > 0 ? target.x + 12 : target.x + target.w - 12;
      best = {
        target,
        start: { x: startX, y: source.y - 7 },
        end: { x: endX, y: target.y - 7 },
        gap,
        dy,
      };
    }
  }
  return best;
}

function buildLadderGeometry(sourceInfo, candidate) {
  const start = sourceInfo.point;
  const end = candidate.targetPoint;
  const rise = Math.max(1, start.y - end.y);
  const steps = clamp(Math.ceil(rise / 38), 3, 9);
  const points = [];
  const colliders = [];
  const sway = Math.sign(end.x - start.x || 1) * Math.min(78, 24 + candidate.dx * .22);

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const arc = Math.sin(t * Math.PI) * sway;
    const x = lerp(start.x, end.x, t) + arc;
    const y = lerp(start.y, end.y, t);
    points.push({ x, y });
    if (i > 0 && i < steps) {
      colliders.push({
        x: x - 35,
        y: y - 5,
        w: 70,
        h: 10,
        type: 'root',
        mycorrhizaStructure: true,
        structureType: 'ladder',
      });
    }
  }
  return { start, end, points, colliders, length: Math.hypot(end.x - start.x, end.y - start.y) };
}

function buildBridgeGeometry(candidate) {
  const { start, end } = candidate;
  const distance = Math.hypot(end.x - start.x, end.y - start.y);
  const segments = clamp(Math.ceil(distance / 58), 3, 8);
  const points = [];
  const colliders = [];
  const sag = Math.min(28, distance * .08);

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const y = lerp(start.y, end.y, t) + Math.sin(t * Math.PI) * sag;
    const x = lerp(start.x, end.x, t);
    points.push({ x, y });
    if (i < segments) {
      const nextT = (i + 1) / segments;
      const nextX = lerp(start.x, end.x, nextT);
      const nextY = lerp(start.y, end.y, nextT) + Math.sin(nextT * Math.PI) * sag;
      const minX = Math.min(x, nextX);
      colliders.push({
        x: minX - 5,
        y: Math.min(y, nextY) - 5,
        w: Math.abs(nextX - x) + 10,
        h: 12 + Math.abs(nextY - y),
        type: 'root',
        mycorrhizaStructure: true,
        structureType: 'bridge',
      });
    }
  }
  return { start, end, points, colliders, length: distance };
}

function sameConnection(structure, source, target) {
  return (
    (structure.source === source && structure.target === target)
    || (structure.source === target && structure.target === source)
  );
}

export function createMycorrhizaStructures({ state, entities }) {
  const structures = [];
  let nextId = 1;
  let lastToastAt = -Infinity;

  function clear() {
    structures.length = 0;
    if (state.level.platforms) {
      state.level.platforms = state.level.platforms.filter(platform => !platform.mycorrhizaStructure);
    }
    nextId = 1;
    lastToastAt = -Infinity;
  }

  function reset() {
    clear();
  }

  function createStructure(cloud, sourceInfo, type, candidate) {
    const geometry = type === 'ladder'
      ? buildLadderGeometry(sourceInfo, candidate)
      : buildBridgeGeometry(candidate);
    const target = candidate.target;
    if (structures.some(item => sameConnection(item, sourceInfo.platform, target))) {
      cloud.mycorrhizaStructureHandled = true;
      return null;
    }

    const structure = {
      id: `myco-structure-${nextId++}`,
      type,
      source: sourceInfo.platform,
      target,
      start: geometry.start,
      end: geometry.end,
      points: geometry.points,
      colliders: geometry.colliders,
      length: geometry.length,
      progress: 0,
      maturity: 0,
      mature: false,
      phase: Math.random() * TAU,
      cloudId: cloud.id,
      growthDuration: clamp(2.8 + geometry.length / 115, 3.6, 7.2),
    };
    structures.push(structure);
    cloud.mycorrhizaStructureHandled = true;
    cloud.life = Math.max(cloud.life, 4.5);
    entities.burst(structure.start.x, structure.start.y, '#d6afff', 20, 110);
    state.toast = type === 'ladder'
      ? 'Micorriza orientada: a rede começou a formar uma escada hifal até a raiz superior.'
      : 'Micorriza orientada: a rede começou a conectar as duas raízes sobre o vão.';
    state.toastTime = 4.8;
    return structure;
  }

  function tryCreateFromCloud(cloud) {
    if (!state.player.canDash || cloud.mycorrhizaStructureHandled) return;
    const age = (cloud.maxLife || 10) - cloud.life;
    if (age < .55 || cloud.radius < 72) return;
    const sourceInfo = nearestSourcePlatform(state, cloud);
    if (!sourceInfo) {
      if (age > 2.2) cloud.mycorrhizaStructureHandled = true;
      return;
    }

    const nearEdge = Math.min(
      Math.abs(cloud.x - sourceInfo.platform.x),
      Math.abs(cloud.x - (sourceInfo.platform.x + sourceInfo.platform.w)),
    ) < 94;

    if (sourceInfo.platform.recovery) {
      const ladder = findLadderTarget(state, sourceInfo);
      if (ladder) {
        createStructure(cloud, sourceInfo, 'ladder', ladder);
        return;
      }
    }

    if (nearEdge) {
      const bridge = findBridgeTarget(state, sourceInfo, cloud);
      if (bridge) {
        createStructure(cloud, sourceInfo, 'bridge', bridge);
        return;
      }
    }

    const ladder = findLadderTarget(state, sourceInfo);
    if (ladder && ladder.rise > 105) {
      createStructure(cloud, sourceInfo, 'ladder', ladder);
      return;
    }

    const bridge = findBridgeTarget(state, sourceInfo, cloud);
    if (bridge) {
      createStructure(cloud, sourceInfo, 'bridge', bridge);
      return;
    }

    if (age > 2.2) cloud.mycorrhizaStructureHandled = true;
  }

  function rebuildCollisionPlatforms() {
    state.level.platforms = (state.level.platforms || [])
      .filter(platform => !platform.mycorrhizaStructure);
    const matureColliders = structures
      .filter(structure => structure.mature)
      .flatMap(structure => structure.colliders);
    state.level.platforms.push(...matureColliders);
  }

  function update(dt) {
    if (state.gameState !== 'play') return;
    for (const cloud of state.level.exudateClouds || []) tryCreateFromCloud(cloud);

    let collisionDirty = false;
    for (const structure of structures) {
      if (structure.mature) continue;
      structure.progress = clamp(structure.progress + dt / structure.growthDuration, 0, 1);
      if (structure.progress > .72) {
        structure.maturity = clamp(structure.maturity + dt * .56, 0, 1);
      }
      if (structure.progress >= 1 && structure.maturity >= 1) {
        structure.mature = true;
        collisionDirty = true;
        state.player.hope += structure.type === 'ladder' ? 3.5 : 3;
        state.player.soil += 1.6;
        entities.burst(structure.end.x, structure.end.y, '#d6afff', 34, 175);
        if (state.time - lastToastAt > 1.5) {
          state.toast = structure.type === 'ladder'
            ? 'Escada micorrízica madura: os ramos espessados agora sustentam Miguelito.'
            : 'Ponte micorrízica madura: o feixe hifal agora pode ser atravessado.';
          state.toastTime = 5;
          lastToastAt = state.time;
        }
      }
    }
    if (collisionDirty) rebuildCollisionPlatforms();
  }

  function drawPath(ctx, structure, visibleCount) {
    const points = structure.points.slice(0, Math.max(2, visibleCount));
    if (points.length < 2) return;
    const matureAlpha = structure.mature ? .92 : .34 + structure.maturity * .42;

    for (let strand = -1; strand <= 1; strand++) {
      ctx.strokeStyle = strand === 0
        ? `rgba(244,226,255,${matureAlpha})`
        : `rgba(182,137,232,${matureAlpha * .68})`;
      ctx.lineWidth = strand === 0 ? (structure.mature ? 3.4 : 2.2) : 1.3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      points.forEach((point, index) => {
        const previous = points[Math.max(0, index - 1)];
        const next = points[Math.min(points.length - 1, index + 1)];
        const angle = Math.atan2(next.y - previous.y, next.x - previous.x) + Math.PI / 2;
        const wave = Math.sin(index * 1.7 + structure.phase + strand) * (structure.mature ? 2.2 : 4.5);
        const x = point.x + Math.cos(angle) * (strand * 4 + wave);
        const y = point.y + Math.sin(angle) * (strand * 4 + wave);
        index ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      });
      ctx.stroke();
    }
  }

  function drawStructure(ctx, structure) {
    const segmentProgress = structure.progress * (structure.points.length - 1);
    const visibleCount = clamp(Math.ceil(segmentProgress) + 1, 2, structure.points.length);
    drawPath(ctx, structure, visibleCount);

    const visiblePoints = structure.points.slice(0, visibleCount);
    ctx.shadowBlur = structure.mature ? 16 : 9;
    ctx.shadowColor = '#d6afff';

    if (structure.type === 'ladder') {
      visiblePoints.forEach((point, index) => {
        if (index === 0 || index === structure.points.length - 1) return;
        const alpha = structure.mature ? .82 : .2 + structure.maturity * .38;
        ctx.strokeStyle = `rgba(226,198,255,${alpha})`;
        ctx.lineWidth = structure.mature ? 3 : 1.5;
        const width = structure.mature ? 34 : 24;
        ctx.beginPath();
        ctx.moveTo(point.x - width, point.y);
        ctx.quadraticCurveTo(point.x, point.y - 6, point.x + width, point.y);
        ctx.stroke();
        for (let k = -1; k <= 1; k++) {
          ctx.fillStyle = `rgba(240,220,255,${alpha * .8})`;
          ctx.beginPath();
          ctx.arc(point.x + k * width * .48, point.y - 1, structure.mature ? 2.7 : 1.7, 0, TAU);
          ctx.fill();
        }
      });
    } else {
      for (let i = 1; i < visiblePoints.length - 1; i++) {
        const point = visiblePoints[i];
        ctx.fillStyle = structure.mature ? '#ead3ff' : 'rgba(214,175,255,.45)';
        ctx.beginPath();
        ctx.arc(point.x, point.y, structure.mature ? 4.2 : 2.4, 0, TAU);
        ctx.fill();
      }
    }

    const tip = visiblePoints[visiblePoints.length - 1];
    ctx.fillStyle = '#fff3ff';
    ctx.beginPath();
    ctx.arc(tip.x, tip.y, 3.5 + Math.sin(state.time * 5 + structure.phase), 0, TAU);
    ctx.fill();
    ctx.shadowBlur = 0;

    if (!structure.mature && Math.abs(structure.start.x - (state.cameraX + W / 2)) < W * .8) {
      const percent = Math.round((structure.progress * .72 + structure.maturity * .28) * 100);
      ctx.font = '700 10px Inter,system-ui';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#f4e6ff';
      ctx.fillText(`${structure.type === 'ladder' ? 'escada' : 'ponte'} micorrízica ${percent}%`, structure.start.x, structure.start.y - 26);
    }
  }

  function render(ctx) {
    if (!structures.length) return;
    ctx.save();
    ctx.translate(-state.cameraX, 0);
    for (const structure of structures) {
      if (structure.end.x < state.cameraX - 180 || structure.start.x > state.cameraX + W + 180) continue;
      drawStructure(ctx, structure);
    }
    ctx.restore();
  }

  return {
    get structureCount() { return structures.length; },
    get matureCount() { return structures.filter(structure => structure.mature).length; },
    get growingCount() { return structures.filter(structure => !structure.mature).length; },
    get ladderCount() { return structures.filter(structure => structure.type === 'ladder').length; },
    get bridgeCount() { return structures.filter(structure => structure.type === 'bridge').length; },
    clear,
    reset,
    update,
    render,
  };
}
