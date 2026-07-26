// Runtime da murcha vascular (Ralstonia solanacearum)
// ===================================================
//
// A fase 9 continua PROCEDURAL: nenhuma plataforma é movida, nenhuma coordenada
// é fixa. O que este runtime faz é escolher, dentro das janelas de chunk que o
// manifesto declara, quais raízes recebem cada papel didático — e só ligar a
// doença quando Miguelito chega perto.
//
// Ordem das responsabilidades neste arquivo:
//   A. seleção procedural das raízes            (selectFocusRoots)
//   B. ativação por proximidade                 (updateActivation)
//   C. porta de entrada dinâmica                (updateWound)
//   D. crescimento superficial e vascular        (updateFocus)
//   E. controles diretos e indiretos            (bacillusStrength / iron pass)
//   F. disseminação                             (updateSpread)
//   G. renderização e HUD                       (render / snapshot)
//   H. contadores e objetivos                   (getters)
//
// Duas invariantes que o código todo respeita:
//   1. Ralstonia PUBLICA valores derivados nas raízes e colônias; ela nunca
//      degrada um valor-base de forma irreversível. Quem calcula rootHealth é
//      root-health-gameplay.js.
//   2. Um foco que entrou no xilema nunca volta a "neutralizado". Conter é
//      segurar, não curar.

import { W } from '../core/constants.js';
import { organismSprites } from '../render/organism-sprites.js';
import { RALSTONIA_DEFAULTS, getPhaseManifest } from './campaign-manifest.js';
import { createRandom } from './random.js';
import {
  RALSTONIA_STATE_LABELS,
  isRalstoniaRootEligible,
  ralstoniaAzospirillumClosure,
  ralstoniaNetGrowth,
  ralstoniaStageForLoads,
  ralstoniaWoundDynamics,
  ralstoniaWoundPressure,
} from './ralstonia-wilt-core.js';
import {
  canRalstoniaFocusSpread,
  chooseRalstoniaSpreadTarget,
  ralstoniaArrivalProtection,
  ralstoniaSpreadOpening,
} from './ralstonia-spread.js';

const TAU = Math.PI * 2;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function hashRoot(root, salt = 0) {
  const x = Math.round(root?.x || 0);
  const y = Math.round(root?.y || 0);
  const w = Math.round(root?.w || 0);
  const value = Math.sin((x * 12.9898 + y * 78.233 + w * 37.719 + salt * 23.17) * .001) * 43758.5453;
  return value - Math.floor(value);
}

function focusState(focus) {
  return ralstoniaStageForLoads({
    surfaceLoad: focus.surfaceLoad,
    vascularLoad: focus.vascularLoad,
    contained: focus.contained,
    neutralized: focus.neutralized,
  });
}

function stageLabel(focus) {
  return RALSTONIA_STATE_LABELS[focusState(focus)] || 'contaminação superficial';
}

// Leitura interpretativa da porta, para o HUD não mostrar só números.
export function ralstoniaDoorLabel(opening, config = RALSTONIA_DEFAULTS) {
  if (opening <= config.woundSealThreshold) return 'Entrada bloqueada';
  if (opening <= config.woundColonizationLimit) return 'Porta fechando';
  return 'Porta aberta';
}

