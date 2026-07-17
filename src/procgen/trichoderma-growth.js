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
  }

  function reset() { clear(); }

  function activeNetworkCount() {
    let count = 0;
    for (const network of networks.values()) {
      if (network.active && !network.metadata.completed && !network.metadata.aborted) count++;
    }
    return count;
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
    const angle = Math.atan2(target.y - hunter.y, target.x - hunter.x);
    const network = createHyphalNetwork({
      kind: 'trichoderma',
      x: hunter.x,
      y: hunter.y,
      angle,
      maxBranches: 22,
      maxPoints: 520,
      metadata: {
        targetId: target.id,
        hunterId: hunter.id,
        contact: 0,
        lysis: 0,
        phase: Math.random() * TAU,
        completed: false,
        aborted: false,
        stalled: 0,
      },
    });
    network.germination = 1;
    networks.set(target.id, network);
    hunter.hyphalAttack = target.id;
    if ((hunter.recruitedUntil || 0) > state.time) {
      hunter.recruitedUntil = Math.max(hunter.recruitedUntil, state.time + 12);
    }
    state.discoveredMicrobes.add('trichoderma');
    entities.burst(hunter.x, hunter.y, '#8df0a8', 18, 115);
    return true;
  }

  function abortAttack(network, target, retryDelay = 1.2) {
    if (!network || network.metadata.aborted || network.metadata.completed) return;
    network.metadata.aborted = true;
    network.active = false;
    network.fading = .9;
    releaseHunter(network, 8);
    if (target) target.trichoRetryAt = state.time + retryDelay;
  }

  function completeAttack(network, target) {
    if (network.metadata.completed) return;
    network.metadata.completed = true;
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
    state.toast = 'Micoparasitismo: Trichoderma envolveu o fungo-alvo e está disponível para um novo ataque';
    state.toastTime = 4.8;
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
    if (Math.abs(target.x - cameraCenter) > W * 1.25 && network.metadata.contact < .08) return;

    const dx = target.x - hunter.x;
    const dy = target.y - hunter.y;
    const hunterDistance = Math.max(1, Math.hypot(dx, dy));
    hunter.vx += dx / hunterDistance * 46 * dt;
    hunter.vy += dy / hunterDistance * 46 * dt;
    hunter.homeX += dx / hunterDistance * 30 * dt;
    hunter.homeY += dy / hunterDistance * 24 * dt;

    updateHyphalNetwork(network, dt, {
      time: state.time,
      bounds: { minX: 8, maxX: (state.level.endX || 6500) - 8, minY: 54, maxY: H - 48 },
      growthScale: 1,
      branchScale: 1.25,
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
      onFirstContact: (currentNetwork, tip, contactTarget) => {
        currentNetwork.metadata.contact = Math.max(currentNetwork.metadata.contact, .08);
        currentNetwork.metadata.stalled = 0;
        entities.burst(contactTarget.x, contactTarget.y, '#baf66f', 12, 90);
      },
      onContact: (currentNetwork, tip, contactTarget, frameDt) => {
        const currentTarget = byId(ecology.agents, currentNetwork.metadata.targetId);
        if (!currentTarget) return;
        currentTarget.vx *= Math.pow(.09, frameDt);
        currentTarget.vy *= Math.pow(.09, frameDt);
        currentNetwork.metadata.contact = clamp(currentNetwork.metadata.contact + frameDt * (.28 + tip.coilTurns * .08), 0, 1);
        currentNetwork.metadata.stalled = 0;
        if (currentNetwork.metadata.contact > .18) {
          const coilContribution = clamp(tip.coilTurns / 2.8, 0, 1);
          currentNetwork.metadata.lysis = clamp(currentNetwork.metadata.lysis + frameDt * (.15 + coilContribution * .24), 0, 1);
          if (Math.random() < frameDt * (3.5 + coilContribution * 4)) {
            currentNetwork.enzymes.push({
              x: currentTarget.x + (Math.random() - .5) * 22,
              y: currentTarget.y + (Math.random() - .5) * 18,
              r: 3,
              life: 1,
            });
            if (currentNetwork.enzymes.length > 90) currentNetwork.enzymes.shift();
          }
          if (Math.random() < frameDt * currentNetwork.metadata.lysis * 3.2) {
            currentNetwork.fragments.push({
              x: currentTarget.x + (Math.random() - .5) * 18,
              y: currentTarget.y + (Math.random() - .5) * 14,
              vx: (Math.random() - .5) * 38,
              vy: -12 - Math.random() * 34,
              r: 1.5 + Math.random() * 2.4,
              life: 1,
              color: '#ff8297',
            });
            if (currentNetwork.fragments.length > 70) currentNetwork.fragments.shift();
          }
        }
      },
    });

    const activeTips = network.tips.filter(tip => tip.active).length;
    if (activeTips === 0 && network.metadata.lysis < 1) {
      network.metadata.stalled += dt;
      if (network.metadata.stalled > .7) abortAttack(network, target, 1.4);
    } else if (network.metadata.contact <= .08) {
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
      if (network.metadata.aborted) {
        networks.delete(id);
        continue;
      }
      if (network.metadata.completed || !network.active) {
        network.fading += dt * .34;
        if (network.fading >= 1) networks.delete(id);
        continue;
      }
      updateAttack(network, dt);
      if (network.metadata.aborted) networks.delete(id);
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

  function render(ctx) {
    for (const network of networks.values()) {
      renderHyphalNetwork(ctx, network, state, {
        color: '#8df0a8', core: '#eaffef', tip: '#ffffff', shadowBlur: 14,
      });
      renderTargetStatus(ctx, network);
    }
  }

  return {
    get attackCount() { return activeNetworkCount(); },
    get tipCount() {
      return [...networks.values()].reduce((sum, network) => sum + network.tips.filter(tip => tip.active).length, 0);
    },
    clear,
    reset,
    update,
    render,
  };
}
