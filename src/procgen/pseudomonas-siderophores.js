import { W } from '../core/constants.js';

const TAU = Math.PI * 2;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function hashPlatform(platform, salt = 0) {
  const x = Math.round(platform.x || 0);
  const y = Math.round(platform.y || 0);
  const w = Math.round(platform.w || 0);
  const value = Math.sin((x * 12.9898 + y * 78.233 + w * 37.719 + salt * 19.19) * .001) * 43758.5453;
  return value - Math.floor(value);
}

function closestPointOnPlatform(platform, x) {
  return clamp(x, platform.x + 18, platform.x + platform.w - 18);
}

function depositRange(colony) {
  return 360 + (colony.sourceCount || 1) * 45 + colony.vigor * 110;
}

export function createPseudomonasSiderophores({ state, entities, ecology, inoculants }) {
  const siderophores = [];
  const colonyStates = new Map();
  let nextSiderophoreId = 1;
  let totalIronRecovered = 0;
  let fungiLimitedCount = 0;
  let lastToastAt = -Infinity;

  function deposits() {
    return state.level.ironDeposits || (state.level.ironDeposits = []);
  }

  function colonies() {
    return (inoculants.colonies || []).filter(colony => colony.type === 'pseudomonas');
  }

  function announce(text, seconds = 4.6) {
    if (state.time - lastToastAt < 2.1) return;
    state.toast = text;
    state.toastTime = seconds;
    lastToastAt = state.time;
  }

  function ensureDeposits() {
    const list = deposits();
    if (list.length) return;
    const candidates = (state.level.platforms || []).filter(platform => (
      !platform.recovery
      && !platform.final
      && !platform.mycorrhizaStructure
      && !platform.azospirillumStructure
      && (platform.logicIndex ?? -1) >= 1
      && platform.w >= 105
    ));

    candidates.forEach((platform, index) => {
      const abundance = hashPlatform(platform, 11);
      const scheduled = index % 3 === 1 || abundance > .69;
      if (!scheduled) return;
      const lateral = hashPlatform(platform, 23);
      const depth = hashPlatform(platform, 37);
      const stock = 2.8 + hashPlatform(platform, 53) * 3.8;
      list.push({
        id: `iron-${index}-${Math.round(platform.x)}`,
        platform,
        x: closestPointOnPlatform(platform, platform.x + 22 + lateral * Math.max(1, platform.w - 44)),
        y: platform.y + clamp(15 + depth * Math.max(12, platform.h * .42), 15, platform.h - 12),
        stock,
        maxStock: stock,
        radius: 9 + hashPlatform(platform, 67) * 5,
        phase: hashPlatform(platform, 79) * TAU,
        exposed: platform.type !== 'root' || abundance > .43,
      });
    });

    if (!list.length && candidates.length) {
      const platform = candidates[Math.floor(candidates.length / 2)];
      list.push({
        id: `iron-fallback-${Math.round(platform.x)}`,
        platform,
        x: platform.x + platform.w * .58,
        y: platform.y + Math.min(platform.h - 14, 28),
        stock: 5,
        maxStock: 5,
        radius: 12,
        phase: .7,
        exposed: true,
      });
    }
  }

  function createColonyState(colony) {
    const entry = {
      colony,
      ironReserve: 0,
      launchCooldown: .5 + Math.random() * .8,
      recovered: 0,
      delivered: 0,
      noIronToast: false,
      activePressure: 0,
    };
    colonyStates.set(colony.id, entry);
    colony.siderophoreState = entry;
    return entry;
  }

  function syncColonyStates() {
    const current = colonies();
    const ids = new Set(current.map(colony => colony.id));
    for (const colony of current) {
      let entry = colonyStates.get(colony.id);
      if (!entry) entry = createColonyState(colony);
      entry.colony = colony;
      colony.siderophoreState = entry;
    }
    for (const [id, entry] of colonyStates) {
      if (ids.has(id)) continue;
      for (let i = siderophores.length - 1; i >= 0; i--) {
        if (siderophores[i].colonyId === id) siderophores.splice(i, 1);
      }
      if (entry.colony) entry.colony.siderophoreState = null;
      colonyStates.delete(id);
    }
  }

  function clear() {
    siderophores.length = 0;
    for (const entry of colonyStates.values()) {
      if (entry.colony) entry.colony.siderophoreState = null;
    }
    colonyStates.clear();
    state.level.ironDeposits = [];
    state.level.siderophores = siderophores;
    nextSiderophoreId = 1;
    totalIronRecovered = 0;
    fungiLimitedCount = 0;
    lastToastAt = -Infinity;
  }

  function reset() {
    siderophores.length = 0;
    colonyStates.clear();
    state.level.ironDeposits = [];
    state.level.siderophores = siderophores;
    nextSiderophoreId = 1;
    totalIronRecovered = 0;
    fungiLimitedCount = 0;
    lastToastAt = -Infinity;
    ensureDeposits();
  }

  function nearbyAvailableDeposit(colony, fromX = colony.x, fromY = colony.y) {
    const range = depositRange(colony);
    let best = null;
    let bestScore = Infinity;
    for (const deposit of deposits()) {
      if (deposit.stock <= .08) continue;
      const distance = Math.hypot(deposit.x - fromX, deposit.y - fromY);
      if (distance > range) continue;
      const score = distance / (.35 + deposit.stock / Math.max(.1, deposit.maxStock));
      if (score < bestScore) {
        best = deposit;
        bestScore = score;
      }
    }
    return best;
  }

  function activeCountFor(colonyId) {
    return siderophores.filter(item => item.colonyId === colonyId && item.state !== 'expired').length;
  }

  function launch(entry) {
    const colony = entry.colony;
    const target = nearbyAvailableDeposit(colony);
    const angle = Math.random() * TAU;
    const particle = {
      id: `sid-${nextSiderophoreId++}`,
      colonyId: colony.id,
      colony,
      x: colony.x + Math.cos(angle) * 8,
      y: colony.y - 8 + Math.sin(angle) * 4,
      vx: Math.cos(angle) * 24,
      vy: Math.sin(angle) * 18,
      state: 'free',
      target,
      age: 0,
      life: 10.5,
      boundIron: 0,
      phase: Math.random() * TAU,
    };
    siderophores.push(particle);
    entry.launchCooldown = .75 + Math.random() * .75;
    colony.vigor = clamp(colony.vigor - .0045, 0, 1);
    entities.burst(particle.x, particle.y, '#d5ff6d', 5, 42);

    if (!target && !entry.noIronToast) {
      entry.noIronToast = true;
      announce('Pseudomonas liberou sideróforos, mas não há Fe³⁺ acessível dentro da zona de exploração.');
    }
  }

  function steer(particle, targetX, targetY, dt, speed, response = 4.8) {
    const dx = targetX - particle.x;
    const dy = targetY - particle.y;
    const distance = Math.max(1, Math.hypot(dx, dy));
    const desiredVX = dx / distance * speed;
    const desiredVY = dy / distance * speed;
    const blend = clamp(dt * response, 0, 1);
    particle.vx += (desiredVX - particle.vx) * blend;
    particle.vy += (desiredVY - particle.vy) * blend;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    return distance;
  }

  function bindIron(particle, deposit) {
    const amount = Math.min(deposit.stock, .34 + Math.random() * .18);
    if (amount <= .02) {
      particle.target = null;
      return;
    }
    deposit.stock = clamp(deposit.stock - amount, 0, deposit.maxStock);
    particle.boundIron = amount;
    particle.state = 'loaded';
    particle.target = null;
    entities.burst(deposit.x, deposit.y, '#ffad5f', 10, 66);
    announce('Complexo sideróforo–Fe³⁺ formado: o ferro capturado está retornando à colônia de Pseudomonas.');
  }

  function deliverIron(particle, entry) {
    const amount = particle.boundIron;
    entry.ironReserve = clamp(entry.ironReserve + amount * .42, 0, 1.5);
    entry.recovered += amount;
    entry.delivered++;
    totalIronRecovered += amount;
    particle.state = 'expired';
    entities.burst(entry.colony.x, entry.colony.y, '#b8ff77', 12, 78);
  }

  function updateParticle(particle, dt) {
    particle.age += dt;
    particle.life -= dt;
    const entry = colonyStates.get(particle.colonyId);
    if (!entry || !entry.colony || particle.life <= 0) {
      particle.state = 'expired';
      return;
    }
    particle.colony = entry.colony;

    if (particle.state === 'free') {
      if (!particle.target || particle.target.stock <= .08) {
        particle.target = nearbyAvailableDeposit(entry.colony, particle.x, particle.y);
      }
      if (particle.target) {
        const distance = steer(particle, particle.target.x, particle.target.y, dt, 82 + entry.colony.sourceCount * 7, 4.6);
        if (distance < particle.target.radius + 5) bindIron(particle, particle.target);
      } else {
        const radius = 28 + Math.sin(particle.age * .7 + particle.phase) * 11;
        const angle = particle.age * 1.25 + particle.phase;
        const targetX = entry.colony.x + Math.cos(angle) * radius;
        const targetY = entry.colony.y - 14 + Math.sin(angle * .8) * radius * .52;
        steer(particle, targetX, targetY, dt, 42, 2.7);
        if (particle.age > 4.8) particle.state = 'expired';
      }
    } else if (particle.state === 'loaded') {
      const distance = steer(particle, entry.colony.x, entry.colony.y - 6, dt, 118, 6.2);
      if (distance < 12) deliverIron(particle, entry);
    }
  }

  function applyIronLimitation(entry, dt, limitedSet) {
    const colony = entry.colony;
    entry.activePressure = 0;
    if (entry.ironReserve <= .025 || colony.dormant || colony.vigor <= .03) return;

    const radius = colony.radius * (1.05 + clamp(entry.ironReserve, 0, 1) * .65);
    let demand = 0;
    for (const agent of ecology.agents) {
      if (agent.type !== 'oportunista') continue;
      const dx = agent.x - colony.x;
      const dy = agent.y - colony.y;
      const distance = Math.max(1, Math.hypot(dx, dy));
      if (distance >= radius) continue;
      const pressure = clamp(1 - distance / radius, 0, 1) * clamp(entry.ironReserve * 1.35, 0, 1);
      if (pressure <= .03) continue;
      agent.ironLimitation = Math.max(agent.ironLimitation || 0, pressure);
      agent.vx *= Math.pow(.32, dt * pressure);
      agent.vy *= Math.pow(.42, dt * pressure);
      agent.vx += dx / distance * 18 * pressure * dt;
      agent.vy += dy / distance * 10 * pressure * dt;
      demand += pressure;
      entry.activePressure += pressure;
      limitedSet.add(agent.id ?? agent);
    }

    if (demand > 0) {
      const use = dt * (.006 + demand * .0075);
      entry.ironReserve = clamp(entry.ironReserve - use, 0, 1.5);
      colony.vigor = clamp(colony.vigor - dt * .0018 * demand, 0, 1);
      state.player.soil += dt * .004 * Math.min(3, demand);
      state.player.hope += dt * .006 * Math.min(3, demand);
    }
  }

  function updateColony(entry, dt) {
    const colony = entry.colony;
    entry.launchCooldown = Math.max(0, entry.launchCooldown - dt);
    const capacity = 1 + Math.min(4, colony.sourceCount || 1);
    const available = nearbyAvailableDeposit(colony);
    if (available) entry.noIronToast = false;

    if (!colony.dormant && colony.growth >= .65 && colony.vigor > .09) {
      const active = activeCountFor(colony.id);
      const needsIron = entry.ironReserve < .92 || entry.activePressure > .08;
      if (entry.launchCooldown <= 0 && active < capacity && needsIron) launch(entry);
    }

    const free = siderophores.filter(item => item.colonyId === colony.id && item.state === 'free').length;
    const loaded = siderophores.filter(item => item.colonyId === colony.id && item.state === 'loaded').length;
    if (colony.dormant) colony.stage = 'sideróforos inativos — pouco carbono';
    else if (loaded) colony.stage = 'complexos Fe³⁺ retornando';
    else if (entry.activePressure > .08) colony.stage = 'limitação de ferro ativa';
    else if (entry.ironReserve > .18) colony.stage = 'reserva férrica disponível';
    else if (free && available) colony.stage = 'sideróforos buscando Fe³⁺';
    else if (free && !available) colony.stage = 'sideróforos sem Fe³⁺ disponível';
    else colony.stage = 'colonização da rizosfera';
  }

  function update(dt) {
    if (state.gameState !== 'play') return;
    ensureDeposits();
    syncColonyStates();

    for (const agent of ecology.agents) {
      if (agent.type !== 'oportunista') continue;
      agent.ironLimitation = Math.max(0, (agent.ironLimitation || 0) - dt * .7);
    }

    for (const deposit of deposits()) {
      if (deposit.stock < deposit.maxStock) {
        deposit.stock = Math.min(deposit.maxStock, deposit.stock + dt * .0015);
      }
    }

    for (const particle of siderophores) updateParticle(particle, dt);
    for (let i = siderophores.length - 1; i >= 0; i--) {
      if (siderophores[i].state === 'expired') siderophores.splice(i, 1);
    }

    const limitedSet = new Set();
    for (const entry of colonyStates.values()) applyIronLimitation(entry, dt, limitedSet);
    fungiLimitedCount = limitedSet.size;
    for (const entry of colonyStates.values()) updateColony(entry, dt);
  }

  function drawDeposit(ctx, deposit) {
    const ratio = clamp(deposit.stock / Math.max(.01, deposit.maxStock), 0, 1);
    const pulse = .92 + Math.sin(state.time * 1.7 + deposit.phase) * .08;
    const radius = deposit.radius * (.58 + ratio * .42) * pulse;
    ctx.save();
    ctx.translate(deposit.x, deposit.y);
    ctx.globalAlpha = .34 + ratio * .66;

    const halo = ctx.createRadialGradient(0, 0, 1, 0, 0, radius * 2.4);
    halo.addColorStop(0, `rgba(255,171,88,${.22 + ratio * .32})`);
    halo.addColorStop(1, 'rgba(255,123,66,0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 2.4, 0, TAU);
    ctx.fill();

    for (let i = 0; i < 6; i++) {
      const angle = deposit.phase + i * TAU / 6;
      const rr = radius * (.25 + (i % 3) * .23);
      ctx.fillStyle = i % 2 ? '#c56543' : '#ed9755';
      ctx.strokeStyle = '#ffd091';
      ctx.lineWidth = .8;
      ctx.beginPath();
      ctx.ellipse(Math.cos(angle) * rr, Math.sin(angle) * rr * .72, 2.2 + ratio * 2.2, 1.6 + ratio * 1.4, angle, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }

    if (ratio > .08) {
      ctx.font = '700 8px Inter,system-ui';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255,213,151,.9)';
      ctx.fillText('Fe³⁺', 0, -radius - 5);
    }
    ctx.restore();
  }

  function renderDeposits(ctx) {
    if (!deposits().length) return;
    ctx.save();
    ctx.translate(-state.cameraX, 0);
    for (const deposit of deposits()) {
      if (deposit.x < state.cameraX - 80 || deposit.x > state.cameraX + W + 80) continue;
      drawDeposit(ctx, deposit);
    }
    ctx.restore();
  }

  function drawSiderophore(ctx, particle) {
    const loaded = particle.state === 'loaded';
    const color = loaded ? '#ffb15c' : '#d5ff6d';
    ctx.save();
    ctx.translate(particle.x, particle.y);
    ctx.shadowBlur = loaded ? 15 : 11;
    ctx.shadowColor = color;
    ctx.strokeStyle = color;
    ctx.fillStyle = loaded ? '#ffcf83' : '#efffb8';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = i * TAU / 6 + particle.phase + state.time * .45;
      const x = Math.cos(angle) * 5.8;
      const y = Math.sin(angle) * 5.8;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, loaded ? 3.2 : 1.8, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawSuppression(ctx, entry) {
    if (entry.ironReserve <= .03) return;
    const colony = entry.colony;
    const radius = colony.radius * (1.05 + clamp(entry.ironReserve, 0, 1) * .65);
    ctx.save();
    ctx.translate(colony.x, colony.y);
    ctx.strokeStyle = entry.activePressure > .06 ? 'rgba(213,255,109,.52)' : 'rgba(141,184,255,.24)';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([4, 8]);
    ctx.beginPath();
    ctx.arc(0, 0, radius + Math.sin(state.time * 1.8 + colony.phase) * 3, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);

    const reserveWidth = 46;
    ctx.fillStyle = 'rgba(3,18,24,.74)';
    ctx.fillRect(-reserveWidth / 2 - 2, 21, reserveWidth + 4, 7);
    ctx.fillStyle = '#d5ff6d';
    ctx.fillRect(-reserveWidth / 2, 23, reserveWidth * clamp(entry.ironReserve / 1.5, 0, 1), 3);
    ctx.font = '700 8px Inter,system-ui';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(226,255,172,.88)';
    ctx.fillText('Fe', 0, 37);
    ctx.restore();
  }

  function drawLimitedFungus(ctx, agent) {
    const pressure = clamp(agent.ironLimitation || 0, 0, 1);
    if (pressure <= .04) return;
    const noiseSeed = agent.noiseSeed || 0;
    ctx.save();
    ctx.translate(agent.x, agent.y);
    ctx.globalAlpha = .25 + pressure * .55;
    ctx.strokeStyle = '#d5ff6d';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    ctx.arc(0, 0, 15 + pressure * 9 + Math.sin(state.time * 3 + noiseSeed) * 2, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    for (let i = 0; i < 3; i++) {
      const angle = state.time * .55 + i * TAU / 3 + noiseSeed;
      ctx.fillStyle = '#d5ff6d';
      ctx.beginPath();
      ctx.arc(Math.cos(angle) * 12, Math.sin(angle) * 8, 1.6, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function render(ctx) {
    ctx.save();
    ctx.translate(-state.cameraX, 0);
    for (const entry of colonyStates.values()) {
      if (entry.colony.x < state.cameraX - 220 || entry.colony.x > state.cameraX + W + 220) continue;
      drawSuppression(ctx, entry);
    }
    for (const particle of siderophores) {
      if (particle.x < state.cameraX - 80 || particle.x > state.cameraX + W + 80) continue;
      drawSiderophore(ctx, particle);
    }
    for (const agent of ecology.agents) {
      if (agent.type !== 'oportunista') continue;
      if (agent.x < state.cameraX - 80 || agent.x > state.cameraX + W + 80) continue;
      drawLimitedFungus(ctx, agent);
    }
    ctx.restore();
  }

  return {
    get depositCount() { return deposits().length; },
    get activeDepositCount() { return deposits().filter(deposit => deposit.stock > .08).length; },
    get freeCount() { return siderophores.filter(item => item.state === 'free').length; },
    get loadedCount() { return siderophores.filter(item => item.state === 'loaded').length; },
    get ironRecovered() { return totalIronRecovered; },
    get fungiLimitedCount() { return fungiLimitedCount; },
    get activeColonyCount() { return [...colonyStates.values()].filter(entry => entry.ironReserve > .03).length; },
    get colonyStates() { return colonyStates; },
    clear,
    reset,
    update,
    renderDeposits,
    render,
  };
}
