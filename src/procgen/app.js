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

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

function installFinalGoal(level) {
  if (level.goal) return;
  const routePlatforms = level.platforms.filter(p => !p.recovery);
  const last = routePlatforms[routePlatforms.length - 1];
  const finalPlatform = {
    x: last.x + last.w + 78,
    y: clamp(last.y + 18, 300, 545),
    w: 340,
    h: 96,
    type: 'root',
    final: true,
    logicIndex: level.debugInfo.length,
  };
  level.platforms.push(finalPlatform);
  level.goal = {
    x: finalPlatform.x + finalPlatform.w - 92,
    y: finalPlatform.y - 132,
    radius: 78,
    completed: false,
  };
  level.endX = finalPlatform.x + finalPlatform.w + 150;
  level.cameraMaxX = Math.max(0, level.endX - 1000);
}

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
  const candidates = platforms.filter(p => !p.recovery && !p.final && p.logicIndex >= 1 && p.w >= 100);
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
  installFinalGoal(levelData);
  sim.reset();
  Object.assign(sim.state.level, levelData);
  sim.state.player.x = 100;
  sim.state.player.y = 400;
  sim.state.gameState = 'play';
  sim.state.mission = 'Colete exsudatos e use E para dirigir as comunidades microbianas';
  populateMicrobeEncounters(levelData.platforms, seed);
  sim.resetEcology(microbeEncounters);
  sim.resetBiology();
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
window.addEventListener('keyup', e => { keys[e.code] = false; });

let lastTime = performance.now();
let lastToast = '';

function currentLogicIndex() {
  let logicIndex = -1;
  for (const platform of levelData.platforms) {
    if (!platform.recovery && !platform.final && sim.state.player.x >= platform.x) {
      logicIndex = Math.max(logicIndex, platform.logicIndex ?? -1);
    }
  }
  return logicIndex;
}

function loop(now) {
  try {
    const dt = Math.max(0, Math.min((now - lastTime) / 1000, .1));
    lastTime = now;

    sim.setInputs(keys);
    sim.step(dt);
    renderer.render();
    sim.ecology.render(ctx);
    sim.mycorrhiza.render(ctx);
    sim.goal.render(ctx);
    sim.gameplay.render(ctx);

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
      p.exudates > 0 ? '🟢 E Exsudato' : null,
      p.canDoubleJump ? '⬆⬆ Salto' : null,
      p.canDash ? '💨 Dash' : null,
      p.canPulse ? '💥 Pulso' : null,
    ].filter(Boolean).join(' | ');
    const infection = p.infection > .01 ? ` | Infecção: ${(p.infection * 100).toFixed(0)}%` : '';
    hudBar.textContent = `Solo: ${p.soil.toFixed(0)} | Esperança: ${p.hope.toFixed(0)} | Exudatos: ${p.exudates}${infection}${abilities ? ' | ' + abilities : ''}`;

    if (showDebug) {
      const logicIndex = currentLogicIndex();
      const ci = levelData.debugInfo[logicIndex];
      debugDiv.textContent = `SEED: ${seed} [R=nova | Tab=debug]\nTrecho ${Math.max(0, logicIndex + 1)}/${levelData.debugInfo.length}`
        + (ci ? ` | ${ci.primitive} | ${ci.logic.difficultyTarget} | vão ${ci.gap}px` : '')
        + `\nEcologia: ${sim.ecology.agents.length} organismos / ${sim.ecology.nicheCount} nichos`
        + `\nMicorriza: ${sim.mycorrhiza.tipCount} pontas / ${sim.mycorrhiza.branchCount} ramos`
        + `\nInterações: ${sim.gameplay.cloudCount} nuvens / ${sim.gameplay.biofilmCount} biofilmes / ${sim.gameplay.attackCount} micoparasitismos`;
    }

    requestAnimationFrame(loop);
  } catch (err) {
    debugDiv.textContent = 'ERRO: ' + err.message + '\n' + err.stack;
  }
}

requestAnimationFrame(loop);
