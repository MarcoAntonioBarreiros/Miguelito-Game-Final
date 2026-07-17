import { W } from '../core/constants.js';

const TAU = Math.PI * 2;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, t) => a + (b - a) * t;

const STAGES = ['rhizoplane', 'auxin-signal', 'primordium', 'emergence', 'elongation', 'mature'];
const STAGE_DURATION = {
  rhizoplane: 1.8,
  'auxin-signal': 2.5,
  primordium: 3.2,
  emergence: 2.2,
  elongation: 5.6,
};

function compatibleHost(colony) {
  return Boolean(
    colony?.platform
    && colony.platform.type === 'root'
    && !colony.platform.mycorrhizaStructure,
  );
}

function bezierPoint(root, t) {
  const u = 1 - t;
  return {
    x: u * u * u * root.startX
      + 3 * u * u * t * root.c1x
      + 3 * u * t * t * root.c2x
      + t * t * t * root.endX,
    y: u * u * u * root.startY
      + 3 * u * u * t * root.c1y
      + 3 * u * t * t * root.c2y
      + t * t * t * root.endY,
  };
}

function stageLabel(root, site) {
  if (!site.compatible) return 'sem raiz hospedeira';
  if (root?.paused) return 'desenvolvimento pausado — pouco carbono';
  if (!root) return site.roots.length ? 'aguardando novo exsudato' : 'rizoplano ativo';
  if (root.stage === 'rhizoplane') return 'aderência ao rizoplano';
  if (root.stage === 'auxin-signal') return 'sinalização hormonal';
  if (root.stage === 'primordium') return 'primórdio de raiz lateral';
  if (root.stage === 'emergence') return 'emergência da raiz lateral';
  if (root.stage === 'elongation') return 'alongamento da raiz lateral';
  return 'raiz lateral madura';
}

