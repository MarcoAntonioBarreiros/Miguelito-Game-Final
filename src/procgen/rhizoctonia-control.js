const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const TAU = Math.PI * 2;

function nearestHostRoot(state, enemy) {
  const centerX = enemy.x + enemy.w / 2;
  const feetY = enemy.y + enemy.h;
  let best = null;
  let bestDistance = Infinity;
  for (const platform of state.level.platforms || []) {
    if (platform.type !== 'root' || platform.final || platform.recovery || platform.mycorrhizaStructure) continue;
    const x = clamp(centerX, platform.x + 18, platform.x + platform.w - 18);
    const distance = Math.hypot(x - centerX, platform.y - feetY);
    if (distance < bestDistance) {
      best = platform;
      bestDistance = distance;
    }
  }
  return best;
}

function stageLabel(enemy) {
  if (enemy.contained) return 'contida por Bacillus';
  const value = enemy.colonization || 0;
  if (value < .25) return 'foco inicial';
  if (value < .5) return 'colonização superficial';
  if (value < .75) return 'lesão ativa';
  return 'necrose cortical';
}

export function createRhizoctoniaControl({ state, entities, pseudomonas }) {
  const memory = new Map();
  let lastInstructionAt = -Infinity;
  let controlledCount = 0;
  let activeCount = 0;

  function announce(text, duration = 5, cooldown = 2.4) {
    if (state.time - lastInstructionAt < cooldown) return;
    state.toast = text;
    state.toastTime = duration;
    lastInstructionAt = state.time;
  }

  function ensure(enemy, index = 0) {
    if (!enemy || !enemy.alive) return null;
    const host = enemy.hostPlatform || nearestHostRoot(state, enemy);
    if (!host) return null;
    enemy.type = 'rhizoctonia';
    enemy.hostPlatform = host;
    enemy.maxHp = enemy.maxHp || 3;
    enemy.hp = Number.isFinite(enemy.hp) ? enemy.hp : enemy.maxHp;
    enemy.colonization = clamp(Number.isFinite(enemy.colonization) ? enemy.colonization : .16, .06, 1);
    enemy.infectionX = Number.isFinite(enemy.infectionX)
      ? clamp(enemy.infectionX, host.x + 24, host.x + host.w - 24)
      : clamp(enemy.x + enemy.w / 2, host.x + 24, host.x + host.w - 24);
    enemy.x = enemy.infectionX - enemy.w / 2;
    enemy.y = host.y - enemy.h - 5;
    enemy.stun = 999;
    enemy.attackCooldown = Number.isFinite(enemy.attackCooldown) ? enemy.attackCooldown : .8 + index * .12;
    enemy.rhizoCharge = enemy.rhizoCharge || 0;
    enemy.rhizoLunge = enemy.rhizoLunge || 0;
    enemy.rhizoAttackDirection = enemy.rhizoAttackDirection || 1;
    enemy.rhizoHitApplied = Boolean(enemy.rhizoHitApplied);
    enemy.containmentTime = enemy.containmentTime || 0;
    enemy.contained = Boolean(enemy.contained);
    enemy.phase = Number.isFinite(enemy.phase) ? enemy.phase : index * 1.71 + Math.random() * TAU;
    if (!memory.has(enemy)) memory.set(enemy, { hp: enemy.hp, announced: false });
    return host;
  }

  function bacillusStrength(enemy, host) {
    let best = 0;
    const spreadRadius = Math.max(34, host.w * (enemy.colonization || .1) * .48);
    for (const film of state.level.biofilms || []) {
      if (!film.functional || film.platform !== host) continue;
      const radius = Math.max(28, film.radius || film.targetRadius || 0);
      const distance = Math.max(0, Math.abs((film.x || 0) - enemy.infectionX) - spreadRadius);
      if (distance >= radius * 1.35) continue;
      const maturity = clamp(film.protectionStrength || film.growth || .35, .2, 1);
      best = Math.max(best, maturity * (1 - distance / (radius * 1.35)));
    }
    return clamp(best, 0, 1);
  }

  function pseudomonasStrength(enemy, host, dt) {
    let best = 0;
    const entries = pseudomonas?.colonyStates;
    if (!entries) return 0;
    for (const entry of entries.values()) {
      const colony = entry.colony;
      if (!colony || colony.dormant || colony.vigor <= .04 || entry.ironReserve <= .025) continue;
      const sameRoot = colony.platform === host;
      const distance = Math.hypot(colony.x - enemy.infectionX, colony.y - host.y);
      const range = (sameRoot ? 285 : 215) + (colony.sourceCount || 1) * 18;
      if (distance >= range) continue;
      const reserve = clamp(entry.ironReserve / .7, 0, 1);
      const pressure = clamp((1 - distance / range) * reserve * colony.vigor * (sameRoot ? 1.18 : .82), 0, 1);
      if (pressure <= .02) continue;
      best = Math.max(best, pressure);
      entry.activePressure = Math.max(entry.activePressure || 0, pressure * .8);
      entry.ironReserve = Math.max(0, entry.ironReserve - dt * .0035 * pressure);
    }
    return clamp(best, 0, 1);
  }

  function prepare() {
    for (let index = 0; index < (state.level.enemies || []).length; index++) {
      const enemy = state.level.enemies[index];
      if (!enemy.alive) continue;
      ensure(enemy, index);
      enemy.stun = 999;
    }
  }

  function damagePlayerFromAttack(enemy, player) {
    const damage = enemy.colonization >= .72 ? 2 : 1;
    entities.damagePlayer?.(damage, damage > 1 ? 'hifa invasiva de Rhizoctonia' : 'hifa de Rhizoctonia', {
      infection: damage > 1 ? .22 : .1,
      invuln: damage > 1 ? 1.2 : 1.02,
      knockbackX: -enemy.rhizoAttackDirection * (damage > 1 ? 345 : 245),
      knockbackY: damage > 1 ? -300 : -225,
    });
  }

  function updateAttack(enemy, host, player, dt, control) {
    enemy.attackCooldown = Math.max(0, enemy.attackCooldown - dt);
    const playerCenterX = player.x + player.w / 2;
    const feetY = player.y + player.h;
    const onRoot = playerCenterX >= host.x - 8
      && playerCenterX <= host.x + host.w + 8
      && Math.abs(feetY - host.y) < 96;
    const dx = playerCenterX - enemy.infectionX;
    const distance = Math.abs(dx);
    const attackRange = 92 + enemy.colonization * 112;
    const suppressed = enemy.contained || control >= .82;

    if (suppressed || !onRoot || distance > attackRange + 55) {
      enemy.rhizoCharge = Math.max(0, enemy.rhizoCharge - dt * 1.65);
      enemy.rhizoLunge = Math.max(0, enemy.rhizoLunge - dt * 1.8);
      enemy.rhizoHitApplied = false;
      return;
    }

    if (enemy.rhizoLunge > 0) {
      enemy.rhizoLunge = Math.max(0, enemy.rhizoLunge - dt);
      const reach = attackRange * (1 - enemy.rhizoLunge / .34);
      enemy.attackTipX = enemy.infectionX + enemy.rhizoAttackDirection * reach;
      if (!enemy.rhizoHitApplied && Math.abs(playerCenterX - enemy.attackTipX) < 42 && Math.abs(feetY - host.y) < 88) {
        enemy.rhizoHitApplied = true;
        damagePlayerFromAttack(enemy, player);
      }
      if (enemy.rhizoLunge <= 0) {
        enemy.attackCooldown = 2.15 + control * 1.35;
        enemy.rhizoHitApplied = false;
      }
      return;
    }

    if (enemy.attackCooldown > 0 || distance > attackRange) {
      enemy.rhizoCharge = Math.max(0, enemy.rhizoCharge - dt * 1.2);
      return;
    }

    enemy.rhizoAttackDirection = Math.sign(dx) || enemy.rhizoAttackDirection;
    const chargeRate = (.82 + enemy.colonization * .42) * (1 - control * .62);
    enemy.rhizoCharge = clamp(enemy.rhizoCharge + dt * chargeRate, 0, 1);
    if (enemy.rhizoCharge >= 1) {
      enemy.rhizoCharge = 0;
      enemy.rhizoLunge = .34;
      enemy.rhizoHitApplied = false;
      announce('Rhizoctonia: a borda da colônia lançou uma hifa de ataque. Afaste-se do halo vermelho ou contenha o foco com Bacillus.', 4.2, 1.4);
    }
  }

  function updateEnemy(enemy, index, dt) {
    const host = ensure(enemy, index);
    if (!host || !enemy.alive) return;

    const mem = memory.get(enemy);
    if (mem && enemy.hp < mem.hp) {
      enemy.colonization = Math.max(.06, enemy.colonization - .13 * (mem.hp - enemy.hp));
      mem.hp = enemy.hp;
    }

    const bacillus = bacillusStrength(enemy, host);
    const iron = pseudomonasStrength(enemy, host, dt);
    enemy.bacillusControl = bacillus;
    enemy.ironLimitation = iron;
    const synergy = bacillus * (1 + iron * .6);
    const phaseFactor = 1 + Math.min(.35, Math.max(0, (state.campaign?.phase || 1) - 1) * .035);
    const naturalGrowth = (.012 + enemy.colonization * .012) * phaseFactor * (1 - iron * .58);
    const retreat = synergy * (.018 + bacillus * .025);
    const net = naturalGrowth - retreat;
    enemy.colonization = clamp(enemy.colonization + dt * net, .06, 1);

    if (bacillus >= .58 && enemy.colonization <= .18) enemy.containmentTime += dt * (.7 + bacillus);
    else enemy.containmentTime = Math.max(0, enemy.containmentTime - dt * .65);
    if (enemy.containmentTime >= 2.6) enemy.contained = true;
    if (enemy.contained && bacillus < .28) enemy.contained = false;
    if (enemy.contained) enemy.colonization = Math.max(.07, enemy.colonization - dt * .012);

    const control = clamp(bacillus * .74 + iron * .34, 0, 1);
    const pressure = enemy.contained
      ? .018
      : clamp(.08 + enemy.colonization * .72 - control * .42, .03, .9);
    host.rhizoctoniaPressure = Math.max(host.rhizoctoniaPressure || 0, pressure);
    host.rhizoctoniaColonization = Math.max(host.rhizoctoniaColonization || 0, enemy.colonization);
    host.rhizoctoniaControl = Math.max(host.rhizoctoniaControl || 0, control);

    if (enemy.contained || net < 0) {
      host.rootDamage = clamp((host.rootDamage || 0) - dt * (.004 + synergy * .013), 0, .94);
    } else {
      host.rootDamage = clamp((host.rootDamage || 0) + dt * pressure * (.012 + enemy.colonization * .012), 0, .94);
    }
    host.rootHealth = clamp(1 - (host.rootDamage || 0), .06, 1);

    updateAttack(enemy, host, state.player, dt, control);

    if (!mem.announced && Math.abs((state.player.x + state.player.w / 2) - enemy.infectionX) < 330) {
      mem.announced = true;
      announce('Controle de Rhizoctonia: Bacillus maduro contém a expansão; Pseudomonas com reserva de Fe enfraquece o fungo; o Pulso remove 1/3 da resistência.', 6.4, .2);
    }
  }

  function update(dt) {
    if (state.gameState !== 'play') return;
    activeCount = 0;
    controlledCount = 0;
    for (const root of state.level.platforms || []) {
      if (root.type !== 'root') continue;
      root.rhizoctoniaColonization = 0;
      root.rhizoctoniaControl = 0;
    }
    (state.level.enemies || []).forEach((enemy, index) => {
      if (!enemy.alive) return;
      activeCount++;
      updateEnemy(enemy, index, dt);
      if (enemy.contained || (enemy.bacillusControl || 0) >= .45) controlledCount++;
    });
  }

  function drawColonizedRoot(ctx, enemy, index) {
    const host = enemy.hostPlatform;
    if (!host) return;
    const colonization = clamp(enemy.colonization || 0, 0, 1);
    const span = clamp(40 + host.w * colonization * .86, 40, host.w - 18);
    const left = clamp(enemy.infectionX - span / 2, host.x + 8, host.x + host.w - span - 8);
    const top = host.y - 4;
    const control = clamp((enemy.bacillusControl || 0) * .74 + (enemy.ironLimitation || 0) * .34, 0, 1);

    ctx.save();
    const patch = ctx.createLinearGradient(left, 0, left + span, 0);
    patch.addColorStop(0, 'rgba(88,34,55,0)');
    patch.addColorStop(.18, `rgba(106,38,58,${.2 + colonization * .22})`);
    patch.addColorStop(.5, `rgba(48,18,31,${.36 + colonization * .32})`);
    patch.addColorStop(.82, `rgba(106,38,58,${.2 + colonization * .22})`);
    patch.addColorStop(1, 'rgba(88,34,55,0)');
    ctx.fillStyle = patch;
    ctx.fillRect(left, top, span, 13 + colonization * 13);

    const strandCount = 5 + Math.floor(colonization * 13);
    for (let i = 0; i < strandCount; i++) {
      const t = strandCount <= 1 ? .5 : i / (strandCount - 1);
      const x0 = enemy.infectionX;
      const x1 = left + span * t;
      const wave = Math.sin(index * 1.7 + i * 2.1) * (5 + colonization * 7);
      ctx.strokeStyle = enemy.contained ? 'rgba(151,126,116,.45)' : `rgba(255,91,124,${.25 + colonization * .42})`;
      ctx.lineWidth = 1 + colonization * 1.6;
      ctx.beginPath();
      ctx.moveTo(x0, top + 5 + (i % 3));
      ctx.bezierCurveTo(
        x0 + (x1 - x0) * .34,
        top + wave,
        x0 + (x1 - x0) * .72,
        top + 5 - wave * .45,
        x1,
        top + 5 + (i % 4),
      );
      ctx.stroke();
    }

    const cushions = Math.floor(colonization * 4.2);
    for (let i = 0; i < cushions; i++) {
      const x = left + span * ((i + 1) / (cushions + 1));
      const r = 4 + colonization * 5 + (i % 2) * 2;
      ctx.fillStyle = enemy.contained ? 'rgba(126,99,94,.64)' : 'rgba(136,49,72,.82)';
      ctx.strokeStyle = enemy.contained ? '#9effdf' : '#ff8297';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(x, top + 5, r, r * .48, 0, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }

    if (control > .05) {
      ctx.strokeStyle = control > .55 ? 'rgba(158,255,223,.75)' : 'rgba(213,255,109,.62)';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 5]);
      ctx.beginPath();
      ctx.moveTo(left, top - 4);
      ctx.lineTo(left + span, top - 4);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  }

  function drawStatus(ctx, enemy) {
    const host = enemy.hostPlatform;
    if (!host) return;
    const colonization = clamp(enemy.colonization || 0, 0, 1);
    const x = enemy.infectionX;
    const y = host.y + Math.min(33, host.h * .48);
    const width = Math.min(118, Math.max(78, host.w * .55));

    ctx.save();
    ctx.fillStyle = 'rgba(19,10,16,.82)';
    ctx.fillRect(x - width / 2 - 3, y - 3, width + 6, 19);
    ctx.fillStyle = '#ff5d82';
    ctx.fillRect(x - width / 2, y, width * colonization, 4);
    ctx.font = '700 8px Inter,system-ui';
    ctx.textAlign = 'center';
    ctx.fillStyle = enemy.contained ? '#9effdf' : '#ffd5df';
    ctx.fillText(`${stageLabel(enemy)} · ${Math.round(colonization * 100)}%`, x, y + 13);

    const labels = [];
    if ((enemy.bacillusControl || 0) > .04) labels.push(`Bacillus ${Math.round(enemy.bacillusControl * 100)}%`);
    if ((enemy.ironLimitation || 0) > .04) labels.push(`Fe limitado ${Math.round(enemy.ironLimitation * 100)}%`);
    if (labels.length) {
      ctx.fillStyle = '#d6ffb0';
      ctx.fillText(labels.join(' · '), x, y + 23);
    }
    ctx.restore();
  }

  function drawAttack(ctx, enemy) {
    const host = enemy.hostPlatform;
    if (!host) return;
    const charge = clamp(enemy.rhizoCharge || 0, 0, 1);
    const lunging = enemy.rhizoLunge > 0;
    if (charge <= .02 && !lunging) return;
    const startX = enemy.infectionX;
    const endX = lunging
      ? (enemy.attackTipX || startX)
      : startX + enemy.rhizoAttackDirection * (45 + charge * (70 + enemy.colonization * 70));
    const y = host.y - 10;
    ctx.save();
    ctx.globalAlpha = .3 + Math.max(charge, lunging ? .8 : 0) * .65;
    ctx.strokeStyle = '#ff416d';
    ctx.lineWidth = 2 + charge * 3;
    ctx.beginPath();
    ctx.moveTo(startX, y);
    ctx.quadraticCurveTo((startX + endX) / 2, y - 18 - charge * 14, endX, y - 4);
    ctx.stroke();
    ctx.fillStyle = '#ff8ba3';
    ctx.beginPath();
    ctx.arc(endX, y - 4, 4 + charge * 3, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function render(ctx) {
    ctx.save();
    ctx.translate(-state.cameraX, 0);
    (state.level.enemies || []).forEach((enemy, index) => {
      if (!enemy.alive || !ensure(enemy, index)) return;
      drawColonizedRoot(ctx, enemy, index);
      drawAttack(ctx, enemy);
      drawStatus(ctx, enemy);
    });
    ctx.restore();
  }

  function reset() {
    memory.clear();
    lastInstructionAt = -Infinity;
    controlledCount = 0;
    activeCount = 0;
  }

  return {
    get activeCount() { return activeCount; },
    get controlledCount() { return controlledCount; },
    prepare,
    update,
    render,
    reset,
  };
}
