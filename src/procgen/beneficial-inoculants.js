import { H, W } from '../core/constants.js';

const TAU = Math.PI * 2;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const PROFILES = {
  rhizobium: {
    label: 'Rhizobium',
    short: 'Rhizobium',
    color: '#c7a5ff',
    pale: '#f0e4ff',
    role: 'pré-nódulo',
    drain: .0014,
  },
  azospirillum: {
    label: 'Azospirillum',
    short: 'Azospirillum',
    color: '#72e8dd',
    pale: '#ddfffb',
    role: 'rizoplano ativo',
    drain: .0012,
  },
  bacillus: {
    label: 'Bacillus',
    short: 'Bacillus',
    color: '#70e5d6',
    pale: '#e3fff5',
    role: 'biofilme',
    drain: .0005,
  },
  pseudomonas: {
    label: 'Pseudomonas',
    short: 'Pseudomonas',
    color: '#8db8ff',
    pale: '#e2edff',
    role: 'zona supressiva',
    drain: .002,
  },
};

const BENEFICIAL_TYPES = Object.keys(PROFILES);

function nearestSupport(state, x, y, maxDistance = 190) {
  let best = null;
  let bestDistance = maxDistance;
  for (const platform of state.level.platforms || []) {
    if (platform.final || platform.recovery || platform.mycorrhizaStructure) continue;
    const pointX = clamp(x, platform.x + 18, platform.x + platform.w - 18);
    const pointY = platform.y - 7;
    const distance = Math.hypot(pointX - x, pointY - y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = { platform, x: pointX, y: pointY, distance };
    }
  }
  return best;
}

