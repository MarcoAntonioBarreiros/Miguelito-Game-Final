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

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function installFinalGoal(level) {
  if (level.goal) return;
  const routePlatforms = level.platforms.filter(platform => !platform.recovery);
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

function shuffledBag(types, random) {
  const bag = [...types];
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  return bag;
}

function populateMicrobeEncounters(platforms, seedValue) {
  microbeEncounters.length = 0;
  const random = createRandom(`${seedValue}:microbe-communities`);
  const types = ['rhizobium', 'oportunista', 'trichoderma', 'pseudomonas', 'azospirillum', 'bacillus'];
  const candidates = platforms.filter(platform => !platform.recovery && !platform.final && platform.logicIndex >= 1 && platform.w >= 100);
  let bag = shuffledBag(types, random);
  let previousType = null;
  let nextSpawnX = 430 + random() * 240;

  for (const platform of candidates) {
    if (platform.x < nextSpawnX) continue;
    if (bag.length === 0) bag = shuffledBag(types, random);
    let type = bag.pop();
    if (type === previousType && bag.length) {
      bag.unshift(type);
      type = bag.pop();
    }
    previousType = type;

    const lateral = (random() - .5) * Math.min(platform.w * .35, 70);
    microbeEncounters.push({
      id: type,
      x: platform.x + platform.w / 2 + lateral,
      y: Math.max(95, platform.y - 72 - random() * 76),
      r: 145 + random() * 75,
      territory: 520 + random() * 720,
      collect: false,
    });
    nextSpawnX = platform.x + 470 + random() * 430;
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
window.addEventListener('keydown', event => {
  keys[event.code] = true;
  if (event.code === 'KeyR') {
    seed = 'solo-vivo-' + Math.floor(Math.random() * 100000);
    levelData = generateLevel(seed);
    initGame();
  }
  if (event.code === 'Tab') {
    event.preventDefault();
    showDebug = !showDebug;
    debugDiv.classList.toggle('hidden', !showDebug);
  }
});
window.addEventListener('keyup', event => { keys[event.code] = false; });

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
    sim.trichoderma.render(ctx);
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

    const player = sim.state.player;
    const abilities = [
      player.exudates > 0 ? '🟢 E Exsudato' : null,
      player.canDoubleJump ? '⬆⬆ Salto' : null,
      player.canDash ? '💨 Dash' : null,
      player.canPulse ? '💥 Pulso' : null,
    ].filter(Boolean).join(' | ');
    const infection = player.infection > .01 ? ` | Infecção: ${(player.infection * 100).toFixed(0)}%` : '';
    hudBar.textContent = `Solo: ${player.soil.toFixed(0)} | Esperança: ${player.hope.toFixed(0)} | Exudatos: ${player.exudates}${infection}${abilities ? ' | ' + abilities : ''}`;

    if (showDebug) {
      const logicIndex = currentLogicIndex();
      const info = levelData.debugInfo[logicIndex];
      const vigor = Math.round(sim.trichoderma.vigorAverage * 100);
      debugDiv.textContent = `SEED: ${seed} [R=nova | Tab=debug]\nTrecho ${Math.max(0, logicIndex + 1)}/${levelData.debugInfo.length}`
        + (info ? ` | ${info.primitive} | ${info.logic.difficultyTarget} | vão ${info.gap}px` : '')
        + `\nEcologia: ${sim.ecology.agents.length} organismos / ${sim.ecology.nicheCount} nichos`
        + `\nMicorriza AM: ${sim.mycorrhiza.tipCount} pontas / ${sim.mycorrhiza.branchCount} ramos / ${sim.mycorrhiza.arbusculeCount} arbúsculos`
        + `\nTrichoderma: ${sim.trichoderma.tipCount} pontas / ${sim.trichoderma.attackCount} alvos / vigor ${vigor}% (${sim.trichoderma.searchCount} em busca)`
        + `\nInterações: ${sim.gameplay.cloudCount} nuvens / ${sim.gameplay.biofilmCount} biofilmes`;
    }

    requestAnimationFrame(loop);
  } catch (error) {
    debugDiv.textContent = 'ERRO: ' + error.message + '\n' + error.stack;
  }
}

requestAnimationFrame(loop);
