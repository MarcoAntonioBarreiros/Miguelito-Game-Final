import { generateLevel } from './generator.js';
import { generateCampaignEncounters } from './campaign-encounters.js';
import { generateUnderdevelopedNitrogenRoots } from './nitrogen-root.js';
import { generateAzospirillumRootLadders } from './azospirillum-root-growth.js';
import { createCampaignObjectiveEvaluator } from './campaign-objectives.js';
import { applyPhaseOneVerticalSlice, createFixedBlockRuntime } from './phase-one-vertical-slice.js';
import { applyPhaseFourMycorrhizaIntro } from './phase-four-mycorrhiza-intro.js';
import { applyPhaseFiveTutorialEncounters, applyPhaseFiveTutorialGeometry } from './phase-five-tutorial.js';
import {
  AZOSPIRILLUM_ROOT_LADDER_DEFAULTS,
  getPhaseManifest,
} from './campaign-manifest.js';
import { applyPhaseLabResources } from './phase-lab-config.js';
import { createPhaseLabSession } from './phase-lab.js';
import { createSimulator } from './simulator.js';
import { createRenderer } from '../render/renderer.js';
import { createPlatformVisuals } from './platform-visuals.js';
import { createCameraView } from './camera-view.js';
import { createRhizoctoniaControl } from './rhizoctonia-control.js';
import { createTrichodermaMeloidogyneControl } from './trichoderma-meloidogyne-control.js';
import { createTrichodermaRhizoctoniaControl } from './trichoderma-rhizoctonia-control.js';
import { createRalstoniaVascularWilt } from './ralstonia-vascular-wilt.js';
import {
  advanceCampaignPhase,
  campaignPhaseSeed,
  createCampaign,
  decorateCampaignLevel,
  prepareCampaignGeneration,
  recordPhaseResult,
  resetCampaign,
} from './campaign-progression.js';

const canvas = document.querySelector('canvas');
const ctx = canvas.getContext('2d');
const debugDiv = document.getElementById('debug');
const missionDiv = document.getElementById('mission');
const hudBar = document.getElementById('hud-bar');
const toastDiv = document.getElementById('toast');
const dashTouchButton = document.querySelector('[data-key="ShiftLeft"]');
const pulseTouchButton = document.querySelector('[data-key="KeyK"]');

let campaignStorage = null;
try { campaignStorage = window.sessionStorage; } catch (_) {}
const phaseLab = createPhaseLabSession({ windowObject: window });
if (phaseLab.enabled) campaignStorage = null;

let sim = createSimulator();
const campaign = createCampaign(phaseLab.enabled ? phaseLab.config.seed : undefined, { storage: campaignStorage });
if (phaseLab.enabled) phaseLab.configureCampaign(campaign);
sim.state.campaign = campaign;
const cameraView = createCameraView({ canvas, state: sim.state });
const rhizoctoniaControl = createRhizoctoniaControl({
  state: sim.state,
  entities: sim.entities,
  pseudomonas: sim.pseudomonasSiderophores,
});
const trichodermaMeloidogyneControl = createTrichodermaMeloidogyneControl({
  state: sim.state,
  entities: sim.entities,
  colonies: sim.trichodermaColonies,
  lifecycle: sim.meloidogyneLifecycle,
});
const trichodermaRhizoctoniaControl = createTrichodermaRhizoctoniaControl({
  state: sim.state,
  entities: sim.entities,
  colonies: sim.trichodermaColonies,
});
const ralstoniaControl = createRalstoniaVascularWilt({
  state: sim.state,
  entities: sim.entities,
  inoculants: sim.beneficialInoculants,
  pseudomonas: sim.pseudomonasSiderophores,
});
const objectiveEvaluator = createCampaignObjectiveEvaluator({
  state: sim.state,
  systems: {
    gameplay: sim.gameplay,
    inoculants: sim.beneficialInoculants,
    pseudomonas: sim.pseudomonasSiderophores,
    opportunisticFungus: sim.opportunisticFungus,
    trichoderma: trichodermaRhizoctoniaControl,
    meloidogyneControl: trichodermaMeloidogyneControl,
  },
});
const fixedBlockRuntime = createFixedBlockRuntime({
  state: sim.state,
  evaluator: objectiveEvaluator,
  entities: sim.entities,
  ecology: sim.ecology,
});
sim.goal.setCompletionGuard(() => {
  const finalTest = getPhaseManifest(campaign.phase)?.finalTest;
  if (!finalTest) return { passed: true };
  const conditions = (finalTest.requires || []).filter(condition => !(
    condition.type === 'worldState' && condition.key === 'reachedFinalRoot'
  ));
  if (!conditions.length) return { passed: true };
  const result = objectiveEvaluator.evaluate(conditions);
  return {
    passed: result.passed,
    message: campaign.phase === 5
      ? 'A raiz final exige a reserva mínima de ferro e o controle funcional do vigor fúngico.'
      : 'A raiz final aguarda a conclusão do objetivo ecológico indicado.',
  };
});
let profile = null;
let seed = '';
let levelData = null;
let renderer = null;
let platformVisuals = null;
let showDebug = true;
let lastTime = performance.now();
let lastToast = '';

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

