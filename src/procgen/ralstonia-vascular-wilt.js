import { W } from '../core/constants.js';
import { organismSprites } from '../render/organism-sprites.js';
import { RALSTONIA_DEFAULTS, getPhaseManifest } from './campaign-manifest.js';
import {
  RALSTONIA_STATE_LABELS,
  ralstoniaNetGrowth,
  ralstoniaStageForLoads,
  ralstoniaVascularEfficiency,
  ralstoniaWoundPressure,
} from './ralstonia-wilt-core.js';

const TAU = Math.PI * 2;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function hashRoot(root, salt = 0) {
  const x = Math.round(root.x || 0);
  const y = Math.round(root.y || 0);
  const w = Math.round(root.w || 0);
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

function rootEligible(root) {
  return root.type === 'root'
    && !root.final
    && !root.recovery
    && !root.mycorrhizaStructure
    && !root.azospirillumStructure
    && (root.logicIndex ?? -1) >= 3
    && root.w >= 120;
}

export function createRalstoniaVascularWilt({ state, entities, inoculants, pseudomonas }) {
  const foci = [];
  let nextId = 1;
  let initialized = false;
  let lastToastAt = -Infinity;
  let neutralizedCount = 0;
  let criticalCount = 0;
  let averageTransport = 1;
  // Contadores dos objetivos da fase 9. `prevented` e `contained` sao marcos:
  // uma vez conquistados nao voltam atras, senao o objetivo piscaria.
  let preventedCount = 0;
  let containedCount = 0;

  // Limiares e tempos vem do manifesto da fase; RALSTONIA_DEFAULTS e o fallback.
  const CONFIG = { ...RALSTONIA_DEFAULTS, ...(getPhaseManifest(state.campaign?.phase)?.ralstonia || {}) };

  function announce(text, duration = 5, cooldown = 2.3) {
    if (state.time - lastToastAt < cooldown) return;
    state.toast = text;
    state.toastTime = duration;
    lastToastAt = state.time;
  }

  function roots() {
    return (state.level.platforms || []).filter(rootEligible);
  }

  function desiredFocusCount() {
    const phase = state.campaign?.phase || 1;
    const manifest = getPhaseManifest(phase);
    const allowedInLab = manifest?.phaseLab?.allowedPathogens;
    const scheduled = Array.isArray(allowedInLab)
      ? allowedInLab.includes('ralstonia')
      : manifest?.pathogenDebuts?.some(entry => entry.pathogen === 'ralstonia');
    if (!scheduled) return 0;
    const themeBoost = state.level.phaseTheme === 'infestação' ? 1 : 0;
    return clamp(1 + Math.floor((phase - 4) / 2) + themeBoost, 1, 3);
  }

  function seedFoci() {
    foci.length = 0;
    nextId = 1;
    neutralizedCount = 0;
    criticalCount = 0;
    averageTransport = 1;
    preventedCount = 0;
    containedCount = 0;

    const count = desiredFocusCount();
    if (!count) {
      state.level.ralstoniaFoci = foci;
      initialized = true;
      return;
    }

    const candidates = roots()
      .map(root => ({
        root,
        score: hashRoot(root, 31 + (state.campaign?.phase || 1) * 17),
      }))
      .sort((a, b) => b.score - a.score);

    const selected = [];
    for (const candidate of candidates) {
      if (selected.some(entry => Math.abs(entry.root.x - candidate.root.x) < 720)) continue;
      selected.push(candidate);
      if (selected.length >= count) break;
    }
    for (const candidate of candidates) {
      if (selected.length >= count) break;
      if (!selected.includes(candidate)) selected.push(candidate);
    }

    for (const { root, score } of selected) {
      const x = clamp(
        root.x + root.w * (.24 + hashRoot(root, 47) * .52),
        root.x + 25,
        root.x + root.w - 25,
      );
      // A fase 9 precisa ensinar as DUAS licoes, e elas exigem focos diferentes:
      // o primeiro nasce so na superficie (da para PREVENIR) e o segundo ja
      // entrou no xilema (so da para CONTER). Sem isso, fechar o objetivo de
      // contencao exigiria deixar uma infeccao entrar de proposito.
      const ensina = (state.campaign?.phase || 0) === 9;
      const indice = foci.length;
      const focoDeContencao = ensina && indice === 1;
      const initialSurface = focoDeContencao
        ? CONFIG.containmentFocusSurfaceLoad
        : ensina && indice === 0
          ? CONFIG.introductoryFocusSurfaceLoad
          : .16 + score * .1;
      const initialVascular = focoDeContencao
        ? CONFIG.containmentFocusVascularLoad
        : ensina && indice === 0
          ? CONFIG.introductoryVascularLoad
          : (root.rootGameplayDamage || 0) > .14 ? .055 : 0;
      // A raiz do tutorial precisa de uma porta de entrada propria: assim a
      // estreia nao depende de ja haver Meloidogyne ou Rhizoctonia em cena.
      if (ensina && indice <= 1 && !Number.isFinite(root.ralstoniaEntryWound)) {
        root.ralstoniaEntryWound = .45;
      }
      foci.push({
        id: `ralstonia-${nextId++}`,
        root,
        // Ancoragem: a posicao e derivada da raiz a cada quadro. Guardar so um x
        // absoluto deixava o foco flutuando quando a raiz colapsava ou deslocava.
        platformId: root.id ?? root.platformId ?? null,
        rootLogicIndex: root.logicIndex ?? -1,
        offsetX: x - root.x,
        x,
        surfaceLoad: initialSurface,
        vascularLoad: initialVascular,
        age: 0,
        phase: hashRoot(root, 61) * TAU,
        oozeTimer: .2 + hashRoot(root, 73) * .5,
        stressTimer: 2.4 + hashRoot(root, 89) * 2.2,
        spreadTimer: 15 + hashRoot(root, 101) * 8,
        announcedEntry: false,
        announcedVascular: false,
        announcedCritical: false,
        neutralized: false,
        contained: false,
        everEnteredVascular: initialVascular >= CONFIG.vascularEntryThreshold,
        containHold: 0,
        neutralizeHold: 0,
        state: 'surface',
        dormant: false,
        bacillusControl: 0,
        pseudomonasControl: 0,
        vascularEfficiency: 1,
      });
    }

    state.level.ralstoniaFoci = foci;
    initialized = true;
    announce(
      'Ralstonia detectada: a bactéria explora ferimentos, coloniza vasos e pode causar murcha. Proteja cedo com Bacillus e Pseudomonas.',
      6.2,
      .1,
    );
  }

  function initialize() {
    seedFoci();
  }

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

  function pseudomonasStrength(focus, dt) {
    let best = 0;
    const entries = pseudomonas?.colonyStates;
    if (!entries) return 0;
    for (const entry of entries.values()) {
      const colony = entry.colony;
      if (!colony || colony.dormant || colony.vigor <= .04) continue;
      const sameRoot = colony.platform === focus.root;
      const distance = Math.hypot(colony.x - focus.x, colony.y - focus.root.y);
      const range = sameRoot ? 310 : 215;
      if (distance >= range) continue;
      const reserve = clamp((entry.ironReserve || 0) / .7, 0, 1);
      const pressure = clamp((1 - distance / range) * colony.vigor * (.35 + reserve * .65) * (sameRoot ? 1.2 : .78), 0, 1);
      if (pressure <= .025) continue;
      best = Math.max(best, pressure);
      entry.activePressure = Math.max(entry.activePressure || 0, pressure * .7);
      entry.ironReserve = Math.max(0, (entry.ironReserve || 0) - dt * .0028 * pressure);
    }
    return clamp(best, 0, 1);
  }

  const woundPressure = ralstoniaWoundPressure;

  // Prevencao: so vale para um foco que NUNCA entrou no xilema. Depois da
  // entrada nao existe cura — o maximo e conter.
  function neutralize(focus) {
    if (focus.neutralized || focus.everEnteredVascular) return;
    focus.neutralized = true;
    focus.surfaceLoad = 0;
    focus.vascularLoad = 0;
    focus.vascularEfficiency = 1;
    focus.root.ralstoniaSurfaceLoad = 0;
    focus.root.ralstoniaVascularLoad = 0;
    focus.root.ralstoniaWilt = 0;
    focus.root.vascularEfficiency = Math.max(focus.root.vascularEfficiency || 0, .92);
    focus.state = 'neutralized';
    neutralizedCount++;
    preventedCount++;
    state.player.soil += 2.2;
    state.player.hope += 2.8;
    entities.burst(focus.x, focus.root.y - 5, '#a8ffe6', 28, 150);
    announce('Infecção superficial neutralizada antes da colonização vascular.', 4.4, .8);
  }

  // Contencao: a infeccao ja entrou, mas o controle sustentado zerou o avanco.
  // A carga NAO volta a zero — fica no piso e a raiz segue infectada e funcional.
  function contain(focus) {
    if (focus.contained || focus.neutralized) return;
    focus.contained = true;
    containedCount++;
    state.player.soil += 1.8;
    state.player.hope += 2.4;
    entities.burst(focus.x, focus.root.y - 5, '#6ce7df', 24, 130);
    announce('Infecção vascular contida: o avanço parou. A raiz segue infectada, porém funcional.', 5.2, 1);
  }

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
    // PRESSAO, nao saude. Quem calcula rootHealth/rootDamage e
    // root-health-gameplay.js — dois donos escrevendo no mesmo campo no mesmo
    // frame se sobrescreviam e o valor final dependia da ordem de update.
    root.ralstoniaDamagePressure = bacterialDamage;
    root.vascularEfficiency = efficiency;
    root.carbonAvailability = clamp(Math.min(root.carbonAvailability ?? 1, efficiency * (1 - vascular * .18)), .05, 1);
    root.nutrientEfficiency = clamp(Math.min(root.nutrientEfficiency ?? 1, efficiency * (1 - vascular * .12)), .04, 1);
    root.mycorrhizaEfficiency = efficiency;
    root.recoveryBlocked = vascular >= .58;

    for (const colony of inoculants?.colonies || []) {
      if (colony.platform !== root) continue;
      colony.vascularStress = vascular;
      colony.vigor = clamp(colony.vigor - dt * vascular * .0035, 0, 1);
      colony.rechargeIntensity = clamp((colony.rechargeIntensity || 0) * (1 - vascular * .38), 0, 1);
    }

    for (const site of state.level.rhizobiumNodules || []) {
      if (site.platform !== root) continue;
      // Multiplicar fixationRate/activity a cada frame destruia o valor-base de
      // forma acumulativa e irreversivel: tirar a pressao nao devolvia nada.
      // Agora o base fica intacto e o efetivo e derivado dele.
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

  function updateFocus(focus, dt) {
    if (!focus.root || !(state.level.platforms || []).includes(focus.root)) return;
    focus.age += dt;
    if (focus.neutralized) {
      focus.root.vascularEfficiency = Math.min(1, (focus.root.vascularEfficiency || .92) + dt * .015);
      return;
    }

    // Posicao sempre derivada da raiz (ancoragem).
    if (Number.isFinite(focus.offsetX)) {
      focus.x = focus.root.x + focus.offsetX + (focus.root.supportOffset || 0);
    }

    const wound = woundPressure(focus.root);
    const bacillus = bacillusStrength(focus);
    const pseudo = pseudomonasStrength(focus, dt);
    focus.bacillusControl = bacillus;
    focus.pseudomonasControl = pseudo;

    // O crescimento vem do nucleo puro e testado: e la que moram as regras de
    // prevencao (superficie pode zerar) e contencao (xilema nunca zera).
    const growth = ralstoniaNetGrowth({
      surfaceLoad: focus.surfaceLoad,
      vascularLoad: focus.vascularLoad,
      woundPressure: wound,
      bacillusControl: bacillus,
      pseudomonasControl: pseudo,
      config: CONFIG,
    });

    focus.surfaceLoad = clamp(focus.surfaceLoad + dt * growth.surfaceRate, 0, 1);
    const piso = focus.everEnteredVascular ? CONFIG.minimumVascularFloorAfterEntry : 0;
    focus.vascularLoad = clamp(focus.vascularLoad + dt * growth.vascularRate, piso, 1);
    if (focus.vascularLoad >= CONFIG.vascularEntryThreshold) focus.everEnteredVascular = true;

    // PREVENCAO: superficie praticamente zerada, sem nunca ter entrado, e o
    // controle mantido por neutralizationHoldSeconds.
    if (!focus.everEnteredVascular
      && focus.surfaceLoad <= CONFIG.surfaceNeutralizationThreshold
      && growth.control > .3) {
      focus.neutralizeHold += dt;
      if (focus.neutralizeHold >= CONFIG.neutralizationHoldSeconds) {
        neutralize(focus);
        return;
      }
    } else {
      focus.neutralizeHold = 0;
    }

    // CONTENCAO: ja entrou, mas o avanco parou e o controle se manteve por
    // containmentHoldSeconds. Sair do controle devolve o crescimento.
    if (focus.everEnteredVascular && growth.holdingVascular && growth.control > .25) {
      focus.containHold += dt;
      if (focus.containHold >= CONFIG.containmentHoldSeconds) contain(focus);
    } else {
      focus.containHold = 0;
      // Voltou a crescer: deixa de estar contido (o estado e mantido, nao dado).
      if (focus.contained && growth.vascularRate > 0) focus.contained = false;
    }

    focus.state = focusState(focus);

    if (focus.vascularLoad >= .08 && !focus.announcedEntry) {
      focus.announcedEntry = true;
      announce('Entrada de Ralstonia: a bactéria atravessou uma região lesionada e alcançou os vasos da raiz.', 5.2, 1.1);
    }
    if (focus.vascularLoad >= .36 && !focus.announcedVascular) {
      focus.announcedVascular = true;
      announce('Colonização vascular ativa: transporte de água, carbono e nutrientes começou a cair.', 5.3, 1.2);
    }
    if (focus.vascularLoad >= .82 && !focus.announcedCritical) {
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

  function update(dt) {
    if (state.gameState !== 'play') return;
    if (!initialized) seedFoci();
    criticalCount = 0;
    let transportSum = 0;
    let active = 0;
    for (const focus of foci) {
      updateFocus(focus, dt);
      if (focus.neutralized) continue;
      active++;
      transportSum += focus.vascularEfficiency;
      if (focus.vascularLoad >= CONFIG.criticalThreshold) criticalCount++;
    }
    averageTransport = active ? transportSum / active : 1;
  }

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
  // ATENCAO: esta funcao roda DENTRO do save()/translate() de render(). Ela
  // precisa fechar exatamente os save() que abrir. A versao anterior chamava
  // ctx.restore() sem nenhum save() proprio: isso desempilhava a translacao da
  // camera, e todo sistema desenhado DEPOIS da Ralstonia (os beneficios) perdia
  // a referencia e flutuava em coordenadas de tela.
  function drawStatus(ctx, focus) {
    if (focus.neutralized && focus.age > 10) return;
    const root = focus.root;
    const x = focus.x;
    const y = root.y + Math.min(root.h - 11, 37);
    const width = Math.min(132, Math.max(96, root.w * .62));
    const vascular = clamp(focus.vascularLoad, 0, 1);
    const control = clamp(focus.bacillusControl * .68 + focus.pseudomonasControl * .42, 0, 1);
    const left = x - width / 2;

    ctx.save();

    // Trilho: quanto do xilema esta comprometido.
    ctx.fillStyle = 'rgba(6,20,24,.72)';
    ctx.fillRect(left, y, width, 5);
    ctx.fillStyle = focus.neutralized ? 'rgba(142,240,198,.7)'
      : vascular >= .82 ? '#ff6f91'
      : vascular >= .58 ? '#e8905e'
      : vascular >= .08 ? '#e8c27e'
      : 'rgba(232,194,126,.6)';
    ctx.fillRect(left, y, width * Math.max(vascular, focus.neutralized ? 0 : .04), 5);

    // Controle sustentado por Bacillus + Pseudomonas: a marca que mostra ao
    // jogador que a contencao esta funcionando.
    if (control > .02) {
      ctx.fillStyle = 'rgba(108,231,223,.85)';
      ctx.fillRect(left, y + 5.5, width * control, 2);
    }

    ctx.font = '700 9px Inter,system-ui';
    ctx.textAlign = 'center';
    ctx.fillStyle = focus.neutralized ? 'rgba(168,255,230,.9)' : 'rgba(245,226,190,.92)';
    ctx.fillText(stageLabel(focus), x, y - 4);

    ctx.restore();
  }

  function render(ctx) {
    if (!foci.length) return;
    ctx.save();
    ctx.translate(-state.cameraX, 0);
    for (const focus of foci) {
      if (focus.root.x + focus.root.w < state.cameraX - 100 || focus.root.x > state.cameraX + W + 100) continue;
      drawVascularBlockage(ctx, focus);
      drawBacteria(ctx, focus);
      drawStatus(ctx, focus);
    }
    ctx.restore();
  }

  function clearRootMarkers() {
    for (const root of state.level.platforms || []) {
      delete root.ralstoniaSurfaceLoad;
      delete root.ralstoniaVascularLoad;
      delete root.ralstoniaWilt;
      delete root.ralstoniaStage;
      delete root.ralstoniaDamage;
      delete root.vascularEfficiency;
      delete root.mycorrhizaEfficiency;
      delete root.recoveryBlocked;
    }
  }

  function reset() {
    clearRootMarkers();
    foci.length = 0;
    state.level.ralstoniaFoci = foci;
    nextId = 1;
    initialized = false;
    lastToastAt = -Infinity;
    neutralizedCount = 0;
    criticalCount = 0;
    averageTransport = 1;
    preventedCount = 0;
    containedCount = 0;
  }

  return {
    get focusCount() { return foci.filter(focus => !focus.neutralized).length; },
    get neutralizedCount() { return neutralizedCount; },
    get preventedCount() { return preventedCount; },
    get containedCount() { return containedCount; },
    get criticalCount() { return criticalCount; },
    get preservedVascularRootCount() {
      return foci.filter(focus => (
        (focus.vascularEfficiency ?? 1) >= .65
        && (focus.root?.rootHealth ?? 1) >= .55
        && focus.state !== 'critical'
      )).length;
    },
    get averageTransport() { return averageTransport; },
    get foci() { return foci; },
    initialize,
    update,
    render,
    reset,
  };
}
