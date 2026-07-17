import { H } from '../core/constants.js';
import { createMicrobeEcology, MICROBE_MOTION_PROFILES } from './microbe-ecology.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const MIGRATION_PULL = {
  rhizobium: .78,
  azospirillum: .9,
  bacillus: .66,
  pseudomonas: .86,
  oportunista: .58,
  trichoderma: .62,
};

const ROAMING_DISTANCE = {
  rhizobium: 760,
  azospirillum: 1120,
  bacillus: 620,
  pseudomonas: 1040,
  oportunista: 1480,
  trichoderma: 980,
};

const MIGRATION_INTERVAL = {
  rhizobium: [5.5, 9.5],
  azospirillum: [4.2, 7.2],
  bacillus: [7.5, 12.5],
  pseudomonas: [4.8, 8.2],
  oportunista: [6.5, 11.5],
  trichoderma: [6.2, 10.2],
};

function centroid(agents) {
  if (!agents.length) return { x: 0, y: 0 };
  let x = 0;
  let y = 0;
  for (const agent of agents) {
    x += agent.x;
    y += agent.y;
  }
  return { x: x / agents.length, y: y / agents.length };
}

export function createRoamingMicrobeEcology({ state, entities }) {
  for (const [type, pull] of Object.entries(MIGRATION_PULL)) {
    if (MICROBE_MOTION_PROFILES[type]) MICROBE_MOTION_PROFILES[type].homePull = pull;
  }
  const base = createMicrobeEcology({ state, entities });
  const niches = [];
  const groups = new Map();

  function buildNiches() {
    niches.length = 0;
    state.level.platforms.forEach((platform, index) => {
      if (platform.w < 62) return;
      const lift = 62 + ((index * 37) % 86);
      niches.push({
        x: platform.x + platform.w / 2,
        y: clamp(platform.y - lift, 76, H - 105),
        platformIndex: index,
        recovery: Boolean(platform.recovery),
        resource: false,
      });
    });
    state.level.exudates.forEach((exudate, index) => {
      niches.push({
        x: exudate.x,
        y: clamp(exudate.y - 34, 72, H - 105),
        platformIndex: -1,
        recovery: false,
        resource: true,
        resourceIndex: index,
      });
    });
  }

  function nearestNicheIndex(x, y, includeRecovery = true) {
    let best = 0;
    let bestDistance = Infinity;
    niches.forEach((niche, index) => {
      if (!includeRecovery && niche.recovery) return;
      const distance = Math.hypot(niche.x - x, (niche.y - y) * 1.35);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index;
      }
    });
    return best;
  }

  function randomInterval(type) {
    const [min, max] = MIGRATION_INTERVAL[type] || [6, 10];
    return min + Math.random() * (max - min);
  }

  function chooseNextNiche(group, center, forceDifferent = false) {
    const distanceLimit = group.territory || ROAMING_DISTANCE[group.type] || 800;
    const current = niches[group.nicheIndex] || niches[0];
    if (!current) return 0;

    const candidates = [];
    niches.forEach((niche, index) => {
      if (index === group.nicheIndex && forceDifferent) return;
      const dx = niche.x - center.x;
      const dy = niche.y - center.y;
      const distance = Math.hypot(dx, dy * 1.35);
      if (distance < 120 || distance > distanceLimit) return;
      if (niche.recovery && group.type !== 'oportunista' && group.type !== 'trichoderma') return;

      let weight = 1;
      if (Math.sign(dx) === group.direction) weight += 1.7;
      if (niche.resource && (group.type === 'pseudomonas' || group.type === 'rhizobium' || group.type === 'azospirillum')) weight += 2.6;
      if (Math.abs(dy) < 115) weight += .8;
      candidates.push({ index, weight });
    });

    if (!candidates.length) {
      group.direction *= -1;
      return nearestNicheIndex(center.x + group.direction * Math.min(300, distanceLimit * .4), center.y, false);
    }

    const total = candidates.reduce((sum, candidate) => sum + candidate.weight, 0);
    let roll = Math.random() * total;
    for (const candidate of candidates) {
      roll -= candidate.weight;
      if (roll <= 0) return candidate.index;
    }
    return candidates[candidates.length - 1].index;
  }

  function applyGroupTarget(group) {
    const target = niches[group.nicheIndex];
    if (!target) return;
    const groupAgents = base.agents.filter(agent => agent.zoneIndex === group.zoneIndex);
    groupAgents.forEach((agent, index) => {
      const angle = index / Math.max(1, groupAgents.length) * Math.PI * 2 + agent.phase * .14;
      const spread = 24 + (index % 3) * 13;
      agent.homeX = target.x + Math.cos(angle) * spread;
      agent.homeY = target.y + Math.sin(angle) * spread * .62;
      agent.radius = Math.max(agent.radius, 180);
    });
  }

  function reset(encounters) {
    base.reset(encounters);
    buildNiches();
    groups.clear();

    base.encounters.forEach((zone, zoneIndex) => {
      const zoneAgents = base.agents.filter(agent => agent.zoneIndex === zoneIndex);
      if (!zoneAgents.length || !niches.length) return;
      const center = centroid(zoneAgents);
      const nicheIndex = nearestNicheIndex(center.x, center.y, false);
      groups.set(zoneIndex, {
        zoneIndex,
        type: zone.id,
        territory: zone.territory || ROAMING_DISTANCE[zone.id] || 800,
        nicheIndex,
        timer: 1.8 + Math.random() * 3,
        direction: Math.random() < .5 ? -1 : 1,
      });
    });

    for (const group of groups.values()) applyGroupTarget(group);
  }

  function clear() {
    groups.clear();
    niches.length = 0;
    base.clear();
  }

  function update(dt) {
    for (const group of groups.values()) {
      const groupAgents = base.agents.filter(agent => agent.zoneIndex === group.zoneIndex);
      if (!groupAgents.length) continue;
      const center = centroid(groupAgents);
      const target = niches[group.nicheIndex];
      group.timer -= dt;

      const arrived = target && Math.hypot(target.x - center.x, target.y - center.y) < 92;
      if (group.timer <= 0 || arrived) {
        group.nicheIndex = chooseNextNiche(group, center, true);
        group.timer = randomInterval(group.type);
        if (Math.random() < .22) group.direction *= -1;
      }
      applyGroupTarget(group);

      const zone = base.encounters[group.zoneIndex];
      if (zone) {
        zone.x = center.x;
        zone.y = center.y;
        zone.r = Math.max(zone.r || 145, 165);
      }
    }
    base.update(dt);
  }

  return {
    get active() { return base.active; },
    get agents() { return base.agents; },
    get encounters() { return base.encounters; },
    get nicheCount() { return niches.length; },
    clear,
    reset,
    update,
    render: base.render,
  };
}