function prepareLevel() {
  profile = prepareCampaignGeneration(campaign);
  seed = campaignPhaseSeed(campaign);
  levelData = generateLevel(seed);
  applyPhaseFourMycorrhizaIntro(
    levelData,
    campaign.phase,
    getPhaseManifest(campaign.phase)?.mycorrhizaBridge,
  );
  applyPhaseFiveTutorialGeometry(levelData, campaign.phase);
  levelData = decorateCampaignLevel(levelData, campaign, profile);
  applyPhaseOneVerticalSlice(levelData, campaign.phase);
  if (phaseLab.enabled) applyPhaseLabResources(levelData, getPhaseManifest(campaign.phase), seed);
  levelData.microbeEncounters = generateCampaignEncounters({
    platforms: levelData.platforms,
    phase: campaign.phase,
    seedValue: seed,
  }).concat(levelData.authoredEncounters || []);
  levelData.microbeEncounters = applyPhaseFiveTutorialEncounters(
    levelData,
    levelData.microbeEncounters,
    campaign.phase,
    seed,
  );
  const declaredAzospirillumLadder = getPhaseManifest(campaign.phase)?.azospirillumRootLadder;
  const contextualAzospirillumLadder = campaign.phase >= 5
    && campaign.unlocks.azospirillumRoots
    ? {
        ...AZOSPIRILLUM_ROOT_LADDER_DEFAULTS,
        count: 2,
        knownSkill: true,
        preserveDestinationHeight: true,
      }
    : null;
  generateAzospirillumRootLadders({
    level: levelData,
    phase: campaign.phase,
    seedValue: seed,
    encounters: levelData.microbeEncounters,
    config: declaredAzospirillumLadder?.enabled === false
      ? null
      : declaredAzospirillumLadder || contextualAzospirillumLadder,
  });
  generateUnderdevelopedNitrogenRoots({
    level: levelData,
    phase: campaign.phase,
    seedValue: seed,
    encounters: levelData.microbeEncounters,
    config: getPhaseManifest(campaign.phase)?.nitrogenRoot,
  });
  installFinalGoal(levelData);
}

const FEATURE_LABELS = {
  doubleJump: 'salto duplo',
  dash: 'Dash',
  pulse: 'Pulso',
  mycorrhizaStructures: 'pontes micorrízicas horizontais',
  azospirillumRoots: 'escadas radiculares de Azospirillum',
};

function phaseIntroText() {
  if (!profile.unlockEvents.length) return profile.mission;
  const names = profile.unlockEvents.map(event => FEATURE_LABELS[event.feature] || event.feature).join(' e ');
  return `Desbloqueios desta fase: ${names}. Cada poder só será exigido depois do chunk de aquisição.`;
}

