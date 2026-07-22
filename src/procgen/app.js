import { generateLevel, enforceTraversableRoute } from './generator.js';
import { generateCampaignEncounters } from './campaign-encounters.js';
import { generateUnderdevelopedNitrogenRoots } from './nitrogen-root.js';
import { generateAzospirillumRootLadders } from './azospirillum-root-growth.js';
import { createCampaignObjectiveEvaluator } from './campaign-objectives.js';
import { applyPhaseOneVerticalSlice, createFixedBlockRuntime } from './phase-one-vertical-slice.js';
import { applySignatureChallenge } from './signature-challenge.js';
import { applyPhaseFourMycorrhizaIntro } from './phase-four-mycorrhiza-intro.js';
import { applyPhaseFiveTutorialEncounters, applyPhaseFiveTutorialGeometry } from './phase-five-tutorial.js';
import { applyPhaseSixTutorialEncounters, applyPhaseSixTutorialGeometry } from './phase-six-tutorial.js';
import { applyPhaseSevenPhosphateGeometry } from './phosphate-solubilization.js';
import {
  AZOSPIRILLUM_ROOT_LADDER_DEFAULTS,
  getPhaseManifest,
} from './campaign-manifest.js';
import { applyPhaseLabResources } from './phase-lab-config.js';
import { createPhaseLabSession } from './phase-lab.js';
import { updateContextPanel } from './hud-context.js';
import { computeEcologicalScore } from './ecological-score.js';
import { initPlayerTuning } from '../render/player-skin-tuning.js';
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
const phaseCardDiv = document.getElementById('phase-card');
const hudBar = document.getElementById('hud-bar');
const stockDiv = document.getElementById('hud-stock');
const alertsDiv = document.getElementById('hud-alerts');
const toastDiv = document.getElementById('toast');

// Icones do HUD. Desenhados em vez de emoji porque emoji muda de forma e de cor
// conforme o sistema, e aqui a cor carrega significado.
const HUD_ICONS = Object.freeze({
  soil: '<path d="M3 15c2-3 5-3 7-1s5 2 8-1v7H3z" fill="#b07a4a"/><path d="M3 15c2-3 5-3 7-1s5 2 8-1" stroke="#e0a86c" stroke-width="1.6" fill="none"/><circle cx="8" cy="18" r="1.2" fill="#7a5233"/><circle cx="14" cy="19" r="1" fill="#7a5233"/>',
  hope: '<path d="M12 21c0-5 2-8 6-10-1 5-3 8-6 10z" fill="#79e07f"/><path d="M12 21c0-5-2-8-6-10 1 5 3 8 6 10z" fill="#4fbf75"/><path d="M12 21V9" stroke="#adf5b4" stroke-width="1.5"/>',
  exudate: '<path d="M12 3c3.4 4.3 5.4 7.2 5.4 9.6A5.4 5.4 0 0 1 6.6 12.6C6.6 10.2 8.6 7.3 12 3z" fill="#5fd6c8"/><path d="M9.6 13.2a2.6 2.6 0 0 0 2.4 2.6" stroke="#d6fff8" stroke-width="1.3" fill="none"/>',
  microbe: '<ellipse cx="12" cy="12" rx="6.4" ry="4.2" transform="rotate(-24 12 12)" fill="#6ce7df"/><path d="M5 17c-1.6 1-2.4 2-2.6 3M19 7c1.6-1 2.4-2 2.6-3" stroke="#9ff6ee" stroke-width="1.4" fill="none"/><circle cx="10.4" cy="11" r="1.1" fill="#093b3a"/>',
  phosphate: '<path d="m12 3 7 4.5v9L12 21l-7-4.5v-9z" fill="#c9a5ff"/><path d="m12 3 7 4.5v9L12 21l-7-4.5v-9z" stroke="#e6d4ff" stroke-width="1.2" fill="none"/><text x="12" y="15" font-size="8" font-weight="800" text-anchor="middle" fill="#3a1f63">P</text>',
});

