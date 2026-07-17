import { createPhysicsSystem } from '../physics.js';
import { createPlayer, resetPlayer } from '../player.js';
import { createMicrobeArt } from '../data/microbes.js';

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
      state.toastTime = 4.7; // seconds
    },
    updateHud: () => {},
    showEnd: () => {}
  };

  const audio = {
    toneNow: () => {}
  };

  const physics = createPhysicsSystem({ state, input, entities, hud, audio });

  function reset() {
    resetPlayer(state.player);
    state.player.alive = true;
    state.time = 0;
    state.level.platforms = [];
    state.level.hazards = [];
    // Reset all inputs
    for (let k in input.keys) input.keys[k] = false;
  }

  function setInputs(newKeys) {
    for (let k in input.keys) input.keys[k] = false;
    for (let k in newKeys) {
      if (newKeys[k]) input.keys[k] = true;
    }
  }

  function step(dt) {
    physics.update(dt);
    if (state.toastTime > 0) {
      state.toastTime -= dt;
    }
  }

  return { state, input, entities, reset, setInputs, step };
}
