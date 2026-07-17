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

  function playerPoint() {
    return {
      x: state.player.x + state.player.w / 2,
      y: state.player.y + state.player.h / 2,
    };
  }

  function nearPoint(x, y, radius = 520) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    const player = playerPoint();
    return Math.hypot(x - player.x, y - player.y) <= radius;
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

  function updateDiscoveredOrganisms() {
    for (const [microbeId, cardId] of Object.entries(discoveryCards)) {
      if (state.discoveredMicrobes.has(microbeId) && manager.trigger(cardId)) return true;
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
    if (now - lastCheckAt < 180) return;
    lastCheckAt = now;

    if (updateDiscoveredOrganisms()) return;

    const player = state.player;
    if (trigger('action-exudate', player.exudates > 0 || (state.level.exudateClouds || []).some(cloud => nearPoint(cloud.x, cloud.y, 360)))) return;
    if (trigger('action-inoculation', sim.beneficialInoculants.followerCount > 0 || sim.trichodermaColonies.followerCount > 0)) return;

    if (trigger('power-double-jump', player.canDoubleJump)) return;
    if (trigger('power-dash', player.canDash)) return;
    if (trigger('power-pulse', player.canPulse)) return;

    const rhizoctonia = (state.level.enemies || []).find(enemy => (
      enemy.alive
      && (enemy.type === 'rhizoctonia' || Number.isFinite(enemy.colonization))
      && nearPoint(enemy.x + enemy.w / 2, enemy.y + enemy.h / 2, 620)
    ));
    if (trigger('organism-rhizoctonia', rhizoctonia)) return;

    const ralstonia = (ralstoniaControl.foci || []).find(focus => (
      !focus.neutralized && nearPlatform(focus.root, 620)
    ));
    if (trigger('organism-ralstonia', ralstonia)) return;

    const juveniles = sim.meloidogyneLifecycle.juveniles || [];
    const nearbyJ2 = juveniles.find(juvenile => juvenile.alive && nearPoint(juvenile.x, juvenile.y, 480));
    if (trigger('organism-meloidogyne-j2', nearbyJ2)) return;

    const eggMasses = sim.meloidogyneLifecycle.eggMasses || [];
    const nearbyEggMass = eggMasses.find(mass => mass.eggs > 0 && nearPoint(mass.x, mass.y, 520));
    if (trigger('structure-egg-mass', nearbyEggMass)) return;

    const galls = sim.meloidogyneLifecycle.galls || [];
    const adultFemale = galls.find(gall => gall.progress >= .78 && nearPoint(gall.x, gall.platform?.y || gall.y, 540));
    if (trigger('organism-meloidogyne-female', adultFemale)) return;

    const nearbyGall = galls.find(gall => gall.progress >= .12 && nearPoint(gall.x, gall.platform?.y || gall.y, 520));
    if (trigger('structure-gall', nearbyGall)) return;

    const nodules = state.level.rhizobiumNodules || [];
    const nearbyNodule = nodules.find(site => site.compatible && nearPoint(site.x, site.surfaceY, 480));
    if (trigger('structure-nodule', nearbyNodule)) return;

    const activeFixation = nodules.find(site => site.fixationRate > .05 && nearPoint(site.x, site.surfaceY, 540));
    if (trigger('process-fbn', activeFixation)) return;

    const nearbyBiofilm = (state.level.biofilms || []).find(film => (
      film.functional && nearPoint(film.x, film.platform?.y ?? film.y, 500)
    ));
    if (trigger('structure-biofilm', nearbyBiofilm)) return;

    const pseudomonasKnown = state.discoveredMicrobes.has('pseudomonas');
    const siderophoreActive = sim.pseudomonasSiderophores.freeCount > 0
      || sim.pseudomonasSiderophores.loadedCount > 0
      || sim.pseudomonasSiderophores.ironRecovered > 0;
    if (trigger('process-siderophore', pseudomonasKnown && siderophoreActive)) return;

    const nearbyArbuscule = (state.level.mycorrhizaArbuscules || []).find(arbuscule => (
      arbuscule.maturity > .08 && nearPoint(arbuscule.x, arbuscule.y, 500)
    ));
    if (trigger('structure-arbuscule', nearbyArbuscule)) return;

    const mycorrhizaPath = (state.level.platforms || []).find(platform => (
      platform.mycorrhizaStructure && nearPlatform(platform, 520)
    ));
    if (trigger('structure-mycorrhiza-path', mycorrhizaPath)) return;

    const lateralRoot = (state.level.azospirillumRoots || []).find(root => (
      root.visibleProgress > .06
      && (nearPoint(root.startX, root.startY, 540) || nearPoint(root.endX, root.endY, 540))
    ));
    if (trigger('structure-lateral-root', lateralRoot)) return;

    const roots = (state.level.platforms || []).filter(root => (
      root.type === 'root'
      && !root.final
      && !root.recovery
      && !root.mycorrhizaStructure
      && nearPlatform(root, 520)
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

  return { update, showWelcome };
}
