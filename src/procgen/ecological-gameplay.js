import { H, W } from '../core/constants.js';

const TAU = Math.PI * 2;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function nearestPointOnPlatform(x, y, platform) {
  return {
    x: clamp(x, platform.x + 18, platform.x + platform.w - 18),
    y: platform.y - 7,
  };
}

export function createEcologicalGameplay({ state, input, entities, ecology }) {
  const clouds = [];
  const biofilms = [];
  const formingBiofilms = new Map();
  const attacks = new Map();
  let nextCloudId = 1;
  let eHeldLast = false;
  let infectionAnnounced = false;

  function toast(title, message, seconds = 4.7) {
    state.toast = `${title}: ${message}`;
    state.toastTime = seconds;
  }

  function clear() {
    clouds.length = 0;
    biofilms.length = 0;
    formingBiofilms.clear();
    attacks.clear();
    eHeldLast = false;
    infectionAnnounced = false;
  }

  function reset() {
    clear();
    state.level.exudateClouds = clouds;
    state.level.biofilms = biofilms;
    state.player.infection = 0;
    state.player.infectionExposure = 0;
    state.player.moveMultiplier = 1;
    for (const checkpoint of state.level.checkpoints || []) {
      biofilms.push({
        x: checkpoint.x,
        y: checkpoint.y + 8,
        radius: 72,
        growth: 1,
        age: 12,
        activated: Boolean(checkpoint.active),
        checkpoint,
        natural: true,
      });
    }
  }

  function deployCloud() {
    const player = state.player;
    if (player.exudates <= 0) {
      toast('Sem exsudatos', 'Colete gotas verdes antes de liberar um gradiente químico.', 3.2);
      return;
    }
    player.exudates--;
    if (clouds.length >= 4) clouds.shift();
    const cloud = {
      id: nextCloudId++,
      x: player.x + player.w / 2 + player.facing * 24,
      y: player.y + player.h / 2,
      radius: 24,
      targetRadius: 155,
      life: 10,
      maxLife: 10,
      phase: Math.random() * TAU,
    };
    clouds.push(cloud);
    entities.burst(cloud.x, cloud.y, '#b7f36b', 22, 135);
    toast('Gradiente de exsudatos', 'A nuvem atrai comunidades móveis e orienta interações ecológicas.', 3.5);
  }

  function prepare() {
    const pressed = Boolean(input.keys.KeyE);
    if (pressed && !eHeldLast && state.gameState === 'play') deployCloud();
    eHeldLast = pressed;
    state.player.moveMultiplier = 1 - clamp(state.player.infection || 0, 0, 1) * .32;
  }

  function updateClouds(dt) {
    for (const cloud of clouds) {
      cloud.life -= dt;
      cloud.radius += (cloud.targetRadius - cloud.radius) * clamp(dt * 2.3, 0, 1);
      cloud.y += Math.sin(state.time * .9 + cloud.phase) * dt * 2.2;
    }
    for (let i = clouds.length - 1; i >= 0; i--) if (clouds[i].life <= 0) clouds.splice(i, 1);
  }

  function attractionWeight(type) {
    if (type === 'bacillus') return 1.5;
    if (type === 'trichoderma') return 1.35;
    if (type === 'rhizobium') return 1.25;
    if (type === 'azospirillum') return 1.18;
    if (type === 'pseudomonas') return 1.12;
    if (type === 'oportunista') return .42;
    return .7;
  }

  function applyCloudTaxia(dt) {
    for (const agent of ecology.agents) {
      let best = null;
      let bestScore = Infinity;
      for (const cloud of clouds) {
        const d = Math.hypot(cloud.x - agent.x, cloud.y - agent.y);
        if (d > cloud.radius * 3.2) continue;
        const score = d / attractionWeight(agent.type);
        if (score < bestScore) {
          best = cloud;
          bestScore = score;
        }
      }
      if (!best) continue;
      const dx = best.x - agent.x;
      const dy = best.y - agent.y;
      const d = Math.max(1, Math.hypot(dx, dy));
      const gradient = clamp(1 - d / (best.radius * 3.2), 0, 1);
      const force = 165 * attractionWeight(agent.type) * gradient;
      agent.vx += dx / d * force * dt;
      agent.vy += dy / d * force * dt;
      agent.homeX += dx / d * force * dt * .9;
      agent.homeY += dy / d * force * dt * .7;
    }
  }

  function updateInfection(dt) {
    const player = state.player;
    const center = { x: player.x + player.w / 2, y: player.y + player.h / 2 };
    let contacts = 0;
    for (const agent of ecology.agents) {
      if (agent.type === 'oportunista' && Math.hypot(agent.x - center.x, agent.y - center.y) < 38) contacts++;
    }
    if (contacts > 0) player.infectionExposure = clamp((player.infectionExposure || 0) + dt * (1.15 + contacts * .35), 0, 1.4);
    else player.infectionExposure = Math.max(0, (player.infectionExposure || 0) - dt * .72);
    if (player.infectionExposure > .48) player.infection = clamp((player.infection || 0) + dt * (.12 + contacts * .055), 0, 1);
    if (player.infection > .06) {
      player.hope = Math.max(0, player.hope - dt * (.18 + player.infection * .58));
      if (!infectionAnnounced) {
        infectionAnnounced = true;
        toast('Contaminação oportunista', 'Propágulos aderiram. Procure Bacillus, Trichoderma ou use o Pulso para reduzir a infecção.', 5.2);
      }
    } else if (player.infection <= .015) infectionAnnounced = false;
    for (const pulse of state.level.pulses) {
      if (pulse.ecologyApplied) continue;
      pulse.ecologyApplied = true;
      if (player.infection > 0) {
        player.infection = Math.max(0, player.infection - .38);
        player.infectionExposure = 0;
        entities.burst(center.x, center.y, '#ffcf8a', 18, 155);
      }
    }
  }

  function nearestPlatform(x, y, maxDistance = 170) {
    let best = null;
    let bestPoint = null;
    let bestDistance = maxDistance;
    for (const platform of state.level.platforms) {
      if (platform.recovery || platform.final) continue;
      const point = nearestPointOnPlatform(x, y, platform);
      const d = Math.hypot(point.x - x, point.y - y);
      if (d < bestDistance) {
        best = platform;
        bestPoint = point;
        bestDistance = d;
      }
    }
    return best ? { platform: best, point: bestPoint, distance: bestDistance } : null;
  }

  function createBiofilm(point, platform) {
    if (biofilms.some(film => Math.abs(film.x - point.x) < 150)) return;
    biofilms.push({
      x: point.x, y: point.y, radius: 18, targetRadius: 88,
      growth: 0, age: 0, activated: false, platform, natural: false,
    });
    entities.burst(point.x, point.y, '#70e5d6', 38, 175);
    toast('Biofilme de Bacillus', 'A matriz aderida estabilizou a raiz e criou uma nova zona segura.', 4.8);
    state.discoveredMicrobes.add('bacillus');
  }

  function updateBiofilmFormation(dt) {
    for (const cloud of clouds) {
      const support = nearestPlatform(cloud.x, cloud.y);
      if (!support) continue;
      const bacilli = ecology.agents.filter(agent => agent.type === 'bacillus' && Math.hypot(agent.x - support.point.x, agent.y - support.point.y) < 112);
      const key = `${cloud.id}:${support.platform.logicIndex ?? Math.round(support.platform.x)}`;
      if (bacilli.length >= 3) {
        const current = formingBiofilms.get(key) || { progress: 0, x: support.point.x, y: support.point.y, platform: support.platform };
        current.progress += dt * clamp(bacilli.length / 4, .65, 1.8);
        current.x = support.point.x;
        current.y = support.point.y;
        formingBiofilms.set(key, current);
        if (current.progress >= 3.4) {
          createBiofilm(current, current.platform);
          formingBiofilms.delete(key);
          cloud.life = Math.min(cloud.life, 1.2);
        }
      } else {
        const current = formingBiofilms.get(key);
        if (current) {
          current.progress = Math.max(0, current.progress - dt * .4);
          if (current.progress <= 0) formingBiofilms.delete(key);
        }
      }
    }
    const player = state.player;
    const center = { x: player.x + player.w / 2, y: player.y + player.h / 2 };
    for (const film of biofilms) {
      film.age += dt;
      film.growth = clamp(film.growth + dt * .42, 0, 1);
      film.radius += ((film.targetRadius || 78) - film.radius) * clamp(dt * 1.8, 0, 1);
      if (Math.hypot(center.x - film.x, center.y - film.y) >= film.radius) continue;
      player.infection = Math.max(0, (player.infection || 0) - dt * .72);
      player.infectionExposure = Math.max(0, (player.infectionExposure || 0) - dt * 1.8);
      player.soil += dt * .32;
      if (film.checkpoint?.active) film.activated = true;
      if (!film.activated) {
        film.activated = true;
        if (film.checkpoint) film.checkpoint.active = true;
        state.currentCheckpoint = { x: film.x - player.w / 2, y: film.y - player.h - 8 };
        entities.burst(film.x, film.y, '#70e5d6', 26, 145);
        toast('Zona segura de Bacillus', 'Checkpoint ativado; a matriz remove contaminação e recupera o solo.', 4.5);
      }
    }
  }

  function updateTrichoderma(dt) {
    const agents = ecology.agents;
    const opportunists = agents.filter(agent => agent.type === 'oportunista');
    const trichoderma = agents.filter(agent => agent.type === 'trichoderma');
    const activeTargets = new Set();
    for (const hunter of trichoderma) {
      let target = null;
      let bestDistance = 145;
      for (const candidate of opportunists) {
        const d = Math.hypot(candidate.x - hunter.x, candidate.y - hunter.y);
        if (d < bestDistance) {
          target = candidate;
          bestDistance = d;
        }
      }
      if (!target) continue;
      activeTargets.add(target.id);
      const record = attacks.get(target.id) || { target, hunter, progress: 0, phase: Math.random() * TAU };
      record.target = target;
      record.hunter = hunter;
      record.progress += dt * (1.05 + (145 - bestDistance) / 145 * .85);
      attacks.set(target.id, record);
      const dx = target.x - hunter.x;
      const dy = target.y - hunter.y;
      const d = Math.max(1, Math.hypot(dx, dy));
      hunter.vx += dx / d * 105 * dt;
      hunter.vy += dy / d * 105 * dt;
      target.vx *= Math.pow(.24, dt);
      target.vy *= Math.pow(.24, dt);
      if (record.progress >= 1.65) {
        const index = agents.indexOf(target);
        if (index >= 0) agents.splice(index, 1);
        attacks.delete(target.id);
        state.player.soil += 1.5;
        state.player.hope += 2.2;
        if (Math.hypot(target.x - (state.player.x + 16), target.y - (state.player.y + 24)) < 240) state.player.infection = Math.max(0, (state.player.infection || 0) - .12);
        entities.burst(target.x, target.y, '#8df0a8', 34, 215);
        entities.burst(target.x, target.y, '#ff8297', 18, 165);
      }
    }
    for (const [id, record] of attacks) {
      if (activeTargets.has(id)) continue;
      record.progress = Math.max(0, record.progress - dt * .8);
      if (record.progress <= 0) attacks.delete(id);
    }
  }

  function update(dt) {
    if (state.gameState !== 'play') return;
    updateClouds(dt);
    applyCloudTaxia(dt);
    updateInfection(dt);
    updateBiofilmFormation(dt);
    updateTrichoderma(dt);
  }

  function drawCloud(ctx, cloud) {
    const life = clamp(cloud.life / cloud.maxLife, 0, 1);
    const alpha = Math.min(1, life * 2.5);
    const gradient = ctx.createRadialGradient(cloud.x, cloud.y, 4, cloud.x, cloud.y, cloud.radius);
    gradient.addColorStop(0, `rgba(207,255,136,${.24 * alpha})`);
    gradient.addColorStop(.5, `rgba(183,243,107,${.12 * alpha})`);
    gradient.addColorStop(1, 'rgba(183,243,107,0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(cloud.x, cloud.y, cloud.radius, 0, TAU);
    ctx.fill();
    for (let i = 0; i < 18; i++) {
      const a = i / 18 * TAU + state.time * (.12 + (i % 3) * .04) + cloud.phase;
      const r = cloud.radius * (.18 + (i % 6) / 7);
      ctx.globalAlpha = alpha * (.25 + (i % 4) * .1);
      ctx.fillStyle = i % 2 ? '#d6ff94' : '#b7f36b';
      ctx.beginPath();
      ctx.arc(cloud.x + Math.cos(a) * r, cloud.y + Math.sin(a * 1.3) * r * .55, 1.5 + i % 3, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawBiofilm(ctx, film) {
    const pulse = 1 + Math.sin(state.time * 1.8 + film.x * .01) * .04;
    ctx.save();
    ctx.translate(film.x, film.y);
    ctx.scale(pulse, pulse * .62);
    const radius = film.radius * film.growth;
    const matrix = ctx.createRadialGradient(0, 0, 4, 0, 0, radius);
    matrix.addColorStop(0, film.activated ? 'rgba(112,229,214,.34)' : 'rgba(112,229,214,.24)');
    matrix.addColorStop(.7, 'rgba(112,229,214,.11)');
    matrix.addColorStop(1, 'rgba(112,229,214,0)');
    ctx.fillStyle = matrix;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = film.activated ? 'rgba(190,255,241,.72)' : 'rgba(112,229,214,.45)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 7]);
    ctx.beginPath();
    ctx.arc(0, 0, radius * .72, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * TAU + state.time * .08;
      const r = radius * (.2 + (i % 4) * .14);
      ctx.fillStyle = i % 3 ? '#70e5d6' : '#e3fff5';
      ctx.globalAlpha = .48 + (i % 3) * .14;
      ctx.beginPath();
      ctx.ellipse(Math.cos(a) * r, Math.sin(a) * r, 5, 2.2, a, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function drawAttack(ctx, record) {
    const { hunter, target, progress, phase } = record;
    const dx = target.x - hunter.x;
    const dy = target.y - hunter.y;
    const d = Math.max(1, Math.hypot(dx, dy));
    const nx = -dy / d;
    const ny = dx / d;
    ctx.strokeStyle = `rgba(141,240,168,${clamp(.25 + progress * .35, .25, .9)})`;
    ctx.lineWidth = 2.2;
    ctx.shadowBlur = 12;
    ctx.shadowColor = '#8df0a8';
    ctx.beginPath();
    ctx.moveTo(hunter.x, hunter.y);
    ctx.bezierCurveTo(hunter.x + dx * .35 + nx * 18, hunter.y + dy * .35 + ny * 18, hunter.x + dx * .7 - nx * 16, hunter.y + dy * .7 - ny * 16, target.x, target.y);
    ctx.stroke();
    ctx.shadowBlur = 0;
    const coils = 3 + Math.floor(progress * 4);
    for (let i = 0; i < coils; i++) {
      const a = state.time * 4.2 + phase + i / coils * TAU;
      const r = 12 + i * 2;
      ctx.strokeStyle = `rgba(141,240,168,${.35 + progress * .25})`;
      ctx.beginPath();
      ctx.arc(target.x + Math.cos(a) * 3, target.y + Math.sin(a) * 2, r, a, a + Math.PI * 1.35);
      ctx.stroke();
    }
  }

  function drawInfection(ctx) {
    const infection = clamp(state.player.infection || 0, 0, 1);
    if (infection <= .01) return;
    const px = state.player.x + state.player.w / 2;
    const py = state.player.y + state.player.h / 2;
    const count = 2 + Math.floor(infection * 6);
    for (let i = 0; i < count; i++) {
      const a = i / count * TAU + state.time * (.55 + i * .04);
      const r = 22 + (i % 3) * 6;
      ctx.fillStyle = '#ff8297';
      ctx.shadowBlur = 12;
      ctx.shadowColor = '#ff6f91';
      ctx.globalAlpha = .4 + infection * .5;
      ctx.beginPath();
      for (let k = 0; k < 10; k++) {
        const aa = k / 10 * TAU;
        const rr = k % 2 ? 3.5 : 5.5;
        const x = px + Math.cos(a) * r + Math.cos(aa) * rr;
        const y = py + Math.sin(a) * r * .65 + Math.sin(aa) * rr;
        k ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const vignette = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .25, W / 2, H / 2, Math.max(W, H) * .72);
    vignette.addColorStop(0, 'rgba(255,70,110,0)');
    vignette.addColorStop(1, `rgba(130,10,48,${infection * .22})`);
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  function render(ctx) {
    ctx.save();
    ctx.translate(-state.cameraX, 0);
    for (const cloud of clouds) drawCloud(ctx, cloud);
    for (const candidate of formingBiofilms.values()) {
      const progress = clamp(candidate.progress / 3.4, 0, 1);
      ctx.strokeStyle = `rgba(112,229,214,${.18 + progress * .42})`;
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 6]);
      ctx.beginPath();
      ctx.arc(candidate.x, candidate.y, 18 + progress * 48, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    for (const film of biofilms) drawBiofilm(ctx, film);
    for (const record of attacks.values()) drawAttack(ctx, record);
    drawInfection(ctx);
    ctx.restore();
  }

  return {
    get cloudCount() { return clouds.length; },
    get biofilmCount() { return biofilms.length; },
    get attackCount() { return attacks.size; },
    clear, reset, prepare, update, render,
  };
}