export function createBeneficialInoculants({ state, input, ecology, entities }) {
  const colonies = [];
  const followDuration = 30;
  const maxFollowers = 8;
  const maxPerSpecies = 3;
  let nextColonyId = 1;
  let eHeldLast = false;
  let suppressEUntilRelease = false;
  let lastRecruitToastAt = -Infinity;

  function isBeneficial(agent) {
    return Boolean(agent && PROFILES[agent.type]);
  }

  function followers() {
    return ecology.agents.filter(agent => (
      isBeneficial(agent)
      && (agent.beneficialRecruitedUntil || 0) > state.time
    ));
  }

  function followerGroups() {
    const groups = new Map();
    for (const agent of followers()) {
      if (!groups.has(agent.type)) groups.set(agent.type, []);
      groups.get(agent.type).push(agent);
    }
    return groups;
  }

  function releaseAgent(agent) {
    agent.beneficialRecruitedUntil = 0;
    agent.beneficialFollowSlot = null;
    agent.beneficialRecruitSource = null;
  }

  function removeAgent(agent) {
    const index = ecology.agents.indexOf(agent);
    if (index >= 0) ecology.agents.splice(index, 1);
  }

  function clear() {
    for (const agent of ecology.agents) {
      if (isBeneficial(agent)) releaseAgent(agent);
    }
    colonies.length = 0;
    nextColonyId = 1;
    eHeldLast = false;
    suppressEUntilRelease = false;
    lastRecruitToastAt = -Infinity;
    state.level.beneficialColonies = colonies;
  }

  function reset() {
    clear();
    state.level.beneficialColonies = colonies;
  }

  function recruitFromClouds() {
    const clouds = state.level.exudateClouds || [];
    let currentFollowers = followers();

    for (const cloud of clouds) {
      if (!cloud.recruitedBeneficials) cloud.recruitedBeneficials = new Set();
      const perSpecies = new Map();
      for (const agent of currentFollowers) {
        perSpecies.set(agent.type, (perSpecies.get(agent.type) || 0) + 1);
      }

      const candidates = ecology.agents
        .filter(agent => (
          isBeneficial(agent)
          && Math.hypot(agent.x - cloud.x, agent.y - cloud.y) < Math.max(66, cloud.radius * .82)
        ))
        .sort((a, b) => (
          Math.hypot(a.x - cloud.x, a.y - cloud.y)
          - Math.hypot(b.x - cloud.x, b.y - cloud.y)
        ));

      for (const agent of candidates) {
        const alreadyFollowing = (agent.beneficialRecruitedUntil || 0) > state.time;
        const speciesCount = perSpecies.get(agent.type) || 0;
        if (!alreadyFollowing && currentFollowers.length >= maxFollowers) break;
        if (!alreadyFollowing && speciesCount >= maxPerSpecies) continue;

        agent.beneficialRecruitedUntil = Math.max(
          agent.beneficialRecruitedUntil || 0,
          state.time + followDuration,
        );
        agent.beneficialRecruitSource = cloud.id;
        if (agent.beneficialFollowSlot == null) agent.beneficialFollowSlot = currentFollowers.length;
        if (!currentFollowers.includes(agent)) {
          currentFollowers.push(agent);
          perSpecies.set(agent.type, speciesCount + 1);
        }

        if (!cloud.recruitedBeneficials.has(agent.id)) {
          cloud.recruitedBeneficials.add(agent.id);
          const profile = PROFILES[agent.type];
          entities.burst(agent.x, agent.y, profile.color, 12, 92);
          state.discoveredMicrobes.add(agent.type);
          if (state.time - lastRecruitToastAt > 2.2) {
            state.toast = `${profile.label} recrutado: leve a comunidade até uma raiz e pressione E novamente para inocular.`;
            state.toastTime = 4.6;
            lastRecruitToastAt = state.time;
          }
        }
      }
    }
  }

  function followPlayer(dt) {
    const recruited = followers().sort((a, b) => (
      BENEFICIAL_TYPES.indexOf(a.type) - BENEFICIAL_TYPES.indexOf(b.type)
      || String(a.id).localeCompare(String(b.id))
    ));
    const playerX = state.player.x + state.player.w / 2;
    const playerY = state.player.y + state.player.h / 2;

    recruited.forEach((agent, index) => {
      agent.beneficialFollowSlot = index;
      const row = Math.floor(index / 3);
      const column = index % 3;
      const lateral = (column - 1) * (34 + row * 4);
      const targetX = playerX - state.player.facing * (80 + row * 28) + lateral;
      const escortLift = agent.type === 'bacillus' ? 74 : 0;
      const targetY = clamp(
        playerY - 42 - row * 27 - escortLift + Math.sin(state.time * 2.25 + index * .8) * 10,
        62,
        H - 68,
      );
      const dx = targetX - agent.x;
      const dy = targetY - agent.y;
      const distance = Math.max(1, Math.hypot(dx, dy));

      if (distance > 760) {
        agent.x = targetX;
        agent.y = targetY;
        agent.vx = 0;
        agent.vy = 0;
        entities.burst(agent.x, agent.y, PROFILES[agent.type].color, 8, 62);
      } else {
        const desiredSpeed = Math.min(225, 56 + distance * 1.5);
        const response = clamp(dt * 6.8, 0, 1);
        const desiredVX = dx / distance * desiredSpeed;
        const desiredVY = dy / distance * desiredSpeed;
        agent.vx += (desiredVX - agent.vx) * response;
        agent.vy += (desiredVY - agent.vy) * response;
        agent.x += dx * clamp(dt * 2.5, 0, .17);
        agent.y += dy * clamp(dt * 2.25, 0, .15);
      }

      agent.homeX = targetX;
      agent.homeY = targetY;
      agent.radius = Math.max(agent.radius || 0, 275);
      agent.angle = Math.atan2(agent.vy, agent.vx);
    });

    for (const agent of ecology.agents) {
      if (!isBeneficial(agent)) continue;
      if ((agent.beneficialRecruitedUntil || 0) <= state.time) releaseAgent(agent);
    }
  }

  function createBacillusBiofilm(colony) {
    const films = state.level.biofilms || (state.level.biofilms = []);
    const existing = films.find(film => Math.hypot(film.x - colony.x, film.y - colony.y) < 120);
    if (existing) {
      existing.targetRadius = Math.max(existing.targetRadius || 78, 84 + colony.sourceCount * 5);
      return existing;
    }
    const film = {
      x: colony.x,
      y: colony.y,
      radius: 18,
      targetRadius: 84 + colony.sourceCount * 5,
      growth: 0,
      age: 0,
      activated: false,
      platform: colony.platform,
      natural: false,
      inoculated: true,
    };
    films.push(film);
    return film;
  }

  function createColony(type, agents, support, offsetIndex, totalGroups) {
    const profile = PROFILES[type];
    const count = Math.max(1, agents.length);
    const spread = totalGroups > 1 ? 54 : 0;
    const x = clamp(
      support.x + (offsetIndex - (totalGroups - 1) / 2) * spread,
      support.platform.x + 24,
      support.platform.x + support.platform.w - 24,
    );
    const colony = {
      id: `beneficial-colony-${nextColonyId++}`,
      type,
      x,
      y: support.y,
      platform: support.platform,
      sourceCount: count,
      vigor: clamp(.48 + count * .14, 0, 1),
      growth: .06,
      age: 0,
      stage: 'estabelecendo',
      dormant: false,
      rechargeIntensity: 0,
      radius: 58 + count * 8,
      phase: Math.random() * TAU,
      linkedBiofilm: null,
    };
    colonies.push(colony);
    for (const agent of agents) removeAgent(agent);
    state.discoveredMicrobes.add(type);

    if (type === 'bacillus') {
      colony.linkedBiofilm = createBacillusBiofilm(colony);
      colony.stage = 'biofilme';
    }
    entities.burst(colony.x, colony.y, profile.color, 24 + count * 5, 125);
    return colony;
  }

  function depositFollowers() {
    const groups = followerGroups();
    if (!groups.size) return false;
    const player = state.player;
    const support = nearestSupport(
      state,
      player.x + player.w / 2 + player.facing * 36,
      player.y + player.h,
      210,
    );
    if (!support) {
      state.toast = 'Inoculação impossível: aproxime Miguelito de uma raiz ou plataforma estável.';
      state.toastTime = 3.8;
      return true;
    }

    const entries = [...groups.entries()];
    const names = [];
    entries.forEach(([type, agents], index) => {
      createColony(type, agents, support, index, entries.length);
      names.push(`${PROFILES[type].label} (${agents.length})`);
    });
    state.toast = `Inoculantes depositados: ${names.join(', ')}. As comunidades agora permanecem fixas e usam vigor persistente.`;
    state.toastTime = 5.5;
    return true;
  }

  function prepare() {
    const pressed = Boolean(input.keys.KeyE);
    if (pressed && !eHeldLast && state.gameState === 'play' && depositFollowers()) {
      suppressEUntilRelease = true;
    }
    if (suppressEUntilRelease && pressed) input.keys.KeyE = false;
    if (!pressed) suppressEUntilRelease = false;
    eHeldLast = pressed;
  }

  function cloudIntensity(colony) {
    let best = 0;
    for (const cloud of state.level.exudateClouds || []) {
      const distance = Math.hypot(cloud.x - colony.x, cloud.y - colony.y);
      const range = Math.max(130, cloud.radius * 2.05);
      if (distance >= range) continue;
      const life = clamp(cloud.life / Math.max(.1, cloud.maxLife || 10), 0, 1);
      best = Math.max(best, (1 - distance / range) * (.45 + life * .55));
    }
    return best;
  }

  function updateRhizobium(colony, dt) {
    colony.stage = colony.growth < .72 ? 'colonizando a raiz' : 'pré-nódulo';
    if (colony.growth < .72) return;
    const factor = colony.sourceCount * colony.vigor;
    state.player.soil += dt * .009 * factor;
    state.player.hope += dt * .013 * factor;
  }

  function updateAzospirillum(colony, dt) {
    colony.stage = colony.growth < .68 ? 'aderindo ao rizoplano' : 'rizoplano ativo';
    if (colony.growth < .68) return;
    const factor = colony.sourceCount * colony.vigor;
    state.player.soil += dt * .007 * factor;
    state.player.hope += dt * .011 * factor;
  }

  function updatePseudomonas(colony, dt) {
    colony.stage = colony.growth < .65 ? 'ocupando o nicho' : 'zona supressiva';
    if (colony.growth < .65) return;
    const radius = colony.radius * (1.1 + colony.vigor * .7);
    for (const agent of ecology.agents) {
      if (agent.type !== 'oportunista') continue;
      const dx = agent.x - colony.x;
      const dy = agent.y - colony.y;
      const distance = Math.max(1, Math.hypot(dx, dy));
      if (distance >= radius) continue;
      const pressure = clamp(1 - distance / radius, 0, 1) * colony.vigor;
      agent.vx += dx / distance * 82 * pressure * dt;
      agent.vy += dy / distance * 58 * pressure * dt;
      agent.vx *= Math.pow(.38, dt * pressure);
      agent.vy *= Math.pow(.38, dt * pressure);
    }
  }

  function updateColony(colony, dt) {
    colony.age += dt;
    colony.growth = clamp(colony.growth + dt * .3, 0, 1);
    const fuel = cloudIntensity(colony);
    colony.rechargeIntensity = fuel;
    if (fuel > .02) {
      colony.vigor = clamp(colony.vigor + dt * (.025 + fuel * .105), 0, 1);
    }

    if (colony.vigor <= .025) {
      colony.vigor = 0;
      colony.dormant = true;
      colony.stage = 'dormente';
      return;
    }
    if (colony.dormant && colony.vigor > .1) colony.dormant = false;
    if (colony.dormant) return;

    const profile = PROFILES[colony.type];
    colony.vigor = clamp(colony.vigor - dt * profile.drain * (1 + colony.sourceCount * .18), 0, 1);
    if (colony.type === 'rhizobium') updateRhizobium(colony, dt);
    else if (colony.type === 'azospirillum') updateAzospirillum(colony, dt);
    else if (colony.type === 'pseudomonas') updatePseudomonas(colony, dt);
    else if (colony.type === 'bacillus') colony.stage = 'biofilme';
  }

  function update(dt) {
    if (state.gameState !== 'play') return;
    recruitFromClouds();
    followPlayer(dt);
    for (const colony of colonies) updateColony(colony, dt);
  }

  function drawFollowerTrails(ctx) {
    const recruited = followers();
    if (!recruited.length) return;
    const playerX = state.player.x + state.player.w / 2;
    const playerY = state.player.y + state.player.h / 2;
    for (const agent of recruited) {
      const profile = PROFILES[agent.type];
      ctx.strokeStyle = `${profile.color}66`;
      ctx.lineWidth = 1.2;
      ctx.setLineDash([3, 7]);
      ctx.beginPath();
      ctx.moveTo(agent.x, agent.y);
      ctx.quadraticCurveTo((agent.x + playerX) / 2, Math.min(agent.y, playerY) - 22, playerX, playerY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = profile.color;
      ctx.globalAlpha = .65;
      ctx.beginPath();
      ctx.arc(agent.x, agent.y, 12 + Math.sin(state.time * 3 + agent.noiseSeed) * 2, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  function drawColony(ctx, colony) {
    const profile = PROFILES[colony.type];
    const growth = colony.growth;
    const pulse = 1 + Math.sin(state.time * 2 + colony.phase) * .045;
    const radius = (16 + colony.sourceCount * 3.2) * growth * pulse;
    ctx.save();
    ctx.translate(colony.x, colony.y);

    const haloRadius = colony.radius * (.55 + growth * .45);
    const halo = ctx.createRadialGradient(0, 0, 2, 0, 0, haloRadius);
    halo.addColorStop(0, `${profile.color}${colony.dormant ? '22' : '44'}`);
    halo.addColorStop(1, `${profile.color}00`);
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(0, 0, haloRadius, 0, TAU);
    ctx.fill();

    ctx.fillStyle = profile.color;
    ctx.strokeStyle = profile.pale;
    ctx.lineWidth = 1.2;
    const cellCount = 7 + colony.sourceCount * 3;
    for (let i = 0; i < cellCount; i++) {
      const angle = i / cellCount * TAU + colony.phase;
      const rr = radius * (.25 + (i % 4) * .18);
      const x = Math.cos(angle) * rr;
      const y = -4 + Math.sin(angle) * rr * .48;
      ctx.globalAlpha = colony.dormant ? .32 : .55 + (i % 3) * .14;
      ctx.beginPath();
      if (colony.type === 'rhizobium') ctx.ellipse(x, y, 4.5, 2.4, angle + .4, 0, TAU);
      else if (colony.type === 'azospirillum') ctx.ellipse(x, y, 5.3, 1.8, angle, 0, TAU);
      else if (colony.type === 'bacillus') ctx.roundRect(x - 4.5, y - 2, 9, 4, 2);
      else ctx.ellipse(x, y, 4.8, 2, angle - .25, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    const width = 52;
    const barY = -radius - 19;
    ctx.fillStyle = 'rgba(3,18,24,.82)';
    ctx.fillRect(-width / 2 - 2, barY - 2, width + 4, 8);
    ctx.fillStyle = colony.vigor > .55 ? profile.color : colony.vigor > .24 ? '#ffd36f' : '#ff8297';
    ctx.fillRect(-width / 2, barY, width * colony.vigor, 4);
    if (colony.rechargeIntensity > .05) {
      ctx.strokeStyle = '#d6ff94';
      ctx.strokeRect(-width / 2 - 1, barY - 1, width + 2, 6);
    }
    ctx.font = '700 9px Inter,system-ui';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#effff5';
    ctx.fillText(`${profile.short} — ${colony.stage}`, 0, barY - 5);
    ctx.restore();
  }

  function render(ctx) {
    ctx.save();
    ctx.translate(-state.cameraX, 0);
    drawFollowerTrails(ctx);
    for (const colony of colonies) {
      if (colony.x < state.cameraX - 180 || colony.x > state.cameraX + W + 180) continue;
      drawColony(ctx, colony);
    }
    ctx.restore();
  }

  function summaryFromCounts(items) {
    return BENEFICIAL_TYPES
      .map(type => {
        const count = items.filter(item => item.type === type).length;
        return count ? `${PROFILES[type].short} ${count}` : null;
      })
      .filter(Boolean)
      .join(', ');
  }

  return {
    get followerCount() { return followers().length; },
    get followerSummary() { return summaryFromCounts(followers()); },
    get colonyCount() { return colonies.length; },
    get colonySummary() { return summaryFromCounts(colonies); },
    get vigorAverage() {
      if (!colonies.length) return 0;
      return colonies.reduce((sum, colony) => sum + colony.vigor, 0) / colonies.length;
    },
    get colonies() { return colonies; },
    clear,
    reset,
    prepare,
    update,
    render,
  };
}
