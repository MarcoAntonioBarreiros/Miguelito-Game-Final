import { H, W } from '../core/constants.js';
import { clamp, createHyphalNetwork, renderHyphalNetwork, TAU, updateHyphalNetwork } from './hyphal-growth.js';

function nearestPointOnRect(x, y, rect) {
  return { x: clamp(x, rect.x, rect.x + rect.w), y: clamp(y, rect.y, rect.y + rect.h) };
}

function avoidHazards(state, tip) {
  let fx = 0;
  let fy = 0;
  for (const hazard of state.level.hazards) {
    const point = nearestPointOnRect(tip.x, tip.y, hazard);
    const dx = tip.x - point.x;
    const dy = tip.y - point.y;
    const distance = Math.max(1, Math.hypot(dx, dy));
    if (distance < 135) {
      const force = (1 - distance / 135) * 1.8;
      fx += dx / distance * force;
      fy += dy / distance * force - .38;
    }
  }
  return { x: fx, y: fy };
}

function byId(agents, id) {
  return agents.find(agent => agent.id === id) || null;
}

export function createTrichodermaGrowth({ state, entities, ecology }) {
  const networks = new Map();
  const detectionRadius = 430;
  const maxActiveNetworks = 6;
  let lastExhaustionToastAt = -Infinity;

  function releaseHunter(network, continuation = 0) {
    const hunter = byId(ecology.agents, network?.metadata?.hunterId);
    if (!hunter) return;
    hunter.hyphalAttack = null;
    if ((hunter.recruitedUntil || 0) > state.time || continuation > 0) {
      hunter.recruitedUntil = Math.max(hunter.recruitedUntil || 0, state.time + continuation);
    }
  }

  function clear() {
    for (const network of networks.values()) releaseHunter(network);
    networks.clear();
    for (const agent of ecology.agents) {
      if (agent.type === 'trichoderma') agent.hyphalAttack = null;
    }
    lastExhaustionToastAt = -Infinity;
  }

  function reset() { clear(); }

  function activeNetworkCount() {
    let count = 0;
    for (const network of networks.values()) {
      if (
        network.active
        && !network.metadata.completed
        && !network.metadata.aborted
        && !network.metadata.exhausted
      ) count++;
    }
    return count;
  }

  function searchNetworks() {
    return [...networks.values()].filter(network => (
      network.active
      && !network.metadata.contactLocked
      && !network.metadata.completed
      && !network.metadata.aborted
      && !network.metadata.exhausted
    ));
  }

  function findNearestHunter(target) {
    let best = null;
    let bestDistance = detectionRadius;
    for (const agent of ecology.agents) {
      if (agent.type !== 'trichoderma' || agent.hyphalAttack) continue;
      const distance = Math.hypot(agent.x - target.x, agent.y - target.y);
      const recruitedBonus = (agent.recruitedUntil || 0) > state.time ? .78 : 1;
      const score = distance * recruitedBonus;
      if (score < bestDistance) {
        best = agent;
        bestDistance = score;
      }
    }
    return best ? { hunter: best, distance: bestDistance } : null;
  }

  function createAttack(target, hunter) {
    if (!hunter || hunter.hyphalAttack || networks.has(target.id)) return false;
    const recruited = (hunter.recruitedUntil || 0) > state.time;
    const angle = Math.atan2(target.y - hunter.y, target.x - hunter.x);
    const network = createHyphalNetwork({
      kind: 'trichoderma',
      x: hunter.x,
      y: hunter.y,
      angle,
      maxBranches: 22,
      maxPoints: 560,
      metadata: {
        targetId: target.id,
        hunterId: hunter.id,
        contact: 0,
        lysis: 0,
        phase: Math.random() * TAU,
        completed: false,
        aborted: false,
        exhausted: false,
        stalled: 0,
        contactLocked: false,
        stage: 'search',
        vigor: recruited ? 1 : .68,
        lastPointCount: 0,
        lastTipCount: 1,
        fuelIntensity: 0,
      },
    });
    network.germination = 1;
    networks.set(target.id, network);
    hunter.hyphalAttack = target.id;
    if (recruited) hunter.recruitedUntil = Math.max(hunter.recruitedUntil, state.time + 12);
    state.discoveredMicrobes.add('trichoderma');
    entities.burst(hunter.x, hunter.y, '#8df0a8', 18, 115);
    return true;
  }

  function abortAttack(network, target, retryDelay = 1.2) {
    if (!network || network.metadata.aborted || network.metadata.completed || network.metadata.exhausted) return;
    network.metadata.aborted = true;
    network.active = false;
    network.fading = .9;
    releaseHunter(network, 8);
    if (target) target.trichoRetryAt = state.time + retryDelay;
  }

  function exhaustAttack(network, target) {
    if (!network || network.metadata.contactLocked || network.metadata.exhausted || network.metadata.completed) return;
    network.metadata.exhausted = true;
    network.metadata.stage = 'retracting';
    network.active = false;
    network.fading = .01;
    releaseHunter(network, 6);
    if (target) target.trichoRetryAt = state.time + 2.2;

    const tip = [...network.tips].reverse().find(candidate => candidate.points.length) || network.tips[0];
    if (tip) entities.burst(tip.x, tip.y, '#8df0a8', 16, 80);
    if (state.time - lastExhaustionToastAt > 2.4) {
      state.toast = 'Crescimento interrompido: o vigor do inoculante acabou antes do contato. Use outro gradiente de exsudatos.';
      state.toastTime = 5.2;
      lastExhaustionToastAt = state.time;
    }
  }

  function completeAttack(network, target) {
    if (network.metadata.completed) return;
    network.metadata.completed = true;
    network.metadata.stage = 'completed';
    network.active = false;
    network.fading = .01;
    const index = ecology.agents.indexOf(target);
    if (index >= 0) ecology.agents.splice(index, 1);
    releaseHunter(network, 18);
    state.player.soil += 1.8;
    state.player.hope += 2.6;
    if (Math.hypot(target.x - (state.player.x + 16), target.y - (state.player.y + 24)) < 260) {
      state.player.infection = Math.max(0, (state.player.infection || 0) - .16);
    }
    entities.burst(target.x, target.y, '#8df0a8', 42, 230);
    entities.burst(target.x, target.y, '#ff8297', 24, 175);
    state.toast = 'Micoparasitismo concluído: após o contato, o enovelamento e a lise prosseguiram autonomamente';
    state.toastTime = 4.8;
  }

  function nearestTipDistance(network, target) {
    let best = Math.hypot(network.x - target.x, network.y - target.y);
    for (const tip of network.tips) {
      if (!tip.active) continue;
      best = Math.min(best, Math.hypot(tip.x - target.x, tip.y - target.y));
    }
    return best;
  }

  function cloudFuelIntensity(network, hunter) {
    const clouds = state.level.exudateClouds || [];
    if (!clouds.length) return 0;
    const anchors = [hunter, ...network.tips.filter(tip => tip.active)];
    let best = 0;
    for (const cloud of clouds) {
      const lifeFactor = clamp(cloud.life / Math.max(.1, cloud.maxLife || 10), 0, 1);
      const range = Math.max(120, cloud.radius * 2.15);
      for (const anchor of anchors) {
        const distance = Math.hypot(anchor.x - cloud.x, anchor.y - cloud.y);
        if (distance >= range) continue;
        best = Math.max(best, (1 - distance / range) * (.55 + lifeFactor * .45));
      }
    }
    return best;
  }

  function updateVigor(network, hunter, target, dt) {
    const metadata = network.metadata;
    if (metadata.contactLocked) {
      metadata.vigor = 1;
      metadata.fuelIntensity = 0;
      metadata.lastPointCount = network.pointCount;
      metadata.lastTipCount = network.tips.length;
      return;
    }

    const fuel = cloudFuelIntensity(network, hunter);
    metadata.fuelIntensity = fuel;
    if (fuel > 0) {
      metadata.vigor += dt * (.09 + fuel * .28);
      hunter.recruitedUntil = Math.max(hunter.recruitedUntil || 0, state.time + 4);
    }

    const pointDelta = Math.max(0, network.pointCount - metadata.lastPointCount);
    const tipDelta = Math.max(0, network.tips.length - metadata.lastTipCount);
    const activeTips = network.tips.filter(tip => tip.active).length;
    const distance = nearestTipDistance(network, target);
    const distanceFactor = distance > 330 ? 1 : distance > 180 ? .78 : .55;
    const recruitedFactor = (hunter.recruitedUntil || 0) > state.time ? .86 : 1;
    const drain = (
      pointDelta * .00155
      + tipDelta * .024
      + activeTips * dt * .0032
    ) * distanceFactor * recruitedFactor;

    metadata.vigor = clamp(metadata.vigor - drain, 0, 1);
    metadata.lastPointCount = network.pointCount;
    metadata.lastTipCount = network.tips.length;
    if (metadata.vigor <= 0) exhaustAttack(network, target);
  }

  function lockContact(network, target) {
    if (network.metadata.contactLocked) return;
    network.metadata.contactLocked = true;
    network.metadata.stage = 'coil';
    network.metadata.vigor = 1;
    network.metadata.contact = Math.max(network.metadata.contact, .08);
    network.metadata.stalled = 0;
    network.maxPoints = Math.max(network.maxPoints, network.pointCount + 280);
    entities.burst(target.x, target.y, '#baf66f', 12, 90);
  }

  function advanceAutonomousLysis(network, target, dt) {
    if (!network.metadata.contactLocked) return;
    target.vx *= Math.pow(.06, dt);
    target.vy *= Math.pow(.06, dt);

    const coilTips = network.tips.filter(tip => tip.mode === 'coil').length;
    const coilTurns = network.tips.reduce((sum, tip) => sum + tip.coilTurns, 0);
    const coilContribution = clamp(coilTurns / Math.max(3, coilTips * 2.6), 0, 1);
    network.metadata.contact = clamp(network.metadata.contact + dt * (.34 + coilTips * .008), 0, 1);
    network.metadata.lysis = clamp(
      network.metadata.lysis + dt * (.16 + coilContribution * .18 + Math.min(.1, coilTips * .006)),
      0,
      1,
    );

    if (Math.random() < dt * (3.2 + coilContribution * 4.5)) {
      network.enzymes.push({
        x: target.x + (Math.random() - .5) * 22,
        y: target.y + (Math.random() - .5) * 18,
        r: 3,
        life: 1,
      });
      if (network.enzymes.length > 90) network.enzymes.shift();
    }
    if (Math.random() < dt * network.metadata.lysis * 3.4) {
      network.fragments.push({
        x: target.x + (Math.random() - .5) * 18,
        y: target.y + (Math.random() - .5) * 14,
        vx: (Math.random() - .5) * 38,
        vy: -12 - Math.random() * 34,
        r: 1.5 + Math.random() * 2.4,
        life: 1,
        color: '#ff8297',
      });
      if (network.fragments.length > 70) network.fragments.shift();
    }
  }

  function updateAttack(network, dt) {
    const target = byId(ecology.agents, network.metadata.targetId);
    const hunter = byId(ecology.agents, network.metadata.hunterId);
    if (!target) {
      abortAttack(network, null, 0);
      return;
    }
    if (!hunter) {
      abortAttack(network, target, 1.5);
      return;
    }

    const cameraCenter = state.cameraX + W / 2;
    if (Math.abs(target.x - cameraCenter) > W * 1.25 && !network.metadata.contactLocked) return;

    const dx = target.x - hunter.x;
    const dy = target.y - hunter.y;
    const hunterDistance = Math.max(1, Math.hypot(dx, dy));
    hunter.vx += dx / hunterDistance * 46 * dt;
    hunter.vy += dy / hunterDistance * 46 * dt;
    hunter.homeX += dx / hunterDistance * 30 * dt;
    hunter.homeY += dy / hunterDistance * 24 * dt;

    const closestDistance = nearestTipDistance(network, target);
    const branchScale = network.metadata.contactLocked
      ? 1.45
      : closestDistance > 300
        ? .55
        : closestDistance > 175
          ? .78
          : 1.12;
    const growthScale = network.metadata.contactLocked
      ? 1
      : .48 + network.metadata.vigor * .72;

    updateHyphalNetwork(network, dt, {
      time: state.time,
      bounds: { minX: 8, maxX: (state.level.endX || 6500) - 8, minY: 54, maxY: H - 48 },
      growthScale,
      branchScale,
      coilDaughters: 3,
      targetProvider: () => {
        const currentTarget = byId(ecology.agents, network.metadata.targetId);
        if (!currentTarget) return null;
        return {
          id: currentTarget.id,
          x: currentTarget.x,
          y: currentTarget.y,
          kind: 'fungal-target',
          range: 720,
          strength: 1.28,
          contactRadius: 48,
          orbitRadius: 48,
        };
      },
      avoidanceProvider: tip => avoidHazards(state, tip),
      canBranch: (currentNetwork, tip, currentTarget, targetDistance) => {
        if (tip.mode === 'coil' || currentNetwork.metadata.contactLocked) return true;
        const activeSearchTips = currentNetwork.tips.filter(candidate => candidate.active && candidate.mode === 'search').length;
        if (targetDistance > 300) return activeSearchTips < 2 && tip.depth < 1;
        if (targetDistance > 175) return activeSearchTips < 4 && tip.depth < 2;
        return activeSearchTips < 8 && tip.depth < 3;
      },
      onFirstContact: (currentNetwork, tip, contactTarget) => lockContact(currentNetwork, contactTarget),
      onContact: currentNetwork => {
        currentNetwork.metadata.stalled = 0;
      },
      onBudgetExhausted: currentNetwork => {
        if (!currentNetwork.metadata.contactLocked) exhaustAttack(currentNetwork, target);
      },
    });

    if (network.metadata.exhausted || network.metadata.aborted) return;

    updateVigor(network, hunter, target, dt);
    if (network.metadata.exhausted) return;

    advanceAutonomousLysis(network, target, dt);

    const activeTips = network.tips.filter(tip => tip.active).length;
    if (activeTips === 0 && !network.metadata.contactLocked && network.metadata.lysis < 1) {
      network.metadata.stalled += dt;
      if (network.metadata.stalled > .7) abortAttack(network, target, 1.4);
    } else if (!network.metadata.contactLocked) {
      network.metadata.stalled = Math.max(0, network.metadata.stalled - dt * .5);
    }

    if (network.metadata.lysis >= 1) completeAttack(network, target);
  }

  function update(dt) {
    if (state.gameState !== 'play') return;
    const cameraCenter = state.cameraX + W / 2;
    const opportunists = ecology.agents.filter(agent => agent.type === 'oportunista');
    let activeCount = activeNetworkCount();

    for (const target of opportunists) {
      if (activeCount >= maxActiveNetworks) break;
      if (networks.has(target.id) || (target.trichoRetryAt || 0) > state.time) continue;
      if (Math.abs(target.x - cameraCenter) > W * .9) continue;
      const found = findNearestHunter(target);
      if (found && createAttack(target, found.hunter)) activeCount++;
    }

    for (const [id, network] of [...networks]) {
      if (network.metadata.aborted || network.metadata.exhausted) {
        network.fading += dt * .45;
        if (network.fading >= 1) networks.delete(id);
        continue;
      }
      if (network.metadata.completed || !network.active) {
        network.fading += dt * .34;
        if (network.fading >= 1) networks.delete(id);
        continue;
      }
      updateAttack(network, dt);
    }
  }

  function renderTargetStatus(ctx, network) {
    const target = byId(ecology.agents, network.metadata.targetId);
    if (!target) return;
    const contact = network.metadata.contact;
    const lysis = network.metadata.lysis;
    ctx.save();
    ctx.translate(-state.cameraX, 0);
    const pulse = 1 + Math.sin(state.time * 3.4 + network.metadata.phase) * .06;
    ctx.strokeStyle = `rgba(141,240,168,${.18 + contact * .62})`;
    ctx.lineWidth = 1.2 + contact * 2.2;
    ctx.setLineDash([3, 6]);
    ctx.beginPath();
    ctx.arc(target.x, target.y, (18 + lysis * 18) * pulse, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    const coils = 2 + Math.floor(contact * 7);
    for (let i = 0; i < coils; i++) {
      const angle = state.time * (2.8 + i * .08) + network.metadata.phase + i / coils * TAU;
      const radius = 11 + i * 2.3;
      ctx.strokeStyle = `rgba(141,240,168,${.2 + contact * .62})`;
      ctx.lineWidth = 1.15;
      ctx.beginPath();
      ctx.ellipse(target.x + Math.cos(angle) * 2.5, target.y + Math.sin(angle) * 1.8, radius, radius * .58, angle * .2, angle, angle + Math.PI * 1.5);
      ctx.stroke();
    }
    ctx.restore();
  }

  function renderVigor(ctx, network) {
    if (network.metadata.contactLocked || network.metadata.completed || network.metadata.exhausted) return;
    const hunter = byId(ecology.agents, network.metadata.hunterId);
    if (!hunter) return;
    const vigor = clamp(network.metadata.vigor, 0, 1);
    const width = 46;
    const x = hunter.x - width / 2;
    const y = hunter.y - 31;
    ctx.save();
    ctx.translate(-state.cameraX, 0);
    ctx.fillStyle = 'rgba(3,18,24,.78)';
    ctx.fillRect(x - 2, y - 2, width + 4, 8);
    ctx.fillStyle = vigor > .55 ? '#8df0a8' : vigor > .25 ? '#ffd36f' : '#ff8297';
    ctx.fillRect(x, y, width * vigor, 4);
    if (network.metadata.fuelIntensity > .08) {
      ctx.strokeStyle = 'rgba(214,255,148,.82)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x - 1, y - 1, width + 2, 6);
    }
    ctx.font = '700 9px Inter,system-ui';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#effff5';
    ctx.fillText('vigor', hunter.x, y - 4);
    ctx.restore();
  }

  function render(ctx) {
    for (const network of networks.values()) {
      renderHyphalNetwork(ctx, network, state, {
        color: '#8df0a8', core: '#eaffef', tip: '#ffffff', shadowBlur: 14,
      });
      renderTargetStatus(ctx, network);
      renderVigor(ctx, network);
    }
  }

  return {
    get attackCount() { return activeNetworkCount(); },
    get searchCount() { return searchNetworks().length; },
    get vigorAverage() {
      const searching = searchNetworks();
      if (!searching.length) return 1;
      return searching.reduce((sum, network) => sum + network.metadata.vigor, 0) / searching.length;
    },
    get tipCount() {
      return [...networks.values()].reduce((sum, network) => sum + network.tips.filter(tip => tip.active).length, 0);
    },
    clear,
    reset,
    update,
    render,
  };
}
