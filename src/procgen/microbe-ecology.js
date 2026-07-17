import { H, W } from '../core/constants.js';
import { microbeCatalog } from '../data/microbes.js';

const TAU = Math.PI * 2;
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const lerp = (a, b, t) => a + (b - a) * t;

export const MICROBE_MOTION_PROFILES = {
  rhizobium: {
    color: '#79e8dc', count: 8, speed: 64, radius: 116,
    cohesion: .12, alignment: .14, separation: 1.65,
    homePull: .38, playerPull: .22, wander: .42,
    kind: 'rod', flagella: 'multi', scale: .72, trail: true,
  },
  azospirillum: {
    color: '#72e8dd', count: 7, speed: 92, radius: 128,
    cohesion: .10, alignment: .12, separation: 1.72,
    homePull: .31, playerPull: .28, wander: .58,
    kind: 'curved', flagella: 'single', scale: .78, trail: true,
  },
  bacillus: {
    color: '#70e5d6', count: 9, speed: 54, radius: 110,
    cohesion: .18, alignment: .16, separation: 1.82,
    homePull: .44, playerPull: .15, wander: .34,
    kind: 'short', flagella: 'peri', scale: .7, trail: true,
  },
  pseudomonas: {
    color: '#b9f36f', count: 7, speed: 86, radius: 122,
    cohesion: .09, alignment: .15, separation: 1.76,
    homePull: .34, playerPull: .24, wander: .54,
    kind: 'thin', flagella: 'tuft', scale: .7, trail: true,
  },
  oportunista: {
    color: '#ff8297', count: 7, speed: 31, radius: 132,
    cohesion: .05, alignment: .05, separation: 1.3,
    homePull: .28, playerPull: .08, wander: .92,
    kind: 'spore', flagella: null, scale: .82, trail: false,
  },
  trichoderma: {
    color: '#8df0a8', count: 7, speed: 37, radius: 132,
    cohesion: .07, alignment: .06, separation: 1.38,
    homePull: .30, playerPull: .11, wander: .82,
    kind: 'conidium', flagella: null, scale: .84, trail: false,
  },
};

function hashSeed(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a += 0x6D2B79F5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function nearestPointOnRect(x, y, rect) {
  return {
    x: clamp(x, rect.x, rect.x + rect.w),
    y: clamp(y, rect.y, rect.y + rect.h),
  };
}

function drawFlagellum(ctx, stateTime, x, y, angle, length, phase, width = .8, spread = 0) {
  ctx.save();
  ctx.strokeStyle = 'rgba(225,255,242,.64)';
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y);
  for (let i = 1; i <= 9; i++) {
    const u = i / 9;
    const a = angle + spread;
    const wave = Math.sin(stateTime * 8.2 - i * .82 + phase) * (2.2 + u * 5.8);
    ctx.lineTo(
      x + Math.cos(a) * length * u + Math.cos(a + Math.PI / 2) * wave,
      y + Math.sin(a) * length * u + Math.sin(a + Math.PI / 2) * wave,
    );
  }
  ctx.stroke();
  ctx.restore();
}

