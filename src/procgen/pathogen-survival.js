const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function ensureDom() {
  if (typeof document === 'undefined') return { hud: null, vignette: null };

  let style = document.getElementById('pathogen-survival-style');
  if (!style) {
    style = document.createElement('style');
    style.id = 'pathogen-survival-style';
    style.textContent = `
      #survival-hud {
        position: fixed;
        z-index: 45;
        left: max(10px, env(safe-area-inset-left));
        top: max(56px, calc(env(safe-area-inset-top) + 48px));
        display: flex;
        gap: 8px;
        align-items: center;
        max-width: calc(100vw - 20px);
        padding: 5px 9px;
        border: 1px solid rgba(219,255,242,.28);
        border-radius: 12px;
        background: rgba(10,25,31,.76);
        box-shadow: 0 5px 18px rgba(0,0,0,.28);
        color: #ecfff7;
        font: 700 12px/1.15 Inter,system-ui,sans-serif;
        pointer-events: none;
        backdrop-filter: blur(6px);
        -webkit-backdrop-filter: blur(6px);
      }
      #survival-hud .hearts { letter-spacing: 1px; white-space: nowrap; }
      #survival-hud .condition {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: #ffd3dc;
      }
      #pathogen-vignette {
        position: fixed;
        z-index: 40;
        inset: 0;
        pointer-events: none;
        opacity: 0;
        box-shadow: inset 0 0 95px 34px rgba(144,22,56,.78);
        transition: opacity .14s linear;
      }
      @media (pointer: coarse), (max-width: 760px) {
        #survival-hud {
          top: max(44px, calc(env(safe-area-inset-top) + 38px));
          padding: 4px 7px;
          font-size: 10px;
          gap: 6px;
          max-width: 72vw;
        }
      }
    `;
    document.head.appendChild(style);
  }

  let hud = document.getElementById('survival-hud');
  if (!hud) {
    hud = document.createElement('div');
    hud.id = 'survival-hud';
    hud.innerHTML = '<span class="hearts"></span><span class="condition"></span>';
    document.body.appendChild(hud);
  }

  let vignette = document.getElementById('pathogen-vignette');
  if (!vignette) {
    vignette = document.createElement('div');
    vignette.id = 'pathogen-vignette';
    document.body.appendChild(vignette);
  }

  return { hud, vignette };
}

function playerCenter(player) {
  return { x: player.x + player.w / 2, y: player.y + player.h / 2 };
}

function standingRoot(state) {
  const player = state.player;
  const centerX = player.x + player.w / 2;
  const feet = player.y + player.h;
  return (state.level.platforms || []).find(platform => (
    platform.type === 'root'
    && !platform.final
    && centerX >= platform.x
    && centerX <= platform.x + platform.w
    && Math.abs(feet - platform.y) < 16
  )) || null;
}

function filmProtectsPlayer(state) {
  const center = playerCenter(state.player);
  return (state.level.biofilms || []).find(film => {
    const functional = film.functional || film.activated || film.checkpoint?.active;
    if (!functional || (film.radius || 0) <= 4) return false;
    return Math.hypot(center.x - film.x, center.y - film.y) < Math.max(28, film.radius);
  }) || null;
}

function rootBacillusDefense(state, root, x) {
  let defense = 0;
  for (const film of state.level.biofilms || []) {
    if (film.platform !== root || !film.functional) continue;
    const radius = Math.max(16, film.radius || film.targetRadius || 0);
    const distance = Math.abs((film.x || 0) - x);
    if (distance >= radius) continue;
    defense = Math.max(defense, clamp(film.protectionStrength || .45, .2, 1) * (1 - distance / radius));
  }
  return defense;
}

