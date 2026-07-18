import { createPhysicsSystem } from '../physics.js';
import { createPlayer, resetPlayer } from '../player.js';
import { applyPersistentUnlocks } from './campaign-progression.js';
import { createMicrobeArt } from '../data/microbes.js';
import { createRoamingMicrobeEcology } from './microbe-roaming.js';
import { createMycorrhizaGrowth } from './mycorrhiza-growth.js';
import { createMycorrhizaStructures } from './mycorrhiza-structures.js';
import { createTrichodermaGrowth } from './trichoderma-growth.js';
import { createTrichodermaRecruitment } from './trichoderma-recruitment.js';
import { createTrichodermaColonies } from './trichoderma-colonies.js';
import { createBeneficialInoculants } from './beneficial-inoculants.js';
import { createPseudomonasSiderophores } from './pseudomonas-siderophores.js';
import { createOpportunisticFungus } from './opportunistic-fungus.js';
import { createBacillusBioprotection } from './bacillus-bioprotection.js';
import { createBacillusBioprotectionSafety } from './bacillus-bioprotection-safety.js';
import { createRhizobiumNodulation } from './rhizobium-nodulation.js';
import { createNitrogenRootDevelopment } from './nitrogen-root.js';
import { createAzospirillumRootGrowth } from './azospirillum-root-growth.js';
import { createAzospirillumRootSafety } from './azospirillum-root-safety.js';
import { createAzospirillumNitrogen } from './azospirillum-nitrogen.js';
import { createMeloidogyneLifecycle } from './meloidogyne-lifecycle.js';
import { createGoalSystem } from './goal-system.js';
import { createEcologicalGameplay } from './ecological-gameplay.js';
import { createPathogenSurvival } from './pathogen-survival.js';
import { createInoculumSelection } from './inoculum-selection.js';
import { createPhosphateSolubilization } from './phosphate-solubilization.js';

function createEmptyLevel() {
  return {
    platforms: [], hazards: [], crystals: [], enemies: [], exudates: [],
    allies: [], checkpoints: [], particles: [], pulses: [], goal: null,
    exudateClouds: [], biofilms: [], beneficialColonies: [], rhizobiumNodules: [],
    nitrogenRoots: [],
    azospirillumRootLadders: [], azospirillumRoots: [], ironDeposits: [], siderophores: [],
    phosphateDeposits: [], availablePhosphatePools: [], phosphateTransportParticles: [],
    nematodeEggMasses: [], nematodeJuveniles: [], rootGalls: [],
  };
}