function drawBacterium(ctx, time, agent, profile) {
  const a = agent.angle;
  const s = agent.size * profile.scale;
  const rearX = agent.x - Math.cos(a) * 13 * s;
  const rearY = agent.y - Math.sin(a) * 13 * s;

  if (profile.flagella === 'single') {
    drawFlagellum(ctx, time, rearX, rearY, a + Math.PI, 42 * s, agent.phase, 1);
  } else if (profile.flagella === 'tuft') {
    for (let i = 0; i < 4; i++) drawFlagellum(ctx, time, rearX, rearY, a + Math.PI, 38 * s, agent.phase + i * .7, .75, (i - 1.5) * .13);
  } else if (profile.flagella === 'multi') {
    for (let i = 0; i < 3; i++) drawFlagellum(ctx, time, rearX, rearY, a + Math.PI, 36 * s, agent.phase + i * .9, .75, (i - 1) * .18);
  } else if (profile.flagella === 'peri') {
    for (let i = 0; i < 5; i++) {
      const fa = a + i / 5 * TAU;
      drawFlagellum(ctx, time, agent.x + Math.cos(fa) * 5 * s, agent.y + Math.sin(fa) * 5 * s, fa, 18 * s, agent.phase + i, .6);
    }
  }

  ctx.save();
  ctx.translate(agent.x, agent.y);
  ctx.rotate(a);
  ctx.scale(s, s);
  const halo = ctx.createRadialGradient(0, 0, 2, 0, 0, 24);
  halo.addColorStop(0, `${profile.color}66`);
  halo.addColorStop(1, `${profile.color}00`);
  ctx.fillStyle = halo;
  ctx.fillRect(-26, -26, 52, 52);

  const body = ctx.createLinearGradient(-14, -5, 14, 5);
  body.addColorStop(0, '#12383b');
  body.addColorStop(.5, profile.color);
  body.addColorStop(1, '#0c282e');
  ctx.fillStyle = body;
  ctx.beginPath();
  if (profile.kind === 'curved') {
    ctx.moveTo(-14, 2);
    ctx.bezierCurveTo(-9, -8, 8, -9, 15, -1);
    ctx.bezierCurveTo(10, 7, -5, 9, -14, 2);
    ctx.closePath();
  } else {
    const h = profile.kind === 'thin' ? 7 : 9;
    const w = profile.kind === 'short' ? 22 : 28;
    ctx.roundRect(-w / 2, -h / 2, w, h, h / 2);
  }
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.28)';
  ctx.lineWidth = .7;
  ctx.stroke();
  ctx.fillStyle = 'rgba(250,255,252,.55)';
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.arc(-7 + i * 4.5, Math.sin(time * 2 + agent.phase + i) * 1.2, .8, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

function drawSpore(ctx, time, agent, profile) {
  const pulse = 1 + Math.sin(time * 2.4 + agent.phase) * .08;
  const r = (profile.kind === 'conidium' ? 6.5 : 5.5) * agent.size * pulse;
  ctx.save();
  ctx.translate(agent.x, agent.y);
  ctx.rotate(agent.angle + time * (profile.kind === 'conidium' ? .35 : -.22));
  const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 4);
  halo.addColorStop(0, `${profile.color}70`);
  halo.addColorStop(1, `${profile.color}00`);
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(0, 0, r * 4, 0, TAU);
  ctx.fill();
  ctx.fillStyle = profile.color;
  ctx.strokeStyle = 'rgba(255,255,255,.35)';
  ctx.lineWidth = 1;
  if (profile.kind === 'conidium') {
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 1.18, r * .86, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = `${profile.color}aa`;
    ctx.beginPath();
    ctx.moveTo(-r * 1.1, 0);
    ctx.quadraticCurveTo(-r * 2.4, r * .8, -r * 3.1, r * .15);
    ctx.stroke();
  } else {
    ctx.beginPath();
    for (let i = 0; i < 12; i++) {
      const aa = i / 12 * TAU;
      const rr = i % 2 ? r : r * 1.34;
      const x = Math.cos(aa) * rr;
      const y = Math.sin(aa) * rr;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255,255,255,.68)';
  ctx.beginPath();
  ctx.arc(-r * .22, -r * .2, Math.max(1, r * .18), 0, TAU);
  ctx.fill();
  ctx.restore();
}

export function createMicrobeEcology({ state, entities }) {
  const ecology = {
    active: false,
    agents: [],
    encounters: [],
  };
  let trailTick = 0;

  function clear() {
    ecology.active = false;
    ecology.agents.length = 0;
    ecology.encounters.length = 0;
  }

  function reset(encounters) {
    clear();
    ecology.encounters = encounters.map((z, index) => ({ ...z, index }));
    const maxAgents = 156;

    for (const zone of ecology.encounters) {
      const profile = MICROBE_MOTION_PROFILES[zone.id];
      if (!profile || ecology.agents.length >= maxAgents) continue;
      const count = Math.min(profile.count, maxAgents - ecology.agents.length);
      const rnd = seededRandom(hashSeed(`${zone.id}:${Math.round(zone.x)}:${Math.round(zone.y)}:${zone.index}`));
      const homeY = clamp(zone.y - 32, 95, H - 100);

      for (let i = 0; i < count; i++) {
        const angle = rnd() * TAU;
        const radius = profile.radius * (.18 + rnd() * .62);
        const direction = rnd() * TAU;
        ecology.agents.push({
          id: `${zone.index}:${i}`,
          type: zone.id,
          zoneIndex: zone.index,
          homeX: zone.x,
          homeY,
          radius: zone.r || profile.radius,
          x: zone.x + Math.cos(angle) * radius,
          y: clamp(homeY + Math.sin(angle) * radius * .62, 70, H - 70),
          vx: Math.cos(direction) * profile.speed * (.45 + rnd() * .35),
          vy: Math.sin(direction) * profile.speed * (.35 + rnd() * .25),
          targetVX: 0,
          targetVY: 0,
          angle: direction,
          phase: rnd() * TAU,
          size: .78 + rnd() * .48,
          tumble: .3 + rnd() * 1.2,
          trail: [],
        });
      }
    }
    ecology.active = ecology.agents.length > 0;
  }

  function obstacleForce(agent) {
    let fx = 0;
    let fy = 0;
    const margin = 58;
    const level = state.level;

    for (const rect of level.platforms) {
      if (agent.x < rect.x - margin || agent.x > rect.x + rect.w + margin || agent.y < rect.y - margin || agent.y > rect.y + rect.h + margin) continue;
      const point = nearestPointOnRect(agent.x, agent.y, rect);
      let dx = agent.x - point.x;
      let dy = agent.y - point.y;
      let d = Math.hypot(dx, dy);
      const inside = agent.x >= rect.x && agent.x <= rect.x + rect.w && agent.y >= rect.y && agent.y <= rect.y + rect.h;
      if (inside) {
        dx = 0;
        dy = -1;
        d = 1;
      }
      if (d < margin) {
        const f = (margin - d) / margin;
        fx += dx / Math.max(1, d) * f * 180;
        fy += dy / Math.max(1, d) * f * 180;
      }
    }

    for (const hazard of level.hazards) {
      if (agent.x < hazard.x - 70 || agent.x > hazard.x + hazard.w + 70 || agent.y < hazard.y - 85) continue;
      const point = nearestPointOnRect(agent.x, agent.y, hazard);
      const dx = agent.x - point.x;
      const dy = agent.y - point.y;
      const d = Math.max(1, Math.hypot(dx, dy));
      if (d < 85) {
        const f = (85 - d) / 85;
        fx += dx / d * f * 210;
        fy += dy / d * f * 240 - f * 90;
      }
    }
    return { x: fx, y: fy };
  }

  function update(dt) {
    if (!ecology.active || state.gameState !== 'play') return;
    trailTick -= dt;
    const addTrail = trailTick <= 0;
    if (addTrail) trailTick = .065;

    const playerX = state.player.x + state.player.w / 2;
    const playerY = state.player.y + state.player.h / 2;
    const cameraCenter = state.cameraX + W / 2;

    for (const zone of ecology.encounters) {
      if (!state.discoveredMicrobes.has(zone.id) && Math.hypot(zone.x - playerX, zone.y - playerY) < (zone.r || 135)) {
        entities.discoverMicrobe(zone.id, true);
      }
    }

    for (const agent of ecology.agents) {
      const profile = MICROBE_MOTION_PROFILES[agent.type];
      if (!profile) continue;
      const distanceFromCamera = Math.abs(agent.x - cameraCenter);
      if (distanceFromCamera > W * 1.35) continue;

      let fx = 0;
      let fy = 0;
      let centerX = 0;
      let centerY = 0;
      let alignX = 0;
      let alignY = 0;
      let neighbours = 0;

      for (const other of ecology.agents) {
        if (other === agent || other.zoneIndex !== agent.zoneIndex) continue;
        const dx = other.x - agent.x;
        const dy = other.y - agent.y;
        const d = Math.hypot(dx, dy);
        if (d > 0 && d < 52) {
          const strength = (52 - d) / 52;
          fx -= dx / d * strength * profile.speed * profile.separation;
          fy -= dy / d * strength * profile.speed * profile.separation;
        }
        if (d > 0 && d < 155) {
          centerX += other.x;
          centerY += other.y;
          alignX += other.vx;
          alignY += other.vy;
          neighbours++;
        }
      }

      if (neighbours) {
        centerX /= neighbours;
        centerY /= neighbours;
        alignX /= neighbours;
        alignY /= neighbours;
        fx += (centerX - agent.x) * profile.cohesion;
        fy += (centerY - agent.y) * profile.cohesion;
        fx += (alignX - agent.vx) * profile.alignment;
        fy += (alignY - agent.vy) * profile.alignment;
      }

      const zone = ecology.encounters[agent.zoneIndex];
      const orbitX = Math.cos(state.time * .23 + agent.phase) * profile.radius * .22;
      const orbitY = Math.sin(state.time * .19 + agent.phase * 1.3) * profile.radius * .16;
      const targetX = agent.homeX + orbitX;
      const targetY = agent.homeY + orbitY;
      const homeDX = targetX - agent.x;
      const homeDY = targetY - agent.y;
      const homeDistance = Math.max(1, Math.hypot(homeDX, homeDY));
      const homeStrength = clamp((homeDistance - profile.radius * .28) / profile.radius, .12, 1);
      fx += homeDX / homeDistance * profile.speed * profile.homePull * homeStrength;
      fy += homeDY / homeDistance * profile.speed * profile.homePull * homeStrength;

      const pdx = playerX - agent.x;
      const pdy = playerY - agent.y;
      const playerDistance = Math.max(1, Math.hypot(pdx, pdy));
      if (playerDistance < 330) {
        const attraction = (1 - playerDistance / 330) * profile.playerPull;
        fx += pdx / playerDistance * profile.speed * attraction;
        fy += pdy / playerDistance * profile.speed * attraction;
      }

      agent.tumble -= dt;
      if (agent.tumble <= 0) {
        agent.tumble = .35 + Math.random() * 1.25;
        agent.phase += (Math.random() - .5) * 1.8;
      }

      fx += Math.cos(state.time * 1.7 + agent.phase) * profile.speed * profile.wander * .34;
      fy += Math.sin(state.time * 1.31 + agent.phase * 1.7) * profile.speed * profile.wander * .25;

      if (profile.kind === 'spore' || profile.kind === 'conidium') {
        fy += Math.sin(state.time * .82 + agent.phase) * 18 - 4;
        fx += Math.cos(state.time * .57 + agent.phase * 1.9) * 11;
      }

      const avoid = obstacleForce(agent);
      fx += avoid.x;
      fy += avoid.y;

      if (agent.y < 70) fy += (70 - agent.y) * 4;
      if (agent.y > H - 72) fy -= (agent.y - (H - 72)) * 5;

      agent.targetVX = fx;
      agent.targetVY = fy;
      const targetSpeed = Math.hypot(agent.targetVX, agent.targetVY);
      if (targetSpeed > profile.speed) {
        agent.targetVX = agent.targetVX / targetSpeed * profile.speed;
        agent.targetVY = agent.targetVY / targetSpeed * profile.speed;
      }

      const response = 1 - Math.pow(.002, dt);
      agent.vx = lerp(agent.vx, agent.targetVX, response);
      agent.vy = lerp(agent.vy, agent.targetVY, response);
      const speed = Math.hypot(agent.vx, agent.vy);
      if (speed < profile.speed * .28) {
        agent.vx += Math.cos(agent.phase) * profile.speed * .16 * dt;
        agent.vy += Math.sin(agent.phase) * profile.speed * .16 * dt;
      }

      agent.x += agent.vx * dt;
      agent.y += agent.vy * dt;
      agent.angle = Math.atan2(agent.vy, agent.vx);

      const worldMax = state.level.endX || 5200;
      agent.x = clamp(agent.x, 28, worldMax - 28);
      agent.y = clamp(agent.y, 45, H - 45);

      if (addTrail && profile.trail && distanceFromCamera < W) {
        agent.trail.push({ x: agent.x, y: agent.y, life: 1 });
        if (agent.trail.length > 18) agent.trail.shift();
      }
      for (const point of agent.trail) point.life -= dt * 2.1;
      while (agent.trail.length && agent.trail[0].life <= 0) agent.trail.shift();

      if (zone && state.discoveredMicrobes.has(zone.id)) {
        agent.homeY = lerp(agent.homeY, clamp(zone.y - 18, 90, H - 90), dt * .08);
      }
    }
  }

  function drawLabel(ctx, zone) {
    const px = state.player.x + state.player.w / 2;
    const py = state.player.y + state.player.h / 2;
    if (Math.hypot(zone.x - px, zone.y - py) > 230) return;
    const profile = MICROBE_MOTION_PROFILES[zone.id];
    const catalog = microbeCatalog[zone.id];
    if (!profile || !catalog) return;
    const known = state.discoveredMicrobes.has(zone.id);
    const text = known ? catalog.name : 'Comunidade microbiana móvel';
    ctx.save();
    ctx.font = '700 12px Inter,system-ui';
    ctx.textAlign = 'center';
    ctx.shadowBlur = 10;
    ctx.shadowColor = profile.color;
    ctx.fillStyle = known ? '#effff6' : '#d2e4dc';
    ctx.fillText(text, zone.x, zone.y - 112);
    ctx.restore();
  }

  function render(ctx) {
    if (!ecology.active) return;
    ctx.save();
    ctx.translate(-state.cameraX, 0);

    for (const agent of ecology.agents) {
      if (agent.x < state.cameraX - 120 || agent.x > state.cameraX + W + 120) continue;
      const profile = MICROBE_MOTION_PROFILES[agent.type];
      if (!profile) continue;
      if (profile.trail && agent.trail.length > 1) {
        ctx.save();
        ctx.strokeStyle = profile.color;
        ctx.lineWidth = 1.2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        agent.trail.forEach((point, index) => {
          ctx.globalAlpha = clamp(point.life, 0, 1) * .18;
          index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y);
        });
        ctx.stroke();
        ctx.restore();
      }
    }

    for (const agent of ecology.agents) {
      if (agent.x < state.cameraX - 120 || agent.x > state.cameraX + W + 120) continue;
      const profile = MICROBE_MOTION_PROFILES[agent.type];
      if (!profile) continue;
      if (profile.kind === 'spore' || profile.kind === 'conidium') drawSpore(ctx, state.time, agent, profile);
      else drawBacterium(ctx, state.time, agent, profile);
    }

    ecology.encounters.forEach(zone => {
      if (zone.x > state.cameraX - 200 && zone.x < state.cameraX + W + 200) drawLabel(ctx, zone);
    });
    ctx.restore();
  }

  return {
    get active() { return ecology.active; },
    get agents() { return ecology.agents; },
    get encounters() { return ecology.encounters; },
    clear,
    reset,
    update,
    render,
  };
}
