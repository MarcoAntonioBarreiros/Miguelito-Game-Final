import { W } from '../core/constants.js';
import { PHOSPHATE_SOLUBILIZATION_DEFAULTS } from './campaign-manifest.js';

const TAU = Math.PI * 2;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function routePlatforms(level) {
  return (level.platforms || [])
    .filter(platform => !platform.recovery && !platform.final && !platform.mycorrhizaStructure)
    .sort((a, b) => (a.logicIndex ?? 0) - (b.logicIndex ?? 0) || a.x - b.x);
}

export function applyPhaseSevenPhosphateGeometry(level, phase) {
  if (phase !== 7) return level;
  const platforms = routePlatforms(level);
  if (platforms.length < 10) return level;
  const colonyPlatform = platforms[Math.min(2, platforms.length - 1)];
  const depositPlatform = platforms[Math.min(6, platforms.length - 1)];
  const rootPlatform = platforms[Math.min(9, platforms.length - 1)];
  rootPlatform.type = 'root';
  rootPlatform.phosphateTarget = true;
  rootPlatform.phosphateStock = 0;

  level.authoredBeneficialColonies = [{
    id: 'phase-7-solubilizer-colony',
    type: 'bacillus',
    platform: colonyPlatform,
    x: colonyPlatform.x + colonyPlatform.w * .58,
    y: colonyPlatform.y - 8,
    sourceCount: 5,
    vigor: 1,
    growth: 1,
    rechargeIntensity: .35,
    solubilizerStrain: true,
  }];

  const deposit = {
    id: 'phase-7-phosphate-deposit',
    phosphateDeposit: true,
    logicIndex: depositPlatform.logicIndex,
    requiredFeature: 'phosphateSolubilization',
    x: depositPlatform.x + depositPlatform.w - 64,
    y: depositPlatform.y - 150,
    w: 58,
    h: 150,
    remainingPhosphate: 1,
    initialPhosphate: 1,
    hp: 1,
    broken: false,
    localAvailablePhosphate: 0,
  };
  level.crystals = (level.crystals || []).filter(crystal => crystal.requiredFeature !== 'pulse');
  level.crystals.push(deposit);
  level.phosphateDeposits = [deposit];
  level.availablePhosphatePools = [];
  level.phosphateTransportParticles = [];
  level.authoredPhosphateRoute = {
    id: 'phase-7-mycorrhizal-route',
    functional: true,
    depositId: deposit.id,
    rootPlatform,
    arbuscule: { x: rootPlatform.x + rootPlatform.w * .45, y: rootPlatform.y - 7, maturity: 1 },
    points: [
      { x: deposit.x + deposit.w / 2, y: deposit.y + deposit.h * .55 },
      { x: deposit.x + 100, y: deposit.y + 18 },
      { x: (deposit.x + rootPlatform.x) / 2, y: Math.min(deposit.y, rootPlatform.y) - 54 },
      { x: rootPlatform.x - 42, y: rootPlatform.y - 34 },
      { x: rootPlatform.x + rootPlatform.w * .45, y: rootPlatform.y - 7 },
    ],
  };
  return level;
}

function pointOnRoute(points, progress) {
  if (!points?.length) return { x: 0, y: 0 };
  if (points.length === 1) return points[0];
  const scaled = clamp(progress, 0, .999999) * (points.length - 1);
  const index = Math.floor(scaled);
  const local = scaled - index;
  const a = points[index];
  const b = points[Math.min(points.length - 1, index + 1)];
  return { x: a.x + (b.x - a.x) * local, y: a.y + (b.y - a.y) * local };
}