export function createSimulator() {
  const state = {
    time: 0,
    gameState: 'play',
    proceduralCampaign: true,
    player: createPlayer(),
    level: createEmptyLevel(),
    jumpHeldLast: false,
    discoveredMicrobes: new Set(),
    microbeArt: createMicrobeArt(),
    campaign: null,
    cameraX: 0,
    shake: 0,
    respawnTimer: 0,
  };

  const input = {
    keys: {
      ArrowLeft: false, KeyA: false,
      ArrowRight: false, KeyD: false,
      Space: false, KeyW: false, ArrowUp: false,
      ShiftLeft: false, ShiftRight: false, KeyJ: false,
      KeyE: false,
      // Seta para baixo cicla o inoculo carregado. A de cima nao serve: e pulo.
      ArrowDown: false,
    },
  };

  const entities = {
    burst: (x, y, color, count, speed) => {
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const velocity = Math.random() * speed;
        state.level.particles.push({
          x, y,
          vx: Math.cos(angle) * velocity,
          vy: Math.sin(angle) * velocity,
          r: 1 + Math.random() * 2,
          color,
          life: .4 + Math.random() * .4,
          max: .8,
        });
      }
    },
    discoverMicrobe: id => { state.discoveredMicrobes.add(id); },
    respawn: reason => {
      const player = state.player;
      for (const juvenile of state.level.nematodeJuveniles || []) {
        if (juvenile.carriedByPlayer) juvenile.alive = false;
      }
      player.x = state.currentCheckpoint ? state.currentCheckpoint.x : 100;
      player.y = state.currentCheckpoint ? state.currentCheckpoint.y : 400;
      player.vx = 0;
      player.vy = 0;
      player.alive = true;
      player.vitality = player.maxVitality || 5;
      player.exudates = Math.floor((player.exudates || 0) / 2);
      player.infectionExposure = 0;
      player.infection = Math.min(.12, Math.max(0, (player.infection || 0) * .2));
      player.fungalContamination = Math.min(.08, Math.max(0, (player.fungalContamination || 0) * .15));
      player.fungalAttachmentLevel = 0;
      player.nematodeLoad = 0;
      player.fungalDamageCooldown = 1.8;
      player.nematodeDamageCooldown = 1.8;
      player.healCooldown = 2;
      player.dashSuppressed = false;
      player.airJumpAvailable = player.canDoubleJump;
      if (state.campaign) applyPersistentUnlocks(player, state.campaign);
      player.invuln = 1.7;
      state.respawnTimer = 0;
      state.gameState = 'play';
      state.toast = reason === 'death'
        ? 'Respawn no último biofilme: Vitalidade restaurada; metade dos exsudatos foi perdida.'
        : 'Retorno ao último ponto seguro.';
      state.toastTime = 4.2;
    },
  };

  const hud = {
    setMission: mission => { state.mission = mission; },
    showToast: (title, desc) => {
      state.toast = `${title}: ${desc}`;
      state.toastTime = 4.7;
    },
    updateHud: () => {},
    showEnd: () => {},
  };

  const audio = { toneNow: () => {} };

  const ecology = createRoamingMicrobeEcology({ state, entities });
  const mycorrhiza = createMycorrhizaGrowth({ state, entities });
  const mycorrhizaStructures = createMycorrhizaStructures({ state, entities });
  const recruitment = createTrichodermaRecruitment({ state, ecology, entities });
  const trichodermaColonies = createTrichodermaColonies({ state, input, ecology, entities });
  const trichoderma = createTrichodermaGrowth({ state, entities, ecology, colonies: trichodermaColonies });
  const goal = createGoalSystem({ state, entities });
  const gameplay = createEcologicalGameplay({ state, input, entities, ecology });
  const beneficialInoculants = createBeneficialInoculants({ state, input, ecology, entities });
  const pseudomonasSiderophores = createPseudomonasSiderophores({
    state,
    entities,
    ecology,
    inoculants: beneficialInoculants,
  });
  const opportunisticFungus = createOpportunisticFungus({ state, entities, ecology });
  const bacillusBioprotection = createBacillusBioprotection({
    state,
    entities,
    ecology,
    inoculants: beneficialInoculants,
  });
  const bacillusBioprotectionSafety = createBacillusBioprotectionSafety({
    state,
    inoculants: beneficialInoculants,
  });
  const rhizobiumNodulation = createRhizobiumNodulation({ state, entities, inoculants: beneficialInoculants });
  const nitrogenRootDevelopment = createNitrogenRootDevelopment({ state, entities });
  const azospirillumRootGrowth = createAzospirillumRootGrowth({ state, entities, inoculants: beneficialInoculants });
  const azospirillumRootSafety = createAzospirillumRootSafety({ state, rootGrowth: azospirillumRootGrowth });
  const azospirillumNitrogen = createAzospirillumNitrogen({ state, inoculants: beneficialInoculants });
  const meloidogyneLifecycle = createMeloidogyneLifecycle({ state, entities });
  const pathogenSurvival = createPathogenSurvival({ state, entities, ecology });

  // Um unico item selecionado por vez decide quem responde ao E: cada sistema
  // consulta a selecao antes de agir, em vez de disputar a tecla por ordem.
  const inoculumSelection = createInoculumSelection({
    state,
    input,
    inoculants: beneficialInoculants,
    trichodermaColonies,
  });
  // A ponte micorrizica passa a exigir colonia inoculada na raiz de origem, em
  // vez de nascer de qualquer exsudato solto perto de uma borda.
  mycorrhizaStructures.setInoculants(beneficialInoculants);
  // A micorriza inoculada emite hifas e forma arbusculos como a do cenario.
  mycorrhiza.setInoculants(beneficialInoculants);
  beneficialInoculants.setSelection(inoculumSelection);
  trichodermaColonies.setSelection(inoculumSelection);
  gameplay.setSelection(inoculumSelection);
  state.inoculumSelection = inoculumSelection;
  const phosphateSolubilization = createPhosphateSolubilization({
    state,
    input,
    entities,
    selection: inoculumSelection,
    bacillus: bacillusBioprotection,
    // Quem carrega o fosfato ate a raiz e a micorriza inoculada, nao uma rota
    // desenhada: o transporte precisa enxergar as colonias reais.
    inoculants: beneficialInoculants,
  });

  state.microbeEcology = ecology;
  state.mycorrhizaGrowth = mycorrhiza;
  state.mycorrhizaStructures = mycorrhizaStructures;
  state.trichodermaGrowth = trichoderma;
  state.trichodermaRecruitment = recruitment;
  state.trichodermaColonies = trichodermaColonies;
  state.beneficialInoculants = beneficialInoculants;
  state.pseudomonasSiderophores = pseudomonasSiderophores;
  state.opportunisticFungus = opportunisticFungus;
  state.bacillusBioprotection = bacillusBioprotection;
  state.rhizobiumNodulation = rhizobiumNodulation;
  state.nitrogenRootDevelopment = nitrogenRootDevelopment;
  state.azospirillumRootGrowth = azospirillumRootGrowth;
  state.azospirillumRootSafety = azospirillumRootSafety;
  state.azospirillumNitrogen = azospirillumNitrogen;
  state.meloidogyneLifecycle = meloidogyneLifecycle;
  state.goalSystem = goal;
  state.ecologicalGameplay = gameplay;
  state.pathogenSurvival = pathogenSurvival;
  state.phosphateSolubilization = phosphateSolubilization;

  const physics = createPhysicsSystem({ state, input, entities, hud, audio });

  function reset() {
    resetPlayer(state.player, state.campaign?.unlocks);
    state.player.alive = true;
    state.time = 0;
    state.currentCheckpoint = null;
    state.jumpHeldLast = false;
    state.respawnTimer = 0;
    recruitment.clear();
    trichoderma.clear();
    trichodermaColonies.clear();
    azospirillumRootGrowth.clear();
    azospirillumNitrogen.clear();
    pseudomonasSiderophores.clear();
    opportunisticFungus.clear();
    bacillusBioprotection.clear();
    meloidogyneLifecycle.clear();
    beneficialInoculants.clear();
    nitrogenRootDevelopment.clear();
    rhizobiumNodulation.clear();
    mycorrhizaStructures.clear();
    ecology.clear();
    mycorrhiza.clear();
    goal.clear();
    gameplay.clear();
    pathogenSurvival.clear();
    phosphateSolubilization.clear();
    state.level = createEmptyLevel();
    for (const key in input.keys) input.keys[key] = false;
  }

  function resetEcology(encounters) {
    ecology.reset(encounters);
  }

  function resetBiology() {
    mycorrhiza.reset();
    mycorrhizaStructures.reset();
    trichoderma.reset();
    recruitment.reset();
    trichodermaColonies.reset();
    goal.reset();
    gameplay.reset();
    azospirillumRootGrowth.reset();
    azospirillumNitrogen.reset();
    beneficialInoculants.reset();
    pseudomonasSiderophores.reset();
    opportunisticFungus.reset();
    bacillusBioprotection.reset();
    rhizobiumNodulation.reset();
    nitrogenRootDevelopment.reset();
    meloidogyneLifecycle.reset();
    pathogenSurvival.reset();
    phosphateSolubilization.reset();
  }

  function setInputs(newKeys) {
    for (const key in input.keys) input.keys[key] = false;
    for (const key in newKeys) if (newKeys[key]) input.keys[key] = true;
  }

  function step(dt) {
    inoculumSelection.prepare(dt);
    phosphateSolubilization.prepare(dt);
    trichodermaColonies.prepare(dt);
    beneficialInoculants.prepare(dt);
    gameplay.prepare(dt);
    pathogenSurvival.prepare(dt);
    opportunisticFungus.prepare(dt);
    physics.update(dt);
    ecology.update(dt);
    recruitment.update(dt);
    beneficialInoculants.update(dt);
    pseudomonasSiderophores.update(dt);
    opportunisticFungus.update(dt);

    const azospirillumRootsUnlocked = state.campaign
      ? Boolean(state.campaign.unlocks.azospirillumRoots)
      : true;
    if (azospirillumRootsUnlocked) {
      azospirillumRootGrowth.update(dt);
      azospirillumRootSafety.update(dt);
    }

    rhizobiumNodulation.update(dt);
    azospirillumNitrogen.update(dt);
    nitrogenRootDevelopment.update(dt);
    trichodermaColonies.update(dt);
    gameplay.update(dt);
    bacillusBioprotection.update(dt);
    phosphateSolubilization.update(dt);
    bacillusBioprotectionSafety.update(dt);
    meloidogyneLifecycle.update(dt);
    trichoderma.update(dt);
    mycorrhiza.update(dt);

    const mycorrhizaStructuresUnlocked = state.campaign
      ? Boolean(state.campaign.unlocks.mycorrhizaStructures)
      : true;
    if (mycorrhizaStructuresUnlocked) mycorrhizaStructures.update(dt);

    pathogenSurvival.update(dt);
    goal.update(dt);
    if (state.toastTime > 0) state.toastTime -= dt;
  }

  const simulator = {
    state, input, entities, ecology, mycorrhiza, mycorrhizaStructures,
    trichoderma, recruitment, trichodermaColonies, beneficialInoculants,
    pseudomonasSiderophores, opportunisticFungus, bacillusBioprotection, bacillusBioprotectionSafety,
    rhizobiumNodulation, nitrogenRootDevelopment, azospirillumRootGrowth, azospirillumRootSafety,
    azospirillumNitrogen,
    meloidogyneLifecycle, pathogenSurvival, goal, gameplay,
    phosphateSolubilization,
    inoculumSelection,
    reset, resetEcology, resetBiology, setInputs, step,
  };

  return simulator;
}