export function createPathogenSurvival({ state, entities, ecology }) {
  const rootMemory = new WeakMap();
  let lastToastAt = -Infinity;
  let attachToastShown = false;
  let transferToastAt = -Infinity;
  const dom = ensureDom();

  function announce(text, seconds = 4.8, cooldown = 1.7) {
    if (state.time - lastToastAt < cooldown) return;
    state.toast = text;
    state.toastTime = seconds;
    lastToastAt = state.time;
  }

  function updateDom() {
    if (!dom.hud) return;
    const player = state.player;
    const vitality = clamp(Math.round(player.vitality || 0), 0, player.maxVitality || 5);
    const max = player.maxVitality || 5;
    const filled = '♥'.repeat(vitality);
    const empty = '♡'.repeat(Math.max(0, max - vitality));
    dom.hud.querySelector('.hearts').textContent = `${filled}${empty}`;

    const infection = clamp(player.infection || 0, 0, 1);
    const load = player.nematodeLoad || 0;
    let condition = '';
    if (state.gameState === 'respawning') condition = 'Reorganizando no último biofilme…';
    else if (infection >= .72) condition = `Colonização fúngica ${Math.round(infection * 100)}%`;
    else if (infection >= .28) condition = `Propágulos aderidos ${Math.round(infection * 100)}%`;
    else if (load) condition = `${load} J2 transportado${load > 1 ? 's' : ''}`;
    else condition = 'Integridade estável';
    dom.hud.querySelector('.condition').textContent = condition;

    if (dom.vignette) {
      const danger = Math.max(
        infection > .28 ? (infection - .28) / .72 : 0,
        vitality <= 2 ? (3 - vitality) * .24 : 0,
      );
      dom.vignette.style.opacity = String(clamp(danger * .62, 0, .72));
    }
  }

  function clearCarriedJ2(remove = true) {
    for (const juvenile of state.level.nematodeJuveniles || []) {
      if (!juvenile.carriedByPlayer) continue;
      juvenile.carriedByPlayer = false;
      juvenile.cooldown = 0;
      if (remove) juvenile.alive = false;
    }
    state.player.nematodeLoad = 0;
  }

  function damagePlayer(amount = 1, source = 'patógeno', options = {}) {
    const player = state.player;
    if (state.gameState !== 'play' || !player.alive || (player.invuln > 0 && !options.fatal)) return false;

    const damage = Math.max(1, Math.round(amount));
    player.vitality = Math.max(0, (player.vitality ?? player.maxVitality ?? 5) - damage);
    player.invuln = options.invuln ?? 1.05;
    player.infection = clamp((player.infection || 0) + (options.infection || 0), 0, 1);
    player.vx = options.knockbackX ?? (-player.facing * 250);
    player.vy = options.knockbackY ?? -245;
    state.shake = Math.max(state.shake || 0, damage > 1 ? .42 : .3);
    entities.burst(
      player.x + player.w / 2,
      player.y + player.h / 2,
      damage > 1 ? '#ff4d77' : '#ff8297',
      18 + damage * 8,
      175 + damage * 40,
    );

    announce(`${source}: Miguelito perdeu ${damage} ${damage === 1 ? 'coração' : 'corações'}.`, 3.6, .55);

    if (player.vitality <= 0 || options.fatal) {
      player.vitality = 0;
      player.alive = false;
      player.deaths = (player.deaths || 0) + 1;
      player.deathFlash = 1;
      player.vx = 0;
      player.vy = 0;
      state.gameState = 'respawning';
      state.respawnTimer = .72;
      announce(`Miguelito foi vencido por ${source}. Retorno ao último biofilme ativo.`, 4.2, 0);
    }
    return true;
  }

  entities.damagePlayer = damagePlayer;

  function nearestTrichodermaDistance() {
    const center = playerCenter(state.player);
    let best = Infinity;
    for (const agent of ecology.agents || []) {
      if (agent.type !== 'trichoderma') continue;
      best = Math.min(best, Math.hypot(agent.x - center.x, agent.y - center.y));
    }
    for (const colony of state.trichodermaColonies?.colonies || []) {
      best = Math.min(best, Math.hypot(colony.x - center.x, colony.y - center.y));
    }
    return best;
  }

  function attachJ2(juvenile, slot) {
    juvenile.carriedByPlayer = true;
    juvenile.carryTime = 0;
    juvenile.carrySlot = slot;
    juvenile.targetRoot = null;
    juvenile.cooldown = Number.POSITIVE_INFINITY;
    juvenile.retarget = Number.POSITIVE_INFINITY;
    juvenile.vx = 0;
    juvenile.vy = 0;
    if (!attachToastShown) {
      attachToastShown = true;
      announce(
        'Transporte de J2: o juvenil aderiu à roupa de Miguelito. Ele não parasita o personagem, mas reduz sua mobilidade e pode ser levado até outra raiz.',
        6.2,
        0,
      );
    }
  }

  function updateCarriedJ2(dt) {
    const player = state.player;
    const center = playerCenter(player);
    const juveniles = state.level.nematodeJuveniles || [];
    let carried = juveniles.filter(juvenile => juvenile.alive && juvenile.carriedByPlayer);

    for (const juvenile of juveniles) {
      if (!juvenile.alive || juvenile.carriedByPlayer || juvenile.state !== 'seeking') continue;
      if (carried.length >= 2 || juvenile.age < .45) continue;
      const distance = Math.hypot(juvenile.x - center.x, juvenile.y - center.y);
      if (distance < 23) {
        attachJ2(juvenile, carried.length);
        carried.push(juvenile);
      }
    }

    const pulseActive = (state.level.pulses || []).some(pulse => pulse.life > 0);
    const safeFilm = filmProtectsPlayer(state);
    if ((pulseActive || safeFilm) && carried.length) {
      for (const juvenile of carried) juvenile.alive = false;
      const removed = carried.length;
      carried = [];
      announce(
        pulseActive
          ? `Pulso mineral removeu ${removed} J2 transportado${removed > 1 ? 's' : ''}.`
          : `Biofilme de Bacillus repeliu ${removed} J2 transportado${removed > 1 ? 's' : ''}.`,
        4.1,
        .8,
      );
      entities.burst(center.x, center.y + 12, pulseActive ? '#ffcf8a' : '#a8ffe6', 18, 120);
    }

    const root = standingRoot(state);
    carried.forEach((juvenile, index) => {
      juvenile.carryTime = (juvenile.carryTime || 0) + dt;
      juvenile.carrySlot = index;
      const side = index % 2 ? -1 : 1;
      juvenile.x = center.x + side * (11 + index * 3) * player.facing;
      juvenile.y = center.y + 12 + index * 9 + Math.sin(state.time * 7 + index) * 2;
      juvenile.vx = player.vx;
      juvenile.vy = player.vy;
      juvenile.cooldown = Number.POSITIVE_INFINITY;
      juvenile.retarget = Number.POSITIVE_INFINITY;
      juvenile.targetRoot = null;

      if (
        root
        && juvenile.carryTime > 2.2
        && rootBacillusDefense(state, root, center.x) < .42
        && Math.random() < dt * .34
      ) {
        juvenile.carriedByPlayer = false;
        juvenile.cooldown = 0;
        juvenile.retarget = 0;
        juvenile.targetRoot = root;
        juvenile.targetX = clamp(center.x, root.x + 18, root.x + root.w - 18);
        juvenile.x = juvenile.targetX;
        juvenile.y = root.y - 10;
        if (state.time - transferToastAt > 4) {
          transferToastAt = state.time;
          announce('Dispersão passiva: um J2 transportado deixou Miguelito e começou a procurar entrada na raiz sob seus pés.', 5.2, 0);
        }
      }
    });

    carried = juveniles.filter(juvenile => juvenile.alive && juvenile.carriedByPlayer);
    player.nematodeLoad = carried.length;
    player.nematodeDamageCooldown = Math.max(0, (player.nematodeDamageCooldown || 0) - dt);
    const matureCarriers = carried.filter(juvenile => (juvenile.carryTime || 0) > 5.5).length;
    if (matureCarriers && player.nematodeDamageCooldown <= 0) {
      damagePlayer(1, 'estresse por J2 transportado', { invuln: .95, knockbackX: player.vx * -.25, knockbackY: -115 });
      player.nematodeDamageCooldown = matureCarriers > 1 ? 2.35 : 3.15;
    }
  }

  function updateRootStress(dt) {
    for (const root of state.level.platforms || []) {
      if (root.type !== 'root' || root.final || root.recovery) continue;
      const pressure = clamp(root.rhizoctoniaPressure || 0, 0, 1);
      if (pressure > 0) {
        root.rootDamage = clamp((root.rootDamage || 0) + dt * pressure * .012, 0, .94);
        root.rootHealth = clamp(1 - root.rootDamage, .06, 1);
      }

      const previous = rootMemory.get(root);
      const health = Number.isFinite(root.rootHealth) ? root.rootHealth : 1;
      if (previous != null) {
        const delta = health - previous;
        if (Math.abs(delta) > .00035) {
          root.healthTrend = delta > 0 ? 1 : -1;
          root.healthTrendTime = .65;
        }
      }
      rootMemory.set(root, health);
      root.healthTrendTime = Math.max(0, (root.healthTrendTime || 0) - dt);
      if (root.healthTrendTime <= 0) root.healthTrend = 0;
    }
  }

  function prepare() {
    const player = state.player;
    const infection = clamp(player.infection || 0, 0, 1);
    const load = player.nematodeLoad || 0;
    player.moveMultiplier = clamp(1 - infection * .34 - load * .1, .48, 1);
    player.jumpMultiplier = clamp(1 - infection * .16 - load * .08, .68, 1);
    player.dashCooldownMultiplier = 1 + infection * .65 + load * .25;
    player.dashSuppressed = load >= 2 || infection >= .92;
  }

  function update(dt) {
    const player = state.player;
    player.deathFlash = Math.max(0, (player.deathFlash || 0) - dt * 1.7);

    if (state.gameState === 'respawning') {
      state.respawnTimer = Math.max(0, (state.respawnTimer || 0) - dt);
      if (state.respawnTimer <= 0) entities.respawn('death');
      updateDom();
      return;
    }
    if (state.gameState !== 'play') {
      updateDom();
      return;
    }

    player.fungalDamageCooldown = Math.max(0, (player.fungalDamageCooldown || 0) - dt);
    player.healCooldown = Math.max(0, (player.healCooldown || 0) - dt);

    const trichodermaDistance = nearestTrichodermaDistance();
    if (trichodermaDistance < 125 && player.infection > 0) {
      const strength = 1 - trichodermaDistance / 125;
      player.infection = Math.max(0, player.infection - dt * (.045 + strength * .18));
      player.infectionExposure = Math.max(0, (player.infectionExposure || 0) - dt * (.16 + strength * .7));
    }

    const film = filmProtectsPlayer(state);
    if (film) {
      if (player.vitality < player.maxVitality && player.healCooldown <= 0) {
        player.vitality++;
        player.healCooldown = 4.2;
        announce('Zona segura de Bacillus: um coração de Vitalidade foi recuperado.', 3.6, .7);
        entities.burst(player.x + 16, player.y + 24, '#a8ffe6', 16, 95);
      }
    }

    const infection = clamp(player.infection || 0, 0, 1);
    if (infection >= .68 && player.fungalDamageCooldown <= 0) {
      damagePlayer(1, 'colonização fúngica', {
        infection: .015,
        invuln: .9,
        knockbackX: player.vx * -.18,
        knockbackY: -95,
      });
      player.fungalDamageCooldown = infection >= .92 ? 1.85 : infection >= .8 ? 2.35 : 2.9;
    }

    updateCarriedJ2(dt);
    updateRootStress(dt);
    updateDom();
  }

  function clear() {
    clearCarriedJ2(false);
    attachToastShown = false;
    lastToastAt = -Infinity;
    transferToastAt = -Infinity;
    updateDom();
  }

  function reset() {
    clear();
    state.player.vitality = state.player.maxVitality || 5;
    state.player.infection = 0;
    state.player.infectionExposure = 0;
    state.player.nematodeLoad = 0;
    state.player.healCooldown = 0;
    state.player.fungalDamageCooldown = 0;
    state.player.nematodeDamageCooldown = 0;
    prepare();
    updateDom();
  }

  return {
    prepare,
    update,
    clear,
    reset,
    damagePlayer,
    clearCarriedJ2,
    get carriedJ2Count() {
      return (state.level.nematodeJuveniles || []).filter(juvenile => juvenile.alive && juvenile.carriedByPlayer).length;
    },
  };
}
