import { createPhysicsSystem } from '../physics.js';
import { createPlayer, resetPlayer } from '../player.js';
import { createMicrobeArt } from '../data/microbes.js';
import { createMicrobeEcology } from './microbe-ecology.js';

export function createSimulator() {
  const state = {
    time: 0,
    gameState: 'play',
    player: createPlayer(),
    level: {
      platforms: [],
      hazards: [],
      crystals: [],
      enemies: [],
      exudates: [],
      allies: [],
      checkpoints: [],
      particles: [],
      pulses: []
    },
    jumpHeldLast: false,
    discoveredMicrobes: new Set(),
    microbeArt: createMicrobeArt(),
    cameraX: 0,
    shake: 0
  };

  const input = {
    keys: {
      ArrowLeft: false, KeyA: false,
      ArrowRight: false, KeyD: false,
      Space: false, KeyW: false, ArrowUp: false,
      ShiftLeft: false, ShiftRight: false, KeyJ: false,
      KeyK: false
    }
  };

  const entities = {
    burst: (x, y, color, count, speed) => {
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = Math.random() * speed;
        state.level.particles.push({
          x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
          r: 1 + Math.random() * 2, color, life: 0.4 + Math.random() * 0.4, max: 0.8
        });
      }
    },
    discoverMicrobe: (id) => {
      state.discoveredMicrobes.add(id);
    },
    respawn: () => {
      state.player.x = state.currentCheckpoint ? state.currentCheckpoint.x : 100;
      state.player.y = state.currentCheckpoint ? state.currentCheckpoint.y : 400;
      state.player.vx = 0;
      state.player.vy = 0;
      state.player.alive = true;
    }
  };

  const hud = {
    setMission: (m) => { state.mission = m; },
    showToast: (title, desc) => {
      state.toast = `${title}: ${desc}`;
      state.toastTime = 4.7;
    },
    updateHud: () => {},
    showEnd: () => {}
  };

  const audio = {
    toneNow: () => {}
  };

  const ecology = createMicrobeEcology({ state, entities });
  state.microbeEcology = ecology;
  const physics = createPhysicsSystem({ state, input, entities, hud, audio });

  function reset() {
    resetPlayer(state.player);
    state.player.alive = true;
    state.time = 0;
    state.level.platforms = [];
    state.level.hazards = [];
    ecology.clear();
    for (const k in input.keys) input.keys[k] = false;
  }

  function resetEcology(encounters) {
    ecology.reset(encounters);
  }

  function setInputs(newKeys) {
    for (const k in input.keys) input.keys[k] = false;
    for (const k in newKeys) {
      if (newKeys[k]) input.keys[k] = true;
    }
  }

  function step(dt) {
    physics.update(dt);
    ecology.update(dt);
    if (state.toastTime > 0) state.toastTime -= dt;
  }

  return { state, input, entities, ecology, reset, resetEcology, setInputs, step };
}
