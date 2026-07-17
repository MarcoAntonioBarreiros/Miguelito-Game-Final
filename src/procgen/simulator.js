import { createPhysicsSystem } from '../physics.js';
import { createPlayer, resetPlayer } from '../player.js';
import { createMicrobeArt } from '../data/microbes.js';
import { createRoamingMicrobeEcology } from './microbe-roaming.js';
import { createMycorrhizaGrowth } from './mycorrhiza-growth.js';
import { createTrichodermaGrowth } from './trichoderma-growth.js';
import { createTrichodermaRecruitment } from './trichoderma-recruitment.js';
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
      exudateClouds: [], biofilms: [],
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
  const trichoderma = createTrichodermaGrowth({ state, entities, ecology });
  const recruitment = createTrichodermaRecruitment({ state, ecology, entities });
  const goal = createGoalSystem({ state, entities });
  const gameplay = createEcologicalGameplay({ state, input, entities, ecology });
  state.microbeEcology = ecology;
  state.mycorrhizaGrowth = mycorrhiza;
  state.trichodermaGrowth = trichoderma;
  state.trichodermaRecruitment = recruitment;
  state.goalSystem = goal;
  state.ecologicalGameplay = gameplay;

  const physics = createPhysicsSystem({ state, input, entities, hud, audio });

  function reset() {
    resetPlayer(state.player);
    state.player.alive = true;
    state.time = 0;
    state.currentCheckpoint = null;
    state.level.platforms = [];
    state.level.hazards = [];
    recruitment.clear();
    ecology.clear();
    mycorrhiza.clear();
    trichoderma.clear();
    goal.clear();
    gameplay.clear();
    for (const key in input.keys) input.keys[key] = false;
  }

  function resetEcology(encounters) {
    ecology.reset(encounters);
  }

  function resetBiology() {
    mycorrhiza.reset();
    trichoderma.reset();
    recruitment.reset();
    goal.reset();
    gameplay.reset();
  }

  function setInputs(newKeys) {
    for (const key in input.keys) input.keys[key] = false;
    for (const key in newKeys) if (newKeys[key]) input.keys[key] = true;
  }

  function step(dt) {
    gameplay.prepare(dt);
    physics.update(dt);
    ecology.update(dt);
    recruitment.update(dt);
    gameplay.update(dt);
    trichoderma.update(dt);
    mycorrhiza.update(dt);
    goal.update(dt);
    if (state.toastTime > 0) state.toastTime -= dt;
  }

  return {
    state, input, entities, ecology, mycorrhiza, trichoderma, recruitment, goal, gameplay,
    reset, resetEcology, resetBiology, setInputs, step,
  };
}