// Diagnostico do sprite no painel de debug (Tab). Existe porque "a animacao nao
// apareceu" tem duas causas muito diferentes — a regra de estado nao disparou,
// ou disparou e a folha nao estava pronta e caiu no fallback — e olhando a tela
// as duas sao identicas. Esta linha separa as duas sem precisar de tentativa e
// erro.
function spriteDiagnostico() {
  const skin = renderer?.playerSkin;
  if (!skin) return 'Sprite: —';
  if (skin.id === 'astronaut') return 'Sprite: astronauta (desenhado)';
  const info = skin.debug();
  if (!info) return `Sprite: ${skin.id} (sem folhas)`;
  const prontas = info.folhas.filter(folha => folha.ready).map(folha => folha.name);
  const falharam = info.folhas.filter(folha => folha.failed).map(folha => folha.name);
  return `Sprite: ${skin.id} | pedido ${info.pedido || '—'} → desenhado ${info.desenhado || '—'}`
    + `${info.caiuNoFallback ? ' [FALLBACK]' : ''}`
    + `\nFolhas prontas: ${prontas.join(',') || 'nenhuma'}`
    + `${falharam.length ? ` | FALHARAM: ${falharam.join(',')}` : ''}`;
}

function hudIcon(name) {
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${HUD_ICONS[name] || ''}</svg>`;
}

function renderStockChips(chips) {
  if (!stockDiv) return;
  const markup = chips.map(chip => (
    `<div class="stock-chip${chip.kind === 'hand' ? ' hand' : ''}">`
    + hudIcon(chip.icon)
    + `<div class="read"><span class="label">${chip.label}</span>`
    + `<span class="value">${chip.value}</span></div>`
    + (chip.key ? `<span class="key">${chip.key}</span>` : '')
    + (chip.swap ? `<span class="swap">${chip.swap}</span>` : '')
    + '</div>'
  )).join('');
  // Reescrever o HTML a cada quadro descarta a transicao e pesa; so troca
  // quando o conteudo muda mesmo.
  if (stockDiv.dataset.markup !== markup) {
    stockDiv.dataset.markup = markup;
    stockDiv.innerHTML = markup;
  }
}

function renderAlerts(alerts) {
  if (!alertsDiv) return;
  const markup = alerts
    .map(alert => `<div class="hud-alert${alert.grave ? ' grave' : ''}">${alert.text}</div>`)
    .join('');
  if (alertsDiv.dataset.markup !== markup) {
    alertsDiv.dataset.markup = markup;
    alertsDiv.innerHTML = markup;
  }
}

// Rotulos legiveis para o painel de objetivos: as condicoes do manifesto usam
// chaves tecnicas (ex.: opportunisticFungusVigor) que nao servem ao jogador.
const OBJECTIVE_LABELS = {
  activeMatureNoduleCount: 'Forme nódulos maduros fixando N₂',
  deployedExudateCount: 'Libere exsudatos na rizosfera',
  doubleJump: 'Domine o salto duplo (Azospirillum)',
  dash: 'Domine o impulso (dash)',
  ecologicalScore: 'Deixe o solo saudável e equilibrado',
  functionalBiofilmCount: 'Forme um biofilme funcional',
  functionalMycorrhizaPathCount: 'Estabeleça uma ponte micorrízica',
  mycorrhizalPhosphateTransported: 'Transporte fósforo pela micorriza',
  neutralizedEggMassCount: 'Neutralize uma massa de ovos de Meloidogyne',
  opportunisticFungusVigor: 'Reduza o vigor do fungo oportunista',
  preservedRootCount: 'Preserve uma raiz saudável',
  pseudomonasIronReserve: 'Acumule reserva de ferro (Pseudomonas)',
  reachedFinalRoot: 'Alcance a raiz final',
  recoveredRootCount: 'Recupere uma raiz danificada',
  rootPhosphateStock: 'Entregue fósforo à raiz-alvo',
  solubilizedPhosphateDepositCount: 'Solubilize o depósito de fosfato',
  totalFixationRate: 'Ative a fixação de nitrogênio',
  visibleLateralRootCount: 'Induza raízes laterais (Azospirillum)',
};

function objectiveLabel(req) {
  return OBJECTIVE_LABELS[req.key] || req.description || req.key;
}

function renderObjectives(campaign, evaluator) {
  const listDiv = document.getElementById('objective-list');
  const finalTest = getPhaseManifest(campaign.phase)?.finalTest;
  
  if (!listDiv || !finalTest?.requires) {
    if (listDiv && listDiv.innerHTML !== '') listDiv.innerHTML = '';
    return;
  }

  const evaluation = evaluator.evaluate(finalTest.requires);
  const doneSet = new Set(
    evaluation.results
      .filter(r => r.passed)
      .map(r => r.condition.key)
  );

  let html = '';
  for (const req of finalTest.requires) {
    const isCompleted = doneSet.has(req.key);
    html += `
      <div class="objective-item ${isCompleted ? 'completed' : ''}">
        <div class="circle"></div>
        <div class="text">${objectiveLabel(req)}</div>
      </div>
    `;
  }
  
  if (listDiv.dataset.markup !== html) {
    listDiv.dataset.markup = html;
    listDiv.innerHTML = html;
  }

  if (!listDiv.dataset.touchInit) {
    listDiv.dataset.touchInit = 'true';
    listDiv.addEventListener('pointerdown', (e) => {
      const item = e.target.closest('.objective-item');
      if (item) {
        item.classList.toggle('expanded');
        if (item.classList.contains('expanded')) {
          setTimeout(() => item.classList.remove('expanded'), 4000);
        }
      }
    });
  }

  const contextDiv = document.getElementById('hud-context');
  if (contextDiv && !contextDiv.dataset.touchInit) {
    contextDiv.dataset.touchInit = 'true';
    contextDiv.addEventListener('pointerdown', (e) => {
      const gauge = e.target.closest('.mobile-gauge-item');
      if (gauge) {
        gauge.classList.toggle('active');
        if (gauge.classList.contains('active')) {
          setTimeout(() => gauge.classList.remove('active'), 4000);
        }
      }
    });
  }
}
const dashTouchButton = document.querySelector('[data-key="ShiftLeft"]');
const selectionTouchButton = document.querySelector('[data-key="ArrowDown"]');

let campaignStorage = null;
try { campaignStorage = window.sessionStorage; } catch (_) {}
// O ajuste do sprite vale em qualquer partida, nao so dentro do Phase Lab:
// precisa ser carregado antes de o renderizador desenhar o primeiro quadro.
initPlayerTuning((() => { try { return window.localStorage; } catch (_) { return null; } })());

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
    phosphate: sim.phosphateSolubilization,
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
// O console de telemetria e ferramenta de desenvolvimento, nao HUD de jogo:
// nasce ligado so dentro do Phase Lab. Fora dele continua acessivel pelo Tab
// (e pelo botao (i) no celular) para quando eu precisar dele numa partida real.
let showDebug = phaseLab.enabled;
debugDiv.classList.toggle('hidden', !showDebug);
let lastTime = performance.now();
let lastToast = '';
let loopErrorCount = 0;
// Depois disso a falha e claramente permanente e insistir so gasta quadro.
const LOOP_ERROR_LIMIT = 240;

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
  applyPhaseSixTutorialGeometry(levelData, campaign.phase);
  levelData = decorateCampaignLevel(levelData, campaign, profile);
  applyPhaseOneVerticalSlice(levelData, campaign.phase);
  // Garante que a mecanica-tema da fase seja necessaria ao menos uma vez.
  applySignatureChallenge(levelData, campaign.phase);
  if (phaseLab.enabled) applyPhaseLabResources(levelData, getPhaseManifest(campaign.phase), seed);
  applyPhaseSevenPhosphateGeometry(
    levelData,
    campaign.phase,
    getPhaseManifest(campaign.phase)?.phosphateSolubilization,
  );
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
  levelData.microbeEncounters = applyPhaseSixTutorialEncounters(
    levelData,
    levelData.microbeEncounters,
    campaign.phase,
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
  // Rede de seguranca global anti-softlock: repara qualquer vao que fique
  // intransponivel com as habilidades ja desbloqueadas, sem tocar nos desafios
  // que exigem a mecanica-tema de proposito.
  enforceTraversableRoute(levelData, {
    doubleJump: Boolean(campaign.unlocks?.doubleJump),
    dash: Boolean(campaign.unlocks?.dash),
  });
  anchorPowerPickups(levelData);
  installFinalGoal(levelData);
}

// Os pickups de poder (fitohormonios: power-jump/power-dash/power-pulse) tem que
// ser coletaveis SEM o poder que concedem. Se o desafio-assinatura/escada elevou
// a plataforma do evento, o pickup do salto duplo ficava num bloco que so o
// proprio salto duplo alcanca — um bootstrap-softlock. Este passo re-ancora cada
// pickup a uma plataforma alcancavel por salto simples a partir da anterior.
function anchorPowerPickups(level) {
  const route = (level.platforms || [])
    .filter(p => !p.recovery && !p.final && Number.isInteger(p.logicIndex) && p.logicIndex >= 0)
    .sort((a, b) => a.logicIndex - b.logicIndex || a.x - b.x);
  if (!route.length) return;
  for (const ally of level.allies || []) {
    if (typeof ally.id !== 'string' || !ally.id.startsWith('power-')) continue;
    let idx = route.findIndex(p => p.logicIndex === ally.logicIndex);
    if (idx < 0) {
      idx = route.reduce((best, p, i) => (
        Math.abs(p.x - ally.x) < Math.abs(route[best].x - ally.x) ? i : best
      ), 0);
    }
    // Recua enquanto a plataforma hospedeira exigir mais que um salto simples
    // (~92px de subida) a partir da anterior — garante que da para chegar la sem
    // o poder ainda nao adquirido.
    while (idx > 0 && route[idx - 1].y - route[idx].y > 92) idx--;
    const host = route[idx];
    ally.x = host.x + host.w / 2;
    ally.y = host.y - 28;
    ally.logicIndex = host.logicIndex;
    ally.anchoredPlatform = true;
  }
}

const FEATURE_LABELS = {
  doubleJump: 'salto duplo',
  dash: 'Dash',
  phosphateSolubilization: 'Solubilizacao de fosfato',
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
  if (selectionTouchButton) selectionTouchButton.disabled = false;
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

  // A abertura da fase nao e narracao: e um cartao de titulo. Ela era anunciada
  // como toast e ao mesmo tempo ficava fixa no canto esquerdo — a mesma frase
  // duas vezes, uma delas para sempre. Agora aparece grande no centro, uma vez,
  // e sai.
  if (announce) showPhaseCard(`Fase ${campaign.phase}`, profile.title, phaseIntroText());
}

let phaseCardTimer = null;

function showPhaseCard(eyebrow, title, subtitle) {
  if (!phaseCardDiv) return;
  phaseCardDiv.innerHTML = `<span class="eyebrow">${eyebrow}</span>`
    + `<span class="title">${title}</span>`
    + `<span class="subtitle">${subtitle}</span>`;
  phaseCardDiv.classList.remove('show', 'leaving');
  // Forca o reinicio da animacao quando duas fases se sucedem rapido.
  void phaseCardDiv.offsetWidth;
  phaseCardDiv.classList.add('show');
  clearTimeout(phaseCardTimer);
  phaseCardTimer = setTimeout(() => {
    phaseCardDiv.classList.add('leaving');
    phaseCardTimer = setTimeout(() => phaseCardDiv.classList.remove('show', 'leaving'), 1100);
  }, 3400);
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

const recoveryToggleButton = document.querySelector('[data-mobile-action="toggle-recovery"]');
function toggleRecoveryPlatforms() {
  const disabled = !sim.state.recoveryPlatformsDisabled;
  sim.state.recoveryPlatformsDisabled = disabled;
  recoveryToggleButton?.setAttribute('aria-pressed', String(disabled));
  sim.state.toast = disabled
    ? 'Plataformas de segurança desligadas: sem os degraus de recuperação.'
    : 'Plataformas de segurança religadas.';
  sim.state.toastTime = 3.2;
}
recoveryToggleButton?.addEventListener('click', event => {
  event.preventDefault();
  toggleRecoveryPlatforms();
});

const keys = {};
window.addEventListener('keydown', event => {
  if (phaseLab.enabled && event.target instanceof Element && event.target.closest('.phase-lab')) return;
  keys[event.code] = true;
  if (event.code === 'KeyR' && !event.repeat) startNewCampaign();
  if (event.code === 'KeyT' && !event.repeat) toggleRecoveryPlatforms();
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
    sim.phosphateSolubilization.render(ctx);
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

    // O objetivo da fase agora e dito pelo cartao de abertura. Manter a mesma
    // frase presa no canto o tempo todo so gastava atencao — quem esquecer tem
    // o GUIA. Fica so o numero da fase, curto.
    // No fim da fase mission deixa de ser objetivo e passa a ser a mensagem de
    // conclusao; encurtar ali apagaria justamente o que precisa ser lido.
    if (sim.state.mission) {
      missionDiv.textContent = sim.state.gameState === 'end'
        ? sim.state.mission
        : `Fase ${campaign.phase}`;
    }

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
    // O seletor manda: o HUD mostra o item escolhido, nao uma ordem de prioridade.
    const selected = sim.inoculumSelection.current;
    const totalCarregado = sim.inoculumSelection.options().length;
    // Salto duplo e Dash eram texto permanente no HUD. Sao poderes que o
    // jogador ja tem para sempre: uma vez aprendidos, o lembrete vira ruido.
    // Estoque: o que eu tenho. Numero grande, rotulo pequeno, um chip por coisa.
    const availablePhosphate = (sim.state.level.availablePhosphatePools || [])
      .reduce((sum, pool) => sum + (pool.amount || 0), 0);
    const chips = [];
    if (selected) {
      chips.push({
        kind: 'hand', icon: selected.kind === 'exudate' ? 'exudate' : 'microbe',
        label: selected.label, value: selected.count,
        key: 'E', swap: totalCarregado > 1 ? `↓ ${totalCarregado}` : '',
      });
    }
    chips.push({ icon: 'soil', label: 'Solo', value: Math.round(player.soil) });
    chips.push({ icon: 'hope', label: 'Esperança', value: Math.round(player.hope) });
    chips.push({ icon: 'exudate', label: 'Exsudatos', value: player.exudates });
    if (player.canPhosphateSolubilization && (!selected || (selected.id !== 'phos' && selected.kind !== 'phos'))) {
      chips.push({ icon: 'phosphate', label: 'Carga P', value: `${Math.round((player.phosphateCharge || 0) * 100)}%` });
    }
    renderStockChips(chips);

    // Alertas: so nascem quando ha problema, e ai tem cor propria. Antes eram
    // mais um trecho igual aos outros no meio da mesma frase.
    const alerts = [];
    if (player.fungalContamination > .01) {
      alerts.push({ text: `Contaminação fúngica ${Math.round(player.fungalContamination * 100)}%`, grave: player.fungalContamination > .4 });
    }
    if (player.infection > .01) {
      alerts.push({ text: `Infecção ${Math.round(player.infection * 100)}%`, grave: player.infection > .5 });
    }
    if (sim.meloidogyneLifecycle.infestationPercent > 2) {
      alerts.push({ text: `Meloidogyne ${sim.meloidogyneLifecycle.infestationPercent.toFixed(0)}%`, grave: sim.meloidogyneLifecycle.infestationPercent > 45 });
    }
    if (rhizoctoniaControl.activeCount) {
      alerts.push({ text: `Rhizoctonia ${rhizoctoniaControl.controlledCount}/${rhizoctoniaControl.activeCount} contida${rhizoctoniaControl.activeCount > 1 ? 's' : ''}` });
    }
    if (ralstoniaControl.focusCount) {
      alerts.push({ text: `Ralstonia ${ralstoniaControl.focusCount} · transporte ${Math.round(ralstoniaControl.averageTransport * 100)}%` });
    }
    renderAlerts(alerts);

    sim.state.level.ecologicalScore = computeEcologicalScore(objectiveEvaluator);
    renderObjectives(campaign, objectiveEvaluator);
    const center = { x: player.x + player.w/2, y: player.y + player.h };
    const nearbyRoot = (sim.state.level.platforms || []).find(p => p.type === 'root' && center.x >= p.x && center.x <= p.x + p.w && Math.abs(center.y - p.y) < 20) || null;
    updateContextPanel(sim.state, nearbyRoot, document.getElementById('hud-context'), sim);

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
        + `\nPoderes: salto ${campaign.unlocks.doubleJump ? '✓' : '—'} / dash ${campaign.unlocks.dash ? '✓' : '—'} / solubilizacao P ${campaign.unlocks.phosphateSolubilization ? '✓' : '—'} / pontes AM ${campaign.unlocks.mycorrhizaStructures ? '✓' : '—'} / raízes Azo ${campaign.unlocks.azospirillumRoots ? '✓' : '—'}`
        + `\nCâmera: ${cameraView.zoom.toFixed(2)}× [roda ou +/− | 0=restaurar]`
        + `\n${spriteDiagnostico()}`
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
        + `\nFosfato: reserva Bacillus ${(sim.bacillusBioprotection.solubilizerEntries.reduce((sum, entry) => sum + (entry.phosphateMetaboliteReserve || 0), 0)).toFixed(2)} / carga ${(player.phosphateCharge || 0).toFixed(2)} / depositos ativos ${(sim.state.level.phosphateDeposits || []).filter(deposit => !deposit.broken).length} / insoluvel ${(sim.state.level.phosphateDeposits || []).reduce((sum, deposit) => sum + (deposit.remainingPhosphate || 0), 0).toFixed(2)} / disponivel ${availablePhosphate.toFixed(2)} / transportado ${sim.phosphateSolubilization.transportedPhosphate.toFixed(2)} / raiz ${sim.phosphateSolubilization.rootPhosphateStock.toFixed(2)}`
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
    // Sem repedir o quadro aqui, qualquer excecao pontual congelava o jogo para
    // sempre: o erro era escrito no painel e o loop simplesmente parava. Agora a
    // partida continua e o erro fica registrado, visivel com Tab.
    loopErrorCount++;
    debugDiv.textContent = `ERRO (${loopErrorCount}): ${error.message}\n${error.stack}`;
    if (loopErrorCount === 1) {
      console.error('Erro no loop principal:', error);
      sim.state.toast = 'Um sistema falhou neste quadro. A partida continua; Tab mostra o erro.';
      sim.state.toastTime = 5;
    }
    // Uma falha que se repete a cada quadro nao deve inundar o console nem
    // impedir de jogar, mas tambem nao pode ser escondida.
    if (loopErrorCount < LOOP_ERROR_LIMIT) {
      requestAnimationFrame(loop);
    } else if (loopErrorCount === LOOP_ERROR_LIMIT) {
      debugDiv.classList.remove('hidden');
      debugDiv.textContent = `ERRO PERSISTENTE apos ${LOOP_ERROR_LIMIT} quadros:\n${error.message}\n${error.stack}`;
    }
  }
}

requestAnimationFrame(loop);