function updateTouchAbilityVisibility() {
  if (dashTouchButton) {
    dashTouchButton.hidden = !sim.state.player.canDash;
    dashTouchButton.disabled = !sim.state.player.canDash;
  }
  if (pulseTouchButton) {
    pulseTouchButton.hidden = !sim.state.player.canPulse;
    pulseTouchButton.disabled = !sim.state.player.canPulse;
  }
}

function initGame({ announce = false } = {}) {
  sim.reset();
  rhizoctoniaControl.reset();
  trichodermaRhizoctoniaControl.reset();
  trichodermaMeloidogyneControl.reset();
  ralstoniaControl.reset();
  sim.state.campaign = campaign;
  Object.assign(sim.state.level, levelData);
  sim.state.player.x = 100;
  sim.state.player.y = 400;
  sim.state.gameState = 'play';
  sim.state.mission = profile.mission;
  cameraView.resetTracking();
  sim.resetEcology(levelData.microbeEncounters);
  sim.resetBiology();
  ralstoniaControl.initialize();
  renderer = createRenderer({ canvas, state: sim.state, entities: sim.entities });
  platformVisuals = createPlatformVisuals({ state: sim.state });
  toastDiv.className = '';
  lastToast = '';
  updateTouchAbilityVisibility();

  // O gerador cria simuladores auxiliares para validar a geometria. Somente
  // esta instância controla o jogo visível e deve alimentar integrações como
  // o sistema de tutoriais e o diagnóstico exposto no navegador.
  window.miguelitoSim = sim;

  if (announce) {
    sim.state.toast = `Fase ${campaign.phase} — ${profile.title}: ${phaseIntroText()}`;
    sim.state.toastTime = 6;
  }
}

function startNewCampaign() {
  if (phaseLab.enabled) {
    phaseLab.configureCampaign(campaign);
    for (const cardId of campaign.tutorialBootstrapSeen || []) {
      window.miguelitoTutorial?.markSeen?.(cardId);
    }
    sim.state.discoveredMicrobes.clear();
    prepareLevel();
    initGame({ announce: true });
    return;
  }
  resetCampaign(campaign);
  sim.state.discoveredMicrobes.clear();
  prepareLevel();
  initGame({ announce: true });
}

function buildPhaseReport() {
  const scoredRoots = (sim.state.level.platforms || []).filter(root => root.type === 'root' && !root.final && !root.recovery && !root.mycorrhizaStructure);
  const rootHealth = scoredRoots.length
    ? scoredRoots.reduce((sum, root) => sum + clamp(root.rootHealth ?? 1, 0, 1), 0) / scoredRoots.length
    : 1;
  const infestation = clamp((sim.meloidogyneLifecycle.infestationPercent || 0) / 100, 0, 1);
  const fixation = Math.max(0, (sim.state.level.rhizobiumNodules || []).reduce((sum, site) => sum + (site.fixationRate || 0), 0));
  const protection = Math.min(1, (sim.bacillusBioprotection.protectedRootCount || 0) / 4);
  const vascularTransport = clamp(ralstoniaControl.averageTransport, 0, 1);
  const score = Math.round(
    rootHealth * 40
    + (1 - infestation) * 20
    + Math.min(1, fixation / 10) * 15
    + protection * 15
    + vascularTransport * 10,
  );
  return {
    phase: campaign.phase,
    title: profile.title,
    theme: profile.theme,
    rootHealth: Math.round(rootHealth * 100),
    infestation: Math.round(infestation * 100),
    fixation: Number(fixation.toFixed(1)),
    protectedRoots: sim.bacillusBioprotection.protectedRootCount || 0,
    vascularTransport: Math.round(vascularTransport * 100),
    score,
  };
}

