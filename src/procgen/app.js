import { generateLevel } from './generator.js';
import { createSimulator } from './simulator.js';
import { createRenderer } from '../render/renderer.js';
import { microbeEncounters } from '../data/microbes.js';

const canvas = document.querySelector('canvas');
const ctx = canvas.getContext('2d');
const debugDiv = document.getElementById('debug');
const missionDiv = document.getElementById('mission');
const hudBar = document.getElementById('hud-bar');
const toastDiv = document.getElementById('toast');

let seed = 'solo-vivo-' + Math.floor(Math.random() * 1000);
let levelData = generateLevel(seed);
let sim = createSimulator();
let renderer = null;
let showDebug = true;

function populateMicrobeEncounters(platforms) {
  microbeEncounters.length = 0;
  const decorativeTypes = ['rhizobium', 'oportunista', 'trichoderma', 'pseudomonas', 'azospirillum', 'bacillus'];
  let nextSpawnX = 600;
  const spacing = 800;
  
  for (let i = 3; i < platforms.length; i++) {
    const plat = platforms[i];
    if (plat.x < nextSpawnX) continue;
    const typeIndex = microbeEncounters.length % decorativeTypes.length;
    microbeEncounters.push({
      id: decorativeTypes[typeIndex],
      x: plat.x + plat.w / 2,
      y: plat.y - 40,
      r: 130 + Math.random() * 40,
      collect: false
    });
    nextSpawnX = plat.x + spacing;
  }
}

function initGame() {
  sim.reset();
  Object.assign(sim.state.level, levelData);
  sim.state.player.x = 100;
  sim.state.player.y = 400;
  sim.state.gameState = 'play';
  sim.state.mission = 'Encontre Azospirillum e desbloqueie o Impulso Radicular (salto duplo)';
  populateMicrobeEncounters(levelData.platforms);
  renderer = createRenderer({ canvas, state: sim.state, entities: sim.entities });
  toastDiv.className = '';
}

initGame();

// Inputs
const keys = {};
window.addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'KeyR') {
    seed = 'solo-vivo-' + Math.floor(Math.random() * 1000);
    levelData = generateLevel(seed);
    initGame();
  }
  if (e.code === 'Tab') {
    e.preventDefault();
    showDebug = !showDebug;
    debugDiv.classList.toggle('hidden', !showDebug);
  }
});
window.addEventListener('keyup', e => {
  keys[e.code] = false;
});

let lastTime = performance.now();
let lastToast = '';

function loop(now) {
  try {
    const dt = Math.max(0, Math.min((now - lastTime) / 1000, 0.1));
    lastTime = now;

    sim.setInputs(keys);
    sim.step(dt);
    renderer.render();

    // Update mission text (top-left, subtle)
    if (sim.state.mission) {
      missionDiv.textContent = '🌱 ' + sim.state.mission;
    }

    // Update toast (top-center, animated)
    if (sim.state.toastTime > 0 && sim.state.toast && sim.state.toast !== lastToast) {
      toastDiv.textContent = sim.state.toast;
      toastDiv.className = 'show';
      lastToast = sim.state.toast;
    }
    if (sim.state.toastTime <= 0 && toastDiv.className === 'show') {
      toastDiv.className = '';
      lastToast = '';
    }

    // Update HUD bar (top-right, stats)
    const p = sim.state.player;
    const abilities = [
      p.canDoubleJump ? '⬆⬆ Salto' : null,
      p.canDash ? '💨 Dash' : null,
      p.canPulse ? '💥 Pulso' : null
    ].filter(Boolean).join(' | ');
    hudBar.textContent = `Solo: ${p.soil.toFixed(0)} | Esperança: ${p.hope.toFixed(0)} | Exudatos: ${p.exudates}${abilities ? ' | ' + abilities : ''}`;

    // Debug panel (bottom-right, small — toggle with Tab)
    if (showDebug) {
      let currentChunk = 0;
      for (let i = 0; i < levelData.platforms.length; i++) {
        if (sim.state.player.x >= levelData.platforms[i].x) currentChunk = i;
      }
      const ci = levelData.debugInfo[currentChunk - 1];
      debugDiv.textContent = `SEED: ${seed} [R=nova | Tab=debug]\nTrecho ${currentChunk}/${levelData.platforms.length - 1}` +
        (ci ? ` | ${ci.primitive} | ${ci.logic.difficultyTarget}` : '');
    }

    requestAnimationFrame(loop);
  } catch (err) {
    debugDiv.textContent = "ERRO: " + err.message + "\n" + err.stack;
  }
}

requestAnimationFrame(loop);
