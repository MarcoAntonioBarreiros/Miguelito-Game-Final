const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

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
  const observedDiscoveries = new Set();

  window.addEventListener('miguelito:tutorial-close', () => {
    resumeDelayUntil = performance.now() + 420;
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
    if (!platform) return false;
    const player = playerPoint();
    const x = clamp(player.x, platform.x, platform.x + platform.w);
    const y = platform.y;
    return Math.hypot(x - player.x, y - player.y) <= radius;
  }

  function trigger(id, condition) {
    return Boolean(condition && manager.trigger(id));
  }

  function visibleMicrobeCandidate() {
    const candidates = [];

    for (const agent of sim.ecology.agents || []) {
      const cardId = discoveryCards[agent.type];
      if (!cardId || manager.hasSeen(cardId)) continue;
      const distance = distanceToPlayer(agent.x, agent.y);
      if (distance > 680) continue;
      candidates.push({
        type: agent.type,
        cardId,
        distance,
        source: 'agent',
      });
    }

    for (const zone of sim.ecology.encounters || []) {
      const cardId = discoveryCards[zone.id];
      if (!cardId || manager.hasSeen(cardId)) continue;
      const radius = clamp((zone.r || 145) + 360, 500, 760);
      const distance = distanceToPlayer(zone.x, zone.y);
      if (distance > radius) continue;
      candidates.push({
        type: zone.id,
        cardId,
        distance: distance + 35,
        source: 'community',
      });
    }

    candidates.sort((a, b) => a.distance - b.distance);
    return candidates[0] || null;
  }

  function triggerVisibleOrganism() {
    const candidate = visibleMicrobeCandidate();
    if (!candidate) return false;

    // O cartão identifica formalmente a comunidade que já está visível ao aluno.
    state.discoveredMicrobes.add(candidate.type);
    observedDiscoveries.add(candidate.type);
    return manager.trigger(candidate.cardId);
  }

  function triggerNewLogicalDiscovery() {
    for (const microbeId of state.discoveredMicrobes) {
      if (observedDiscoveries.has(microbeId)) continue;
      observedDiscoveries.add(microbeId);
      const cardId = discoveryCards[microbeId];
      if (cardId && manager.trigger(cardId)) return true;
    }
    return false;
  }

  function update() {
    if (
      manager.isOpen
      || state.gameState !== 'play'
      || state.campaign?.transitionRequested
    ) return;

    const now = performance.now();
    if (now < resumeDelayUntil || now - lastCheckAt < 150) return;
    lastCheckAt = now;

    // Primeira aparição visual é o gatilho principal. O antigo raio central
    // da comunidade permanece apenas como mecanismo interno do jogo.
    if (triggerVisibleOrganism()) return;
    if (triggerNewLogicalDiscovery()) return;

    const player = state.player;
    if (trigger('action-exudate', player.exudates > 0 || (state.level.exudateClouds || []).some(cloud => nearPoint(cloud.x, cloud.y, 360)))) return;
    if (trigger('action-inoculation', sim.beneficialInoculants.followerCount > 0 || sim.trichodermaColonies.followerCount > 0)) return;

    if (trigger('power-double-jump', player.canDoubleJump)) return;
    if (trigger('power-dash', player.canDash)) return;
    if (trigger('power-pulse', player.canPulse)) return;

    const rhizoctonia = (state.level.enemies || []).find(enemy => (
      enemy.alive
      && (enemy.type === 'rhizoctonia' || Number.isFinite(enemy.colonization))
      && nearPoint(enemy.x + enemy.w / 2, enemy.y + enemy.h / 2, 680)
    ));
    if (trigger('organism-rhizoctonia', rhizoctonia)) return;

    const ralstonia = (ralstoniaControl.foci || []).find(focus => (
      !focus.neutralized && nearPlatform(focus.root, 680)
    ));
    if (trigger('organism-ralstonia', ralstonia)) return;

    const juveniles = sim.meloidogyneLifecycle.juveniles || [];
    const nearbyJ2 = juveniles.find(juvenile => juvenile.alive && nearPoint(juvenile.x, juvenile.y, 560));
    if (trigger('organism-meloidogyne-j2', nearbyJ2)) return;

    const eggMasses = sim.meloidogyneLifecycle.eggMasses || [];
    const nearbyEggMass = eggMasses.find(mass => mass.eggs > 0 && nearPoint(mass.x, mass.y, 580));
    if (trigger('structure-egg-mass', nearbyEggMass)) return;

    const galls = sim.meloidogyneLifecycle.galls || [];
    const adultFemale = galls.find(gall => gall.progress >= .78 && nearPoint(gall.x, gall.platform?.y || gall.y, 600));
    if (trigger('organism-meloidogyne-female', adultFemale)) return;

    const nearbyGall = galls.find(gall => gall.progress >= .12 && nearPoint(gall.x, gall.platform?.y || gall.y, 580));
    if (trigger('structure-gall', nearbyGall)) return;

    const nodules = state.level.rhizobiumNodules || [];
    const nearbyNodule = nodules.find(site => site.compatible && nearPoint(site.x, site.surfaceY, 560));
    if (trigger('structure-nodule', nearbyNodule)) return;

    const activeFixation = nodules.find(site => site.fixationRate > .05 && nearPoint(site.x, site.surfaceY, 600));
    if (trigger('process-fbn', activeFixation)) return;

    const nearbyBiofilm = (state.level.biofilms || []).find(film => (
      film.functional && nearPoint(film.x, film.platform?.y ?? film.y, 580)
    ));
    if (trigger('structure-biofilm', nearbyBiofilm)) return;

    const pseudomonasKnown = state.discoveredMicrobes.has('pseudomonas');
    const siderophoreActive = sim.pseudomonasSiderophores.freeCount > 0
      || sim.pseudomonasSiderophores.loadedCount > 0
      || sim.pseudomonasSiderophores.ironRecovered > 0;
    if (trigger('process-siderophore', pseudomonasKnown && siderophoreActive)) return;

    const nearbyArbuscule = (state.level.mycorrhizaArbuscules || []).find(arbuscule => (
      arbuscule.maturity > .08 && nearPoint(arbuscule.x, arbuscule.y, 580)
    ));
    if (trigger('structure-arbuscule', nearbyArbuscule)) return;

    const mycorrhizaPath = (state.level.platforms || []).find(platform => (
      platform.mycorrhizaStructure && nearPlatform(platform, 600)
    ));
    if (trigger('structure-mycorrhiza-path', mycorrhizaPath)) return;

    const lateralRoot = (state.level.azospirillumRoots || []).find(root => (
      root.visibleProgress > .06
      && (nearPoint(root.startX, root.startY, 600) || nearPoint(root.endX, root.endY, 600))
    ));
    if (trigger('structure-lateral-root', lateralRoot)) return;

    const roots = (state.level.platforms || []).filter(root => (
      root.type === 'root'
      && !root.final
      && !root.recovery
      && !root.mycorrhizaStructure
      && nearPlatform(root, 580)
    ));
    const changedRoot = roots.find(root => root.rootState && root.rootState !== 'healthy');
    if (trigger('process-root-health', changedRoot)) return;

    const recoveringRoot = roots.find(root => root.healthTrend > 0 && root.recoveryPulse > .2);
    if (trigger('process-root-recovery', recoveringRoot)) return;

    const collapsedRoot = roots.find(root => root.rootState === 'collapse' || root.unstable);
    if (trigger('process-root-collapse', collapsedRoot)) return;

    const mycoparasitismActive = trichodermaRhizoctoniaControl.activeAttackCount > 0
      || sim.trichoderma.attackCount > 0;
    trigger('process-mycoparasitism', mycoparasitismActive);
  }

  function showWelcome() {
    manager.trigger('system-welcome');
  }

  function diagnostics() {
    const player = playerPoint();
    const nearbyAgents = (sim.ecology.agents || [])
      .map(agent => ({
        type: agent.type,
        distance: Math.round(Math.hypot(agent.x - player.x, agent.y - player.y)),
      }))
      .filter(agent => agent.distance <= 800)
      .sort((a, b) => a.distance - b.distance);

    return {
      gameState: state.gameState,
      tutorialOpen: manager.isOpen,
      discovered: [...state.discoveredMicrobes],
      nearbyAgents,
      closestCandidate: visibleMicrobeCandidate(),
    };
  }

  return { update, showWelcome, diagnostics };
}
