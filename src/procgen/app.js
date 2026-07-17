import { generateLevel } from './generator.js';
import { createRandom } from './random.js';
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

function shuffledBag(types, rnd) {
  const bag = [...types];
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  return bag;
}

function populateMicrobeEncounters(platforms, seedValue) {
  microbeEncounters.length = 0;
  const rnd = createRandom(`${seedValue}:microbe-communities`);
  const types = ['rhizobium', 'oportunista', 'trichoderma', 'pseudomonas', 'azospirillum', 'bacillus'];
  const candidates = platforms.filter(p => !p.recovery && p.logicIndex >= 1 && p.w >= 100);
  let bag = shuffledBag(types, rnd);
  let previousType = null;
  let nextSpawnX = 430 + rnd() * 240;

  for (const plat of candidates) {
    if (plat.x < nextSpawnX) continue;
    if (bag.length === 0) bag = shuffledBag(types, rnd);
    let type = bag.pop();
    if (type === previousType && bag.length) {
      bag.unshift(type);
      type = bag.pop();
    }
    previousType = type;

    const lateral = (rnd() - .5) * Math.min(plat.w * .35, 70);
    microbeEncounters.push({
      id: type,
      x: plat.x + plat.w / 2 + lateral,
      y: Math.max(95, plat.y - 72 - rnd() * 76),
      r: 145 + rnd() * 75,
      territory: 520 + rnd() * 720,
      collect: false,
    });
    nextSpawnX = plat.x + 470 + rnd() * 430;
  }
}

function initGame() {
  sim.reset();
  Object.assign(sim.state.level, levelData);
  sim.state.player.x = 100;
  sim.state.player.y = 400;
  sim.state.gameState = 'play';
  sim.state.mission = 'Encontre Azospirillum e desbloqueie o Impulso Radicular (salto duplo)';
  populateMicrobeEncounters(levelData.platforms, seed);
  sim.resetEcology(microbeEncounters);
  microbeEncounters.length = 0;
  renderer = createRenderer({ canvas, state: sim.state, entities: sim.entities });
  toastDiv.className = '';
}

initGame();

const keys = {};
window.addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'KeyR') {
    seed = 'solo-vivo-' + Math.floor(Math.random() * 100000);
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

function currentLogicIndex() {
  let logicIndex = -1;
  for (const platform of levelData.platforms) {
    if (!platform.recovery && sim.state.player.x >= platform.x) logicIndex = Math.max(logicIndex, platform.logicIndex ?? -1);
  }
  return logicIndex;
}

function loop(now) {
  try {
    const dt = Math.max(0, Math.min((now - lastTime) / 1000, 0.1));
    lastTime = now;

    sim.setInputs(keys);
    sim.step(dt);
    renderer.render();
    sim.ecology.render(ctx);

    if (sim.state.mission) missionDiv.textContent = '🌱 ' + sim.state.mission;

    if (sim.state.toastTime > 0 && sim.state.toast && sim.state.toast !== lastToast) {
      toastDiv.textContent = sim.state.toast;
      toastDiv.className = 'show';
      lastToast = sim.state.toast;
    }
    if (sim.state.toastTime <= 0 && toastDiv.className === 'show') {
      toastDiv.className = '';
      lastToast = '';
    }

    const p = sim.state.player;
    const abilities = [
      p.canDoubleJump ? '⬆⬆ Salto' : null,
      p.canDash ? '💨 Dash' : null,
      p.canPulse ? '💥 Pulso' : null,
    ].filter(Boolean).join(' | ');
    hudBar.textContent = `Solo: ${p.soil.toFixed(0)} | Esperança: ${p.hope.toFixed(0)} | Exudatos: ${p.exudates}${abilities ? ' | ' + abilities : ''}`;

    if (showDebug) {
      const logicIndex = currentLogicIndex();
      const ci = levelData.debugInfo[logicIndex];
      debugDiv.textContent = `SEED: ${seed} [R=nova | Tab=debug]\nTrecho ${Math.max(0, logicIndex + 1)}/${levelData.debugInfo.length}`
        + (ci ? ` | ${ci.primitive} | ${ci.logic.difficultyTarget} | vão ${ci.gap}px` : '')
        + `\nEcologia livre: ${sim.ecology.agents.length} organismos em ${sim.ecology.nicheCount} nichos`;
    }

    requestAnimationFrame(loop);
  } catch (err) {
    debugDiv.textContent = 'ERRO: ' + err.message + '\n' + err.stack;
  }
}

requestAnimationFrame(loop);
