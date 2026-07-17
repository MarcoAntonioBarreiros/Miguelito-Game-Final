import { createPhysicsSystem } from '../physics.js';
import { createPlayer, resetPlayer } from '../player.js';
import { createMicrobeArt } from '../data/microbes.js';
import { createRoamingMicrobeEcology } from './microbe-roaming.js';
import { createMycorrhizaGrowth } from './mycorrhiza-growth.js';
import { createMycorrhizaStructures } from './mycorrhiza-structures.js';
import { createTrichodermaGrowth } from './trichoderma-growth.js';
import { createTrichodermaRecruitment } from './trichoderma-recruitment.js';
import { createTrichodermaColonies } from './trichoderma-colonies.js';
import { createBeneficialInoculants } from './beneficial-inoculants.js';
import { createRhizobiumNodulation } from './rhizobium-nodulation.js';
import { createAzospirillumRootGrowth } from './azospirillum-root-growth.js';
import { createAzospirillumRootSafety } from './azospirillum-root-safety.js';
import { createGoalSystem } from './goal-system.js';
import { createEcologicalGameplay } from './ecological-gameplay.js';

export function createSimulator() {
  const state = {
    time: 0,
    gameState: 'play',
    player: createPlayer(),
    level: {
      platforms: [], hazards: [], crystals: [], enemies: [], exudates: [],
      allies: [], checkpoints: [], particles: [], pulses: [], goal: null,
      exudateClouds: [], biofilms: [], beneficialColonies: [], rhizobiumNodules: [],
      azospirillumRoots: [],
    },
    jumpHeldLast: false,
    discoveredMicrobes: new Set(),
    microbeArt: createMicrobeArt(),
    cameraX: 0,
    shake: 0,
  };

  const input = {
    keys: {
      ArrowLeft: false, KeyA: false,
      ArrowRight: false, KeyD: false,
      Space: false, KeyW: false, ArrowUp: false,
      ShiftLeft: false, ShiftRight: false, KeyJ: false,
      KeyK: false, KeyE: false,
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
    respawn: () => {
      state.player.x = state.currentCheckpoint ? state.currentCheckpoint.x : 100;
      state.player.y = state.currentCheckpoint ? state.currentCheckpoint.y : 400;
      state.player.vx = 0;
      state.player.vy = 0;
      state.player.alive = true;
      state.player.infectionExposure = 0;
      state.player.infection = Math.max(0, (state.player.infection || 0) - .28);
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
  const rhizobiumNodulation = createRhizobiumNodulation({ state, entities, inoculants: beneficialInoculants });
  const azospirillumRootGrowth = createAzospirillumRootGrowth({ state, entities, inoculants: beneficialInoculants });
  const azospirillumRootSafety = createAzospirillumRootSafety({ state, rootGrowth: azospirillumRootGrowth });
  state.microbeEcology = ecology;
  state.mycorrhizaGrowth = mycorrhiza;
  state.mycorrhizaStructures = mycorrhizaStructures;
  state.trichodermaGrowth = trichoderma;
  state.trichodermaRecruitment = recruitment;
  state.trichodermaColonies = trichodermaColonies;
  state.beneficialInoculants = beneficialInoculants;
  state.rhizobiumNodulation = rhizobiumNodulation;
  state.azospirillumRootGrowth = azospirillumRootGrowth;
  state.azospirillumRootSafety = azospirillumRootSafety;
  state.goalSystem = goal;
  state.ecologicalGameplay = gameplay;

  const physics = createPhysicsSystem({ state, input, entities, hud, audio });

  function reset() {
    resetPlayer(state.player);
    state.player.alive = true;
    state.time = 0;
    state.currentCheckpoint = null;
    recruitment.clear();
    trichoderma.clear();
    trichodermaColonies.clear();
    azospirillumRootGrowth.clear();
    beneficialInoculants.clear();
    rhizobiumNodulation.clear();
    mycorrhizaStructures.clear();
    ecology.clear();
    mycorrhiza.clear();
    goal.clear();
    gameplay.clear();
    state.level.platforms = [];
    state.level.hazards = [];
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
    beneficialInoculants.reset();
    rhizobiumNodulation.reset();
  }

  function setInputs(newKeys) {
    for (const key in input.keys) input.keys[key] = false;
    for (const key in newKeys) if (newKeys[key]) input.keys[key] = true;
  }

  function step(dt) {
    trichodermaColonies.prepare(dt);
    beneficialInoculants.prepare(dt);
    gameplay.prepare(dt);
    physics.update(dt);
    ecology.update(dt);
    recruitment.update(dt);
    beneficialInoculants.update(dt);
    azospirillumRootGrowth.update(dt);
    azospirillumRootSafety.update(dt);
    rhizobiumNodulation.update(dt);
    trichodermaColonies.update(dt);
    gameplay.update(dt);
    trichoderma.update(dt);
    mycorrhiza.update(dt);
    mycorrhizaStructures.update(dt);
    goal.update(dt);
    if (state.toastTime > 0) state.toastTime -= dt;
  }

  return {
    state, input, entities, ecology, mycorrhiza, mycorrhizaStructures,
    trichoderma, recruitment, trichodermaColonies, beneficialInoculants,
    rhizobiumNodulation, azospirillumRootGrowth, azospirillumRootSafety,
    goal, gameplay,
    reset, resetEcology, resetBiology, setInputs, step,
  };
}