export function createPhosphateSolubilization({ state, input, entities, selection, bacillus }) {
  let charge = 0;
  let eHeldLast = false;
  let shots = [];
  let chargeParticles = [];
  let transported = 0;
  let solubilizedCount = 0;

  function settings() {
    return { ...PHOSPHATE_SOLUBILIZATION_DEFAULTS, ...(state.level.phaseProfile?.phosphateSolubilization || {}) };
  }

  function selected() {
    return Boolean(state.player.canPhosphateSolubilization
      && selection?.isSelected('phosphate-solubilization'));
  }

  function nearestSolubilizer() {
    const px = state.player.x + state.player.w / 2;
    const py = state.player.y + state.player.h / 2;
    const radius = settings().absorptionRadius;
    return bacillus.solubilizerEntries
      .filter(entry => entry.mode !== 'spores' && entry.mode !== 'sporulating' && entry.maturity >= .72)
      .map(entry => ({ entry, distance: Math.hypot(entry.colony.x - px, entry.colony.y - py) }))
      .filter(item => item.distance <= radius)
      .sort((a, b) => a.distance - b.distance)[0]?.entry || null;
  }

  function fireShot() {
    const config = settings();
    if (charge < config.minimumCharge) {
      charge = 0;
      state.player.phosphateCharge = 0;
      return;
    }
    const x = state.player.x + state.player.w / 2 + state.player.facing * 18;
    const y = state.player.y + state.player.h * .45;
    shots.push({
      x, y, originX: x, originY: y, direction: state.player.facing || 1,
      charge, energy: charge * 2, distance: 0, hitDeposits: new Set(),
    });
    entities.burst(x, y, '#df91ff', 10 + Math.round(charge * 12), 110);
    charge = 0;
    state.player.phosphateCharge = 0;
  }

  function prepare(dt) {
    if (state.gameState !== 'play') return;
    const held = Boolean(input.keys.KeyE);
    if (selected() && held) {
      const entry = nearestSolubilizer();
      if (entry && entry.phosphateMetaboliteReserve > 0) {
        const config = settings();
        const gain = dt / Math.max(.1, config.chargeTimeSeconds);
        const consumed = Math.min(gain, entry.phosphateMetaboliteReserve, config.maximumCharge - charge);
        charge = clamp(charge + consumed, 0, config.maximumCharge);
        entry.phosphateMetaboliteReserve -= consumed;
        if (consumed > 0 && chargeParticles.length < 22) {
          chargeParticles.push({
            fromX: entry.colony.x,
            fromY: entry.colony.y,
            progress: 0,
            speed: 1.5 + charge * 1.2,
            phase: state.time * 5,
          });
        }
      }
    }
    if (selected() && !held && eHeldLast) fireShot();
    if (!selected() && !held) charge = 0;
    eHeldLast = held;
    state.player.phosphateCharge = charge;
  }

  function dissolveWithShot(shot) {
    const config = settings();
    for (const deposit of state.level.phosphateDeposits || []) {
      if (deposit.broken || shot.hitDeposits.has(deposit.id)) continue;
      const cx = deposit.x + deposit.w / 2;
      const cy = deposit.y + deposit.h / 2;
      const along = (cx - shot.originX) * shot.direction;
      if (along < 0 || along > config.shotRange || along > shot.distance + 36) continue;
      const halfWidth = 12 + along * (.12 + shot.charge * .13);
      if (Math.abs(cy - shot.originY) > halfWidth + deposit.h / 2) continue;
      const amount = Math.min(deposit.remainingPhosphate, shot.energy * config.amountSolubilizedPerCharge);
      if (amount <= 0) continue;
      shot.hitDeposits.add(deposit.id);
      shot.energy = Math.max(0, shot.energy - amount / Math.max(.001, config.amountSolubilizedPerCharge));
      deposit.remainingPhosphate = clamp(deposit.remainingPhosphate - amount, 0, deposit.initialPhosphate);
      deposit.localAvailablePhosphate = (deposit.localAvailablePhosphate || 0) + amount;
      let pool = (state.level.availablePhosphatePools || []).find(candidate => candidate.depositId === deposit.id);
      if (!pool) {
        pool = {
          depositId: deposit.id, x: cx, y: cy, amount: 0, phase: 0,
          captureRadius: config.localPoolCaptureRadius,
          absorptionState: 'available',
        };
        state.level.availablePhosphatePools.push(pool);
      }
      pool.amount += amount;
      if (deposit.remainingPhosphate <= .0001) {
        deposit.broken = true;
        solubilizedCount += 1;
        state.toast = 'Deposito esgotado: o fosforo foi solubilizado e permanece disponivel localmente.';
        state.toastTime = 4;
      } else {
        state.toast = `Solubilizacao parcial: ${Math.round((1 - deposit.remainingPhosphate / deposit.initialPhosphate) * 100)}%.`;
        state.toastTime = 2.5;
      }
      if (shot.energy <= .001) shot.distance = config.shotRange;
    }
  }

  function updateTransport(dt) {
    const route = state.level.authoredPhosphateRoute;
    if (!route?.functional || route.arbuscule?.maturity < 1) return;
    const config = settings();
    const pool = (state.level.availablePhosphatePools || []).find(candidate => candidate.depositId === route.depositId);
    if (!pool || pool.amount <= 0) return;
    const amount = Math.min(pool.amount, dt * config.mycorrhizalTransportRate);
    pool.amount -= amount;
    pool.absorptionState = pool.amount > .001 ? 'absorbing' : 'depleted';
    const sourceDeposit = (state.level.phosphateDeposits || []).find(deposit => deposit.id === pool.depositId);
    if (sourceDeposit) sourceDeposit.localAvailablePhosphate = Math.max(0, pool.amount);
    transported += amount;
    route.rootPlatform.phosphateStock = (route.rootPlatform.phosphateStock || 0) + amount;
    route.rootPlatform.nutritionalEfficiency = clamp((route.rootPlatform.nutritionalEfficiency || 0) + amount * .08, 0, 1);
    route.rootPlatform.metabolicMaintenance = clamp((route.rootPlatform.metabolicMaintenance || 0) + amount * .06, 0, 1);
    const maximumHealth = clamp(route.rootPlatform.maxRootHealth ?? 1, 0, 1);
    route.rootPlatform.rootHealth = Math.min(
      maximumHealth,
      (route.rootPlatform.rootHealth ?? maximumHealth) + amount * .025,
    );
    state.player.soil += amount * .35;
    state.player.hope += amount * .22;
    const particles = state.level.phosphateTransportParticles || (state.level.phosphateTransportParticles = []);
    if (particles.length < 18) particles.push({ progress: 0, speed: .28 + amount * 2, life: 1 });
  }

  function update(dt) {
    const config = settings();
    for (const shot of shots) {
      shot.distance += config.shotSpeed * dt;
      shot.x = shot.originX + shot.direction * shot.distance;
      dissolveWithShot(shot);
    }
    shots = shots.filter(shot => shot.distance < config.shotRange);
    for (const particle of chargeParticles) particle.progress += dt * particle.speed;
    chargeParticles = chargeParticles.filter(particle => particle.progress < 1);
    updateTransport(dt);
    for (const particle of state.level.phosphateTransportParticles || []) particle.progress += dt * particle.speed;
    state.level.phosphateTransportParticles = (state.level.phosphateTransportParticles || []).filter(particle => particle.progress < 1);
  }

  function render(ctx) {
    const route = state.level.authoredPhosphateRoute;
    ctx.save();
    ctx.translate(-state.cameraX, 0);
    for (const deposit of state.level.phosphateDeposits || []) {
      if (deposit.broken) continue;
      const ratio = deposit.remainingPhosphate / deposit.initialPhosphate;
      ctx.save();
      ctx.translate(deposit.x + deposit.w / 2, deposit.y + deposit.h / 2);
      ctx.globalAlpha = .48 + ratio * .52;
      ctx.shadowBlur = 18;
      ctx.shadowColor = '#db83ff';
      ctx.fillStyle = '#67447b';
      ctx.strokeStyle = '#efb4ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-deposit.w * .42, deposit.h * .45);
      ctx.lineTo(-deposit.w * .5, -deposit.h * .18);
      ctx.lineTo(-deposit.w * .16, -deposit.h * .5);
      ctx.lineTo(deposit.w * .42, -deposit.h * .3);
      ctx.lineTo(deposit.w * .5, deposit.h * .42);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    for (const pool of state.level.availablePhosphatePools || []) {
      if (pool.amount <= .001) continue;
      for (let i = 0; i < 9; i++) {
        const angle = state.time * .5 + i * TAU / 9;
        ctx.fillStyle = i % 2 ? '#f2b4ff' : '#ffc966';
        ctx.globalAlpha = .38 + Math.min(1, pool.amount) * .5;
        ctx.beginPath();
        ctx.arc(pool.x + Math.cos(angle) * (15 + i % 3 * 5), pool.y + Math.sin(angle) * (9 + i % 2 * 5), 2.2, 0, TAU);
        ctx.fill();
      }
    }
    if (route?.functional) {
      ctx.strokeStyle = 'rgba(209,159,255,.72)';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      route.points.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
      ctx.stroke();
      for (const particle of state.level.phosphateTransportParticles || []) {
        const point = pointOnRoute(route.points, particle.progress);
        ctx.fillStyle = '#ffd56f';
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#e4a2ff';
        ctx.beginPath(); ctx.arc(point.x, point.y, 3.2, 0, TAU); ctx.fill();
      }
    }
    for (const shot of shots) {
      const width = 10 + shot.distance * (.12 + shot.charge * .13);
      ctx.fillStyle = 'rgba(223,145,255,.20)';
      ctx.beginPath();
      ctx.moveTo(shot.originX, shot.originY);
      ctx.lineTo(shot.x, shot.y - width);
      ctx.lineTo(shot.x, shot.y + width);
      ctx.closePath(); ctx.fill();
    }
    for (const particle of chargeParticles) {
      const px = state.player.x + state.player.w / 2;
      const py = state.player.y + state.player.h * .45;
      const t = clamp(particle.progress, 0, 1);
      const x = particle.fromX + (px - particle.fromX) * t;
      const y = particle.fromY + (py - particle.fromY) * t + Math.sin(t * TAU + particle.phase) * 9;
      ctx.fillStyle = '#e8a4ff';
      ctx.globalAlpha = .35 + t * .65;
      ctx.beginPath(); ctx.arc(x, y, 2.2 + t, 0, TAU); ctx.fill();
    }
    if (charge > 0) {
      const px = state.player.x + state.player.w / 2;
      const py = state.player.y + state.player.h * .45;
      ctx.strokeStyle = '#e6a2ff';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(px, py, 18 + charge * 18, -.5 * Math.PI, (-.5 + charge * 2) * Math.PI); ctx.stroke();
    }
    ctx.restore();
  }

  function clear() {
    charge = 0;
    eHeldLast = false;
    shots = [];
    chargeParticles = [];
    transported = 0;
    solubilizedCount = 0;
    state.player.phosphateCharge = 0;
  }

  return {
    prepare, update, render, clear, reset: clear,
    get charge() { return charge; },
    get shotCount() { return shots.length; },
    get solubilizedDepositCount() { return solubilizedCount; },
    get transportedPhosphate() { return transported; },
    get rootPhosphateStock() { return state.level.authoredPhosphateRoute?.rootPlatform?.phosphateStock || 0; },
  };
}
