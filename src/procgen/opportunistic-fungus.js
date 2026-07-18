import { H, W } from '../core/constants.js';
import { getPhaseManifest } from './campaign-manifest.js';

const TAU = Math.PI * 2;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export const MAX_HYPHAL_SEGMENTS_PER_FOCUS = 140;
const MAX_TIPS_PER_FOCUS = 6;
const MAX_SPORES_PER_FOCUS = 12;

function hashSeed(text) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

export const OPPORTUNISTIC_FUNGUS_DEFAULTS = Object.freeze({
  contaminationRate: 1,
  movementSpeedReduction: .25,
  accelerationReduction: .35,
  jumpImpulseReduction: .15,
  recoveryRate: .12,
  hyphalGrowthRate: 1,
  sporulationRate: 1,
});

export const PSEUDOMONAS_IRON_CONTROL_DEFAULTS = Object.freeze({
  minimumIronReserve: 1,
  minimumFungalVigor: .25,
  growthSuppression: .7,
  sporulationSuppression: .8,
  adhesionSuppression: .7,
});

export function fungalResponse(limitation, fungusConfig, ironConfig) {
  const pressure = clamp(limitation || 0, 0, 1);
  return {
    vigor: clamp(
      1 - pressure * (1 - ironConfig.minimumFungalVigor),
      ironConfig.minimumFungalVigor,
      1,
    ),
    growth: clamp(1 - pressure * ironConfig.growthSuppression, .08, 1) * fungusConfig.hyphalGrowthRate,
    branching: clamp(1 - pressure * ironConfig.growthSuppression * .9, .08, 1),
    sporulation: clamp(1 - pressure * ironConfig.sporulationSuppression, .04, 1) * fungusConfig.sporulationRate,
    adhesion: clamp(1 - pressure * ironConfig.adhesionSuppression, .04, 1),
  };
}

function playerCenter(player) {
  return { x: player.x + player.w / 2, y: player.y + player.h / 2 };
}

function pointSegmentDistance(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const denominator = dx * dx + dy * dy || 1;
  const t = clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / denominator, 0, 1);
  return Math.hypot(point.x - (start.x + dx * t), point.y - (start.y + dy * t));
}

function eligibleRoot(platform) {
  return platform?.type === 'root'
    && !platform.recovery
    && !platform.mycorrhizaStructure
    && (platform.w || 0) >= 70;
}

function focusGroups(ecology) {
  const groups = new Map();
  for (const agent of ecology.agents || []) {
    if (agent.type !== 'oportunista') continue;
    const key = String(agent.zoneIndex ?? agent.id);
    const group = groups.get(key) || { key, zoneIndex: agent.zoneIndex, agents: [] };
    group.agents.push(agent);
    groups.set(key, group);
  }
  return [...groups.values()];
}

function nearestRootAnchor(state, ecology, group) {
  const zone = Number.isInteger(group.zoneIndex) ? ecology.encounters?.[group.zoneIndex] : null;
  const representative = group.agents[0];
  const sourceX = zone?.x ?? representative.homeX ?? representative.x;
  const sourceY = zone?.y ?? representative.homeY ?? representative.y;
  let root = null;
  let bestScore = Infinity;
  for (const candidate of state.level.platforms || []) {
    if (!eligibleRoot(candidate)) continue;
    const centerX = candidate.x + candidate.w / 2;
    const score = Math.abs(centerX - sourceX) + Math.abs(candidate.y - sourceY) * .35;
    if (score < bestScore) {
      root = candidate;
      bestScore = score;
    }
  }
  if (!root) return { x: sourceX, y: sourceY, root: null };
  return {
    x: clamp(sourceX, root.x + 24, root.x + root.w - 24),
    y: root.y - 5,
    root,
  };
}

