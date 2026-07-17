import { generateLevel } from './generator.js';
import { createRandom } from './random.js';
import { createSimulator } from './simulator.js';
import { createRenderer } from '../render/renderer.js';
import { createPlatformVisuals } from './platform-visuals.js';
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
let platformVisuals = null;
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
  sim.state.mission = 'Restaure o solo vivo e observe as raízes infestadas por Meloidogyne';
  populateMicrobeEncounters(levelData.platforms, seed);
  sim.resetEcology(microbeEncounters);
  sim.resetBiology();
  microbeEncounters.length = 0;
  renderer = createRenderer({ canvas, state: sim.state, entities: sim.entities });
  platformVisuals = createPlatformVisuals({ state: sim.state });
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
    platformVisuals.drawWorld(ctx);
    sim.pseudomonasSiderophores.renderDeposits(ctx);
    sim.ecology.render(ctx);
    sim.meloidogyneLifecycle.render(ctx);
    sim.beneficialInoculants.render(ctx);
    sim.pseudomonasSiderophores.render(ctx);
    sim.azospirillumRootGrowth.render(ctx);
    sim.rhizobiumNodulation.render(ctx);
    sim.trichodermaColonies.render(ctx);
    sim.trichoderma.render(ctx);
    sim.mycorrhizaStructures.render(ctx);
    sim.mycorrhiza.render(ctx);
    sim.goal.render(ctx);
    sim.gameplay.render(ctx);
    sim.bacillusBioprotection.render(ctx);
    platformVisuals.renderLabel(ctx);

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
    const inoculationAction = sim.trichodermaColonies.followerCount > 0
      ? `🧫 E Inocular Trichoderma (${sim.trichodermaColonies.followerCount})`
      : sim.beneficialInoculants.followerCount > 0
        ? `🧪 E Inocular benéficas (${sim.beneficialInoculants.followerCount})`
        : player.exudates > 0 ? '🟢 E Exsudato' : null;
    const abilities = [
      inoculationAction,
      player.canDoubleJump ? '⬆⬆ Salto' : null,
      player.canDash ? '💨 Dash' : null,
      player.canPulse ? '💥 Pulso' : null,
    ].filter(Boolean).join(' | ');
    const infection = player.infection > .01 ? ` | Infecção: ${(player.infection * 100).toFixed(0)}%` : '';
    const bacillusDefense = (player.bacillusResistance || 0) > .04
      ? ` | Defesa Bacillus: ${Math.round(player.bacillusResistance * 100)}%`
      : '';
    const nematodePressure = sim.meloidogyneLifecycle.infestationPercent > 2
      ? ` | Meloidogyne: ${sim.meloidogyneLifecycle.infestationPercent.toFixed(0)}%`
      : '';
    hudBar.textContent = `Solo: ${player.soil.toFixed(0)} | Esperança: ${player.hope.toFixed(0)} | Exudatos: ${player.exudates}${infection}${bacillusDefense}${nematodePressure}${abilities ? ' | ' + abilities : ''}`;

    if (showDebug) {
      const logicIndex = currentLogicIndex();
      const info = levelData.debugInfo[logicIndex];
      const vigor = Math.round(sim.trichodermaColonies.vigorAverage * 100);
      const beneficialVigor = Math.round(sim.beneficialInoculants.vigorAverage * 100);
      const fixation = sim.rhizobiumNodulation.fixationRate.toFixed(1);
      const ironRecovered = sim.pseudomonasSiderophores.ironRecovered.toFixed(1);
      const rootHealth = Math.round(sim.meloidogyneLifecycle.rootHealthAverage * 100);
      debugDiv.textContent = `SEED: ${seed} [R=nova | Tab=debug]\nTrecho ${Math.max(0, logicIndex + 1)}/${levelData.debugInfo.length}`
        + (info ? ` | ${info.primitive} | ${info.logic.difficultyTarget} | vão ${info.gap}px` : '')
        + `\nEcologia: ${sim.ecology.agents.length} organismos / ${sim.ecology.nicheCount} nichos`
        + `\nMeloidogyne: ${sim.meloidogyneLifecycle.eggMassCount} massas (${sim.meloidogyneLifecycle.eggCount} ovos) / ${sim.meloidogyneLifecycle.juvenileCount} J2 livres / ${sim.meloidogyneLifecycle.penetratingCount} penetrando`
        + `\nGalhas: ${sim.meloidogyneLifecycle.gallCount} totais / ${sim.meloidogyneLifecycle.matureGallCount} maduras / ${sim.meloidogyneLifecycle.femaleCount} fêmeas / saúde radicular média ${rootHealth}%`
        + `\nMicorriza AM: ${sim.mycorrhiza.tipCount} pontas / ${sim.mycorrhiza.branchCount} ramos / ${sim.mycorrhiza.arbusculeCount} arbúsculos`
        + `\nEstruturas AM: ${sim.mycorrhizaStructures.growingCount} crescendo / ${sim.mycorrhizaStructures.matureCount} maduras (${sim.mycorrhizaStructures.ladderCount} escadas, ${sim.mycorrhizaStructures.bridgeCount} pontes)`
        + `\nInoculantes: ${sim.beneficialInoculants.followerCount} seguindo / ${sim.beneficialInoculants.colonyCount} colônias / vigor médio ${beneficialVigor}%`
        + (sim.beneficialInoculants.colonySummary ? ` [${sim.beneficialInoculants.colonySummary}]` : '')
        + `\nBacillus: ${sim.bacillusBioprotection.matureBiofilmCount} biofilmes maduros / ${sim.bacillusBioprotection.sporulatedCount} esporulados / ${sim.bacillusBioprotection.germinatingCount} reativando`
        + `\nBioproteção: ${sim.bacillusBioprotection.fungiUnderAntibiosis} fungos sob antibiose / ${sim.bacillusBioprotection.protectedRootCount} raízes protegidas`
        + `\nSideróforos: ${sim.pseudomonasSiderophores.freeCount} livres / ${sim.pseudomonasSiderophores.loadedCount} com Fe³⁺ / Fe recuperado ${ironRecovered} / ${sim.pseudomonasSiderophores.fungiLimitedCount} fungos limitados`
        + `\nDepósitos Fe³⁺: ${sim.pseudomonasSiderophores.activeDepositCount}/${sim.pseudomonasSiderophores.depositCount} ativos / ${sim.pseudomonasSiderophores.activeColonyCount} colônias com reserva`
        + `\nRaízes laterais: ${sim.azospirillumRootGrowth.rootCount} totais / ${sim.azospirillumRootGrowth.growingCount} crescendo / ${sim.azospirillumRootGrowth.matureCount} maduras / ${sim.azospirillumRootGrowth.pausedCount} pausadas`
        + `\nNodulação: ${sim.rhizobiumNodulation.siteCount} sítios / ${sim.rhizobiumNodulation.matureCount} maduros / ${sim.rhizobiumNodulation.activeCount} ativos / FBN ${fixation}`
        + (sim.rhizobiumNodulation.incompatibleCount ? ` / ${sim.rhizobiumNodulation.incompatibleCount} sem hospedeiro` : '')
        + `\nTrichoderma: ${sim.trichodermaColonies.followerCount} seguindo / ${sim.trichodermaColonies.colonyCount} colônias / vigor médio ${vigor}%`
        + `\nHifas de ataque: ${sim.trichoderma.tipCount} pontas / ${sim.trichoderma.attackCount} alvos / ${sim.trichoderma.searchCount} em busca`
        + `\nInterações: ${sim.gameplay.cloudCount} nuvens / ${sim.gameplay.biofilmCount} biofilmes`;
    }

    requestAnimationFrame(loop);
  } catch (error) {
    debugDiv.textContent = 'ERRO: ' + error.message + '\n' + error.stack;
  }
}

requestAnimationFrame(loop);