function maybeAdvanceCampaign() {
  if (!campaign.transitionRequested) return false;

  if (!campaign.transitionCaptured) {
    const report = buildPhaseReport();
    recordPhaseResult(campaign, report);
    const vascular = report.phase >= 4 ? ` · transporte ${report.vascularTransport}%` : '';
    sim.state.toast = `Fase ${report.phase}: ${report.score} pontos · saúde ${report.rootHealth}% · infestação ${report.infestation}%${vascular}`;
    sim.state.toastTime = 3.4;
  }

  if (sim.state.time < campaign.transitionAt) return false;

  if (phaseLab.enabled) {
    campaign.transitionRequested = false;
    sim.state.gameState = 'end';
    sim.state.mission = `Phase Lab concluido: ${getPhaseManifest(campaign.phase)?.finalTest?.goal || profile.mission}`;
    return true;
  }

  if (!advanceCampaignPhase(campaign)) {
    campaign.transitionRequested = false;
    sim.state.gameState = 'end';
    sim.state.mission = 'Campanha concluída';
    return true;
  }
  prepareLevel();
  initGame({ announce: true });
  return true;
}

prepareLevel();
initGame({ announce: true });
if (phaseLab.enabled) phaseLab.mount({ onRestart: startNewCampaign });

const keys = {};
window.addEventListener('keydown', event => {
  if (phaseLab.enabled && event.target instanceof Element && event.target.closest('.phase-lab')) return;
  keys[event.code] = true;
  if (event.code === 'KeyR' && !event.repeat) startNewCampaign();
  if (event.code === 'Tab') {
    event.preventDefault();
    showDebug = !showDebug;
    debugDiv.classList.toggle('hidden', !showDebug);
  }
});
window.addEventListener('keyup', event => { keys[event.code] = false; });

function currentLogicIndex() {
  let logicIndex = -1;
  for (const platform of levelData.platforms) {
    if (!platform.recovery && !platform.final && sim.state.player.x >= platform.x) {
      logicIndex = Math.max(logicIndex, platform.logicIndex ?? -1);
    }
  }
  return logicIndex;
}

function renderWorld() {
  ctx.save();
  try {
    cameraView.apply(ctx);
    renderer.render();
    platformVisuals.drawWorld(ctx);
    rhizoctoniaControl.render(ctx);
    ralstoniaControl.render(ctx);
    sim.pseudomonasSiderophores.renderDeposits(ctx);
    sim.ecology.render(ctx);
    sim.meloidogyneLifecycle.render(ctx);
    sim.beneficialInoculants.render(ctx);
    sim.pseudomonasSiderophores.render(ctx);
    sim.opportunisticFungus.render(ctx);
    sim.azospirillumRootGrowth.render(ctx);
    sim.rhizobiumNodulation.render(ctx);
    sim.nitrogenRootDevelopment.render(ctx);
    sim.trichodermaColonies.render(ctx);
    sim.trichoderma.render(ctx);
    trichodermaRhizoctoniaControl.render(ctx);
    trichodermaMeloidogyneControl.render(ctx);
    sim.mycorrhizaStructures.render(ctx);
    sim.mycorrhiza.render(ctx);
    sim.goal.render(ctx);
    sim.gameplay.render(ctx);
    sim.bacillusBioprotection.render(ctx);
    fixedBlockRuntime.render(ctx);
    platformVisuals.renderLabel(ctx);
  } finally {
    ctx.restore();
  }
}