function buildLesions(state, anchor, random) {
  const lesions = [{
    x: anchor.x,
    y: anchor.y,
    root: anchor.root,
    maturity: 1,
    reached: true,
    phase: random() * TAU,
  }];
  if (!anchor.root) {
    for (const direction of [-1, 1]) {
      lesions.push({
        x: anchor.x + direction * (95 + random() * 55),
        y: clamp(anchor.y + (random() - .5) * 70, 60, H - 60),
        root: null,
        maturity: 0,
        reached: false,
        phase: random() * TAU,
      });
    }
    return lesions;
  }

  const roots = (state.level.platforms || [])
    .filter(eligibleRoot)
    .filter(root => Math.abs((root.x + root.w / 2) - anchor.x) <= 880)
    .sort((left, right) => (
      Math.abs((left.x + left.w / 2) - anchor.x)
      - Math.abs((right.x + right.w / 2) - anchor.x)
    ));

  const hostPositions = [.2, .78]
    .map(position => clamp(anchor.root.x + anchor.root.w * position, anchor.root.x + 18, anchor.root.x + anchor.root.w - 18))
    .filter(x => Math.abs(x - anchor.x) > 34);
  for (const x of hostPositions) {
    lesions.push({
      x,
      y: anchor.root.y - 5,
      root: anchor.root,
      maturity: .18,
      reached: false,
      phase: random() * TAU,
    });
  }

  for (const root of roots) {
    if (root === anchor.root || lesions.length >= 6) continue;
    lesions.push({
      x: clamp(root.x + root.w * (.28 + random() * .44), root.x + 18, root.x + root.w - 18),
      y: root.y - 5,
      root,
      maturity: .12,
      reached: false,
      phase: random() * TAU,
    });
  }
  return lesions;
}

function targetAngle(from, target) {
  return Math.atan2(target.y - from.y, target.x - from.x);
}

