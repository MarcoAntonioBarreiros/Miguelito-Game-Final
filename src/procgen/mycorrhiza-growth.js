import { H, W } from '../core/constants.js';

const TAU = Math.PI * 2;
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

function angleDelta(a, b) {
  return Math.atan2(Math.sin(b - a), Math.cos(b - a));
}

function smoothNoise(x, y, t, seed) {
  return (
    Math.sin(x * .011 + t * .47 + seed)
    + Math.cos(y * .009 - t * .31 + seed * 1.7) * .72
    + Math.sin((x + y) * .0042 + t * .19 + seed * .43) * .48
  ) / 2.2;
}

function nearestRootTarget(state, x, y, minDistance = 0) {
  let best = null;
  let bestDistance = Infinity;
  for (const platform of state.level.platforms) {
    const tx = clamp(x, platform.x + 12, platform.x + platform.w - 12);
    const ty = platform.y - 10;
    const d = Math.hypot(tx - x, (ty - y) * 1.2);
    if (d >= minDistance && d < bestDistance && d < 520) {
      best = { x: tx, y: ty, kind: 'root' };
      bestDistance = d;
    }
  }
  for (const exudate of state.level.exudates) {
    if (exudate.taken) continue;
    const d = Math.hypot(exudate.x - x, exudate.y - y);
    if (d >= minDistance && d < bestDistance * .92 && d < 580) {
      best = { x: exudate.x, y: exudate.y, kind: 'exudate' };
      bestDistance = d;
    }
  }
  return best;
}

function avoidHazards(state, x, y) {
  let fx = 0;
  let fy = 0;
  for (const h of state.level.hazards) {
    const px = clamp(x, h.x, h.x + h.w);
    const py = clamp(y, h.y, h.y + h.h);
    const dx = x - px;
    const dy = y - py;
    const d = Math.max(1, Math.hypot(dx, dy));
    if (d < 125) {
      const f = (1 - d / 125) * 1.6;
      fx += dx / d * f;
      fy += dy / d * f - .45;
    }
  }
  return { x: fx, y: fy };
}

function makeBranch(x, y, angle, depth, seed) {
  return {
    points: [{ x, y }],
    x,
    y,
    angle,
    depth,
    seed,
    age: 0,
    active: true,
    distanceSincePoint: 0,
    nextBranch: 48 + Math.random() * 74,
    totalDistance: 0,
    contact: false,
  };
}