function loop(now) {
  try {
    const dt = Math.max(0, Math.min((now - lastTime) / 1000, .1));
    lastTime = now;

    rhizoctoniaControl.prepare(dt);
    trichodermaRhizoctoniaControl.update(0);
    trichodermaMeloidogyneControl.update(0);
    sim.setInputs(keys);
    sim.step(dt);
    fixedBlockRuntime.update(dt);
    rhizoctoniaControl.update(dt);
    trichodermaRhizoctoniaControl.update(dt);
    trichodermaMeloidogyneControl.update(dt);
    ralstoniaControl.update(dt);
    maybeAdvanceCampaign();
    cameraView.update(dt);
    renderWorld();
    updateTouchAbilityVisibility();

    if (sim.state.mission) missionDiv.textContent = `🌱 Fase ${campaign.phase}: ${sim.state.mission}`;

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
    const fungalContamination = player.fungalContamination > .01
      ? ` | Contaminação fúngica: ${(player.fungalContamination * 100).toFixed(0)}%`
      : '';
    const bacillusDefense = (player.bacillusResistance || 0) > .04
      ? ` | Defesa Bacillus: ${Math.round(player.bacillusResistance * 100)}%`
      : '';
    const nematodePressure = sim.meloidogyneLifecycle.infestationPercent > 2
      ? ` | Meloidogyne: ${sim.meloidogyneLifecycle.infestationPercent.toFixed(0)}%`
      : '';
    const rhizoctonia = rhizoctoniaControl.activeCount
      ? ` | Rhizoctonia: ${rhizoctoniaControl.controlledCount}/${rhizoctoniaControl.activeCount} contida${rhizoctoniaControl.activeCount > 1 ? 's' : ''}`
      : '';
    const ralstonia = ralstoniaControl.focusCount
      ? ` | Ralstonia: ${ralstoniaControl.focusCount} · transporte ${Math.round(ralstoniaControl.averageTransport * 100)}%`
      : '';
    const trichoRhizo = trichodermaRhizoctoniaControl.activeAttackCount
      ? ` | Trichoderma→Rhizoctonia: ${trichodermaRhizoctoniaControl.activeAttackCount}`
      : '';
    const trichoNematode = trichodermaMeloidogyneControl.activeAttackCount
      ? ` | Trichoderma→Meloidogyne: ${trichodermaMeloidogyneControl.activeAttackCount}`
      : '';
    hudBar.textContent = `F${campaign.phase} · ${campaign.totalScore} pts | Solo: ${player.soil.toFixed(0)} | Esperança: ${player.hope.toFixed(0)} | Exsudatos: ${player.exudates}${infection}${fungalContamination}${bacillusDefense}${nematodePressure}${rhizoctonia}${ralstonia}${trichoRhizo}${trichoNematode}${abilities ? ' | ' + abilities : ''}`;

    if (showDebug) {
      const logicIndex = currentLogicIndex();
      const info = levelData.debugInfo[logicIndex];
      const vigor = Math.round(sim.trichodermaColonies.vigorAverage * 100);
      const beneficialVigor = Math.round(sim.beneficialInoculants.vigorAverage * 100);
      const fixation = (sim.state.level.rhizobiumNodules || []).reduce((sum, site) => sum + (site.fixationRate || 0), 0).toFixed(1);
      const associativeNitrogen = sim.azospirillumNitrogen.associativeNitrogenRate.toFixed(3);
      const ironRecovered = sim.pseudomonasSiderophores.ironRecovered.toFixed(1);
      const liveRoots = (sim.state.level.platforms || []).filter(root => root.type === 'root' && !root.final && !root.recovery && !root.mycorrhizaStructure);
      const rootHealth = liveRoots.length
        ? Math.round(liveRoots.reduce((sum, root) => sum + clamp(root.rootHealth ?? 1, 0, 1), 0) / liveRoots.length * 100)
        : 100;
      debugDiv.textContent = `CAMPANHA: ${campaign.seed} | Fase ${campaign.phase} — ${profile.title} [${profile.theme}]\nSEED: ${seed} [R=nova campanha | Tab=debug]\nTrecho ${Math.max(0, logicIndex + 1)}/${levelData.debugInfo.length}`
        + (info ? ` | ${info.primitive} | ${info.logic.difficultyTarget} | vão ${info.gap}px` : '')
        + `\nPoderes: salto ${campaign.unlocks.doubleJump ? '✓' : '—'} / dash ${campaign.unlocks.dash ? '✓' : '—'} / pulso ${campaign.unlocks.pulse ? '✓' : '—'} / pontes AM ${campaign.unlocks.mycorrhizaStructures ? '✓' : '—'} / raízes Azo ${campaign.unlocks.azospirillumRoots ? '✓' : '—'}`
        + `\nCâmera: ${cameraView.zoom.toFixed(2)}× [roda ou +/− | 0=restaurar]`
        + `\nEcologia: ${sim.ecology.agents.length} organismos / ${sim.ecology.nicheCount} nichos`
        + `\nRhizoctonia: ${rhizoctoniaControl.activeCount} focos / ${rhizoctoniaControl.controlledCount} contidos por biocontrole`
        + `\nTrichoderma anti-Rhizoctonia: ${trichodermaRhizoctoniaControl.activeAttackCount} ataques · ${trichodermaRhizoctoniaControl.eliminatedCount} focos lisados · ${trichodermaRhizoctoniaControl.abortedCount} ataques interrompidos`
        + `\nRalstonia: ${ralstoniaControl.focusCount} focos ativos / ${ralstoniaControl.neutralizedCount} neutralizados / ${ralstoniaControl.criticalCount} críticos · transporte médio ${Math.round(ralstoniaControl.averageTransport * 100)}%`
        + `\nMeloidogyne: ${sim.meloidogyneLifecycle.eggMassCount} massas (${sim.meloidogyneLifecycle.eggCount} ovos) / ${sim.meloidogyneLifecycle.juvenileCount} J2 livres / ${sim.meloidogyneLifecycle.penetratingCount} penetrando`
        + `\nTrichoderma anti-Meloidogyne: ${trichodermaMeloidogyneControl.activeAttackCount} ataques (${trichodermaMeloidogyneControl.eggAttackCount} ovos / ${trichodermaMeloidogyneControl.juvenileAttackCount} J2) · ${trichodermaMeloidogyneControl.eggsDestroyed} ovos inviabilizados · ${trichodermaMeloidogyneControl.eggMassesNeutralized} massas neutralizadas · ${trichodermaMeloidogyneControl.juvenilesDestroyed} J2 lisados`
        + `\nGalhas: ${sim.meloidogyneLifecycle.gallCount} totais / ${sim.meloidogyneLifecycle.matureGallCount} maduras / ${sim.meloidogyneLifecycle.femaleCount} fêmeas / saúde radicular média ${rootHealth}%`
        + `\nMicorriza AM: ${sim.mycorrhiza.tipCount} pontas / ${sim.mycorrhiza.branchCount} ramos / ${sim.mycorrhiza.arbusculeCount} arbúsculos`
        + `\nEstruturas AM: ${sim.mycorrhizaStructures.growingCount} crescendo / ${sim.mycorrhizaStructures.matureCount} maduras (${sim.mycorrhizaStructures.bridgeCount} pontes horizontais)`
        + `\nInoculantes: ${sim.beneficialInoculants.followerCount} seguindo / ${sim.beneficialInoculants.colonyCount} colônias / vigor médio ${beneficialVigor}%`
        + (sim.beneficialInoculants.colonySummary ? ` [${sim.beneficialInoculants.colonySummary}]` : '')
        + `\nBacillus: ${sim.bacillusBioprotection.matureBiofilmCount} biofilmes maduros / ${sim.bacillusBioprotection.sporulatedCount} esporulados / ${sim.bacillusBioprotection.germinatingCount} reativando`
        + `\nBioproteção: ${sim.bacillusBioprotection.fungiUnderAntibiosis} fungos sob antibiose / ${sim.bacillusBioprotection.protectedRootCount} raízes protegidas`
        + `\nSideróforos: ${sim.pseudomonasSiderophores.freeCount} livres / ${sim.pseudomonasSiderophores.loadedCount} com Fe³⁺ / Fe recuperado ${ironRecovered} / ${sim.pseudomonasSiderophores.fungiLimitedCount} fungos limitados`
        + `\nDepósitos Fe³⁺: ${sim.pseudomonasSiderophores.activeDepositCount}/${sim.pseudomonasSiderophores.depositCount} ativos / ${sim.pseudomonasSiderophores.activeColonyCount} colônias com reserva`
        + `\nEscadas Azo: ${sim.azospirillumRootGrowth.rootCount} totais / ${sim.azospirillumRootGrowth.growingCount} crescendo / ${sim.azospirillumRootGrowth.matureCount} maduras / ${sim.azospirillumRootGrowth.pausedCount} pausadas · N associativo ${associativeNitrogen} · sinergias ${sim.azospirillumNitrogen.synergizedNoduleCount}`
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
