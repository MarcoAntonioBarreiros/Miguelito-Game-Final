import { H, W } from '../core/constants.js';
import { getPhaseManifest } from './campaign-manifest.js';

const TAU = Math.PI * 2;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

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

  function opportunists() {
    return (ecology.agents || []).filter(agent => agent.type === 'oportunista');
  }

  function createNetwork(agent) {
    const seedText = `${state.campaign?.seed || 'fungus'}:${agent.id}:${Math.round(agent.homeX || agent.x)}`;
    const random = seededRandom(hashSeed(seedText));
    const network = {
      agent,
      random,
      segments: [],
      tips: [],
      spores: [],
      growthAccumulator: 0,
      sporeAccumulator: 0,
      response: null,
      attached: 0,
    };
    const count = 2 + Math.floor(random() * 2);
    for (let index = 0; index < count; index++) {
      network.tips.push({
        x: agent.x + (random() - .5) * 22,
        y: agent.y + (random() - .5) * 18,
        angle: random() * TAU,
        depth: 0,
        age: random(),
        phase: random() * TAU,
      });
    }
    networks.set(agent.id, network);
    return network;
  }

  function syncNetworks() {
    const agents = opportunists();
    const ids = new Set(agents.map(agent => agent.id));
    for (const agent of agents) {
      const network = networks.get(agent.id) || createNetwork(agent);
      network.agent = agent;
    }
    for (const id of networks.keys()) if (!ids.has(id)) networks.delete(id);
  }

  function growTip(network, tip, step, target, response) {
    const direct = Math.atan2(target.y - tip.y, target.x - tip.x);
    const turn = Math.atan2(Math.sin(direct - tip.angle), Math.cos(direct - tip.angle));
    const distance = Math.hypot(target.x - tip.x, target.y - tip.y);
    const attraction = clamp(1 - distance / 760, .08, 1) * response.adhesion;
    tip.angle += turn * (.055 + attraction * .13);
    tip.angle += Math.sin(state.time * 2.1 + tip.phase + tip.age * .7) * .055;
    const start = { x: tip.x, y: tip.y };
    tip.x += Math.cos(tip.angle) * step;
    tip.y += Math.sin(tip.angle) * step;
    tip.y = clamp(tip.y, 55, H - 55);
    tip.age += step * .025;
    network.segments.push({ start, end: { x: tip.x, y: tip.y }, depth: tip.depth, phase: tip.phase });
    if (network.segments.length > 170) network.segments.splice(0, network.segments.length - 170);

    const denseNearTarget = distance < 175 ? 2.5 : distance < 330 ? 1.35 : .45;
    const branchChance = .035 * denseNearTarget * response.branching;
    if (tip.depth < 4 && network.tips.length < 15 && network.random() < branchChance) {
      const side = network.random() < .5 ? -1 : 1;
      network.tips.push({
        x: tip.x,
        y: tip.y,
        angle: tip.angle + side * (.45 + network.random() * .55),
        depth: tip.depth + 1,
        age: 0,
        phase: network.random() * TAU,
      });
    }
  }

  function updateSpores(network, dt, response, target) {
    network.sporeAccumulator += dt * response.sporulation * (.35 + network.segments.length / 120);
    if (network.segments.length > 24 && network.sporeAccumulator >= 1 && network.spores.length < 28) {
      network.sporeAccumulator -= 1;
      const segment = network.segments[Math.floor(network.random() * network.segments.length)];
      network.spores.push({
        x: segment.end.x,
        y: segment.end.y,
        vx: (network.random() - .5) * 14,
        vy: -5 - network.random() * 9,
        phase: network.random() * TAU,
        life: 5 + network.random() * 4,
      });
    }
    for (const spore of network.spores) {
      spore.x += spore.vx * dt * response.vigor;
      spore.y += (spore.vy + Math.sin(state.time * 1.7 + spore.phase) * 6) * dt * response.vigor;
      spore.life -= dt;
      if (Math.hypot(spore.x - target.x, spore.y - target.y) < 27) {
        contactIntensity += .22 * response.adhesion;
        spore.life = Math.min(spore.life, .35);
      }
    }
    network.spores = network.spores.filter(spore => spore.life > 0);
  }

  function updateNetwork(network, dt, target, settings) {
    const limitation = clamp(network.agent.ironLimitation || 0, 0, 1);
    const response = fungalResponse(limitation, settings.fungus, settings.iron);
    network.response = response;
    network.agent.fungalVigor = response.vigor;
    maximumIronLimitation = Math.max(maximumIronLimitation, limitation);

    network.growthAccumulator += dt * 22 * response.growth;
    while (network.growthAccumulator >= 1) {
      network.growthAccumulator -= 1;
      const tips = [...network.tips];
      for (const tip of tips) growTip(network, tip, 3.4, target, response);
    }
    updateSpores(network, dt, response, target);

    let touching = 0;
    for (let index = Math.max(0, network.segments.length - 90); index < network.segments.length; index++) {
      const segment = network.segments[index];
      if (pointSegmentDistance(target, segment.start, segment.end) < 24) touching++;
    }
    if (touching) {
      const pressure = clamp(touching / 7, .12, 1) * response.adhesion;
      contactIntensity += pressure;
      network.attached = clamp(network.attached + dt * pressure * 1.2, 0, 1);
    } else {
      network.attached = Math.max(0, network.attached - dt * (.12 + limitation * 1.1));
    }
  }

  function prepare() {
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
    syncNetworks();
    const settings = config();
    const target = playerCenter(state.player);
    contactIntensity = 0;
    maximumIronLimitation = 0;
    for (const network of networks.values()) updateNetwork(network, dt, target, settings);

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
        state.toast = 'Contaminação fúngica: hifas aderidas reduzem aceleração, velocidade e impulso do pulo.';
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

  function drawNetwork(ctx, network) {
    const response = network.response || { vigor: 1 };
    const vigor = response.vigor;
    const pink = Math.round(92 + vigor * 130);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = `rgba(255,${pink},155,${.22 + vigor * .45})`;
    ctx.shadowBlur = 5 + vigor * 9;
    for (const segment of network.segments) {
      const width = Math.max(.45, (2.15 - segment.depth * .27) * (.42 + vigor * .58));
      ctx.strokeStyle = `rgba(255,${pink},155,${.24 + vigor * .58})`;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(segment.start.x, segment.start.y);
      ctx.lineTo(segment.end.x, segment.end.y);
      ctx.stroke();
    }
    for (const tip of network.tips) {
      const radius = 1.4 + vigor * 2 + Math.sin(state.time * 5 + tip.phase) * .45;
      ctx.fillStyle = `rgba(255,235,240,${.35 + vigor * .6})`;
      ctx.beginPath();
      ctx.arc(tip.x, tip.y, radius, 0, TAU);
      ctx.fill();
    }
    for (const spore of network.spores) {
      const alpha = clamp(spore.life / 4, .12, .48) * (.35 + vigor * .65);
      ctx.fillStyle = `rgba(213,175,255,${alpha})`;
      ctx.strokeStyle = `rgba(255,231,255,${alpha * .7})`;
      ctx.lineWidth = .7;
      ctx.beginPath();
      ctx.arc(spore.x, spore.y, 2.2 + Math.sin(state.time * 2 + spore.phase) * .45, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawVigorIndicator(ctx, network) {
    const limitation = clamp(network.agent.ironLimitation || 0, 0, 1);
    if (limitation < .08) return;
    const vigor = network.response?.vigor ?? 1;
    const x = network.agent.x;
    const y = network.agent.y - 38;
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
      if (network.agent.x < state.cameraX - W || network.agent.x > state.cameraX + W * 2) continue;
      drawNetwork(ctx, network);
      drawVigorIndicator(ctx, network);
    }
    ctx.restore();
  }

  function clear() {
    networks.clear();
    contactIntensity = 0;
    maximumIronLimitation = 0;
    damageCooldown = 0;
    contactAnnounced = false;
  }

  function reset() {
    clear();
    state.player.fungalContamination = 0;
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
