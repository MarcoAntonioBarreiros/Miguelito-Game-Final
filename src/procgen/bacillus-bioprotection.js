import { W } from '../core/constants.js';

const TAU = Math.PI * 2;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function modeLabel(entry) {
  if (entry.mode === 'adhesion') return 'adesão à superfície';
  if (entry.mode === 'matrix') return 'matriz do biofilme';
  if (entry.mode === 'mature') return 'biofilme maduro';
  if (entry.mode === 'antibiosis') return 'antibiose ativa';
  if (entry.mode === 'sporulating') return 'esporulação';
  if (entry.mode === 'spores') return 'endósporos dormentes';
  if (entry.mode === 'germinating') return 'germinação de endósporos';
  return 'biofilme';
}

function isMetabolicallyActive(entry) {
  return ['adhesion', 'matrix', 'mature', 'antibiosis', 'sporulating', 'germinating'].includes(entry.mode);
}

export function createBacillusBioprotection({ state, entities, ecology, inoculants }) {
  const colonyStates = new Map();
  let fungiUnderAntibiosis = 0;
  let lastToastAt = -Infinity;

  function bacillusColonies() {
    return (inoculants.colonies || []).filter(colony => colony.type === 'bacillus');
  }

  function announce(text, seconds = 4.8) {
    if (state.time - lastToastAt < 2) return;
    state.toast = text;
    state.toastTime = seconds;
    lastToastAt = state.time;
  }

  function ensureBiofilm(colony) {
    const films = state.level.biofilms || (state.level.biofilms = []);
    let film = colony.linkedBiofilm;
    if (!film || !films.includes(film)) {
      film = films.find(candidate => (
        candidate.inoculated
        && Math.hypot(candidate.x - colony.x, candidate.y - colony.y) < 120
      ));
    }
    if (!film) {
      film = {
        x: colony.x,
        y: colony.y,
        radius: 18,
        targetRadius: 48,
        growth: 0,
        age: 0,
        activated: false,
        platform: colony.platform,
        natural: false,
        inoculated: true,
      };
      films.push(film);
    }
    colony.linkedBiofilm = film;
    film.bacillusManaged = true;
    film.bacillusColonyId = colony.id;
    return film;
  }

  function createEntry(colony) {
    const entry = {
      colony,
      film: ensureBiofilm(colony),
      mode: 'adhesion',
      maturity: .08,
      antibioticReserve: 0,
      sporulation: 0,
      germination: 0,
      activePressure: 0,
      resistanceStrength: 0,
      sporeCount: 5 + (colony.sourceCount || 1) * 4,
      announcedMature: false,
      announcedSpores: false,
      announcedGermination: false,
      phase: Math.random() * TAU,
    };
    colony.bacillusState = entry;
    colonyStates.set(colony.id, entry);
    return entry;
  }

  function removeManagedFilm(entry) {
    const films = state.level.biofilms || [];
    const index = films.indexOf(entry.film);
    if (index >= 0 && entry.film?.bacillusManaged) films.splice(index, 1);
  }

  function syncColonies() {
    const current = bacillusColonies();
    const ids = new Set(current.map(colony => colony.id));
    for (const colony of current) {
      let entry = colonyStates.get(colony.id);
      if (!entry) entry = createEntry(colony);
      entry.colony = colony;
      entry.film = ensureBiofilm(colony);
      colony.bacillusState = entry;
    }
    for (const [id, entry] of colonyStates) {
      if (ids.has(id)) continue;
      removeManagedFilm(entry);
      if (entry.colony) entry.colony.bacillusState = null;
      colonyStates.delete(id);
    }
  }

  function clear() {
    for (const entry of colonyStates.values()) {
      if (entry.colony) entry.colony.bacillusState = null;
      removeManagedFilm(entry);
    }
    colonyStates.clear();
    fungiUnderAntibiosis = 0;
    lastToastAt = -Infinity;
    state.player.bacillusResistance = 0;
  }

  function reset() {
    clear();
  }

  function configureFilm(entry) {
    const { colony, film } = entry;
    if (!film) return;
    film.platform = colony.platform;
    film.x = colony.x;
    film.y = colony.y;
    film.bacillusMode = entry.mode;
    film.protectionStrength = entry.resistanceStrength;

    if (entry.mode === 'spores') {
      film.targetRadius = 0;
      film.radius = 0;
      film.growth = 0;
      film.functional = false;
      return;
    }

    const target = 34 + entry.maturity * (48 + (colony.sourceCount || 1) * 6);
    film.targetRadius = target;
    film.radius = Math.min(Math.max(film.radius || 0, 8), target + 8);
    film.growth = Math.max(film.growth || 0, clamp(entry.maturity, .08, 1));
    film.functional = entry.maturity >= .42 && entry.mode !== 'sporulating';
  }

  function enterMode(entry, mode) {
    if (entry.mode === mode) return;
    entry.mode = mode;
    const colony = entry.colony;

    if (mode === 'mature' && !entry.announcedMature) {
      entry.announcedMature = true;
      announce('Biofilme maduro de Bacillus: a matriz protege a raiz e sustenta a produção de metabólitos antimicrobianos.', 5.4);
      entities.burst(colony.x, colony.y, '#a8ffe6', 30, 130);
    } else if (mode === 'spores' && !entry.announcedSpores) {
      entry.announcedSpores = true;
      announce('Esporulação de Bacillus: com pouco carbono, a comunidade formou endósporos resistentes e entrou em dormência.', 5.5);
      entities.burst(colony.x, colony.y, '#ffe5a0', 24, 95);
    } else if (mode === 'germinating' && !entry.announcedGermination) {
      entry.announcedGermination = true;
      announce('Reativação de Bacillus: novos exsudatos estimularam a germinação dos endósporos e a reconstrução do biofilme.', 5.5);
      entities.burst(colony.x, colony.y, '#d6ff94', 34, 125);
    }
  }

  function updateLifecycle(entry, dt) {
    const colony = entry.colony;
    const fuel = clamp(colony.rechargeIntensity || 0, 0, 1);
    const sourceBoost = 1 + Math.max(0, (colony.sourceCount || 1) - 1) * .12;

    if (entry.mode === 'spores') {
      colony.stage = modeLabel(entry);
      colony.dormant = true;
      colony.vigor = Math.min(colony.vigor, .08);
      entry.antibioticReserve = Math.max(0, entry.antibioticReserve - dt * .01);
      if (fuel > .08) {
        colony.dormant = false;
        colony.vigor = Math.max(colony.vigor, .065);
        entry.germination = 0;
        enterMode(entry, 'germinating');
      }
      configureFilm(entry);
      return;
    }

    if (entry.mode === 'germinating') {
      colony.dormant = false;
      entry.germination = clamp(entry.germination + dt * (.14 + fuel * .55) * sourceBoost, 0, 1);
      entry.maturity = Math.max(.18, entry.germination * .58);
      colony.stage = modeLabel(entry);
      if (entry.germination >= 1 && colony.vigor > .1) {
        entry.maturity = .56;
        entry.sporulation = 0;
        entry.antibioticReserve = Math.max(entry.antibioticReserve, .08);
        entry.announcedSpores = false;
        entry.announcedGermination = false;
        enterMode(entry, 'matrix');
      }
      configureFilm(entry);
      return;
    }

    colony.dormant = false;
    const growthRate = (.035 + fuel * .095 + colony.vigor * .018) * sourceBoost;
    if (entry.mode === 'adhesion') {
      entry.maturity = clamp(entry.maturity + dt * growthRate, 0, 1);
      if (entry.maturity >= .28) enterMode(entry, 'matrix');
    } else if (entry.mode === 'matrix') {
      entry.maturity = clamp(entry.maturity + dt * growthRate * .82, 0, 1);
      if (entry.maturity >= .72) enterMode(entry, 'mature');
    } else {
      entry.maturity = clamp(entry.maturity + dt * growthRate * .18, 0, 1);
    }

    if (entry.maturity >= .7) {
      const production = dt * (.009 + fuel * .075 + colony.vigor * .012) * sourceBoost;
      entry.antibioticReserve = clamp(entry.antibioticReserve + production, 0, 1.25);
      if (entry.antibioticReserve > .12 && entry.mode === 'mature') enterMode(entry, 'antibiosis');
    }

    const carbonStress = colony.vigor < .15 && fuel < .035;
    if (carbonStress) {
      entry.sporulation = clamp(entry.sporulation + dt * (.095 + (1 - colony.vigor) * .09), 0, 1);
      if (entry.mode !== 'adhesion' && entry.mode !== 'matrix') enterMode(entry, 'sporulating');
    } else {
      entry.sporulation = Math.max(0, entry.sporulation - dt * (.12 + fuel * .25));
      if (entry.mode === 'sporulating' && entry.sporulation < .35) {
        enterMode(entry, entry.antibioticReserve > .12 ? 'antibiosis' : 'mature');
      }
    }

    if (entry.sporulation >= 1) {
      entry.maturity = .18;
      entry.antibioticReserve *= .18;
      colony.vigor = Math.min(colony.vigor, .025);
      colony.dormant = true;
      enterMode(entry, 'spores');
    }

    colony.stage = modeLabel(entry);
    configureFilm(entry);
  }

  function decayAgentMarkers(dt) {
    for (const agent of ecology.agents) {
      agent.bacillusAntibiosis = Math.max(0, (agent.bacillusAntibiosis || 0) - dt * 1.8);
    }
  }

  function applyAntibiosis(entry, dt) {
    entry.activePressure = 0;
    if (!isMetabolicallyActive(entry) || entry.maturity < .68 || entry.antibioticReserve <= .015) return;

    const colony = entry.colony;
    const radius = 82 + entry.maturity * 42 + (colony.sourceCount || 1) * 11;
    for (const agent of ecology.agents) {
      if (agent.type !== 'oportunista') continue;
      const dx = agent.x - colony.x;
      const dy = agent.y - colony.y;
      const distance = Math.max(1, Math.hypot(dx, dy));
      if (distance >= radius) continue;

      const reserveFactor = clamp(entry.antibioticReserve / .35, .12, 1);
      const synergy = 1 + clamp(agent.ironLimitation || 0, 0, 1) * .48;
      const pressure = clamp((1 - distance / radius) * colony.vigor * reserveFactor * synergy, 0, 1);
      if (pressure <= .01) continue;

      agent.bacillusAntibiosis = Math.max(agent.bacillusAntibiosis || 0, pressure);
      agent.vx += dx / distance * 118 * pressure * dt;
      agent.vy += dy / distance * 66 * pressure * dt;
      agent.vx *= Math.pow(.2, dt * pressure);
      agent.vy *= Math.pow(.28, dt * pressure);
      agent.homeX += dx / distance * 56 * pressure * dt;
      agent.homeY += dy / distance * 36 * pressure * dt;
      entry.antibioticReserve = Math.max(0, entry.antibioticReserve - dt * .018 * pressure);
      entry.activePressure = Math.max(entry.activePressure, pressure);
    }
  }

  function applyInducedResistance(entry, dt) {
    entry.resistanceStrength = 0;
    if (!isMetabolicallyActive(entry) || entry.maturity < .55 || entry.mode === 'sporulating') return;

    const colony = entry.colony;
    const platform = colony.platform;
    const player = state.player;
    const centerX = player.x + player.w / 2;
    const centerY = player.y + player.h / 2;
    const feetY = player.y + player.h;
    const filmRadius = Math.max(18, entry.film?.radius || 0);
    const insideFilm = Math.hypot(centerX - colony.x, centerY - colony.y) < filmRadius * 1.05;
    const onProtectedRoot = platform
      && centerX >= platform.x - 20
      && centerX <= platform.x + platform.w + 20
      && Math.abs(feetY - platform.y) < 58;
    if (!insideFilm && !onProtectedRoot) return;

    const strength = clamp(entry.maturity * colony.vigor * (.7 + (colony.sourceCount || 1) * .08), 0, .9);
    entry.resistanceStrength = strength;
    state.player.bacillusResistance = Math.max(state.player.bacillusResistance || 0, strength);

    state.player.infectionExposure = Math.max(
      0,
      (state.player.infectionExposure || 0) - dt * (.45 + strength * 1.25),
    );
    state.player.infection = Math.max(
      0,
      (state.player.infection || 0) - dt * (.035 + strength * .18),
    );
    state.player.soil += dt * .055 * strength;
  }

  function update(dt) {
    if (state.gameState !== 'play') return;
    syncColonies();
    state.player.bacillusResistance = 0;
    fungiUnderAntibiosis = 0;
    decayAgentMarkers(dt);

    for (const entry of colonyStates.values()) updateLifecycle(entry, dt);
    for (const entry of colonyStates.values()) applyAntibiosis(entry, dt);
    for (const entry of colonyStates.values()) applyInducedResistance(entry, dt);

    fungiUnderAntibiosis = ecology.agents.filter(agent => (
      agent.type === 'oportunista' && (agent.bacillusAntibiosis || 0) > .04
    )).length;
  }

  function drawProtectedRoot(ctx, entry) {
    if (entry.maturity < .55 || entry.mode === 'spores') return;
    const platform = entry.colony.platform;
    if (!platform) return;
    const strength = clamp(entry.maturity * entry.colony.vigor, 0, 1);
    ctx.save();
    ctx.globalAlpha = .16 + strength * .3;
    ctx.strokeStyle = '#94ffe0';
    ctx.lineWidth = 2 + strength * 2;
    ctx.setLineDash([6, 8]);
    ctx.beginPath();
    ctx.moveTo(platform.x + 12, platform.y - 3);
    ctx.lineTo(platform.x + platform.w - 12, platform.y - 3);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  function drawAntibioticHalo(ctx, entry) {
    if (entry.maturity < .68 || entry.mode === 'spores') return;
    const colony = entry.colony;
    const reserve = clamp(entry.antibioticReserve / .45, 0, 1);
    if (reserve <= .02) return;
    const radius = 82 + entry.maturity * 42 + (colony.sourceCount || 1) * 11;
    ctx.save();
    ctx.translate(colony.x, colony.y);
    ctx.strokeStyle = entry.activePressure > .04 ? 'rgba(255,206,119,.58)' : 'rgba(112,229,214,.25)';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([2, 7]);
    ctx.beginPath();
    ctx.arc(0, 0, radius + Math.sin(state.time * 1.7 + entry.phase) * 3, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);

    const moleculeCount = 5 + Math.round(reserve * 7);
    for (let i = 0; i < moleculeCount; i++) {
      const angle = state.time * (.3 + i * .012) + entry.phase + i * TAU / moleculeCount;
      const rr = radius * (.35 + (i % 4) * .13);
      const x = Math.cos(angle) * rr;
      const y = Math.sin(angle * 1.23) * rr * .56;
      ctx.fillStyle = i % 2 ? '#ffd77e' : '#9effdf';
      ctx.globalAlpha = .38 + reserve * .4;
      ctx.beginPath();
      ctx.arc(x, y, 1.7 + (i % 3) * .45, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawSpores(ctx, entry) {
    if (entry.mode !== 'spores' && entry.mode !== 'germinating' && entry.mode !== 'sporulating') return;
    const colony = entry.colony;
    const germination = entry.mode === 'germinating' ? entry.germination : 0;
    ctx.save();
    ctx.translate(colony.x, colony.y - 5);
    for (let i = 0; i < entry.sporeCount; i++) {
      const angle = entry.phase + i * TAU / entry.sporeCount;
      const ring = 12 + (i % 4) * 5;
      const x = Math.cos(angle) * ring;
      const y = Math.sin(angle) * ring * .48;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle + .35);
      ctx.fillStyle = entry.mode === 'spores' ? '#d9b56c' : '#d6ff94';
      ctx.strokeStyle = '#fff0bd';
      ctx.lineWidth = 1.1;
      ctx.globalAlpha = .58 + (i % 3) * .12;
      ctx.beginPath();
      ctx.ellipse(0, 0, 4.2, 2.5, 0, 0, TAU);
      ctx.fill();
      ctx.stroke();
      if (germination > 0) {
        ctx.strokeStyle = '#8ff4e8';
        ctx.beginPath();
        ctx.moveTo(3.5, 0);
        ctx.quadraticCurveTo(6 + germination * 5, -2, 8 + germination * 10, -germination * 5);
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.restore();
  }

  function drawLimitedFungus(ctx, agent) {
    const pressure = clamp(agent.bacillusAntibiosis || 0, 0, 1);
    if (pressure <= .04) return;
    const seed = Number.isFinite(agent.noiseSeed) ? agent.noiseSeed : 0;
    ctx.save();
    ctx.translate(agent.x, agent.y);
    ctx.globalAlpha = .3 + pressure * .55;
    ctx.strokeStyle = '#ffd77e';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    ctx.arc(0, 0, 16 + pressure * 10 + Math.sin(state.time * 3 + seed) * 2, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    for (let i = 0; i < 4; i++) {
      const angle = state.time * .48 + seed + i * TAU / 4;
      ctx.fillStyle = i % 2 ? '#ffd77e' : '#9effdf';
      ctx.beginPath();
      ctx.arc(Math.cos(angle) * 13, Math.sin(angle) * 8, 1.6, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawReserve(ctx, entry) {
    if (entry.mode === 'spores') return;
    const colony = entry.colony;
    const width = 46;
    const reserve = clamp(entry.antibioticReserve / 1.25, 0, 1);
    ctx.save();
    ctx.translate(colony.x, colony.y);
    ctx.fillStyle = 'rgba(3,18,24,.76)';
    ctx.fillRect(-width / 2 - 2, 25, width + 4, 7);
    ctx.fillStyle = '#ffd77e';
    ctx.fillRect(-width / 2, 27, width * reserve, 3);
    ctx.font = '700 8px Inter,system-ui';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,227,164,.9)';
    ctx.fillText('antibiose', 0, 41);
    ctx.restore();
  }

  function render(ctx) {
    if (!colonyStates.size) return;
    ctx.save();
    ctx.translate(-state.cameraX, 0);
    for (const entry of colonyStates.values()) {
      if (entry.colony.x < state.cameraX - 230 || entry.colony.x > state.cameraX + W + 230) continue;
      drawProtectedRoot(ctx, entry);
      drawAntibioticHalo(ctx, entry);
      drawSpores(ctx, entry);
      drawReserve(ctx, entry);
    }
    for (const agent of ecology.agents) {
      if (agent.type === 'oportunista') drawLimitedFungus(ctx, agent);
    }
    ctx.restore();
  }

  return {
    get colonyCount() { return colonyStates.size; },
    get matureBiofilmCount() {
      return [...colonyStates.values()].filter(entry => entry.maturity >= .72 && entry.mode !== 'spores').length;
    },
    get activeBiofilmCount() {
      return [...colonyStates.values()].filter(entry => entry.mode === 'antibiosis' || entry.mode === 'mature').length;
    },
    get sporulatedCount() {
      return [...colonyStates.values()].filter(entry => entry.mode === 'spores').length;
    },
    get germinatingCount() {
      return [...colonyStates.values()].filter(entry => entry.mode === 'germinating').length;
    },
    get fungiUnderAntibiosis() { return fungiUnderAntibiosis; },
    get protectedRootCount() {
      const platforms = new Set();
      for (const entry of colonyStates.values()) {
        if (entry.maturity >= .55 && entry.mode !== 'spores') platforms.add(entry.colony.platform);
      }
      return platforms.size;
    },
    clear,
    reset,
    update,
    render,
  };
}