export function createAzospirillumRootGrowth({ state, entities, inoculants }) {
  const sites = new Map();
  const roots = [];
  let nextRootId = 1;
  let lastToastAt = -Infinity;

  function generatedPlatforms() {
    return (state.level.platforms || []).filter(platform => platform.azospirillumStructure);
  }

  function removeGeneratedPlatforms() {
    const platforms = state.level.platforms || [];
    for (let i = platforms.length - 1; i >= 0; i--) {
      if (platforms[i].azospirillumStructure) platforms.splice(i, 1);
    }
  }

  function clear() {
    removeGeneratedPlatforms();
    sites.clear();
    roots.length = 0;
    nextRootId = 1;
    lastToastAt = -Infinity;
    state.level.azospirillumRoots = roots;
  }

  function reset() {
    clear();
  }

  function cloudKey(cloud, index) {
    return cloud.id ?? `${Math.round(cloud.x)}:${Math.round(cloud.y)}:${index}`;
  }

  function nearbyClouds(colony) {
    return (state.level.exudateClouds || [])
      .map((cloud, index) => ({ cloud, key: cloudKey(cloud, index) }))
      .filter(({ cloud }) => Math.hypot(cloud.x - colony.x, cloud.y - colony.y) < Math.max(170, cloud.radius * 2.25));
  }

  function createSite(colony) {
    const site = {
      colony,
      compatible: compatibleHost(colony),
      roots: [],
      activeRoot: null,
      cooldown: 0,
      usedClouds: new Set(nearbyClouds(colony).map(item => item.key)),
      announcedIncompatible: false,
    };
    sites.set(colony.id, site);
    return site;
  }

  function syncSites() {
    const colonies = (inoculants.colonies || []).filter(colony => colony.type === 'azospirillum');
    const activeIds = new Set(colonies.map(colony => colony.id));
    for (const colony of colonies) {
      let site = sites.get(colony.id);
      if (!site) site = createSite(colony);
      site.colony = colony;
      site.compatible = compatibleHost(colony);
    }
    for (const [id, site] of sites) {
      if (activeIds.has(id)) continue;
      for (const root of site.roots) removeRootPlatforms(root);
      sites.delete(id);
    }
    state.level.azospirillumRoots = roots;
  }

  function announce(text, seconds = 4.8) {
    if (state.time - lastToastAt < 1.7) return;
    state.toast = text;
    state.toastTime = seconds;
    lastToastAt = state.time;
  }

  function sideClearance(parent, direction) {
    const edge = direction > 0 ? parent.x + parent.w : parent.x;
    let clearance = 270;
    for (const platform of state.level.platforms || []) {
      if (platform === parent || platform.mycorrhizaStructure || platform.azospirillumStructure) continue;
      const verticalNear = platform.y < parent.y + 125 && platform.y + platform.h > parent.y - 75;
      if (!verticalNear) continue;
      if (direction > 0 && platform.x >= edge) clearance = Math.min(clearance, platform.x - edge - 16);
      if (direction < 0 && platform.x + platform.w <= edge) clearance = Math.min(clearance, edge - (platform.x + platform.w) - 16);
    }
    return clamp(clearance, 115, 270);
  }

  function chooseDirection(site, cueCloud = null) {
    const colony = site.colony;
    const parent = colony.platform;
    if (cueCloud && Math.abs(cueCloud.x - colony.x) > 28) return Math.sign(cueCloud.x - colony.x);
    const left = sideClearance(parent, -1);
    const right = sideClearance(parent, 1);
    if (Math.abs(left - right) > 28) return right > left ? 1 : -1;
    return colony.x >= parent.x + parent.w / 2 ? 1 : -1;
  }

  function createRoot(site, cueCloud = null) {
    const colony = site.colony;
    const parent = colony.platform;
    const direction = chooseDirection(site, cueCloud);
    const clearance = sideClearance(parent, direction);
    const sourceBoost = Math.max(0, (colony.sourceCount || 1) - 1) * 18;
    const length = clamp(145 + sourceBoost + colony.vigor * 58, 145, clearance);
    const startX = clamp(colony.x, parent.x + 18, parent.x + parent.w - 18);
    const startY = parent.y + clamp(parent.h * .2, 8, 18);
    const cloudDrop = cueCloud ? clamp(cueCloud.y - startY, 18, 88) : 44;
    const drop = clamp(34 + cloudDrop * .35 + site.roots.length * 13, 38, 86);
    const root = {
      id: `azo-root-${nextRootId++}`,
      site,
      colony,
      parent,
      direction,
      startX,
      startY,
      c1x: startX + direction * length * .26,
      c1y: startY + 5,
      c2x: startX + direction * length * .72,
      c2y: startY + drop * .58,
      endX: startX + direction * length,
      endY: startY + drop,
      length,
      stage: 'rhizoplane',
      progress: 0,
      visibleProgress: 0,
      paused: false,
      mature: false,
      colliders: [],
      phase: Math.random() * TAU,
      age: 0,
    };
    site.activeRoot = root;
    site.roots.push(root);
    roots.push(root);
    colony.vigor = clamp(colony.vigor - .045, 0, 1);
    announce('Azospirillum aderido: a sinalização hormonal começou a reorganizar a arquitetura da raiz.');
    return root;
  }

  function removeRootPlatforms(root) {
    const platforms = state.level.platforms || [];
    const id = root.id;
    for (let i = platforms.length - 1; i >= 0; i--) {
      if (platforms[i].rootStructureId === id) platforms.splice(i, 1);
    }
    root.colliders.length = 0;
  }

  function buildColliders(root) {
    if (root.colliders.length) return;
    const count = clamp(Math.round(root.length / 44), 4, 7);
    for (let i = 0; i < count; i++) {
      const t = .26 + (i / Math.max(1, count - 1)) * .72;
      const point = bezierPoint(root, t);
      const next = bezierPoint(root, Math.min(1, t + .025));
      const slope = Math.abs(next.x - point.x) < 1 ? 0 : (next.y - point.y) / (next.x - point.x);
      const width = clamp(root.length / count * 1.12, 38, 58);
      const platform = {
        x: point.x - width / 2,
        y: point.y - 5 + Math.min(4, Math.abs(slope) * 5),
        w: width,
        h: 11,
        type: 'root',
        oneWay: true,
        azospirillumStructure: true,
        rootStructureId: root.id,
        logicIndex: root.parent.logicIndex ?? -1,
      };
      root.colliders.push(platform);
      state.level.platforms.push(platform);
    }
  }

  function advanceStage(root) {
    const index = STAGES.indexOf(root.stage);
    const next = STAGES[Math.min(STAGES.length - 1, index + 1)];
    root.stage = next;
    root.progress = 0;
    if (next === 'auxin-signal') {
      announce('Sinalização hormonal: o Azospirillum estimula um novo ponto de ramificação na raiz.');
    } else if (next === 'primordium') {
      announce('Primórdio lateral: células internas da raiz iniciaram a formação de um novo meristema.');
    } else if (next === 'emergence') {
      announce('Emergência: a nova raiz lateral rompeu os tecidos externos e começou a explorar o solo.');
    } else if (next === 'elongation') {
      entities.burst(root.startX, root.startY, '#72e8dd', 24, 105);
    } else if (next === 'mature') {
      root.mature = true;
      root.visibleProgress = 1;
      buildColliders(root);
      root.site.activeRoot = null;
      root.site.cooldown = 9.5;
      root.colony.vigor = clamp(root.colony.vigor - .12, 0, 1);
      state.player.soil += 4.5;
      state.player.hope += 3.2;
      entities.burst(root.endX, root.endY, '#d7ba7d', 34, 145);
      announce('Raiz lateral madura: uma nova superfície radicular agora pode sustentar Miguelito e receber outros simbiontes.', 5.6);
    }
  }

  function updateRoot(root, dt) {
    root.age += dt;
    const colony = root.colony;
    const carbon = clamp(colony.vigor * .82 + (colony.rechargeIntensity || 0) * .42, 0, 1.18);
    root.paused = colony.dormant || colony.vigor < .07;
    colony.stage = stageLabel(root, root.site);
    if (root.mature || root.paused) return;

    const duration = STAGE_DURATION[root.stage] || 1;
    const sourceBoost = 1 + Math.max(0, (colony.sourceCount || 1) - 1) * .11;
    root.progress = clamp(root.progress + dt * Math.max(.12, carbon) * sourceBoost / duration, 0, 1);
    if (root.stage === 'elongation') root.visibleProgress = root.progress;
    else if (STAGES.indexOf(root.stage) >= STAGES.indexOf('emergence')) root.visibleProgress = Math.max(root.visibleProgress, .08 + root.progress * .12);

    const stageCost = root.stage === 'elongation' ? .0105 : .0065;
    colony.vigor = clamp(colony.vigor - dt * stageCost * (1 + root.length / 260), 0, 1);
    if (root.progress >= 1) advanceStage(root);
  }

  function newCueCloud(site) {
    const candidates = nearbyClouds(site.colony)
      .filter(item => !site.usedClouds.has(item.key))
      .sort((a, b) => b.cloud.life - a.cloud.life);
    if (!candidates.length) return null;
    const chosen = candidates[0];
    site.usedClouds.add(chosen.key);
    return chosen.cloud;
  }

  function updateSite(site, dt) {
    const colony = site.colony;
    site.cooldown = Math.max(0, site.cooldown - dt);

    if (!site.compatible) {
      colony.stage = 'rizosfera sem raiz hospedeira';
      if (!site.announcedIncompatible) {
        site.announcedIncompatible = true;
        announce('Azospirillum sem hospedeiro: a comunidade permanece no solo, mas não induz raízes laterais fora de uma raiz viva.');
      }
      return;
    }

    if (site.activeRoot) {
      updateRoot(site.activeRoot, dt);
      return;
    }

    colony.stage = stageLabel(null, site);
    if (site.roots.length === 0) {
      if (colony.growth >= .68 && colony.vigor > .24 && !colony.dormant) createRoot(site);
      return;
    }

    if (site.roots.length >= 2 || site.cooldown > 0 || colony.vigor < .34 || colony.dormant) return;
    const cue = newCueCloud(site);
    if (cue) createRoot(site, cue);
  }

  function update(dt) {
    if (state.gameState !== 'play') return;
    syncSites();
    for (const site of sites.values()) updateSite(site, dt);
  }

  function drawSignal(ctx, root) {
    const stageIndex = STAGES.indexOf(root.stage);
    if (stageIndex < 1 || stageIndex > 2) return;
    const intensity = root.stage === 'auxin-signal' ? root.progress : 1 - root.progress * .45;
    for (let i = 0; i < 4; i++) {
      const angle = state.time * .75 + root.phase + i * TAU / 4;
      const radius = 12 + i * 5 + Math.sin(state.time * 2 + i) * 2;
      ctx.globalAlpha = .18 + intensity * .28;
      ctx.fillStyle = i % 2 ? '#ffd783' : '#72e8dd';
      ctx.beginPath();
      ctx.arc(root.startX + Math.cos(angle) * radius, root.startY + Math.sin(angle) * radius * .45, 2.2, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawPrimordium(ctx, root) {
    const stageIndex = STAGES.indexOf(root.stage);
    if (stageIndex < 2) return;
    const development = root.stage === 'primordium' ? root.progress : 1;
    const radius = 3 + development * 8;
    ctx.save();
    ctx.translate(root.startX, root.startY + 4);
    ctx.scale(1, .7);
    const gradient = ctx.createRadialGradient(-2, -2, 1, 0, 0, radius * 1.2);
    gradient.addColorStop(0, '#ffe6b0');
    gradient.addColorStop(.62, '#c78f5d');
    gradient.addColorStop(1, 'rgba(76,43,42,.9)');
    ctx.fillStyle = gradient;
    ctx.strokeStyle = '#f2c98e';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.ellipse(0, 0, radius, radius * .8, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function drawRootPath(ctx, root) {
    const stageIndex = STAGES.indexOf(root.stage);
    if (stageIndex < 3) return;
    const visible = root.mature ? 1 : clamp(root.visibleProgress, 0, 1);
    if (visible <= 0) return;
    const samples = Math.max(4, Math.ceil(visible * 28));
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = root.mature ? '#b98b58' : '#caa36e';
    ctx.lineWidth = root.mature ? 11 : 5 + visible * 5;
    ctx.shadowBlur = root.mature ? 5 : 12;
    ctx.shadowColor = root.paused ? '#8a6470' : '#72e8dd';
    ctx.beginPath();
    for (let i = 0; i <= samples; i++) {
      const t = visible * i / samples;
      const point = bezierPoint(root, t);
      if (i === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.strokeStyle = 'rgba(255,226,170,.65)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i <= samples; i++) {
      const t = visible * i / samples;
      const point = bezierPoint(root, t);
      if (i === 0) ctx.moveTo(point.x, point.y - 1);
      else ctx.lineTo(point.x, point.y - 1);
    }
    ctx.stroke();

    const hairLimit = root.mature ? 1 : visible;
    ctx.strokeStyle = 'rgba(235,217,184,.55)';
    ctx.lineWidth = 1;
    for (let t = .34; t < hairLimit; t += .095) {
      const point = bezierPoint(root, t);
      const next = bezierPoint(root, Math.min(1, t + .02));
      const angle = Math.atan2(next.y - point.y, next.x - point.x);
      const side = Math.floor(t * 100) % 2 ? 1 : -1;
      const normal = angle + side * Math.PI / 2;
      const length = 8 + Math.sin(t * 49 + root.phase) * 2;
      ctx.beginPath();
      ctx.moveTo(point.x, point.y);
      ctx.lineTo(point.x + Math.cos(normal) * length, point.y + Math.sin(normal) * length);
      ctx.stroke();
    }

    if (!root.mature) {
      const tip = bezierPoint(root, visible);
      ctx.fillStyle = root.paused ? '#b98592' : '#8ff4e8';
      ctx.shadowBlur = 14;
      ctx.shadowColor = ctx.fillStyle;
      ctx.beginPath();
      ctx.arc(tip.x, tip.y, 5.5, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function render(ctx) {
    if (!roots.length) return;
    ctx.save();
    ctx.translate(-state.cameraX, 0);
    for (const root of roots) {
      const minX = Math.min(root.startX, root.endX) - 80;
      const maxX = Math.max(root.startX, root.endX) + 80;
      if (maxX < state.cameraX || minX > state.cameraX + W) continue;
      drawSignal(ctx, root);
      drawPrimordium(ctx, root);
      drawRootPath(ctx, root);
    }
    ctx.restore();
  }

  return {
    get siteCount() { return sites.size; },
    get rootCount() { return roots.length; },
    get matureCount() { return roots.filter(root => root.mature).length; },
    get growingCount() { return roots.filter(root => !root.mature).length; },
    get pausedCount() { return roots.filter(root => !root.mature && root.paused).length; },
    get platformCount() { return generatedPlatforms().length; },
    clear,
    reset,
    update,
    render,
  };
}
