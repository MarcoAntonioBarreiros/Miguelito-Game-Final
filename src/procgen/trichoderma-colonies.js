import { H } from '../core/constants.js';

const TAU = Math.PI * 2;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function nearestSubstrate(state, x, y, maxDistance = 150) {
  let best = null;
  let bestDistance = maxDistance;
  for (const platform of state.level.platforms || []) {
    if (platform.final) continue;
    const pointX = clamp(x, platform.x + 16, platform.x + platform.w - 16);
    const pointY = platform.y - 7;
    const distance = Math.hypot(pointX - x, pointY - y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = { x: pointX, y: pointY, platform };
    }
  }
  return best;
}

export function createTrichodermaColonies({ state, input, ecology, entities }) {
  const colonies = [];
  let nextColonyId = 1;
  let eHeldLast = false;
  let suppressEUntilRelease = false;

  function recruitedFollowers() {
    return ecology.agents.filter(agent => (
      agent.type === 'trichoderma'
      && !agent.hyphalAttack
      && (agent.recruitedUntil || 0) > state.time
    ));
  }

  function removeAgent(agent) {
    const index = ecology.agents.indexOf(agent);
    if (index >= 0) ecology.agents.splice(index, 1);
  }

  function createColony({ x, y, agents = [], natural = false }) {
    const support = nearestSubstrate(state, x, y);
    const count = Math.max(1, agents.length || 1);
    const colony = {
      id: `tricho-colony-${nextColonyId++}`,
      x: support?.x ?? x,
      y: support?.y ?? clamp(y, 72, H - 72),
      platform: support?.platform || null,
      vigor: natural ? .62 : clamp(.48 + count * .13, 0, 1),
      growth: .08,
      age: 0,
      sourceCount: count,
      natural,
      activeTargetId: null,
      cooldownUntil: 0,
      kills: 0,
      stage: 'inoculated',
      exhausted: false,
      rechargeIntensity: 0,
      phase: Math.random() * TAU,
    };
    colonies.push(colony);
    for (const agent of agents) removeAgent(agent);
    state.discoveredMicrobes.add('trichoderma');
    entities.burst(colony.x, colony.y, '#8df0a8', 28 + count * 4, 145);
    return colony;
  }

  function depositFollowers() {
    const followers = recruitedFollowers();
    if (!followers.length) return false;
    const player = state.player;
    const x = player.x + player.w / 2 + player.facing * 42;
    const y = player.y + player.h - 2;
    const colony = createColony({ x, y, agents: followers, natural: false });
    state.toast = `Trichoderma inoculado: ${followers.length} propágulo${followers.length > 1 ? 's' : ''} formaram uma colônia fixa com vigor persistente`;
    state.toastTime = 5.2;
    colony.stage = 'ready';
    return true;
  }

  function inoculateNaturalAgent(agent) {
    if (!agent || agent.type !== 'trichoderma') return null;
    if ((agent.recruitedUntil || 0) > state.time || agent.hyphalAttack) return null;
    return createColony({ x: agent.x, y: agent.y, agents: [agent], natural: true });
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
      const range = Math.max(135, cloud.radius * 2.1);
      if (distance >= range) continue;
      const life = clamp(cloud.life / Math.max(.1, cloud.maxLife || 10), 0, 1);
      best = Math.max(best, (1 - distance / range) * (.48 + life * .52));
    }
    return best;
  }

  function update(dt) {
    if (state.gameState !== 'play') return;
    for (const colony of colonies) {
      colony.age += dt;
      colony.growth = clamp(colony.growth + dt * .34, 0, 1);
      const fuel = cloudIntensity(colony);
      colony.rechargeIntensity = fuel;
      if (fuel > .02) {
        colony.vigor = clamp(colony.vigor + dt * (.035 + fuel * .13), 0, 1);
        if (colony.vigor > .1 && colony.exhausted) {
          colony.exhausted = false;
          colony.stage = 'ready';
          entities.burst(colony.x, colony.y, '#d6ff94', 14, 85);
        }
      }
      if (!colony.activeTargetId && !colony.exhausted && state.time >= colony.cooldownUntil) {
        colony.stage = 'ready';
      }
    }
  }

  function drawColony(ctx, colony) {
    const growth = colony.growth;
    const pulse = 1 + Math.sin(state.time * 2.2 + colony.phase) * .05;
    const radius = (18 + colony.sourceCount * 2.8) * growth * pulse;
    ctx.save();
    ctx.translate(colony.x, colony.y);

    const halo = ctx.createRadialGradient(0, 0, 2, 0, 0, radius * 2.8);
    halo.addColorStop(0, `rgba(141,240,168,${.2 + colony.vigor * .22})`);
    halo.addColorStop(1, 'rgba(141,240,168,0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 2.8, 0, TAU);
    ctx.fill();

    ctx.strokeStyle = colony.exhausted ? 'rgba(255,130,151,.58)' : 'rgba(184,255,198,.72)';
    ctx.lineWidth = 1.3;
    for (let i = 0; i < 7; i++) {
      const angle = -Math.PI + i / 6 * Math.PI;
      const length = radius * (.72 + (i % 3) * .16);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(Math.cos(angle) * length * .45, -4 - (i % 2) * 5, Math.cos(angle) * length, Math.sin(angle) * length * .28 - 3);
      ctx.stroke();
    }

    for (let i = 0; i < 8 + colony.sourceCount * 2; i++) {
      const angle = i / (8 + colony.sourceCount * 2) * TAU + colony.phase;
      const rr = radius * (.22 + (i % 4) * .17);
      ctx.fillStyle = i % 3 ? '#8df0a8' : '#ecfff1';
      ctx.globalAlpha = colony.exhausted ? .35 : .62 + (i % 3) * .1;
      ctx.beginPath();
      ctx.ellipse(Math.cos(angle) * rr, -5 + Math.sin(angle) * rr * .42, 3.8, 2.6, angle, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    const width = 52;
    const barY = -radius - 18;
    ctx.fillStyle = 'rgba(3,18,24,.82)';
    ctx.fillRect(-width / 2 - 2, barY - 2, width + 4, 8);
    ctx.fillStyle = colony.vigor > .55 ? '#8df0a8' : colony.vigor > .24 ? '#ffd36f' : '#ff8297';
    ctx.fillRect(-width / 2, barY, width * clamp(colony.vigor, 0, 1), 4);
    if (colony.rechargeIntensity > .05) {
      ctx.strokeStyle = '#d6ff94';
      ctx.strokeRect(-width / 2 - 1, barY - 1, width + 2, 6);
    }
    ctx.font = '700 9px Inter,system-ui';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#effff5';
    const label = colony.exhausted ? 'colônia exaurida' : colony.activeTargetId ? 'colônia ativa' : 'colônia inoculada';
    ctx.fillText(label, 0, barY - 5);
    ctx.restore();
  }

  function render(ctx) {
    ctx.save();
    ctx.translate(-state.cameraX, 0);
    for (const colony of colonies) drawColony(ctx, colony);
    ctx.restore();
  }

  function clear() {
    colonies.length = 0;
    nextColonyId = 1;
    eHeldLast = false;
    suppressEUntilRelease = false;
  }

  function reset() { clear(); }

  function byId(id) {
    return colonies.find(colony => colony.id === id) || null;
  }

  return {
    get colonies() { return colonies; },
    get followerCount() { return recruitedFollowers().length; },
    get colonyCount() { return colonies.length; },
    get vigorAverage() {
      if (!colonies.length) return 0;
      return colonies.reduce((sum, colony) => sum + colony.vigor, 0) / colonies.length;
    },
    byId,
    inoculateNaturalAgent,
    clear,
    reset,
    prepare,
    update,
    render,
  };
}
