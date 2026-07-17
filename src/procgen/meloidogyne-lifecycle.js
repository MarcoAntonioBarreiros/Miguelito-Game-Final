import { W } from '../core/constants.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const hash = (p, s = 0) => {
  const v = Math.sin(((p.x || 0) * 12.9898 + (p.y || 0) * 78.233 + (p.w || 0) * 37.719 + s * 31.17) * .001) * 43758.5453;
  return v - Math.floor(v);
};
const pointOnRoot = (p, x) => ({ x: clamp(x, p.x + 18, p.x + p.w - 18), y: p.y - 5 });

export function createMeloidogyneLifecycle({ state, entities }) {
  const eggs = [], juveniles = [], galls = [];
  let eggId = 1, juvenileId = 1, gallId = 1, lastToast = -Infinity;
  let healthAverage = 1, infestation = 0;

  const roots = () => (state.level.platforms || []).filter(p => p.type === 'root' && !p.final && !p.recovery && !p.mycorrhizaStructure);
  function prepareRoot(p) {
    if (p.type !== 'root') return;
    if (!Number.isFinite(p.rootHealth)) p.rootHealth = 1;
    if (!Number.isFinite(p.rootDamage)) p.rootDamage = 0;
    if (!Number.isFinite(p.carbonAvailability)) p.carbonAvailability = 1;
    if (!Number.isFinite(p.nutrientEfficiency)) p.nutrientEfficiency = 1;
    if (!Number.isFinite(p.meloidogyneBurden)) p.meloidogyneBurden = 0;
  }
  function announce(text, duration = 5) {
    if (state.time - lastToast < 2.2) return;
    state.toast = text;
    state.toastTime = duration;
    lastToast = state.time;
  }
  function expose() {
    state.level.nematodeEggMasses = eggs;
    state.level.nematodeJuveniles = juveniles;
    state.level.rootGalls = galls;
  }

  function addEggMass(platform, x, generation = 0, sourceGallId = null, initial = false) {
    prepareRoot(platform);
    const maxEggs = initial ? 7 + Math.floor(hash(platform, 113 + generation) * 4) : 5 + generation + Math.floor(Math.random() * 3);
    const mass = {
      id: `melo-egg-${eggId++}`, platform,
      x: clamp(x, platform.x + 20, platform.x + platform.w - 20), y: platform.y - 7,
      eggs: maxEggs, maxEggs, generation, sourceGallId, initial,
      hatch: .8 + hash(platform, 127 + generation) * 2.2,
      age: 0, emptyAge: 0, phase: hash(platform, 139 + generation) * TAU,
    };
    eggs.push(mass);
    return mass;
  }

  function seedInfestation() {
    const candidates = roots().filter(p => (p.logicIndex ?? -1) >= 2 && p.w >= 120 && !p.azospirillumStructure);
    let chosen = candidates.filter((p, i) => i % 5 === 2 || hash(p, 17) > .79);
    chosen = chosen.slice(0, Math.max(1, Math.min(3, Math.ceil(candidates.length / 7))));
    if (!chosen.length && candidates.length) chosen = [candidates[Math.floor(candidates.length * .55)]];
    for (const p of chosen) addEggMass(p, p.x + p.w * (.28 + hash(p, 29) * .44), 0, null, true);
  }

  function clear() {
    eggs.length = juveniles.length = galls.length = 0;
    for (const p of state.level.platforms || []) {
      delete p.rootHealth; delete p.rootDamage; delete p.carbonAvailability;
      delete p.nutrientEfficiency; delete p.meloidogyneBurden; delete p.meloidogyneStage;
    }
    eggId = juvenileId = gallId = 1;
    lastToast = -Infinity; healthAverage = 1; infestation = 0; expose();
  }
  function reset() {
    eggs.length = juveniles.length = galls.length = 0;
    eggId = juvenileId = gallId = 1; lastToast = -Infinity;
    for (const p of roots()) prepareRoot(p);
    expose(); seedInfestation();
  }

  function spawnJ2(mass) {
    if (juveniles.length >= 18) return false;
    const a = -Math.PI / 2 + (Math.random() - .5) * 1.2;
    juveniles.push({
      id: `melo-j2-${juvenileId++}`, generation: mass.generation,
      x: mass.x + (Math.random() - .5) * 12, y: mass.y - 8 - Math.random() * 7,
      vx: Math.cos(a) * (18 + Math.random() * 16), vy: Math.sin(a) * (18 + Math.random() * 12),
      state: 'seeking', targetRoot: null, targetX: mass.x, progress: 0,
      age: 0, retarget: 0, cooldown: 0, phase: Math.random() * TAU, alive: true,
    });
    entities.burst(mass.x, mass.y - 8, '#fff0cf', 8, 58);
    return true;
  }

  function updateEggs(dt) {
    for (const m of eggs) {
      m.age += dt; m.y = m.platform.y - 7; m.x = clamp(m.x, m.platform.x + 20, m.platform.x + m.platform.w - 20);
      if (m.eggs <= 0) { m.emptyAge += dt; continue; }
      m.hatch -= dt;
      if (m.hatch <= 0 && spawnJ2(m)) {
        m.eggs--; m.hatch = 1.45 + Math.random() * 2.4 + m.generation * .18;
        if (m.eggs === m.maxEggs - 1) announce('Eclosão de Meloidogyne: juvenis J2 móveis deixaram a massa de ovos e procuram uma raiz hospedeira.');
      } else if (m.hatch <= 0) m.hatch = 1;
    }
    for (let i = eggs.length - 1; i >= 0; i--) if (!eggs[i].eggs && eggs[i].emptyAge > 10 && eggs[i].sourceGallId) eggs.splice(i, 1);
  }

  function exudateAttraction(p) {
    let best = 0;
    for (const c of state.level.exudateClouds || []) {
      const q = pointOnRoot(p, c.x), range = Math.max(145, c.radius * 2.25);
      const d = Math.hypot(c.x - q.x, c.y - q.y);
      if (d < range) best = Math.max(best, (1 - d / range) * (.45 + .55 * clamp(c.life / Math.max(.1, c.maxLife || 10), 0, 1)));
    }
    return best;
  }
  function bacillusDefense(p, x) {
    let value = 0;
    for (const f of state.level.biofilms || []) {
      if (!f.functional || f.platform !== p) continue;
      const r = Math.max(16, f.radius || f.targetRadius || 0), d = Math.abs((f.x || 0) - x);
      if (d < r) value = Math.max(value, clamp(f.protectionStrength || 0, .25, 1) * (1 - d / r));
    }
    return value;
  }
  function occupancy(p) {
    return galls.filter(g => g.platform === p).length + juveniles.filter(j => j.alive && j.targetRoot === p && j.state !== 'seeking').length;
  }
  function chooseRoot(j) {
    let best = null, score = Infinity;
    for (const p of roots()) {
      prepareRoot(p);
      if (occupancy(p) >= 2) continue;
      const q = pointOnRoot(p, j.x), d = Math.hypot(q.x - j.x, q.y - j.y);
      if (d > 820) continue;
      const s = d / (.78 + exudateAttraction(p) * 1.55 + clamp(p.rootHealth ?? 1, .12, 1) * .28)
        + occupancy(p) * 105 + bacillusDefense(p, q.x) * 180;
      if (s < score) { score = s; best = { p, x: q.x }; }
    }
    if (best) { j.targetRoot = best.p; j.targetX = best.x; }
  }
  function steer(j, x, y, dt, speed) {
    const dx = x - j.x, dy = y - j.y, d = Math.max(1, Math.hypot(dx, dy));
    const wave = Math.sin(state.time * 6.5 + j.phase) * 12;
    const tx = dx / d * speed - dy / d * wave, ty = dy / d * speed + dx / d * wave * .55;
    const b = clamp(dt * 3.9, 0, 1);
    j.vx += (tx - j.vx) * b; j.vy += (ty - j.vy) * b; j.x += j.vx * dt; j.y += j.vy * dt;
    return d;
  }

  function seek(j, dt) {
    j.retarget -= dt; j.cooldown = Math.max(0, j.cooldown - dt);
    if (!j.targetRoot || !roots().includes(j.targetRoot) || j.retarget <= 0) { chooseRoot(j); j.retarget = 1.2 + Math.random() * 1.1; }
    if (!j.targetRoot) { j.x += j.vx * dt; j.y += j.vy * dt; return; }
    const q = pointOnRoot(j.targetRoot, j.targetX); j.targetX = q.x;
    if (steer(j, q.x, q.y, dt, 47 + j.generation * 2.5) > 13 || j.cooldown > 0) return;
    if (occupancy(j.targetRoot) >= 2) { j.targetRoot = null; j.cooldown = 1.5; return; }
    const defense = bacillusDefense(j.targetRoot, q.x);
    if (defense > .58 && Math.random() < defense * .72) {
      j.vx *= -1.1; j.vy = -28 - defense * 24; j.cooldown = 3 + defense * 3; j.targetRoot = null;
      entities.burst(q.x, q.y, '#a8ffe6', 8, 62); return;
    }
    j.state = 'penetrating'; j.progress = 0; j.x = q.x; j.y = q.y;
    announce('Penetração radicular: um juvenil J2 iniciou a entrada. Biofilmes ativos podem reduzir esse sucesso.');
  }
  function penetrate(j, dt) {
    const p = j.targetRoot;
    if (!p) { j.state = 'seeking'; return; }
    j.progress = clamp(j.progress + dt * .19 * (1 - bacillusDefense(p, j.targetX) * .72), 0, 1);
    j.x = j.targetX + Math.sin(j.progress * Math.PI * 4 + j.phase) * 3;
    j.y = p.y + j.progress * Math.min(15, p.h * .22);
    if (j.progress < 1) return;
    j.state = 'migrating'; j.progress = 0;
    const dir = j.targetX < p.x + p.w / 2 ? 1 : -1;
    j.feedingX = clamp(j.targetX + dir * (26 + Math.random() * 34), p.x + 28, p.x + p.w - 28);
    announce('Migração interna: o J2 atravessa os tecidos em direção ao local de alimentação permanente.');
  }
  function addGall(j) {
    const p = j.targetRoot;
    if (!p || galls.length >= 8 || galls.filter(g => g.platform === p).length >= 2) { j.alive = false; return; }
    galls.push({
      id: `melo-gall-${gallId++}`, platform: p, x: j.feedingX, y: p.y + Math.min(22, p.h * .34),
      generation: j.generation, progress: .04, age: 0, stage: 'feeding-site', femaleMaturity: 0,
      eggTimer: 10 + Math.random() * 4, eggMassesLaid: 0, phase: Math.random() * TAU,
    });
    j.alive = false; entities.burst(j.feedingX, p.y + 4, '#ffb08f', 16, 78);
    announce('Sítio de alimentação: células gigantes começaram a sustentar a formação da galha.', 5.5);
  }
  function migrate(j, dt) {
    const p = j.targetRoot;
    if (!p) { j.state = 'seeking'; return; }
    j.progress = clamp(j.progress + dt * .17, 0, 1);
    j.x += (j.feedingX - j.x) * clamp(dt * 2.2, 0, 1);
    j.y = p.y + 10 + Math.sin(j.progress * Math.PI) * Math.min(26, p.h * .38);
    if (j.progress >= 1) addGall(j);
  }
  function updateJuveniles(dt) {
    for (const j of juveniles) {
      j.age += dt; if (j.age > 32 && j.state === 'seeking') j.alive = false;
      if (!j.alive) continue;
      if (j.state === 'seeking') seek(j, dt); else if (j.state === 'penetrating') penetrate(j, dt); else migrate(j, dt);
    }
    for (let i = juveniles.length - 1; i >= 0; i--) if (!juveniles[i].alive) juveniles.splice(i, 1);
  }

  function stage(g) {
    if (g.progress < .2) return 'feeding-site';
    if (g.progress < .5) return 'young-gall';
    if (g.progress < .78) return 'mature-gall';
    if (g.progress < 1) return 'sedentary-female';
    return g.eggMassesLaid ? 'egg-laying-female' : 'adult-female';
  }
  function layEggs(g) {
    if (g.generation >= 2 || g.eggMassesLaid || eggs.length >= 8) return;
    const x = clamp(g.x + 17, g.platform.x + 20, g.platform.x + g.platform.w - 20);
    addEggMass(g.platform, x, g.generation + 1, g.id); g.eggMassesLaid = 1;
    entities.burst(x, g.platform.y - 6, '#ffe0a6', 18, 72);
    announce('Nova massa de ovos: a fêmea sedentária completou o ciclo e iniciou outra geração.', 5.5);
  }
  function updateGalls(dt) {
    for (const g of galls) {
      g.age += dt; g.x = clamp(g.x, g.platform.x + 24, g.platform.x + g.platform.w - 24);
      if (g.progress < 1) g.progress = clamp(g.progress + dt * (.045 + (1 - clamp(g.platform.rootHealth ?? 1, .15, 1)) * .012), 0, 1);
      else { g.femaleMaturity = clamp(g.femaleMaturity + dt * .09, 0, 1); g.eggTimer -= dt; if (g.femaleMaturity >= .8 && g.eggTimer <= 0) layEggs(g); }
      g.stage = stage(g);
    }
  }

  function standingOn(p) {
    const pl = state.player, x = pl.x + pl.w / 2, feet = pl.y + pl.h;
    return x >= p.x - 4 && x <= p.x + p.w + 4 && Math.abs(feet - p.y) < 18;
  }
  function updateRoots(dt) {
    const list = roots(); let sum = 0, pressure = 0;
    for (const p of list) {
      prepareRoot(p);
      const pg = galls.filter(g => g.platform === p);
      const invading = juveniles.filter(j => j.targetRoot === p && j.state !== 'seeking').length;
      const burden = pg.reduce((v, g) => v + .1 + g.progress * .18 + g.eggMassesLaid * .04, 0) + invading * .035;
      const target = clamp(burden, 0, .88), response = target > p.rootDamage ? 1.5 : .035;
      p.rootDamage = clamp(p.rootDamage + (target - p.rootDamage) * clamp(dt * response, 0, 1), 0, .88);
      p.rootHealth = clamp(1 - p.rootDamage, .12, 1);
      p.carbonAvailability = clamp(p.rootHealth * (1 - pg.length * .035), .1, 1);
      p.nutrientEfficiency = clamp(p.rootHealth * (1 - pg.length * .05), .08, 1);
      p.meloidogyneBurden = burden;
      p.meloidogyneStage = pg.length ? (pg.some(g => g.progress >= 1) ? 'galha com fêmea' : 'galha em formação') : invading ? 'penetração ativa' : 'saudável';
      if (standingOn(p) && p.rootHealth < .82) {
        const stress = 1 - p.rootHealth;
        state.player.hope = Math.max(0, state.player.hope - dt * stress * .16);
        state.player.soil = Math.max(0, state.player.soil - dt * stress * .065);
      }
      sum += p.rootHealth; pressure += burden;
    }
    healthAverage = list.length ? sum / list.length : 1;
    infestation = list.length ? clamp(pressure / list.length, 0, 1) : 0;
  }

  function update(dt) {
    if (state.gameState !== 'play') return;
    for (const p of roots()) prepareRoot(p);
    updateEggs(dt); updateJuveniles(dt); updateGalls(dt); updateRoots(dt);
  }

  function drawEgg(ctx, m) {
    const ratio = m.eggs / Math.max(1, m.maxEggs), empty = m.eggs <= 0;
    ctx.save(); ctx.translate(m.x, m.y); ctx.globalAlpha = empty ? clamp(1 - m.emptyAge / 11, 0, .45) : 1;
    ctx.fillStyle = empty ? 'rgba(180,132,105,.22)' : 'rgba(255,213,155,.28)';
    ctx.strokeStyle = empty ? 'rgba(199,157,128,.25)' : 'rgba(255,235,196,.82)';
    ctx.beginPath(); ctx.ellipse(0, -2, 14 + ratio * 5, 8 + ratio * 3, 0, 0, TAU); ctx.fill(); ctx.stroke();
    for (let i = 0; i < Math.max(2, m.eggs); i++) {
      const a = i / Math.max(2, m.eggs) * TAU + m.phase, r = 3 + i % 3 * 3;
      ctx.fillStyle = i % 2 ? '#fff0cf' : '#ffd7a0'; ctx.beginPath(); ctx.ellipse(Math.cos(a) * r, -2 + Math.sin(a) * r * .48, 2.4, 1.7, a, 0, TAU); ctx.fill();
    }
    if (!empty) { ctx.font = '700 8px Inter,system-ui'; ctx.textAlign = 'center'; ctx.fillStyle = '#fff0cf'; ctx.fillText(`ovos ${m.eggs}`, 0, -15); }
    ctx.restore();
  }
  function drawJ2(ctx, j) {
    const embedded = j.state !== 'seeking', a = Math.atan2(j.vy || 0, j.vx || 1);
    ctx.save(); ctx.translate(j.x, j.y); ctx.rotate(a); ctx.strokeStyle = embedded ? '#ffa197' : '#fff1d5'; ctx.lineWidth = embedded ? 2.1 : 1.6;
    ctx.beginPath(); for (let i = 0; i <= 12; i++) { const t = i / 12, x = (t - .5) * 25, y = Math.sin(t * Math.PI * 3 + state.time * 7 + j.phase) * (embedded ? 1.5 : 2.6); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.stroke();
    ctx.fillStyle = '#ffcab8'; ctx.beginPath(); ctx.arc(12.5, 0, 1.9, 0, TAU); ctx.fill(); ctx.restore();
  }
  function drawGall(ctx, g) {
    const p = clamp(g.progress, 0, 1), w = 10 + p * 22, h = 7 + p * 15;
    ctx.save(); ctx.translate(g.x, g.platform.y + 2);
    const gradient = ctx.createRadialGradient(0, 3, 2, 0, 5, w);
    gradient.addColorStop(0, p > .75 ? '#ff9784' : '#e2a670'); gradient.addColorStop(.7, '#9d5b44'); gradient.addColorStop(1, 'rgba(92,49,43,.08)');
    ctx.fillStyle = gradient; ctx.strokeStyle = '#ffcd9f'; ctx.beginPath(); ctx.ellipse(0, 5, w, h, 0, 0, TAU); ctx.fill(); ctx.stroke();
    if (p > .55) { const f = clamp((p - .55) / .45, 0, 1); ctx.fillStyle = '#fff4da'; ctx.strokeStyle = '#ffa599'; ctx.beginPath(); ctx.ellipse(0, 5, 3 + f * 6, 4 + f * 8, 0, 0, TAU); ctx.fill(); ctx.stroke(); }
    const labels = { 'feeding-site': 'células gigantes', 'young-gall': 'galha jovem', 'mature-gall': 'galha madura', 'sedentary-female': 'fêmea sedentária', 'adult-female': 'fêmea adulta', 'egg-laying-female': 'oviposição' };
    ctx.font = '700 8px Inter,system-ui'; ctx.textAlign = 'center'; ctx.fillStyle = '#ffd0b0'; ctx.fillText(labels[g.stage] || 'galha', 0, -h - 6); ctx.restore();
  }
  function render(ctx) {
    ctx.save(); ctx.translate(-state.cameraX, 0);
    for (const p of roots()) if ((p.rootDamage || 0) >= .06) {
      const x = p.x + p.w / 2, y = p.y + Math.min(p.h - 10, 34), w = Math.min(72, p.w - 34);
      ctx.fillStyle = 'rgba(31,17,22,.68)'; ctx.fillRect(x - w / 2 - 2, y - 2, w + 4, 7);
      ctx.fillStyle = p.rootHealth > .65 ? '#ffd36f' : p.rootHealth > .35 ? '#ff9c70' : '#ff657f'; ctx.fillRect(x - w / 2, y, w * p.rootHealth, 3);
    }
    for (const g of galls) if (g.x > state.cameraX - 100 && g.x < state.cameraX + W + 100) drawGall(ctx, g);
    for (const m of eggs) if (m.x > state.cameraX - 80 && m.x < state.cameraX + W + 80) drawEgg(ctx, m);
    for (const j of juveniles) if (j.x > state.cameraX - 100 && j.x < state.cameraX + W + 100) drawJ2(ctx, j);
    ctx.restore();
  }

  return {
    get eggMassCount() { return eggs.filter(m => m.eggs > 0).length; },
    get eggCount() { return eggs.reduce((s, m) => s + m.eggs, 0); },
    get juvenileCount() { return juveniles.filter(j => j.state === 'seeking').length; },
    get penetratingCount() { return juveniles.filter(j => j.state !== 'seeking').length; },
    get gallCount() { return galls.length; },
    get matureGallCount() { return galls.filter(g => g.progress >= .5).length; },
    get femaleCount() { return galls.filter(g => g.progress >= .78).length; },
    get rootHealthAverage() { return healthAverage; },
    get infestationPercent() { return infestation * 100; },
    get eggMasses() { return eggs; }, get juveniles() { return juveniles; }, get galls() { return galls; },
    clear, reset, update, render,
  };
}