export function createMycorrhizaGrowth({ state, entities }) {
  const networks = [];
  let active = false;

  function clear() {
    networks.length = 0;
    active = false;
  }

  function reset() {
    clear();
    const mycorrhizaAllies = state.level.allies.filter(a => a.id === 'myco');
    for (const ally of mycorrhizaAllies) {
      networks.push({
        ally,
        x: ally.x,
        y: ally.y,
        germination: 0,
        branches: [],
        contacts: [],
        maxBranches: 18,
        maxPoints: 430,
        pointCount: 0,
        pulse: Math.random() * TAU,
      });
    }
    active = networks.length > 0;
  }

  function maybeBranch(network, branch) {
    if (!branch.active || branch.depth >= 3 || network.branches.length >= network.maxBranches) return;
    if (branch.totalDistance < branch.nextBranch) return;
    branch.nextBranch += 58 + Math.random() * 95;
    const side = Math.random() < .5 ? -1 : 1;
    const split = .42 + Math.random() * .48;
    network.branches.push(makeBranch(
      branch.x,
      branch.y,
      branch.angle + side * split,
      branch.depth + 1,
      branch.seed + Math.random() * 4 + side,
    ));
  }

  function updateBranch(network, branch, dt, growthScale) {
    if (!branch.active || network.pointCount >= network.maxPoints) return;
    branch.age += dt;
    const target = nearestRootTarget(state, branch.x, branch.y, branch.totalDistance < 70 ? 75 : 0);
    const noise = smoothNoise(branch.x, branch.y, state.time, branch.seed);
    let desired = branch.angle + noise * .38;

    if (target) {
      const targetAngle = Math.atan2(target.y - branch.y, target.x - branch.x);
      const distance = Math.max(1, Math.hypot(target.x - branch.x, target.y - branch.y));
      const tropism = clamp(1 - distance / 580, .08, .72) * (target.kind === 'exudate' ? 1.18 : 1);
      desired += angleDelta(desired, targetAngle) * tropism;
    }

    const avoid = avoidHazards(state, branch.x, branch.y);
    if (Math.abs(avoid.x) + Math.abs(avoid.y) > .01) {
      const avoidAngle = Math.atan2(avoid.y, avoid.x);
      desired += angleDelta(desired, avoidAngle) * .72;
    }

    branch.angle += angleDelta(branch.angle, desired) * clamp(dt * 3.2, 0, 1);
    const speed = (branch.depth === 0 ? 34 : 27 - branch.depth * 2) * growthScale;
    const step = speed * dt;
    branch.x += Math.cos(branch.angle) * step;
    branch.y += Math.sin(branch.angle) * step;
    branch.y = clamp(branch.y, 70, H - 58);
    branch.totalDistance += step;
    branch.distanceSincePoint += step;

    if (branch.distanceSincePoint >= 4.5) {
      branch.distanceSincePoint = 0;
      branch.points.push({ x: branch.x, y: branch.y });
      network.pointCount++;
    }

    maybeBranch(network, branch);

    if (target && Math.hypot(target.x - branch.x, target.y - branch.y) < 20) {
      if (!branch.contact) {
        branch.contact = true;
        network.contacts.push({ x: target.x, y: target.y, life: 1, seed: branch.seed });
        entities.burst(target.x, target.y, '#d6afff', 10, 75);
      }
      branch.angle += (Math.random() - .5) * .9;
      if (branch.depth >= 2 && Math.random() < dt * .8) branch.active = false;
    }

    const worldEnd = state.level.endX || 6000;
    if (branch.x < 10 || branch.x > worldEnd - 10 || branch.y < 60 || branch.y > H - 48) branch.active = false;
  }

  function update(dt) {
    if (!active) return;
    for (const network of networks) {
      const playerDistance = Math.hypot(
        state.player.x + state.player.w / 2 - network.x,
        state.player.y + state.player.h / 2 - network.y,
      );
      const awakened = playerDistance < 850 || network.ally.taken;
      if (!awakened) continue;

      network.germination = clamp(network.germination + dt * (network.ally.taken ? .72 : .34), 0, 1);
      if (network.germination > .16 && network.branches.length === 0) {
        const target = nearestRootTarget(state, network.x, network.y, 75);
        const angle = target ? Math.atan2(target.y - network.y, target.x - network.x) : -.25;
        network.branches.push(makeBranch(network.x, network.y, angle, 0, network.pulse));
      }

      const growthScale = network.ally.taken ? 1.55 : .8;
      for (const branch of [...network.branches]) updateBranch(network, branch, dt, growthScale);
      for (const contact of network.contacts) contact.life = Math.max(0, contact.life - dt * .12);
    }
  }

  function drawNetwork(ctx, network) {
    const time = state.time;
    ctx.save();
    ctx.translate(-state.cameraX, 0);

    const sporeAlpha = network.ally.taken ? .28 : 1;
    ctx.globalAlpha = sporeAlpha;
    ctx.shadowBlur = 22;
    ctx.shadowColor = '#d6afff';
    ctx.fillStyle = '#f2ddff';
    ctx.beginPath();
    ctx.arc(network.x, network.y + Math.sin(time * 1.7 + network.pulse) * 4, 9 + network.germination * 2, 0, TAU);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;

    for (const branch of network.branches) {
      if (branch.points.length < 2) continue;
      const alpha = branch.active ? .88 : .48;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.shadowBlur = 12;
      ctx.shadowColor = '#d6afff';
      ctx.strokeStyle = `rgba(214,175,255,${alpha * .32})`;
      ctx.lineWidth = Math.max(1.2, 5.2 - branch.depth * .8);
      ctx.beginPath();
      branch.points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = `rgba(240,220,255,${alpha})`;
      ctx.lineWidth = Math.max(.75, 1.9 - branch.depth * .25);
      ctx.stroke();

      if (branch.active) {
        ctx.shadowBlur = 16;
        ctx.shadowColor = '#d6afff';
        ctx.fillStyle = '#fff3ff';
        ctx.beginPath();
        ctx.arc(branch.x, branch.y, 2.8 + Math.sin(time * 5 + branch.seed) * .7, 0, TAU);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }

    for (const contact of network.contacts) {
      ctx.globalAlpha = .28 + contact.life * .45;
      ctx.strokeStyle = '#d6afff';
      ctx.lineWidth = 1.2;
      for (let i = 0; i < 5; i++) {
        const a = i / 5 * TAU + contact.seed;
        ctx.beginPath();
        ctx.moveTo(contact.x, contact.y);
        ctx.quadraticCurveTo(
          contact.x + Math.cos(a + .4) * 14,
          contact.y + Math.sin(a + .4) * 10,
          contact.x + Math.cos(a) * 25,
          contact.y + Math.sin(a) * 18,
        );
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;

    if (!network.ally.taken && Math.abs(network.x - (state.cameraX + W / 2)) < W * .7) {
      ctx.font = '700 12px Inter,system-ui';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#f4e6ff';
      ctx.shadowBlur = 10;
      ctx.shadowColor = '#d6afff';
      const stage = network.germination < .18 ? 'Esporo micorrízico' : 'Hifas com tropismo radicular';
      ctx.fillText(stage, network.x, network.y - 28);
      ctx.shadowBlur = 0;
    }

    ctx.restore();
  }

  function render(ctx) {
    if (!active) return;
    for (const network of networks) drawNetwork(ctx, network);
  }

  return {
    get active() { return active; },
    get branchCount() { return networks.reduce((sum, n) => sum + n.branches.length, 0); },
    get tipCount() { return networks.reduce((sum, n) => sum + n.branches.filter(b => b.active).length, 0); },
    clear,
    reset,
    update,
    render,
  };
}