export function createRalstoniaVascularWilt({ state, entities, inoculants, pseudomonas }) {
  const foci = [];
  const spreadEvents = [];
  let nextId = 1;
  let nextEventId = 1;
  let initialized = false;
  let lastToastAt = -Infinity;

  let neutralizedCount = 0;
  let criticalCount = 0;
  let averageTransport = 1;
  // Marcos da fase 9. `prevented` e `contained` não voltam atrás — senão o
  // objetivo piscaria. `critical` é leitura do agora (condição `live`).
  let preventedCount = 0;
  let containedCount = 0;
  let blockedSpreadCount = 0;
  let successfulSpreadCount = 0;
  let spreadEventCount = 0;

  // Marcadores didáticos: os cartões são abertos por tutorial-triggers.js, que
  // lê estas flags. Cada um dispara uma única vez por fase.
  const didactics = {
    entry: false,
    obstruction: false,
    containment: false,
    spread: false,
  };

  // Limiares e tempos vêm do manifesto da fase; RALSTONIA_DEFAULTS é o fallback.
  const CONFIG = { ...RALSTONIA_DEFAULTS, ...(getPhaseManifest(state.campaign?.phase)?.ralstonia || {}) };

  let random = createRandom(`${state.campaign?.seed || state.level?.seed || 'ralstonia'}:ralstonia-foci`);
  let spreadWindowReached = false;

  function announce(text, duration = 5, cooldown = 2.3) {
    if (state.time - lastToastAt < cooldown) return;
    state.toast = text;
    state.toastTime = duration;
    lastToastAt = state.time;
  }

  function phaseNumber() {
    return Number.isInteger(state.campaign?.phase) ? state.campaign.phase : 0;
  }

  function manifest() {
    return getPhaseManifest(phaseNumber());
  }

  function eligibleRoots() {
    return (state.level.platforms || []).filter(isRalstoniaRootEligible);
  }

  // ---------------------------------------------------------------------------
  // A. SELEÇÃO PROCEDURAL
  // ---------------------------------------------------------------------------

  // Os segmentos do manifesto entram apenas como JANELAS de seleção. Nada de
  // geometria autoral: quem está dentro da janela é o que a geração produziu.
  function segmentWindow(segmentId) {
    const segment = (manifest()?.segments || []).find(entry => entry.id === segmentId);
    if (!segment) return null;
    return { from: segment.from, to: segment.to };
  }

  function rootsInWindow(window, { minimumLogicIndex = -1, exclude = new Set() } = {}) {
    if (!window) return [];
    return eligibleRoots().filter(root => (
      !exclude.has(root)
      && (root.logicIndex ?? -1) >= Math.max(window.from, minimumLogicIndex)
      && (root.logicIndex ?? -1) <= window.to
    ));
  }

  // Escolha determinística dentro de um conjunto. Expande a janela em degraus
  // quando a geração não produziu raiz elegível ali — nunca cai em coordenada
  // fixa nem inventa plataforma.
  function pickRoot(window, { minimumLogicIndex = -1, exclude = new Set(), salt = 0 } = {}) {
    if (!window) return null;
    for (const expansion of [0, 3, 6, 12, 40]) {
      const widened = {
        from: Math.max(0, window.from - expansion),
        to: window.to + expansion,
      };
      const pool = rootsInWindow(widened, { minimumLogicIndex, exclude });
      if (!pool.length) continue;
      const ordered = pool.slice().sort((a, b) => (
        (a.logicIndex ?? 0) - (b.logicIndex ?? 0) || a.x - b.x
      ));
      const roll = clamp(random(), 0, .999);
      const index = Math.floor(roll * ordered.length);
      // Um pequeno desvio determinístico por `salt` evita que os dois papéis
      // caiam sempre na mesma posição relativa da janela.
      return ordered[(index + salt) % ordered.length];
    }
    return null;
  }

  // Recursos disponíveis antes de um chunk: usado para não colocar o foco de
  // prevenção antes de existir qualquer forma de prevenir (seção 22).
  //
  // A lista autoritativa é `level.microbeEncounters` (cada entrada traz `id` do
  // organismo e o `logicIndex` do chunk). `allies`/`agents` entram como fontes
  // complementares porque em cenários de teste e no Phase Lab elas podem ser as
  // únicas presentes. Quando uma fonte não existe o portão simplesmente não
  // restringe — nunca inventa recurso nem move o que já está ancorado.
  function resourceLogicIndexes() {
    const encounters = [];
    const push = (type, logicIndex) => {
      if (!type || !Number.isFinite(logicIndex)) return;
      encounters.push({ type, logicIndex });
    };
    for (const encounter of state.level.microbeEncounters || []) {
      push(encounter.id || encounter.type, encounter.logicIndex ?? chunkIndexAtX(encounter.x));
    }
    for (const ally of state.level.allies || []) {
      push(ally.type || ally.organism || ally.id, ally.logicIndex ?? chunkIndexAtX(ally.x));
    }
    for (const agent of state.level.agents || []) {
      push(agent.type, agent.logicIndex ?? chunkIndexAtX(agent.x));
    }
    const exudates = (state.level.exudates || [])
      .map(node => (node.logicIndex ?? chunkIndexAtX(node.x)))
      .filter(Number.isFinite);
    const ironDeposits = (state.level.ironDeposits || [])
      .map(node => (node.logicIndex ?? chunkIndexAtX(node.x)))
      .filter(Number.isFinite);
    return { encounters, exudates, ironDeposits };
  }

  function chunkIndexAtX(x) {
    let best = -1;
    for (const platform of state.level.platforms || []) {
      if (platform.recovery || platform.final) continue;
      if ((platform.x ?? 0) <= x) best = Math.max(best, platform.logicIndex ?? -1);
    }
    return best;
  }

  function earliestOf(list, predicate) {
    let best = Infinity;
    for (const entry of list) {
      if (!predicate(entry)) continue;
      const index = Number.isFinite(entry.logicIndex) ? entry.logicIndex : entry;
      if (Number.isFinite(index)) best = Math.min(best, index);
    }
    return best;
  }

  // Onde a prevenção passa a ser possível: depois do primeiro organismo capaz
  // de prevenir (Azospirillum, Bacillus ou Pseudomonas) e do primeiro exsudato.
  function preventionAvailableFrom() {
    const { encounters, exudates } = resourceLogicIndexes();
    const organism = earliestOf(encounters, entry => (
      entry.type === 'azospirillum' || entry.type === 'bacillus' || entry.type === 'pseudomonas'
    ));
    const exudate = exudates.length ? Math.min(...exudates) : Infinity;
    const gate = Math.max(
      Number.isFinite(organism) ? organism : 0,
      Number.isFinite(exudate) ? exudate : 0,
    );
    return Number.isFinite(gate) ? gate : 0;
  }

  // Onde a contenção passa a ser possível: Pseudomonas e ferro acessíveis.
  function containmentAvailableFrom() {
    const { encounters, ironDeposits } = resourceLogicIndexes();
    const organism = earliestOf(encounters, entry => entry.type === 'pseudomonas');
    const iron = ironDeposits.length ? Math.min(...ironDeposits) : Infinity;
    const gate = Math.max(
      Number.isFinite(organism) ? organism : 0,
      Number.isFinite(iron) ? iron : 0,
    );
    return Number.isFinite(gate) ? gate : 0;
  }

  function desiredFocusCount() {
    const phase = phaseNumber() || 1;
    const info = manifest();
    const allowedInLab = info?.phaseLab?.allowedPathogens;
    const scheduled = Array.isArray(allowedInLab)
      ? allowedInLab.includes('ralstonia')
      : info?.pathogenDebuts?.some(entry => entry.pathogen === 'ralstonia');
    if (!scheduled) return 0;
    const themeBoost = state.level.phaseTheme === 'infestação' ? 1 : 0;
    return clamp(1 + Math.floor((phase - 4) / 2) + themeBoost, 1, CONFIG.maximumFocusCount);
  }

  function createFocus({
    root,
    role,
    surfaceLoad,
    vascularLoad,
    woundOpening,
    spreadGeneration = 0,
    source = null,
    graceSeconds = null,
  }) {
    const offsetX = clamp(
      root.w * (.24 + hashRoot(root, 47) * .52),
      25,
      Math.max(25, root.w - 25),
    );
    const focus = {
      id: `ralstonia-${nextId++}`,
      root,
      role,
      // Ancoragem: a posição é derivada da raiz a cada quadro. Guardar só um x
      // absoluto deixava o foco flutuando quando a raiz colapsava ou deslocava.
      platformId: root.id ?? root.platformId ?? null,
      rootLogicIndex: root.logicIndex ?? -1,
      offsetX,
      x: root.x + offsetX,

      // B. ativação
      activationState: 'pending',
      activationDistance: CONFIG.activationDistance,
      activationGraceRemaining: graceSeconds ?? CONFIG.activationGraceSeconds,
      activatedAt: null,
      source,
      spreadGeneration,

      // C/D. doença
      woundOpening: clamp(woundOpening, 0, 1),
      surfaceLoad: clamp(surfaceLoad, 0, 1),
      vascularLoad: clamp(vascularLoad, 0, 1),
      surfaceNetRate: 0,
      vascularNetRate: 0,
      openingPressure: 0,
      closurePressure: 0,

      // E. controles
      azospirillumClosure: 0,
      bacillusControl: 0,
      pseudomonasControl: 0,

      // marcos
      everEnteredVascular: clamp(vascularLoad, 0, 1) >= CONFIG.vascularEntryThreshold,
      everPrevented: false,
      everContained: false,
      contained: false,
      neutralized: false,
      containHold: 0,
      neutralizeHold: 0,

      // F. disseminação
      spreadTimer: 12 + hashRoot(root, 101) * 8,
      spreadEventsUsed: 0,
      spreadCooldown: 0,
      spreadBudgetBonus: 0,
      pedagogicalSpread: false,

      // apresentação
      age: 0,
      phase: hashRoot(root, 61) * TAU,
      oozeTimer: .2 + hashRoot(root, 73) * .5,
      stressTimer: 2.4 + hashRoot(root, 89) * 2.2,
      announcedEntry: false,
      announcedVascular: false,
      announcedCritical: false,
      state: 'surface',
      vascularEfficiency: 1,
    };
    focus.state = focusState(focus);
    foci.push(focus);
    return focus;
  }

  function selectFocusRoots() {
    const count = desiredFocusCount();
    if (!count) return;
    const teaching = phaseNumber() === 9;
    const used = new Set();

    if (teaching) {
      // FOCO DE PREVENÇÃO — janela p9-surface-intro, nunca antes de existir uma
      // forma de prevenir na rota.
      const preventionRoot = pickRoot(segmentWindow('p9-surface-intro'), {
        minimumLogicIndex: preventionAvailableFrom(),
        exclude: used,
      });
      if (preventionRoot) {
        used.add(preventionRoot);
        createFocus({
          root: preventionRoot,
          role: 'prevention',
          surfaceLoad: CONFIG.introductoryFocusSurfaceLoad,
          vascularLoad: CONFIG.introductoryVascularLoad,
          woundOpening: CONFIG.preventionFocusWoundOpening,
        });
      }

      // FOCO DE CONTENÇÃO — janela p9-vascular-intro, sempre POSTERIOR ao de
      // prevenção e depois de Pseudomonas + ferro acessíveis. Começa acima do
      // limiar de entrada: só dá para conter, nunca para prevenir.
      const containmentRoot = pickRoot(segmentWindow('p9-vascular-intro'), {
        minimumLogicIndex: Math.max(
          containmentAvailableFrom(),
          (preventionRoot?.logicIndex ?? -1) + 1,
        ),
        exclude: used,
        salt: 1,
      });
      if (containmentRoot) {
        used.add(containmentRoot);
        createFocus({
          root: containmentRoot,
          role: 'containment',
          surfaceLoad: CONFIG.containmentFocusSurfaceLoad,
          vascularLoad: CONFIG.containmentFocusVascularLoad,
          woundOpening: CONFIG.containmentFocusWoundOpening,
        });
      }
    }

    // FOCOS DE PRÁTICA — no restante da fase. Também nascem `pending`: só
    // começam a doença quando o jogador chega na região.
    //
    // Na fase de ensino sobra SEMPRE uma vaga sob `maximumFocusCount`. Sem essa
    // reserva os focos semeados enchiam o teto e uma disseminação bem-sucedida
    // nunca podia criar o foco superficial — a terceira lição ficava sem a metade
    // "falhei em bloquear e nasceu um novo foco".
    const seededCap = teaching
      ? Math.min(count, Math.max(1, CONFIG.maximumFocusCount - 1))
      : count;
    const totalChunks = manifest()?.totalChunks ?? 24;
    while (foci.length < seededCap) {
      const practiceRoot = pickRoot(
        { from: teaching ? 21 : 3, to: totalChunks },
        { exclude: used, salt: foci.length },
      );
      if (!practiceRoot) break;
      used.add(practiceRoot);
      const damage = practiceRoot.rootGameplayDamage || 0;
      createFocus({
        root: practiceRoot,
        role: 'practice',
        surfaceLoad: .16 + hashRoot(practiceRoot, 17) * .1,
        vascularLoad: damage > .14 ? .055 : 0,
        woundOpening: clamp(.22 + damage * .4, 0, 1),
      });
    }
  }

  function seedFoci() {
    foci.length = 0;
    spreadEvents.length = 0;
    nextId = 1;
    nextEventId = 1;
    neutralizedCount = 0;
    criticalCount = 0;
    averageTransport = 1;
    preventedCount = 0;
    containedCount = 0;
    blockedSpreadCount = 0;
    successfulSpreadCount = 0;
    spreadEventCount = 0;
    spreadWindowReached = false;
    didactics.entry = false;
    didactics.obstruction = false;
    didactics.containment = false;
    didactics.spread = false;
    random = createRandom(`${state.campaign?.seed || state.level?.seed || 'ralstonia'}:ralstonia-foci`);

    selectFocusRoots();

    state.level.ralstoniaFoci = foci;
    state.level.ralstoniaSpreadEvents = spreadEvents;
    initialized = true;
  }

  function initialize() {
    seedFoci();
  }

  // ---------------------------------------------------------------------------
  // B. ATIVAÇÃO POR PROXIMIDADE
  // ---------------------------------------------------------------------------

  function playerCenterX() {
    return state.player.x + state.player.w / 2;
  }

  function distanceToRoot(root) {
    const x = playerCenterX();
    if (x < root.x) return root.x - x;
    if (x > root.x + root.w) return x - (root.x + root.w);
    return 0;
  }

  function playerChunkIndex() {
    let best = -1;
    for (const platform of state.level.platforms || []) {
      if (platform.recovery || platform.final) continue;
      if (playerCenterX() >= (platform.x ?? 0)) best = Math.max(best, platform.logicIndex ?? -1);
    }
    return Math.max(0, best);
  }

  // Nada de doença pendente evoluindo do outro lado do mapa: quando o jogador
  // chegasse, a lesão já seria irreversível e a lição de prevenção impossível.
  function updateActivation(focus, dt) {
    if (focus.activationState === 'active' || focus.activationState === 'neutralized') return;

    if (focus.activationState === 'pending') {
      const near = distanceToRoot(focus.root) <= focus.activationDistance
        || playerChunkIndex() >= (focus.rootLogicIndex ?? Infinity) - 1;
      if (!near) return;
      focus.activationState = 'warning';
      focus.activatedAt = state.time;
      announce(
        'Ralstonia detectada nesta região: a bactéria explora ferimentos e coloniza os vasos. Feche a porta de entrada antes que ela chegue ao xilema.',
        6, .1,
      );
      return;
    }

    // warning: o foco já é visível e o jogador pode agir, mas a doença ainda
    // não avança. O cartão didático abre aqui (tutorial-triggers lê `foci`) e a
    // graça só corre com o jogo rodando e sem tutorial aberto.
    if (state.tutorialOpen === true) return;
    focus.activationGraceRemaining = Math.max(0, focus.activationGraceRemaining - dt);
    if (focus.activationGraceRemaining <= 0) focus.activationState = 'active';
  }

  // ---------------------------------------------------------------------------
  // E. CONTROLES
  // ---------------------------------------------------------------------------

  function bacillusStrength(focus) {
    let best = 0;
    for (const film of state.level.biofilms || []) {
      if (!film.functional || film.platform !== focus.root) continue;
      const radius = Math.max(24, film.radius || film.targetRadius || 0);
      const distance = Math.abs((film.x || 0) - focus.x);
      if (distance >= radius * 1.45) continue;
      const strength = clamp(film.protectionStrength || film.growth || .25, .18, 1);
      best = Math.max(best, strength * (1 - distance / (radius * 1.45)));
    }
    return clamp(best, 0, 1);
  }

  function azospirillumClosureFor(focus) {
    return ralstoniaAzospirillumClosure({
      colonies: inoculants?.colonies || [],
      lateralRoots: state.level.azospirillumRoots || [],
      root: focus.root,
    });
  }

  // Ferro: UMA passada global por quadro.
  //
  // A versão anterior chamava `pseudomonasStrength(focus, dt)` dentro do laço de
  // focos e descontava `entry.ironReserve` a cada chamada: com dois focos no
  // alcance da mesma colônia o ferro era consumido duas vezes no mesmo quadro.
  // Agora as pressões são calculadas sem mutar nada, a demanda é somada e
  // limitada por colônia, e o desconto acontece uma única vez.
  function resolvePseudomonasControl(activeFoci, dt) {
    const strengthByFocus = new Map();
    const entries = pseudomonas?.colonyStates;
    if (!entries) return strengthByFocus;

    for (const entry of entries.values()) {
      const colony = entry.colony;
      if (!colony || colony.dormant || colony.vigor <= .04) continue;

      let demand = 0;
      let bestPressure = 0;
      for (const focus of activeFoci) {
        const sameRoot = colony.platform === focus.root;
        const distance = Math.hypot(colony.x - focus.x, colony.y - focus.root.y);
        const range = sameRoot ? 310 : 215;
        if (distance >= range) continue;
        const reserve = clamp((entry.ironReserve || 0) / .7, 0, 1);
        const pressure = clamp(
          (1 - distance / range) * colony.vigor * (.35 + reserve * .65) * (sameRoot ? 1.2 : .78),
          0, 1,
        );
        if (pressure <= .025) continue;
        demand += pressure;
        bestPressure = Math.max(bestPressure, pressure);
        strengthByFocus.set(focus.id, Math.max(strengthByFocus.get(focus.id) || 0, pressure));
      }

      if (demand <= 0) continue;
      entry.activePressure = Math.max(entry.activePressure || 0, bestPressure * .7);
      // Demanda limitada: dois focos custam mais que um, mas nunca o dobro
      // linear, e nunca mais de um desconto por quadro.
      entry.ironReserve = Math.max(0, (entry.ironReserve || 0) - dt * .0028 * clamp(demand, 0, 1.4));
    }
    return strengthByFocus;
  }

  // ---------------------------------------------------------------------------
  // Prevenção e contenção
  // ---------------------------------------------------------------------------

  function neutralize(focus) {
    if (focus.neutralized || focus.everEnteredVascular) return;
    focus.neutralized = true;
    focus.activationState = 'neutralized';
    focus.surfaceLoad = 0;
    focus.vascularLoad = 0;
    focus.vascularEfficiency = 1;
    focus.root.ralstoniaSurfaceLoad = 0;
    focus.root.ralstoniaVascularLoad = 0;
    focus.root.ralstoniaWilt = 0;
    focus.root.ralstoniaCarbonMultiplier = 1;
    focus.root.ralstoniaNutrientMultiplier = 1;
    focus.root.ralstoniaDamagePressure = 0;
    focus.root.ralstoniaWoundOpening = focus.woundOpening;
    focus.root.vascularEfficiency = Math.max(focus.root.vascularEfficiency || 0, .92);
    focus.root.recoveryBlocked = false;
    focus.state = 'neutralized';
    neutralizedCount++;
    // `everPrevented` impede contagem dupla se o foco voltasse a ser avaliado.
    if (!focus.everPrevented) {
      focus.everPrevented = true;
      preventedCount++;
    }
    // Foco neutralizado não dissemina: cancela o que estava a caminho dele.
    for (const event of spreadEvents) {
      if (event.sourceFocus !== focus) continue;
      if (event.state === 'warning' || event.state === 'traveling') {
        event.state = 'blocked';
        event.blocked = true;
        releaseTarget(event);
      }
    }
    state.player.soil += 2.2;
    state.player.hope += 2.8;
    entities.burst(focus.x, focus.root.y - 5, '#a8ffe6', 28, 150);
    announce('Infecção superficial neutralizada antes da colonização vascular.', 4.4, .8);
  }

  function contain(focus) {
    if (focus.contained || focus.neutralized) return;
    focus.contained = true;
    // Marco permanente separado do estado atual: o objetivo usa `everContained`
    // e não conta o mesmo foco duas vezes se ele escapar e for contido de novo.
    if (!focus.everContained) {
      focus.everContained = true;
      containedCount++;
    }
    state.player.soil += 1.8;
    state.player.hope += 2.4;
    entities.burst(focus.x, focus.root.y - 5, '#6ce7df', 24, 130);
    announce('Infecção vascular contida: o avanço parou. A raiz segue infectada, porém funcional.', 5.2, 1);
  }

  // ---------------------------------------------------------------------------
  // Publicação dos efeitos (sempre derivada)
  // ---------------------------------------------------------------------------

  function applyRootEffects(focus, dt) {
    const root = focus.root;
    const vascular = clamp(focus.vascularLoad, 0, 1);
    const surface = clamp(focus.surfaceLoad, 0, 1);
    const efficiency = clamp(1 - vascular * .86 - surface * .08, .08, 1);
    const wilt = clamp((vascular - .25) / .75, 0, 1);
    const bacterialDamage = clamp(vascular * .54 + surface * .04, 0, .62);

    focus.vascularEfficiency = efficiency;
    root.ralstoniaSurfaceLoad = surface;
    root.ralstoniaVascularLoad = vascular;
    root.ralstoniaWilt = wilt;
    root.ralstoniaStage = stageLabel(focus);
    root.ralstoniaDamage = bacterialDamage;
    root.ralstoniaWoundOpening = focus.woundOpening;
    // PRESSÃO, não saúde. Quem calcula rootHealth/rootDamage é
    // root-health-gameplay.js — dois donos escrevendo no mesmo campo no mesmo
    // quadro se sobrescreviam e o valor final dependia da ordem de update.
    root.ralstoniaDamagePressure = bacterialDamage;
    root.vascularEfficiency = efficiency;
    root.mycorrhizaEfficiency = efficiency;
    // MULTIPLICADORES, não valores destruídos. Antes isto era
    // `root.carbonAvailability = Math.min(anterior, novo)`, que só podia cair:
    // quando a carga vascular recuava, carbono e nutrição ficavam presos no pior
    // valor da partida. Agora quem consome multiplica pelo seu próprio base.
    root.ralstoniaCarbonMultiplier = clamp(efficiency * (1 - vascular * .18), .05, 1);
    root.ralstoniaNutrientMultiplier = clamp(efficiency * (1 - vascular * .12), .04, 1);
    root.recoveryBlocked = vascular >= .58;

    for (const colony of inoculants?.colonies || []) {
      if (colony.platform !== root) continue;
      colony.vascularStress = vascular;
      colony.vascularEfficiencyMultiplier = clamp(1 - vascular * .38, 0, 1);
      colony.vigor = clamp(colony.vigor - dt * vascular * .0035, 0, 1);
    }

    for (const site of state.level.rhizobiumNodules || []) {
      if (site.platform !== root) continue;
      // Multiplicar fixationRate/activity a cada quadro destruía o valor-base de
      // forma acumulativa e irreversível: tirar a pressão não devolvia nada.
      // O base fica intacto e o efetivo é derivado dele.
      if (!Number.isFinite(site.baseFixationRate)) site.baseFixationRate = site.fixationRate || 0;
      if (!Number.isFinite(site.baseActivity)) site.baseActivity = site.activity || 0;
      const rawFixation = site.baseFixationRate;
      const adjustedFixation = rawFixation * efficiency;
      const lostFixation = Math.max(0, rawFixation - adjustedFixation);
      site.vascularEfficiency = efficiency;
      site.effectiveActivity = site.baseActivity * efficiency;
      site.effectiveFixationRate = adjustedFixation;
      state.player.soil = Math.max(0, state.player.soil - dt * .022 * lostFixation);
      state.player.hope = Math.max(0, state.player.hope - dt * .013 * lostFixation);
    }
  }

  function standingOn(root) {
    const player = state.player;
    const centerX = player.x + player.w / 2;
    const feetY = player.y + player.h;
    return centerX >= root.x - 4
      && centerX <= root.x + root.w + 4
      && Math.abs(feetY - root.y) < 20;
  }

  function applyGameplayPressure(focus, dt) {
    if (!standingOn(focus.root) || focus.neutralized) return;
    const vascular = focus.vascularLoad;
    if (vascular > .42) {
      state.player.moveMultiplier = Math.min(state.player.moveMultiplier ?? 1, 1 - vascular * .18);
      state.player.jumpMultiplier = Math.min(state.player.jumpMultiplier ?? 1, 1 - vascular * .1);
      state.player.hope = Math.max(0, state.player.hope - dt * vascular * .15);
      state.player.soil = Math.max(0, state.player.soil - dt * vascular * .065);
    }

    if (vascular < .86) return;
    focus.stressTimer -= dt;
    if (focus.stressTimer > 0) return;
    focus.stressCycle = (focus.stressCycle || 0) + 1;
    focus.stressTimer = 3.6 + hashRoot(focus.root, 149 + focus.stressCycle) * 1.8;
    entities.damagePlayer?.(1, 'colapso de raiz com murcha vascular', {
      infection: 0,
      invuln: 1.1,
      knockbackX: (hashRoot(focus.root, 167 + (focus.stressCycle || 0)) < .5 ? -1 : 1) * 135,
      knockbackY: -185,
    });
    entities.burst(state.player.x + state.player.w / 2, focus.root.y - 2, '#b78a63', 18, 115);
    announce('Raiz em murcha crítica: o colapso vascular tornou a plataforma instável.', 4.2, 1.3);
  }

  // ---------------------------------------------------------------------------
  // C + D. PORTA E CRESCIMENTO
  // ---------------------------------------------------------------------------

  function updateWound(focus, dt) {
    const root = focus.root;
    const dynamics = ralstoniaWoundDynamics({
      currentOpening: focus.woundOpening,
      rootHealth: root.rootHealth ?? 1,
      rootDamage: Number.isFinite(root.rootGameplayDamage) ? root.rootGameplayDamage : null,
      meloidogynePressure: root.meloidogyneBurden || 0,
      rhizoctoniaPressure: Math.max(
        root.rhizoctoniaColonization || 0,
        root.rhizoctoniaPressure || 0,
      ),
      azospirillumClosure: focus.azospirillumClosure,
      dt,
      config: CONFIG,
    });
    focus.woundOpening = dynamics.nextOpening;
    focus.openingPressure = dynamics.openingPressure;
    focus.closurePressure = dynamics.closurePressure;
    focus.lesionFloor = dynamics.lesionFloor;
    root.ralstoniaWoundOpening = focus.woundOpening;
  }

  function updateFocus(focus, dt, pseudomonasByFocus) {
    if (!focus.root || !(state.level.platforms || []).includes(focus.root)) return;
    focus.age += dt;

    // Posição sempre derivada da raiz (ancoragem).
    if (Number.isFinite(focus.offsetX)) {
      focus.x = focus.root.x + focus.offsetX + (focus.root.supportOffset || 0);
    }

    updateActivation(focus, dt);

    if (focus.neutralized) {
      focus.root.vascularEfficiency = Math.min(1, (focus.root.vascularEfficiency || .92) + dt * .015);
      return;
    }

    // Controles são lidos mesmo em `warning`: o jogador precisa ver a barreira
    // e a porta reagirem antes da doença começar a correr.
    focus.azospirillumClosure = azospirillumClosureFor(focus);
    focus.bacillusControl = bacillusStrength(focus);
    focus.pseudomonasControl = pseudomonasByFocus.get(focus.id) || 0;

    // Pendente não faz NADA: não cresce, não fecha porta, não gasta recurso,
    // não pressiona a raiz.
    if (focus.activationState === 'pending') {
      focus.surfaceNetRate = 0;
      focus.vascularNetRate = 0;
      return;
    }

    updateWound(focus, dt);

    const growth = ralstoniaNetGrowth({
      surfaceLoad: focus.surfaceLoad,
      vascularLoad: focus.vascularLoad,
      woundOpening: focus.woundOpening,
      bacillusControl: focus.bacillusControl,
      pseudomonasControl: focus.pseudomonasControl,
      config: CONFIG,
    });
    focus.surfaceNetRate = growth.surfaceRate;
    focus.vascularNetRate = growth.vascularRate;
    focus.controlStrength = growth.control;

    // Em `warning` a doença está congelada: o jogador acabou de descobrir o foco.
    const progressing = focus.activationState === 'active';
    if (progressing) {
      focus.surfaceLoad = clamp(focus.surfaceLoad + dt * growth.surfaceRate, 0, 1);
      const floor = focus.everEnteredVascular ? CONFIG.minimumVascularFloorAfterEntry : 0;
      focus.vascularLoad = clamp(focus.vascularLoad + dt * growth.vascularRate, floor, 1);
    }

    const wasVascular = focus.everEnteredVascular;
    if (focus.vascularLoad >= CONFIG.vascularEntryThreshold) focus.everEnteredVascular = true;
    if (!wasVascular && focus.everEnteredVascular) {
      didactics.entry = true;
      focus.announcedEntry = true;
      announce('Entrada de Ralstonia: a bactéria atravessou uma região lesionada e alcançou os vasos da raiz.', 5.2, 1.1);
    }
    if (focus.vascularLoad >= CONFIG.obstructionThreshold) didactics.obstruction = true;

    // PREVENÇÃO. Não exige Bacillus nem Pseudomonas: porta fechada OU controle
    // direto suficiente, com a superfície praticamente zerada.
    const doorClosed = focus.woundOpening <= CONFIG.woundColonizationLimit;
    const directControl = growth.control > .3;
    if (progressing
      && !focus.everEnteredVascular
      && focus.surfaceLoad <= CONFIG.surfaceNeutralizationThreshold
      && (doorClosed || directControl)) {
      focus.neutralizeHold += dt;
      if (focus.neutralizeHold >= CONFIG.neutralizationHoldSeconds) {
        neutralize(focus);
        return;
      }
    } else {
      focus.neutralizeHold = 0;
    }

    // CONTENÇÃO. Já entrou, o avanço parou e o controle se manteve.
    if (progressing && focus.everEnteredVascular && growth.holdingVascular && growth.control > .25) {
      focus.containHold += dt;
      if (focus.containHold >= CONFIG.containmentHoldSeconds) {
        contain(focus);
        didactics.containment = true;
      }
    } else {
      focus.containHold = 0;
      // Voltou a crescer: deixa de estar contido (o estado é mantido, não dado).
      if (focus.contained && growth.vascularRate > 0) focus.contained = false;
    }

    focus.state = focusState(focus);

    if (focus.vascularLoad >= .36 && !focus.announcedVascular) {
      focus.announcedVascular = true;
      announce('Colonização vascular ativa: transporte de água, carbono e nutrientes começou a cair.', 5.3, 1.2);
    }
    if (focus.vascularLoad >= CONFIG.criticalThreshold && !focus.announcedCritical) {
      focus.announcedCritical = true;
      announce('Murcha vascular crítica: Bacillus e Pseudomonas agora apenas desaceleram o avanço; a prevenção teria sido mais eficiente.', 6, 1.2);
    }

    applyRootEffects(focus, dt);
    applyGameplayPressure(focus, dt);

    focus.oozeTimer -= dt;
    if (focus.oozeTimer <= 0 && (focus.surfaceLoad > .1 || focus.vascularLoad > .18)) {
      focus.oozeCycle = (focus.oozeCycle || 0) + 1;
      const jitter = hashRoot(focus.root, 131 + focus.oozeCycle);
      focus.oozeTimer = .3 + jitter * .55;
      entities.burst(
        focus.x + (jitter - .5) * 22,
        focus.root.y - 3,
        focus.vascularLoad > .55 ? '#d8b674' : '#f3d49a',
        3 + Math.floor(focus.vascularLoad * 5),
        38 + focus.vascularLoad * 42,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // F. DISSEMINAÇÃO
  // ---------------------------------------------------------------------------

  function occupiedRoots() {
    const set = new Set();
    for (const focus of foci) {
      if (focus.neutralized) continue;
      set.add(focus.root);
    }
    return set;
  }

  function targetedRoots() {
    const set = new Set();
    for (const event of spreadEvents) {
      if (event.state === 'warning' || event.state === 'traveling') set.add(event.targetRoot);
    }
    return set;
  }

  function releaseTarget(event) {
    if (event.targetRoot) delete event.targetRoot.ralstoniaSpreadIncoming;
  }

  function hasActiveEvent(focus) {
    return spreadEvents.some(event => (
      event.sourceFocus === focus
      && (event.state === 'warning' || event.state === 'traveling')
    ));
  }

  // Garantia pedagógica da estreia (seção 21): ao entrar na região da terceira
  // lição, UM foco vascular ativo recebe a primeira janela curta. Nenhuma
  // coordenada é criada — o alvo continua sendo escolhido proceduralmente.
  function ensureSpreadOpportunity() {
    if (phaseNumber() !== 9) return;
    const window = segmentWindow('p9-spread-intro');
    if (!window) return;
    if (playerChunkIndex() < window.from) return;

    if (!spreadWindowReached) {
      spreadWindowReached = true;
      const candidate = foci.find(focus => (
        !focus.neutralized
        && focus.everEnteredVascular
        && focus.activationState !== 'pending'
      ));
      if (candidate) {
        candidate.pedagogicalSpread = true;
        candidate.spreadTimer = Math.min(candidate.spreadTimer, CONFIG.spreadFirstOpportunitySeconds);
      }
      return;
    }

    // Oportunidade RECUPERÁVEL: se o jogador deixou o primeiro evento passar e
    // ainda não bloqueou nenhum, o foco vascular ganha uma segunda chance depois
    // de `spreadRetrySeconds`. Sem isso o objetivo de bloquear disseminação
    // poderia ficar impossível numa partida em que o primeiro aviso escapou.
    if (blockedSpreadCount > 0) return;
    if (spreadEvents.some(event => event.state === 'warning' || event.state === 'traveling')) return;
    const retry = foci.find(focus => (
      !focus.neutralized
      && focus.everEnteredVascular
      && focus.activationState === 'active'
      && focus.spreadEventsUsed > 0
      && focus.spreadBudgetBonus < 1
      && focus.spreadCooldown <= 0
    ));
    if (!retry) return;
    retry.spreadBudgetBonus = 1;
    retry.pedagogicalSpread = true;
    retry.spreadTimer = CONFIG.spreadRetrySeconds;
  }

  function openSpreadEvent(focus) {
    const target = chooseRalstoniaSpreadTarget({
      sourceRoot: focus.root,
      roots: eligibleRoots(),
      config: CONFIG,
      random: createRandom(
        `${state.campaign?.seed || 'ralstonia'}:spread:${focus.id}:${focus.spreadEventsUsed}:${focus.platformId ?? focus.rootLogicIndex}`,
      ),
      occupiedRoots: occupiedRoots(),
      targetedRoots: targetedRoots(),
    });
    // Sem alvo elegível: não cria evento, não gasta a cota, tenta de novo depois.
    if (!target) {
      focus.spreadTimer = CONFIG.spreadRetrySeconds;
      return null;
    }

    const event = {
      id: `ralstonia-spread-${nextEventId++}`,
      sourceFocusId: focus.id,
      sourceFocus: focus,
      sourceRoot: focus.root,
      targetRoot: target,
      targetPlatformId: target.id ?? target.platformId ?? null,
      state: 'warning',
      warningRemaining: CONFIG.spreadWarningSeconds,
      travelProgress: 0,
      seed: `${focus.id}:${focus.spreadEventsUsed}`,
      blocked: false,
      completed: false,
    };
    spreadEvents.push(event);
    focus.spreadEventsUsed++;
    focus.pedagogicalSpread = false;
    spreadEventCount++;
    target.ralstoniaSpreadIncoming = CONFIG.spreadWarningSeconds;
    didactics.spread = true;
    announce('Disseminação bacteriana: proteja a raiz marcada antes da chegada.', 5.4, .9);
    return event;
  }

  function resolveArrival(event) {
    const target = event.targetRoot;
    const probe = { root: target, x: target.x + target.w / 2 };
    const azo = ralstoniaAzospirillumClosure({
      colonies: inoculants?.colonies || [],
      lateralRoots: state.level.azospirillumRoots || [],
      root: target,
    });
    const bacillus = bacillusStrength(probe);
    // Pseudomonas do alvo: reusa a mesma leitura de alcance/vigor/ferro, sem
    // consumir ferro (a chegada é um instante, não um quadro de pressão).
    let pseudo = 0;
    for (const entry of pseudomonas?.colonyStates?.values() || []) {
      const colony = entry.colony;
      if (!colony || colony.dormant || colony.vigor <= .04) continue;
      const sameRoot = colony.platform === target;
      const distance = Math.hypot(colony.x - probe.x, colony.y - target.y);
      const range = sameRoot ? 310 : 215;
      if (distance >= range) continue;
      const reserve = clamp((entry.ironReserve || 0) / .7, 0, 1);
      pseudo = Math.max(pseudo, clamp(
        (1 - distance / range) * colony.vigor * (.35 + reserve * .65) * (sameRoot ? 1.2 : .78),
        0, 1,
      ));
    }

    const opening = ralstoniaSpreadOpening(target);
    const verdict = ralstoniaArrivalProtection({
      bacillus,
      pseudomonas: pseudo,
      azospirillumClosure: azo,
      rootHealth: target.rootHealth ?? 1,
      opening,
      config: CONFIG,
    });
    event.arrivalProtection = verdict.protection;
    event.arrivalOpening = opening;

    if (verdict.blocked) {
      event.state = 'blocked';
      event.blocked = true;
      blockedSpreadCount++;
      state.player.soil += 1.4;
      state.player.hope += 1.9;
      entities.burst(probe.x, target.y - 6, '#8ef0c6', 26, 145);
      announce(
        verdict.sealed
          ? 'Disseminação bloqueada: a raiz estava cicatrizada e a bactéria não encontrou porta de entrada.'
          : 'Disseminação bloqueada: a proteção biológica impediu a colonização da nova raiz.',
        5, .9,
      );
      releaseTarget(event);
      return;
    }

    // Falhou em bloquear: nasce um foco SUPERFICIAL — nunca vascular, nunca
    // crítico. O jogador ainda pode prevenir este.
    event.state = 'completed';
    event.completed = true;
    if (foci.filter(focus => !focus.neutralized).length < CONFIG.maximumFocusCount) {
      const born = createFocus({
        root: target,
        role: 'spread',
        surfaceLoad: CONFIG.spreadFocusInitialSurfaceLoad,
        vascularLoad: 0,
        woundOpening: opening,
        spreadGeneration: (event.sourceFocus?.spreadGeneration || 0) + 1,
        source: event.sourceFocusId,
        graceSeconds: CONFIG.spreadFocusGraceSeconds,
      });
      born.activationState = 'warning';
      born.activatedAt = state.time;
      successfulSpreadCount++;
      entities.burst(probe.x, target.y - 6, '#e8c27e', 24, 130);
      announce('A disseminação chegou: nasceu um novo foco superficial. Ainda dá para prevenir a entrada nesta raiz.', 5.4, .9);
    }
    releaseTarget(event);
  }

  function updateSpread(dt) {
    ensureSpreadOpportunity();

    for (const focus of foci) {
      focus.spreadCooldown = Math.max(0, focus.spreadCooldown - dt);
      if (!canRalstoniaFocusSpread(focus, {
        config: CONFIG,
        activeEventForFocus: hasActiveEvent(focus),
      })) continue;
      if (state.tutorialOpen === true) continue;
      focus.spreadTimer -= dt;
      if (focus.spreadTimer > 0) continue;
      focus.spreadTimer = CONFIG.spreadRetrySeconds;
      openSpreadEvent(focus);
    }

    for (const event of spreadEvents) {
      if (event.state === 'warning') {
        if (state.tutorialOpen === true) continue;
        event.warningRemaining = Math.max(0, event.warningRemaining - dt);
        if (event.targetRoot) event.targetRoot.ralstoniaSpreadIncoming = event.warningRemaining;
        if (event.warningRemaining <= 0) {
          event.state = 'traveling';
          event.travelProgress = 0;
        }
        continue;
      }
      if (event.state === 'traveling') {
        if (state.tutorialOpen === true) continue;
        event.travelProgress = clamp(
          event.travelProgress + dt / Math.max(.4, CONFIG.spreadTravelSeconds),
          0, 1,
        );
        if (event.targetRoot) {
          event.targetRoot.ralstoniaSpreadIncoming = (1 - event.travelProgress)
            * CONFIG.spreadTravelSeconds;
        }
        if (event.travelProgress >= 1) resolveArrival(event);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // UPDATE
  // ---------------------------------------------------------------------------

  function update(dt) {
    if (state.gameState !== 'play') return;
    if (!initialized) seedFoci();

    // Uma passada global de ferro antes dos focos: consumo único por colônia.
    const activeFoci = foci.filter(focus => (
      !focus.neutralized && focus.activationState !== 'pending'
    ));
    const pseudomonasByFocus = resolvePseudomonasControl(activeFoci, dt);

    criticalCount = 0;
    let transportSum = 0;
    let active = 0;
    for (const focus of foci) {
      updateFocus(focus, dt, pseudomonasByFocus);
      if (focus.neutralized) continue;
      active++;
      transportSum += focus.vascularEfficiency;
      if (focus.vascularLoad >= CONFIG.criticalThreshold) criticalCount++;
    }
    averageTransport = active ? transportSum / active : 1;

    updateSpread(dt);
  }

  // ---------------------------------------------------------------------------
  // G. RENDERIZAÇÃO
  // ---------------------------------------------------------------------------

  function drawBacteria(ctx, focus) {
    const root = focus.root;
    const surface = clamp(focus.surfaceLoad, 0, 1);
    const vascular = clamp(focus.vascularLoad, 0, 1);
    if (organismSprites.draw(ctx, 'ralstonia', {
      x: focus.x,
      y: root.y + 2,
      height: 58 + surface * 12,
      time: state.time,
      phase: focus.phase,
      alpha: focus.neutralized ? .38 : .72 + surface * .28,
      anchorY: .88,
      flipX: Math.sin(focus.phase) < 0,
    })) return;
    const count = 5 + Math.floor(surface * 11 + vascular * 9);
    for (let i = 0; i < count; i++) {
      const angle = focus.phase + i * 2.399 + state.time * (.18 + (i % 3) * .04);
      const spread = 8 + (i % 5) * (3 + surface * 4);
      const depth = vascular > .05
        ? 4 + (i % 6) / 5 * Math.min(root.h - 10, 18 + vascular * 34)
        : -3 + Math.sin(angle) * 3;
      const x = focus.x + Math.cos(angle) * spread * (1 + vascular * .7);
      const y = root.y + depth;
      const rod = 2.4 + vascular * 1.5;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle * .7);
      ctx.fillStyle = focus.neutralized ? 'rgba(168,255,230,.25)' : i % 2 ? '#e8c27e' : '#f1dfa8';
      ctx.strokeStyle = focus.neutralized ? 'rgba(168,255,230,.3)' : 'rgba(107,69,44,.8)';
      ctx.lineWidth = .7;
      ctx.beginPath();
      ctx.roundRect(-rod, -1.2, rod * 2, 2.4, 1.2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawVascularBlockage(ctx, focus) {
    const root = focus.root;
    const vascular = clamp(focus.vascularLoad, 0, 1);
    if (vascular <= .045) return;
    const span = clamp(34 + root.w * vascular * .62, 34, root.w - 18);
    const left = clamp(focus.x - span / 2, root.x + 9, root.x + root.w - span - 9);
    const vesselCount = 3 + Math.floor(vascular * 5);

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(root.x, root.y, root.w, root.h, 14);
    ctx.clip();

    const stain = ctx.createLinearGradient(left, root.y, left + span, root.y + root.h);
    stain.addColorStop(0, 'rgba(93,55,36,0)');
    stain.addColorStop(.22, `rgba(82,48,30,${.12 + vascular * .22})`);
    stain.addColorStop(.5, `rgba(43,28,25,${.24 + vascular * .38})`);
    stain.addColorStop(.8, `rgba(104,67,37,${.1 + vascular * .2})`);
    stain.addColorStop(1, 'rgba(93,55,36,0)');
    ctx.fillStyle = stain;
    ctx.fillRect(left, root.y, span, root.h);

    for (let i = 0; i < vesselCount; i++) {
      const y = root.y + 12 + i / Math.max(1, vesselCount - 1) * Math.max(8, root.h - 24);
      const blockage = .18 + vascular * .74;
      ctx.strokeStyle = `rgba(48,29,24,${.24 + vascular * .58})`;
      ctx.lineWidth = 1.2 + vascular * 2.1;
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.bezierCurveTo(
        left + span * .3, y + Math.sin(i + focus.phase) * 6,
        left + span * .68, y - 4,
        left + span, y + Math.cos(i + focus.phase) * 4,
      );
      ctx.stroke();

      ctx.strokeStyle = `rgba(236,194,119,${.12 + (1 - blockage) * .45})`;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 5 + vascular * 8]);
      ctx.beginPath();
      ctx.moveTo(left, y - 2);
      ctx.lineTo(left + span, y - 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  }

  // Estado do foco, desenhado sobre a raiz.
  //
  // ATENÇÃO: esta função roda DENTRO do save()/translate() de render(). Ela
  // precisa fechar exatamente os save() que abrir. Uma versão anterior chamava
  // ctx.restore() sem nenhum save() próprio: isso desempilhava a translação da
  // câmera e todo sistema desenhado DEPOIS da Ralstonia perdia a referência.
  function drawStatus(ctx, focus) {
    if (focus.neutralized && focus.age > 10) return;
    if (focus.activationState === 'pending') return;
    const root = focus.root;
    const x = focus.x;
    const y = root.y + Math.min(root.h - 14, 34);
    const width = Math.min(132, Math.max(96, root.w * .62));
    const surface = clamp(focus.surfaceLoad, 0, 1);
    const vascular = clamp(focus.vascularLoad, 0, 1);
    const opening = clamp(focus.woundOpening, 0, 1);
    const left = x - width / 2;

    ctx.save();

    // Trilho 1 — carga superficial (o que está FORA do tecido).
    ctx.fillStyle = 'rgba(6,20,24,.72)';
    ctx.fillRect(left, y, width, 3.5);
    ctx.fillStyle = 'rgba(232,194,126,.78)';
    ctx.fillRect(left, y, width * surface, 3.5);

    // Trilho 2 — carga vascular (o que já está DENTRO).
    ctx.fillStyle = 'rgba(6,20,24,.72)';
    ctx.fillRect(left, y + 4.5, width, 5);
    ctx.fillStyle = focus.neutralized ? 'rgba(142,240,198,.7)'
      : vascular >= CONFIG.criticalThreshold ? '#ff6f91'
      : vascular >= CONFIG.obstructionThreshold ? '#e8905e'
      : vascular >= CONFIG.vascularEntryThreshold ? '#e8c27e'
      : 'rgba(232,194,126,.35)';
    ctx.fillRect(left, y + 4.5, width * Math.max(vascular, focus.neutralized ? 0 : .03), 5);
    // Contido: marca de crescimento interrompido, com a carga residual visível.
    if (focus.contained && !focus.neutralized) {
      ctx.strokeStyle = 'rgba(108,231,223,.95)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(left + width * vascular, y + 3.4);
      ctx.lineTo(left + width * vascular, y + 11);
      ctx.stroke();
    }

    // Trilho 3 — PORTA DE ENTRADA. Verde-azulado quando está fechando por
    // Azospirillum/cicatrização; âmbar quando continua aberta.
    const doorY = y + 10.5;
    ctx.fillStyle = 'rgba(6,20,24,.6)';
    ctx.fillRect(left, doorY, width, 2.5);
    ctx.fillStyle = opening <= CONFIG.woundSealThreshold ? 'rgba(142,240,198,.95)'
      : opening <= CONFIG.woundColonizationLimit ? 'rgba(126,214,205,.9)'
      : 'rgba(255,150,110,.85)';
    ctx.fillRect(left, doorY, width * Math.max(.02, opening), 2.5);

    // Marcas de controle: Bacillus (contorno de biofilme) e Pseudomonas (ferro).
    if (focus.bacillusControl > .02) {
      ctx.strokeStyle = 'rgba(168,255,230,.85)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(left, doorY + 4.5);
      ctx.lineTo(left + width * focus.bacillusControl, doorY + 4.5);
      ctx.stroke();
    }
    if (focus.pseudomonasControl > .02) {
      ctx.fillStyle = 'rgba(244,162,97,.9)';
      const dots = Math.max(1, Math.round(focus.pseudomonasControl * 7));
      for (let i = 0; i < dots; i++) {
        ctx.beginPath();
        ctx.arc(left + 2 + i * 5.5, doorY + 8, 1.5, 0, TAU);
        ctx.fill();
      }
    }
    if (focus.azospirillumClosure > .02) {
      ctx.strokeStyle = 'rgba(126,214,205,.9)';
      ctx.lineWidth = 1.2;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(left, doorY + 2.2);
      ctx.lineTo(left + width * focus.azospirillumClosure, doorY + 2.2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.font = '700 9px Inter,system-ui';
    ctx.textAlign = 'center';
    ctx.fillStyle = focus.neutralized ? 'rgba(168,255,230,.9)' : 'rgba(245,226,190,.92)';
    ctx.fillText(stageLabel(focus), x, y - 10);
    ctx.font = '600 8px Inter,system-ui';
    ctx.fillStyle = opening <= CONFIG.woundColonizationLimit
      ? 'rgba(142,240,198,.9)'
      : 'rgba(255,178,150,.9)';
    ctx.fillText(ralstoniaDoorLabel(opening, CONFIG), x, y - 1.5);

    ctx.restore();
  }

  function drawSpreadEvent(ctx, event) {
    if (event.state !== 'warning' && event.state !== 'traveling') return;
    const source = event.sourceRoot;
    const target = event.targetRoot;
    if (!source || !target) return;
    const x0 = source.x + source.w / 2;
    const y0 = source.y - 4;
    const x1 = target.x + target.w / 2;
    const y1 = target.y - 4;

    ctx.save();

    // Fluxo entre origem e alvo — pontilhado no aviso, contínuo na viagem.
    ctx.strokeStyle = event.state === 'warning'
      ? 'rgba(255,178,150,.5)'
      : 'rgba(232,194,126,.85)';
    ctx.lineWidth = event.state === 'warning' ? 1.2 : 2;
    if (event.state === 'warning') ctx.setLineDash([5, 7]);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo((x0 + x1) / 2, Math.min(y0, y1) - 58, x1, y1);
    ctx.stroke();
    ctx.setLineDash([]);

    // Alvo claramente marcado.
    ctx.strokeStyle = 'rgba(255,111,145,.9)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.roundRect(target.x - 3, target.y - 5, target.w + 6, target.h + 8, 15);
    ctx.stroke();
    ctx.setLineDash([]);

    // Contagem regressiva discreta.
    const remaining = event.state === 'warning'
      ? event.warningRemaining
      : (1 - event.travelProgress) * CONFIG.spreadTravelSeconds;
    ctx.font = '700 10px Inter,system-ui';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,196,180,.95)';
    ctx.fillText(`${remaining.toFixed(1)}s`, x1, target.y - 12);

    // Partículas viajando: a bactéria não teleporta.
    if (event.state === 'traveling') {
      const t = event.travelProgress;
      for (let i = 0; i < 4; i++) {
        const p = clamp(t - i * .07, 0, 1);
        const mx = (1 - p) * (1 - p) * x0 + 2 * (1 - p) * p * ((x0 + x1) / 2) + p * p * x1;
        const my = (1 - p) * (1 - p) * y0
          + 2 * (1 - p) * p * (Math.min(y0, y1) - 58)
          + p * p * y1;
        ctx.fillStyle = `rgba(232,194,126,${.85 - i * .18})`;
        ctx.beginPath();
        ctx.arc(mx, my, 3 - i * .5, 0, TAU);
        ctx.fill();
      }
    }

    ctx.restore();
  }

  function render(ctx) {
    if (!foci.length && !spreadEvents.length) return;
    ctx.save();
    ctx.translate(-state.cameraX, 0);
    for (const event of spreadEvents) drawSpreadEvent(ctx, event);
    for (const focus of foci) {
      if (focus.activationState === 'pending') continue;
      if (focus.root.x + focus.root.w < state.cameraX - 100 || focus.root.x > state.cameraX + W + 100) continue;
      drawVascularBlockage(ctx, focus);
      drawBacteria(ctx, focus);
      drawStatus(ctx, focus);
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Snapshot para HUD e debug
  // ---------------------------------------------------------------------------

  function focusForRoot(root) {
    return foci.find(focus => focus.root === root && !focus.neutralized)
      || foci.find(focus => focus.root === root)
      || null;
  }

  function incomingEventForRoot(root) {
    return spreadEvents.find(event => (
      event.targetRoot === root && (event.state === 'warning' || event.state === 'traveling')
    )) || null;
  }

  function rootSnapshot(root) {
    const focus = focusForRoot(root);
    const incoming = incomingEventForRoot(root);
    if (!focus && !incoming) return null;
    const snapshot = {
      hasFocus: Boolean(focus),
      stage: focus ? focusState(focus) : null,
      stageLabel: focus ? stageLabel(focus) : null,
      doorLabel: focus ? ralstoniaDoorLabel(focus.woundOpening, CONFIG) : null,
      opening: focus ? focus.woundOpening : ralstoniaSpreadOpening(root),
      surfaceLoad: focus ? focus.surfaceLoad : 0,
      vascularLoad: focus ? focus.vascularLoad : 0,
      transport: focus ? (focus.vascularEfficiency ?? 1) : 1,
      azospirillumClosure: focus ? focus.azospirillumClosure : 0,
      bacillusControl: focus ? focus.bacillusControl : 0,
      pseudomonasControl: focus ? focus.pseudomonasControl : 0,
      contained: Boolean(focus?.contained),
      neutralized: Boolean(focus?.neutralized),
      activationState: focus ? focus.activationState : null,
      incomingSeconds: null,
      incomingProtection: null,
    };
    if (incoming) {
      snapshot.incomingSeconds = incoming.state === 'warning'
        ? incoming.warningRemaining
        : (1 - incoming.travelProgress) * CONFIG.spreadTravelSeconds;
      const azo = ralstoniaAzospirillumClosure({
        colonies: inoculants?.colonies || [],
        lateralRoots: state.level.azospirillumRoots || [],
        root,
      });
      snapshot.incomingProtection = ralstoniaArrivalProtection({
        bacillus: bacillusStrength({ root, x: root.x + root.w / 2 }),
        pseudomonas: 0,
        azospirillumClosure: azo,
        rootHealth: root.rootHealth ?? 1,
        opening: ralstoniaSpreadOpening(root),
        config: CONFIG,
      }).protection;
    }
    return snapshot;
  }

  function debugLines() {
    const lines = foci.map(focus => [
      focus.id,
      `#${focus.rootLogicIndex}`,
      focus.activationState,
      `S${focus.surfaceLoad.toFixed(2)}`,
      `V${focus.vascularLoad.toFixed(2)}`,
      `porta${focus.woundOpening.toFixed(2)}`,
      `azo${focus.azospirillumClosure.toFixed(2)}`,
      `bac${focus.bacillusControl.toFixed(2)}`,
      `pse${focus.pseudomonasControl.toFixed(2)}`,
      `dS${focus.surfaceNetRate.toFixed(3)}`,
      `dV${focus.vascularNetRate.toFixed(3)}`,
      focus.contained ? 'contido' : '',
      focus.everContained ? 'jaContido' : '',
      `t${focus.spreadTimer.toFixed(1)}`,
      `ev${focus.spreadEventsUsed}`,
      `g${focus.spreadGeneration}`,
    ].filter(Boolean).join(' '));
    for (const event of spreadEvents) {
      lines.push([
        event.id,
        event.state,
        `alvo#${event.targetRoot?.logicIndex ?? '?'}`,
        event.state === 'warning' ? `aviso${event.warningRemaining.toFixed(1)}` : '',
        event.state === 'traveling' ? `viagem${event.travelProgress.toFixed(2)}` : '',
      ].filter(Boolean).join(' '));
    }
    lines.push(`bloqueadas=${blockedSpreadCount} sucedidas=${successfulSpreadCount}`);
    return lines;
  }

  function clearRootMarkers() {
    for (const root of state.level.platforms || []) {
      delete root.ralstoniaSurfaceLoad;
      delete root.ralstoniaVascularLoad;
      delete root.ralstoniaWilt;
      delete root.ralstoniaStage;
      delete root.ralstoniaDamage;
      delete root.ralstoniaDamagePressure;
      delete root.ralstoniaWoundOpening;
      delete root.ralstoniaCarbonMultiplier;
      delete root.ralstoniaNutrientMultiplier;
      delete root.ralstoniaSpreadIncoming;
      delete root.vascularEfficiency;
      delete root.mycorrhizaEfficiency;
      delete root.recoveryBlocked;
      // Marcador autoral legado: some junto, senão uma raiz de partida antiga
      // continuaria com a porta presa em .45.
      delete root.ralstoniaEntryWound;
    }
    for (const colony of inoculants?.colonies || []) {
      delete colony.vascularStress;
      delete colony.vascularEfficiencyMultiplier;
    }
  }

  function reset() {
    clearRootMarkers();
    foci.length = 0;
    spreadEvents.length = 0;
    state.level.ralstoniaFoci = foci;
    state.level.ralstoniaSpreadEvents = spreadEvents;
    nextId = 1;
    nextEventId = 1;
    initialized = false;
    lastToastAt = -Infinity;
    neutralizedCount = 0;
    criticalCount = 0;
    averageTransport = 1;
    preventedCount = 0;
    containedCount = 0;
    blockedSpreadCount = 0;
    successfulSpreadCount = 0;
    spreadEventCount = 0;
    spreadWindowReached = false;
    didactics.entry = false;
    didactics.obstruction = false;
    didactics.containment = false;
    didactics.spread = false;
  }

  // Atuadores de laboratorio. Existem para o Phase Lab e para os testes poderem
  // montar QUALQUER situacao da doenca sem esperar o tempo de jogo: criar foco em
  // cada estagio, mexer na porta, ligar controles, forcar/limpar disseminacao.
  // Nenhum deles e usado pelo jogo normal.
  const lab = {
    spawnFocus({
      root = null,
      logicIndex = null,
      stage = 'pending',
      woundOpening = null,
      spreadGeneration = 0,
    } = {}) {
      const target = root
        || eligibleRoots().find(candidate => candidate.logicIndex === logicIndex)
        || eligibleRoots()[0];
      if (!target) return null;
      const loads = {
        pending: { surface: CONFIG.introductoryFocusSurfaceLoad, vascular: 0 },
        surface: { surface: CONFIG.introductoryFocusSurfaceLoad, vascular: 0 },
        vascular: { surface: CONFIG.containmentFocusSurfaceLoad, vascular: CONFIG.vascularColonizationThreshold + .04 },
        obstructed: { surface: .3, vascular: CONFIG.obstructionThreshold + .02 },
        critical: { surface: .3, vascular: CONFIG.criticalThreshold + .03 },
      }[stage] || { surface: .2, vascular: 0 };
      const focus = createFocus({
        root: target,
        role: 'lab',
        surfaceLoad: loads.surface,
        vascularLoad: loads.vascular,
        woundOpening: Number.isFinite(woundOpening) ? woundOpening : CONFIG.preventionFocusWoundOpening,
        spreadGeneration,
      });
      if (stage !== 'pending') {
        focus.activationState = 'active';
        focus.activationGraceRemaining = 0;
        focus.activatedAt = state.time;
      }
      return focus;
    },
    setFocus(focus, patch = {}) {
      if (!focus) return null;
      Object.assign(focus, patch);
      if (focus.vascularLoad >= CONFIG.vascularEntryThreshold) focus.everEnteredVascular = true;
      focus.state = focusState(focus);
      return focus;
    },
    forceSpread(focus) {
      if (!focus) return null;
      focus.pedagogicalSpread = true;
      focus.spreadTimer = 0;
      return focus;
    },
    openSpreadEvent,
    resolveNextArrival() {
      const event = spreadEvents.find(entry => (
        entry.state === 'warning' || entry.state === 'traveling'
      ));
      if (!event) return null;
      event.state = 'traveling';
      event.travelProgress = 1;
      resolveArrival(event);
      return event;
    },
    clearSpreadEvents() {
      for (const event of spreadEvents) releaseTarget(event);
      spreadEvents.length = 0;
    },
    activateAll() {
      for (const focus of foci) {
        if (focus.neutralized) continue;
        focus.activationState = 'active';
        focus.activationGraceRemaining = 0;
      }
    },
  };

  return {
    get focusCount() { return foci.filter(focus => !focus.neutralized).length; },
    get activeFocusCount() {
      return foci.filter(focus => focus.activationState === 'active' && !focus.neutralized).length;
    },
    get pendingFocusCount() {
      return foci.filter(focus => focus.activationState === 'pending').length;
    },
    get neutralizedCount() { return neutralizedCount; },
    get preventedCount() { return preventedCount; },
    get containedCount() { return containedCount; },
    get criticalCount() { return criticalCount; },
    get blockedSpreadCount() { return blockedSpreadCount; },
    get successfulSpreadCount() { return successfulSpreadCount; },
    get spreadEventCount() { return spreadEventCount; },
    get activeSpreadEvents() {
      return spreadEvents.filter(event => event.state === 'warning' || event.state === 'traveling');
    },
    get preservedVascularRootCount() {
      return foci.filter(focus => (
        (focus.vascularEfficiency ?? 1) >= .65
        && (focus.root?.rootHealth ?? 1) >= .55
        && focus.state !== 'critical'
      )).length;
    },
    get averageTransport() { return averageTransport; },
    get foci() { return foci; },
    get spreadEvents() { return spreadEvents; },
    get didactics() { return didactics; },
    get config() { return CONFIG; },
    rootSnapshot,
    debugLines,
    lab,
    initialize,
    update,
    render,
    reset,
  };
}
