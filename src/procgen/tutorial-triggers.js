const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export const TUTORIAL_RUNTIME_VERSION = '2026.07.16.7';

export const TUTORIAL_PROXIMITY = Object.freeze({
  microbeAgent: 220,
  microbeCommunity: 210,
  organism: 280,
  structure: 300,
  rootProcess: 320,
});

const discoveryCards = {
  rhizobium: 'organism-rhizobium',
  azospirillum: 'organism-azospirillum',
  myco: 'organism-mycorrhiza',
  bacillus: 'organism-bacillus',
  pseudomonas: 'organism-pseudomonas',
  trichoderma: 'organism-trichoderma',
  phos: 'organism-phosphate-solubilizer',
  oportunista: 'organism-opportunistic-fungus',
};

export function createTutorialTriggers({
  state,
  sim,
  manager,
  ralstoniaControl,
  trichodermaRhizoctoniaControl,
}) {
  let lastCheckAt = -Infinity;
  let resumeDelayUntil = 0;

  function conditionSnapshot() {
    return {
      exudate: (state.player.exudates || 0) > 0,
      inoculation: sim.beneficialInoculants.followerCount > 0
        || sim.trichodermaColonies.followerCount > 0,
      doubleJump: Boolean(state.player.canDoubleJump),
      dash: Boolean(state.player.canDash),
      pulse: Boolean(state.player.canPulse),
    };
  }

  let previousConditions = conditionSnapshot();

  window.addEventListener('miguelito:tutorial-close', () => {
    resumeDelayUntil = performance.now() + 520;
  });

  function playerPoint() {
    return {
      x: state.player.x + state.player.w / 2,
      y: state.player.y + state.player.h / 2,
    };
  }

  function distanceToPlayer(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return Infinity;
    const player = playerPoint();
    return Math.hypot(x - player.x, y - player.y);
  }

  function nearPoint(x, y, radius = 520) {
    return distanceToPlayer(x, y) <= radius;
  }

  function nearPlatform(platform, radius = 560) {
    return distanceToPlatform(platform) <= radius;
  }

  function distanceToPlatform(platform) {
    if (!platform) return Infinity;
    const player = playerPoint();
    const x = clamp(player.x, platform.x, platform.x + platform.w);
    const y = platform.y;
    return Math.hypot(x - player.x, y - player.y);
  }

  function trigger(id, condition) {
    return Boolean(condition && manager.trigger(id));
  }

  function organismCandidates() {
    const candidatesByCard = new Map();

    function addCandidate(cardId, distance, extra = {}) {
      if (!cardId || manager.hasSeen(cardId) || !Number.isFinite(distance)) return;
      const current = candidatesByCard.get(cardId);
      if (!current || distance < current.distance) {
        candidatesByCard.set(cardId, { cardId, distance, ...extra });
      }
    }

    for (const agent of sim.ecology.agents || []) {
      const cardId = discoveryCards[agent.type];
      const distance = distanceToPlayer(agent.x, agent.y);
      if (distance > TUTORIAL_PROXIMITY.microbeAgent) continue;
      addCandidate(cardId, distance, { type: agent.type, source: 'agent' });
    }

    for (const zone of sim.ecology.encounters || []) {
      const cardId = discoveryCards[zone.id];
      const distance = distanceToPlayer(zone.x, zone.y);
      if (distance > TUTORIAL_PROXIMITY.microbeCommunity) continue;
      addCandidate(cardId, distance, { type: zone.id, source: 'community' });
    }

    for (const enemy of state.level.enemies || []) {
      if (!enemy.alive || (enemy.type !== 'rhizoctonia' && !Number.isFinite(enemy.colonization))) continue;
      const distance = distanceToPlayer(
        enemy.x + (enemy.w || 0) / 2,
        enemy.y + (enemy.h || 0) / 2,
      );
      if (distance <= TUTORIAL_PROXIMITY.organism) {
        addCandidate('organism-rhizoctonia', distance, { source: 'enemy' });
      }
    }

    for (const focus of ralstoniaControl.foci || []) {
      if (focus.neutralized) continue;
      const distance = distanceToPlatform(focus.root);
      if (distance <= TUTORIAL_PROXIMITY.rootProcess) {
        addCandidate('organism-ralstonia', distance, { source: 'focus' });
      }
    }

    for (const juvenile of sim.meloidogyneLifecycle.juveniles || []) {
      if (!juvenile.alive) continue;
      const distance = distanceToPlayer(juvenile.x, juvenile.y);
      if (distance <= TUTORIAL_PROXIMITY.organism) {
        addCandidate('organism-meloidogyne-j2', distance, { source: 'juvenile' });
      }
    }

    for (const gall of sim.meloidogyneLifecycle.galls || []) {
      if (gall.progress < .78) continue;
      const distance = distanceToPlayer(gall.x, gall.platform?.y ?? gall.y);
      if (distance <= TUTORIAL_PROXIMITY.structure) {
        addCandidate('organism-meloidogyne-female', distance, { source: 'gall' });
      }
    }

    return [...candidatesByCard.values()]
      .sort((a, b) => a.distance - b.distance || a.cardId.localeCompare(b.cardId));
  }

  function triggerNearestOrganism() {
    for (const candidate of organismCandidates()) {
      if (!manager.trigger(candidate.cardId)) continue;
      if (candidate.type) state.discoveredMicrobes.add(candidate.type);
      return true;
    }
    return false;
  }

  function triggerStateTransitions() {
    const current = conditionSnapshot();
    const transitions = [
      ['action-exudate', current.exudate && !previousConditions.exudate],
      ['action-inoculation', current.inoculation && !previousConditions.inoculation],
      ['power-double-jump', current.doubleJump && !previousConditions.doubleJump],
      ['power-dash', current.dash && !previousConditions.dash],
      ['power-pulse', current.pulse && !previousConditions.pulse],
    ];
    previousConditions = current;
    for (const [id, active] of transitions) {
      if (active && manager.trigger(id)) return true;
    }
    return false;
  }

  function update() {
    if (manager.isOpen || state.gameState !== 'play' || state.campaign?.transitionRequested) return;

    const now = performance.now();
    if (now < resumeDelayUntil || now - lastCheckAt < 140) return;
    lastCheckAt = now;

    // Entre todos os organismos próximos, abre primeiro o mais perto de Miguelito.
    if (triggerNearestOrganism()) return;
    if (triggerStateTransitions()) return;

    const eggMasses = sim.meloidogyneLifecycle.eggMasses || [];
    const nearbyEggMass = eggMasses.find(mass => (
      mass.eggs > 0 && nearPoint(mass.x, mass.y, TUTORIAL_PROXIMITY.structure)
    ));
    if (trigger('structure-egg-mass', nearbyEggMass)) return;

    const galls = sim.meloidogyneLifecycle.galls || [];
    const nearbyGall = galls.find(gall => (
      gall.progress >= .12
      && nearPoint(gall.x, gall.platform?.y || gall.y, TUTORIAL_PROXIMITY.structure)
    ));
    if (trigger('structure-gall', nearbyGall)) return;

    const nodules = state.level.rhizobiumNodules || [];
    const nearbyNodule = nodules.find(site => (
      site.compatible && nearPoint(site.x, site.surfaceY, TUTORIAL_PROXIMITY.rootProcess)
    ));
    if (trigger('structure-nodule', nearbyNodule)) return;

    const activeFixation = nodules.find(site => (
      site.fixationRate > .05 && nearPoint(site.x, site.surfaceY, TUTORIAL_PROXIMITY.rootProcess)
    ));
    if (trigger('process-fbn', activeFixation)) return;

    const nearbyBiofilm = (state.level.biofilms || []).find(film => (
      film.functional
      && nearPoint(film.x, film.platform?.y ?? film.y, TUTORIAL_PROXIMITY.structure)
    ));
    if (trigger('structure-biofilm', nearbyBiofilm)) return;

    const pseudomonasKnown = state.discoveredMicrobes.has('pseudomonas');
    const siderophoreActive = sim.pseudomonasSiderophores.freeCount > 0
      || sim.pseudomonasSiderophores.loadedCount > 0
      || sim.pseudomonasSiderophores.ironRecovered > 0;
    const nearbyPseudomonas = (sim.ecology.agents || []).some(agent => (
      agent.type === 'pseudomonas'
      && nearPoint(agent.x, agent.y, TUTORIAL_PROXIMITY.organism)
    ));
    if (trigger('process-siderophore', pseudomonasKnown && siderophoreActive && nearbyPseudomonas)) return;

    const nearbyArbuscule = (state.level.mycorrhizaArbuscules || []).find(arbuscule => (
      arbuscule.maturity > .08
      && nearPoint(arbuscule.x, arbuscule.y, TUTORIAL_PROXIMITY.structure)
    ));
    if (trigger('structure-arbuscule', nearbyArbuscule)) return;

    const mycorrhizaPath = (state.level.platforms || []).find(platform => (
      platform.mycorrhizaStructure && nearPlatform(platform, TUTORIAL_PROXIMITY.rootProcess)
    ));
    if (trigger('structure-mycorrhiza-path', mycorrhizaPath)) return;

    const lateralRoot = (state.level.azospirillumRoots || []).find(root => (
      root.visibleProgress > .06
      && (
        nearPoint(root.startX, root.startY, TUTORIAL_PROXIMITY.rootProcess)
        || nearPoint(root.endX, root.endY, TUTORIAL_PROXIMITY.rootProcess)
      )
    ));
    if (trigger('structure-lateral-root', lateralRoot)) return;

    const roots = (state.level.platforms || []).filter(root => (
      root.type === 'root'
      && !root.final
      && !root.recovery
      && !root.mycorrhizaStructure
      && nearPlatform(root, TUTORIAL_PROXIMITY.rootProcess)
    ));
    const changedRoot = roots.find(root => root.rootState && root.rootState !== 'healthy');
    if (trigger('process-root-health', changedRoot)) return;

    const recoveringRoot = roots.find(root => root.healthTrend > 0 && root.recoveryPulse > .2);
    if (trigger('process-root-recovery', recoveringRoot)) return;

    const collapsedRoot = roots.find(root => root.rootState === 'collapse' || root.unstable);
    if (trigger('process-root-collapse', collapsedRoot)) return;

    const nearbyTargetedRhizoctonia = (state.level.enemies || []).some(enemy => (
      enemy.trichodermaRhizoTargeted
      && nearPoint(enemy.x + enemy.w / 2, enemy.y + enemy.h / 2, TUTORIAL_PROXIMITY.structure)
    ));
    const nearbyOpportunisticFungus = (sim.ecology.agents || []).some(agent => (
      agent.type === 'oportunista'
      && nearPoint(agent.x, agent.y, TUTORIAL_PROXIMITY.structure)
    ));
    const mycoparasitismActive = (
      trichodermaRhizoctoniaControl.activeAttackCount > 0 && nearbyTargetedRhizoctonia
    ) || (sim.trichoderma.attackCount > 0 && nearbyOpportunisticFungus);
    trigger('process-mycoparasitism', mycoparasitismActive);
  }

  function showWelcome() {
    manager.trigger('system-welcome');
  }

  function rearm() {
    // Fotografa o estado atual: poderes já ativos não reaparecem imediatamente.
    previousConditions = conditionSnapshot();
    resumeDelayUntil = performance.now() + 700;
    lastCheckAt = -Infinity;
  }

  function diagnostics() {
    const player = playerPoint();
    const nearbyAgents = (sim.ecology.agents || [])
      .map(agent => ({
        type: agent.type,
        distance: Math.round(Math.hypot(agent.x - player.x, agent.y - player.y)),
      }))
      .filter(agent => agent.distance <= 500)
      .sort((a, b) => a.distance - b.distance);

    return {
      version: TUTORIAL_RUNTIME_VERSION,
      gameState: state.gameState,
      tutorialOpen: manager.isOpen,
      conditions: conditionSnapshot(),
      discovered: [...state.discoveredMicrobes],
      nearbyAgents,
      closestCandidate: organismCandidates()[0] || null,
    };
  }

  return { update, showWelcome, rearm, diagnostics };
}