export function createOpportunisticFungus({ state, entities, ecology }) {
  const networks = new Map();
  let contactIntensity = 0;
  let maximumIronLimitation = 0;
  let damageCooldown = 0;
  let contactAnnounced = false;

  function config() {
    const manifest = getPhaseManifest(state.campaign?.phase);
    return {
      fungus: { ...OPPORTUNISTIC_FUNGUS_DEFAULTS, ...(manifest?.opportunisticFungus || {}) },
      iron: { ...PSEUDOMONAS_IRON_CONTROL_DEFAULTS, ...(manifest?.pseudomonasIronControl || {}) },
    };
  }

  function anchorAgents(network) {
    for (const agent of network.agents) {
      agent.rootedFungus = true;
      agent.rootAnchorX = network.anchor.x;
      agent.rootAnchorY = network.anchor.y;
      agent.x = network.anchor.x;
      agent.y = network.anchor.y;
      agent.homeX = network.anchor.x;
      agent.homeY = network.anchor.y;
      agent.vx = 0;
      agent.vy = 0;
    }
  }

  function makeTip(network, targetIndex, depth = 0, angleOffset = 0) {
    const target = network.lesions[targetIndex] || network.lesions[0];
    return {
      x: network.anchor.x,
      y: network.anchor.y,
      angle: targetAngle(network.anchor, target) + angleOffset,
      targetIndex,
      depth,
      age: 0,
      phase: network.random() * TAU,
      active: true,
    };
  }

  function createNetwork(group) {
    const anchor = nearestRootAnchor(state, ecology, group);
    const seedText = `${state.campaign?.seed || 'fungus'}:root-focus:${group.key}:${Math.round(anchor.x)}`;
    const random = seededRandom(hashSeed(seedText));
    const network = {
      key: group.key,
      agents: group.agents,
      agent: group.agents[0],
      anchor,
      hostRoot: anchor.root,
      random,
      lesions: buildLesions(state, anchor, random),
      segments: [],
      tips: [],
      spores: [],
      growthAccumulator: 0,
      sporeAccumulator: 0,
      response: null,
      attached: 0,
      reachedLesions: 1,
    };
    const availableTargets = Math.max(1, network.lesions.length - 1);
    const tipCount = Math.min(2, availableTargets);
    for (let index = 0; index < tipCount; index++) {
      network.tips.push(makeTip(network, 1 + index, 0, (index ? 1 : -1) * .08));
    }
    networks.set(group.key, network);
    anchorAgents(network);
    return network;
  }

  function syncNetworks() {
    const groups = focusGroups(ecology);
    const activeKeys = new Set(groups.map(group => group.key));
    for (const group of groups) {
      const network = networks.get(group.key) || createNetwork(group);
      network.agents = group.agents;
      network.agent = group.agents[0];
      anchorAgents(network);
    }
    for (const [key, network] of networks) {
      if (activeKeys.has(key)) continue;
      for (const agent of network.agents) delete agent.rootedFungus;
      networks.delete(key);
    }
  }

  function nextUnreachedLesion(network, tip) {
    let bestIndex = -1;
    let bestDistance = Infinity;
    network.lesions.forEach((lesion, index) => {
      if (index === 0 || lesion.reached || index === tip.targetIndex) return;
      const distance = Math.hypot(lesion.x - tip.x, lesion.y - tip.y);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });
    return bestIndex;
  }

  function reachLesion(network, tip, lesion) {
    if (!lesion.reached) {
      lesion.reached = true;
      lesion.maturity = 1;
      network.reachedLesions++;
    }
    const next = nextUnreachedLesion(network, tip);
    if (next < 0) {
      tip.active = false;
      return;
    }
    tip.targetIndex = next;
    tip.angle = targetAngle(tip, network.lesions[next]);
  }

  function growTip(network, tip, step, response) {
    if (!tip.active || network.segments.length >= MAX_HYPHAL_SEGMENTS_PER_FOCUS) return;
    const target = network.lesions[tip.targetIndex] || network.lesions[0];
    const direct = targetAngle(tip, target);
    const turn = Math.atan2(Math.sin(direct - tip.angle), Math.cos(direct - tip.angle));
    const distance = Math.hypot(target.x - tip.x, target.y - tip.y);
    const attraction = clamp(1 - distance / 520, .16, 1);
    tip.angle += turn * (.075 + attraction * .19);
    tip.angle += Math.sin(state.time * 1.65 + tip.phase + tip.age * .42) * .035;
    const start = { x: tip.x, y: tip.y };
    tip.x += Math.cos(tip.angle) * step;
    tip.y = clamp(tip.y + Math.sin(tip.angle) * step, 48, H - 48);
    tip.age += step * .022;
    network.segments.push({
      start,
      end: { x: tip.x, y: tip.y },
      depth: tip.depth,
      phase: tip.phase,
      order: network.segments.length,
    });

    if (distance <= step * 1.8 + 8) reachLesion(network, tip, target);

    const nearLesion = distance < 145 ? 1.5 : .55;
    const branchChance = .018 * nearLesion * response.branching;
    if (
      tip.active
      && tip.depth < 3
      && network.tips.length < MAX_TIPS_PER_FOCUS
      && network.segments.length < MAX_HYPHAL_SEGMENTS_PER_FOCUS - 18
      && network.random() < branchChance
    ) {
      const targetIndex = nextUnreachedLesion(network, tip);
      if (targetIndex >= 0) {
        const side = network.random() < .5 ? -1 : 1;
        const branch = {
          x: tip.x,
          y: tip.y,
          angle: tip.angle + side * (.42 + network.random() * .35),
          targetIndex,
          depth: tip.depth + 1,
          age: 0,
          phase: network.random() * TAU,
          active: true,
        };
        network.tips.push(branch);
      }
    }
  }

  function updateSpores(network, dt, response, target) {
    const matureLesions = network.lesions.filter(lesion => lesion.reached);
    network.sporeAccumulator += dt * response.sporulation * (.16 + matureLesions.length * .12);
    if (
      network.segments.length > 34
      && network.sporeAccumulator >= 1
      && network.spores.length < MAX_SPORES_PER_FOCUS
    ) {
      network.sporeAccumulator -= 1;
      const source = matureLesions[Math.floor(network.random() * matureLesions.length)] || network.anchor;
      network.spores.push({
        x: source.x + (network.random() - .5) * 16,
        y: source.y - network.random() * 8,
        vx: (network.random() - .5) * 9,
        vy: -4 - network.random() * 7,
        phase: network.random() * TAU,
        life: 4 + network.random() * 3,
      });
    }
    for (const spore of network.spores) {
      spore.x += spore.vx * dt * response.vigor;
      spore.y += (spore.vy + Math.sin(state.time * 1.5 + spore.phase) * 4) * dt * response.vigor;
      spore.life -= dt;
      if (Math.hypot(spore.x - target.x, spore.y - target.y) < 21) {
        contactIntensity += .12 * response.adhesion;
        spore.life = Math.min(spore.life, .3);
      }
    }
    network.spores = network.spores.filter(spore => spore.life > 0);
  }

  function updateNetwork(network, dt, target, settings) {
    const limitation = clamp(
      network.agents.reduce((sum, agent) => sum + (agent.ironLimitation || 0), 0)
        / Math.max(1, network.agents.length),
      0,
      1,
    );
    const response = fungalResponse(limitation, settings.fungus, settings.iron);
    network.response = response;
    for (const agent of network.agents) agent.fungalVigor = response.vigor;
    maximumIronLimitation = Math.max(maximumIronLimitation, limitation);

    if (network.segments.length < MAX_HYPHAL_SEGMENTS_PER_FOCUS) {
      network.growthAccumulator += dt * 10 * response.growth;
      while (network.growthAccumulator >= 1 && network.segments.length < MAX_HYPHAL_SEGMENTS_PER_FOCUS) {
        network.growthAccumulator -= 1;
        const tips = [...network.tips];
        for (const tip of tips) growTip(network, tip, 4.2, response);
      }
    }
    updateSpores(network, dt, response, target);

    let touching = 0;
    for (const segment of network.segments) {
      if (Math.abs(segment.end.x - target.x) > 80 || Math.abs(segment.end.y - target.y) > 80) continue;
      if (pointSegmentDistance(target, segment.start, segment.end) < 22) touching++;
    }
    if (touching) {
      const pressure = clamp(touching / 5, .16, 1) * response.adhesion;
      contactIntensity += pressure;
      network.attached = clamp(network.attached + dt * pressure * 1.4, 0, 1);
    } else {
      network.attached = Math.max(0, network.attached - dt * (.18 + limitation * 1.15));
    }
  }

  function prepare() {
    syncNetworks();
    const settings = config().fungus;
    const contamination = clamp(state.player.fungalContamination || 0, 0, 1);
    state.player.moveMultiplier = clamp(
      (state.player.moveMultiplier ?? 1) * (1 - contamination * settings.movementSpeedReduction),
      .42,
      1,
    );
    state.player.accelerationMultiplier = clamp(1 - contamination * settings.accelerationReduction, .42, 1);
    state.player.jumpMultiplier = clamp(
      (state.player.jumpMultiplier ?? 1) * (1 - contamination * settings.jumpImpulseReduction),
      .62,
      1,
    );
  }

  function update(dt) {
    if (state.gameState !== 'play') return;
    if (!networks.size) syncNetworks();
    const settings = config();
    const target = playerCenter(state.player);
    contactIntensity = 0;
    maximumIronLimitation = 0;
    state.player.fungalAttachmentLevel = 0;
    for (const network of networks.values()) {
      updateNetwork(network, dt, target, settings);
      state.player.fungalAttachmentLevel = Math.max(
        state.player.fungalAttachmentLevel,
        network.attached,
      );
    }

    const player = state.player;
    if (contactIntensity > .02) {
      const gain = .24 * settings.fungus.contaminationRate * clamp(contactIntensity, .2, 1.5);
      const ironDetachment = maximumIronLimitation * settings.fungus.recoveryRate * 2.6;
      player.fungalContamination = clamp(
        (player.fungalContamination || 0) + dt * (gain - ironDetachment),
        0,
        1,
      );
      if (!contactAnnounced && player.fungalContamination > .12) {
        contactAnnounced = true;
        state.toast = 'Contaminação fúngica: fragmentos de hifa aderidos reduzem aceleração, velocidade e impulso do pulo.';
        state.toastTime = 5.2;
      }
    } else {
      const acceleratedDetachment = 1 + maximumIronLimitation * 2.2;
      player.fungalContamination = Math.max(
        0,
        (player.fungalContamination || 0) - dt * settings.fungus.recoveryRate * acceleratedDetachment,
      );
      if (player.fungalContamination <= .02) contactAnnounced = false;
    }

    damageCooldown = Math.max(0, damageCooldown - dt);
    if (player.fungalContamination >= .62 && damageCooldown <= 0) {
      entities.damagePlayer?.(1, 'contaminação pelo fungo oportunista', {
        invuln: .7,
        knockbackX: 0,
        knockbackY: -65,
      });
      damageCooldown = 6.2;
    }
  }

  function drawFocus(ctx, network, vigor) {
    const pulse = .82 + Math.sin(state.time * 2.4 + network.lesions[0].phase) * .12;
    ctx.save();
    ctx.translate(network.anchor.x, network.anchor.y + 3);
    ctx.fillStyle = `rgba(91,18,45,${.32 + vigor * .18})`;
    ctx.strokeStyle = `rgba(255,101,137,${.48 + vigor * .38})`;
    ctx.lineWidth = 2.2;
    ctx.shadowColor = 'rgba(255,74,119,.72)';
    ctx.shadowBlur = 9 * vigor;
    ctx.beginPath();
    ctx.ellipse(0, 0, 14 * pulse, 7 * pulse, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = `rgba(255,184,190,${.5 + vigor * .38})`;
    ctx.beginPath();
    ctx.arc(0, -1, 3.1, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawNetwork(ctx, network) {
    const response = network.response || { vigor: 1 };
    const vigor = response.vigor;
    const green = Math.round(72 + vigor * 45);
    drawFocus(ctx, network, vigor);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Bainha translúcida: mantém o volume orgânico sem multiplicar partículas.
    ctx.shadowColor = `rgba(255,74,119,${.12 + vigor * .2})`;
    ctx.shadowBlur = 7 + vigor * 7;
    for (const segment of network.segments) {
      const width = Math.max(2.1, (6.6 - segment.depth * 1.15) * (.52 + vigor * .48));
      ctx.strokeStyle = `rgba(112,23,54,${.16 + vigor * .18})`;
      ctx.lineWidth = width + 5;
      ctx.beginPath();
      ctx.moveTo(segment.start.x, segment.start.y);
      ctx.lineTo(segment.end.x, segment.end.y);
      ctx.stroke();
    }

    ctx.shadowBlur = 4 + vigor * 5;
    for (const segment of network.segments) {
      const width = Math.max(1.15, (3.8 - segment.depth * .68) * (.48 + vigor * .52));
      ctx.strokeStyle = `rgba(255,${green},125,${.34 + vigor * .55})`;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(segment.start.x, segment.start.y);
      ctx.lineTo(segment.end.x, segment.end.y);
      ctx.stroke();

      if (segment.depth <= 1 && segment.order % 9 === 0) {
        const dx = segment.end.x - segment.start.x;
        const dy = segment.end.y - segment.start.y;
        const length = Math.max(1, Math.hypot(dx, dy));
        const nx = -dy / length;
        const ny = dx / length;
        ctx.strokeStyle = `rgba(255,210,211,${.22 + vigor * .36})`;
        ctx.lineWidth = .75;
        ctx.beginPath();
        ctx.moveTo(segment.end.x - nx * 3.5, segment.end.y - ny * 3.5);
        ctx.lineTo(segment.end.x + nx * 3.5, segment.end.y + ny * 3.5);
        ctx.stroke();
      }
    }

    for (const lesion of network.lesions) {
      if (lesion === network.lesions[0]) continue;
      const reached = lesion.reached ? 1 : .28;
      const radius = 2.3 + reached * 2 + Math.sin(state.time * 2 + lesion.phase) * .35;
      ctx.fillStyle = `rgba(255,92,126,${.22 + reached * .52})`;
      ctx.shadowColor = 'rgba(255,78,118,.7)';
      ctx.shadowBlur = lesion.reached ? 8 : 3;
      ctx.beginPath();
      ctx.arc(lesion.x, lesion.y, radius, 0, TAU);
      ctx.fill();
    }

    for (const tip of network.tips) {
      if (!tip.active) continue;
      const radius = 1.5 + vigor * 1.7 + Math.sin(state.time * 4.2 + tip.phase) * .35;
      ctx.fillStyle = `rgba(255,224,205,${.42 + vigor * .5})`;
      ctx.shadowColor = 'rgba(255,112,132,.8)';
      ctx.shadowBlur = 7 * vigor;
      ctx.beginPath();
      ctx.arc(tip.x, tip.y, radius, 0, TAU);
      ctx.fill();
    }

    ctx.shadowBlur = 0;
    for (const spore of network.spores) {
      const alpha = clamp(spore.life / 3.5, .08, .34) * (.3 + vigor * .7);
      ctx.fillStyle = `rgba(223,181,238,${alpha})`;
      ctx.beginPath();
      ctx.arc(spore.x, spore.y, 1.45 + Math.sin(state.time * 1.7 + spore.phase) * .25, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawVigorIndicator(ctx, network) {
    const limitation = clamp(
      network.agents.reduce((sum, agent) => sum + (agent.ironLimitation || 0), 0)
        / Math.max(1, network.agents.length),
      0,
      1,
    );
    if (limitation < .08) return;
    const vigor = network.response?.vigor ?? 1;
    const x = network.anchor.x;
    const y = network.anchor.y - 38;
    ctx.save();
    ctx.font = '700 9px Inter,system-ui';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,231,237,.9)';
    ctx.fillText(`Vigor fúngico ${Math.round(vigor * 100)}%`, x, y);
    ctx.fillStyle = 'rgba(5,18,24,.8)';
    ctx.fillRect(x - 27, y + 5, 54, 5);
    ctx.fillStyle = vigor <= .45 ? '#b9f36f' : '#ff8297';
    ctx.fillRect(x - 26, y + 6, 52 * vigor, 3);
    ctx.restore();
  }

  function render(ctx) {
    ctx.save();
    ctx.translate(-state.cameraX, 0);
    for (const network of networks.values()) {
      if (network.anchor.x < state.cameraX - W || network.anchor.x > state.cameraX + W * 2) continue;
      drawNetwork(ctx, network);
      drawVigorIndicator(ctx, network);
    }
    ctx.restore();
  }

  function clear() {
    for (const network of networks.values()) {
      for (const agent of network.agents) delete agent.rootedFungus;
    }
    networks.clear();
    contactIntensity = 0;
    maximumIronLimitation = 0;
    damageCooldown = 0;
    contactAnnounced = false;
  }

  function reset() {
    clear();
    state.player.fungalContamination = 0;
    state.player.fungalAttachmentLevel = 0;
  }

  return {
    prepare,
    update,
    render,
    clear,
    reset,
    get networks() { return networks; },
    get contactIntensity() { return contactIntensity; },
    get maximumIronLimitation() { return maximumIronLimitation; },
    get controlledFungalVigor() {
      const values = [...networks.values()].map(network => network.response?.vigor ?? 1);
      return values.length ? Math.min(...values) : 1;
    },
  };
}
