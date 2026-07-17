import { PLAYER_MAX_X, W } from './core/constants.js';
import { clamp, lerp, rects } from './core/math.js';
import { microbeEncounters } from './data/microbes.js';
import { unlockCampaignFeature } from './procgen/campaign-progression.js';

export function createPhysicsSystem({ state, input, entities, hud, audio }) {
  function collectCampaignUnlock(ally, player) {
    const feature = ally.unlockFeature
      || (ally.id === 'azo' ? 'doubleJump' : ally.id === 'myco' ? 'mycorrhizaStructures' : ally.id === 'phos' ? 'pulse' : ally.id === 'dash' ? 'dash' : null);
    unlockCampaignFeature(state, feature);

    let color = '#72e8dd';
    if (feature === 'doubleJump') {
      player.airJumpAvailable = true;
      player.soil += 6;
      player.hope += 5;
      hud.setMission('Pratique o salto duplo e continue restaurando o solo');
      entities.discoverMicrobe('azospirillum', false);
    } else if (feature === 'dash') {
      color = '#70e5d6';
      player.soil += 7;
      player.hope += 5;
      hud.setMission('Combine salto duplo e dash para alcançar a primeira raiz principal');
    } else if (feature === 'mycorrhizaStructures') {
      color = '#d6afff';
      player.soil += 8;
      player.hope += 5;
      hud.setMission('Libere exsudatos nas bordas para formar pontes e escadas micorrízicas');
      entities.discoverMicrobe('myco', false);
    } else if (feature === 'pulse') {
      color = '#8db8ff';
      player.soil += 9;
      player.hope += 6;
      hud.setMission('Use o pulso para romper cristais alaranjados e liberar minerais');
      entities.discoverMicrobe('phos', false);
    } else if (feature === 'azospirillumRoots') {
      player.soil += 8;
      player.hope += 6;
      hud.setMission('Inocule Azospirillum em raízes e use exsudatos para orientar novas ramificações');
      entities.discoverMicrobe('azospirillum', false);
    }
    return color;
  }

  function findEnemyHost(enemy, level) {
    const centerX = enemy.x + enemy.w / 2;
    let best = null;
    let bestDistance = Infinity;
    for (const platform of level.platforms) {
      if (platform.final || platform.recovery || platform.mycorrhizaStructure) continue;
      const pointX = clamp(centerX, platform.x, platform.x + platform.w);
      const distance = Math.hypot(pointX - centerX, platform.y - (enemy.y + enemy.h));
      if (distance < bestDistance) {
        best = platform;
        bestDistance = distance;
      }
    }
    if (best) best.type = 'root';
    return best;
  }

  function ensureRhizoctonia(enemy, level) {
    if (enemy.type === 'rhizoctonia' && enemy.hostPlatform) return;
    enemy.type = 'rhizoctonia';
    enemy.maxHp = enemy.maxHp || 3;
    enemy.hp = Number.isFinite(enemy.hp) ? enemy.hp : enemy.maxHp;
    enemy.mode = enemy.mode || 'colonizing';
    enemy.attackCharge = enemy.attackCharge || 0;
    enemy.attackTime = enemy.attackTime || 0;
    enemy.attackCooldown = enemy.attackCooldown || .5;
    enemy.attackDirection = enemy.attackDirection || 1;
    enemy.stun = enemy.stun || 0;
    enemy.colonization = enemy.colonization || .18;
    enemy.hostPlatform = enemy.hostPlatform || findEnemyHost(enemy, level);
    enemy.homeX = enemy.homeX ?? enemy.x;
    if (enemy.hostPlatform) {
      enemy.left = enemy.hostPlatform.x + 14;
      enemy.right = enemy.hostPlatform.x + enemy.hostPlatform.w - enemy.w - 14;
      enemy.x = clamp(enemy.x, enemy.left, enemy.right);
      enemy.y = enemy.hostPlatform.y - enemy.h - 5;
    }
  }

  function hitRhizoctonia(enemy, player) {
    ensureRhizoctonia(enemy, state.level);
    if (!enemy.alive) return;
    enemy.hp = Math.max(0, enemy.hp - 1);
    enemy.stun = 1.05;
    enemy.attackTime = 0;
    enemy.attackCharge = 0;
    enemy.mode = 'stunned';
    entities.burst(enemy.x + enemy.w / 2, enemy.y + enemy.h / 2, '#ffb15c', 28, 210);

    if (enemy.hp <= 0) {
      enemy.alive = false;
      if (enemy.hostPlatform) enemy.hostPlatform.rhizoctoniaPressure = 0;
      player.soil += 4.5;
      player.hope += 5;
      state.toast = 'Rhizoctonia desestruturada: o foco de infecção foi interrompido. Trichoderma será uma resposta biológica mais eficiente nas próximas etapas.';
      state.toastTime = 4.8;
      entities.burst(enemy.x + enemy.w / 2, enemy.y + enemy.h / 2, '#8df0a8', 38, 235);
    } else {
      state.toast = `Pulso interrompeu Rhizoctonia: resistência ${enemy.hp}/${enemy.maxHp}.`;
      state.toastTime = 3.2;
    }
  }

  function updateRhizoctonia(enemy, dt, player, level) {
    ensureRhizoctonia(enemy, level);
    if (!enemy.alive || !enemy.hostPlatform) return;

    const host = enemy.hostPlatform;
    enemy.left = host.x + 14;
    enemy.right = host.x + host.w - enemy.w - 14;
    enemy.x = clamp(enemy.x, enemy.left, enemy.right);
    enemy.y = host.y - enemy.h - 5;
    enemy.attackCooldown = Math.max(0, enemy.attackCooldown - dt);
    enemy.stun = Math.max(0, enemy.stun - dt);

    const playerCenterX = player.x + player.w / 2;
    const enemyCenterX = enemy.x + enemy.w / 2;
    const dx = playerCenterX - enemyCenterX;
    const horizontalDistance = Math.abs(dx);
    const verticalDistance = Math.abs((player.y + player.h) - host.y);
    const playerOnHostLevel = verticalDistance < 105;

    enemy.colonization = clamp(enemy.colonization + dt * (enemy.stun > 0 ? -.025 : .018), .12, 1);
    host.rhizoctoniaPressure = Math.max(
      host.rhizoctoniaPressure || 0,
      clamp(.12 + enemy.colonization * .58 + (enemy.mode === 'charging' ? .12 : 0), 0, 1),
    );

    if (enemy.stun > 0) {
      enemy.mode = 'stunned';
      return;
    }

    if (enemy.attackTime > 0) {
      enemy.mode = 'lunge';
      enemy.attackTime = Math.max(0, enemy.attackTime - dt);
      enemy.x = clamp(enemy.x + enemy.attackDirection * 165 * dt, enemy.left, enemy.right);
      if (enemy.attackTime <= 0) {
        enemy.mode = 'recovering';
        enemy.attackCooldown = Math.max(enemy.attackCooldown, 2.1);
      }
    } else if (playerOnHostLevel && horizontalDistance < 155 && enemy.attackCooldown <= 0) {
      enemy.mode = 'charging';
      enemy.attackCharge += dt;
      enemy.attackDirection = Math.sign(dx) || enemy.attackDirection;
      if (enemy.attackCharge >= .72) {
        enemy.attackCharge = 0;
        enemy.attackTime = .32;
        enemy.attackCooldown = 2.5;
        enemy.mode = 'lunge';
        state.toast = 'Rhizoctonia formou uma almofada de infecção e lançou uma hifa de ataque.';
        state.toastTime = 3.4;
      }
    } else {
      enemy.attackCharge = Math.max(0, enemy.attackCharge - dt * 1.5);
      enemy.mode = 'colonizing';
      const direction = Math.sign(dx) || 1;
      if (playerOnHostLevel && horizontalDistance < 330) {
        enemy.x = clamp(enemy.x + direction * (17 + enemy.colonization * 9) * dt, enemy.left, enemy.right);
      } else {
        enemy.x += enemy.vx * dt * .42;
        if (enemy.x <= enemy.left || enemy.x >= enemy.right) enemy.vx *= -1;
        enemy.x = clamp(enemy.x, enemy.left, enemy.right);
      }
    }

    if (rects(player, enemy) && player.invuln <= 0) {
      const charged = enemy.mode === 'lunge' && enemy.attackTime > 0;
      const damage = charged ? 2 : 1;
      entities.damagePlayer?.(damage, charged ? 'ataque de Rhizoctonia' : 'contato com Rhizoctonia', {
        infection: charged ? .24 : .11,
        invuln: charged ? 1.25 : 1.05,
        knockbackX: -enemy.attackDirection * (charged ? 360 : 255),
        knockbackY: charged ? -310 : -245,
      });
      enemy.attackTime = 0;
      enemy.attackCharge = 0;
      enemy.attackCooldown = Math.max(enemy.attackCooldown, 2.2);
      enemy.stun = .28;
    }
  }

  function update(dt) {
    state.time += dt;
    if (state.gameState !== 'play') return;

    const player = state.player;
    const level = state.level;
    const keys = input.keys;
    const moveMultiplier = clamp(player.moveMultiplier ?? 1, .48, 1);
    const jumpMultiplier = clamp(player.jumpMultiplier ?? 1, .68, 1);

    player.invuln = Math.max(0, player.invuln - dt);
    player.dashCooldown = Math.max(0, player.dashCooldown - dt);
    const left = keys.ArrowLeft || keys.KeyA;
    const right = keys.ArrowRight || keys.KeyD;
    const jump = keys.Space || keys.KeyW || keys.ArrowUp;
    const jumpPressed = jump && !state.jumpHeldLast;
    state.jumpHeldLast = jump;
    if (jumpPressed) player.jumpBuffer = .12;
    else player.jumpBuffer = Math.max(0, player.jumpBuffer - dt);
    if (player.onGround) {
      player.coyote = .12;
      player.airJumpAvailable = player.canDoubleJump;
    } else {
      player.coyote = Math.max(0, player.coyote - dt);
    }

    if (player.dashTime > 0) {
      player.dashTime -= dt;
      player.vx = player.facing * 660 * (.82 + moveMultiplier * .18);
      player.vy = 0;
    } else {
      const target = (right ? 1 : 0) - (left ? 1 : 0);
      if (target) player.facing = target;
      player.vx = lerp(player.vx, target * 245 * moveMultiplier, 1 - Math.pow(.0008, dt));
      if (!target) player.vx *= Math.pow(.00002, dt);
      player.vy += 1180 * dt;
      player.vy = Math.min(player.vy, 720);
      if (player.jumpBuffer > 0 && player.coyote > 0) {
        player.vy = -465 * jumpMultiplier;
        player.jumpBuffer = 0;
        player.coyote = 0;
        entities.burst(player.x + 16, player.y + 48, '#d9ffc1', 8, 80);
      } else if (player.jumpBuffer > 0 && player.canDoubleJump && player.airJumpAvailable) {
        player.vy = -445 * jumpMultiplier;
        player.jumpBuffer = 0;
        player.airJumpAvailable = false;
        entities.burst(player.x + 16, player.y + 39, '#72e8dd', 22, 165);
        audio.toneNow(330, .11, 'triangle', .07);
      }
    }

    if (
      player.canDash
      && !player.dashSuppressed
      && (keys.ShiftLeft || keys.ShiftRight || keys.KeyJ)
      && player.dashCooldown <= 0
      && player.dashTime <= 0
    ) {
      player.dashTime = .16;
      player.dashCooldown = .82 * (player.dashCooldownMultiplier || 1);
      entities.burst(player.x + 16, player.y + 24, '#6ce7df', 16, 170);
      keys.ShiftLeft = keys.ShiftRight = keys.KeyJ = false;
    }
    if (player.canPulse && keys.KeyK) {
      level.pulses.push({ x: player.x + 16, y: player.y + 24, r: 8, life: .34 });
      entities.burst(player.x + 16, player.y + 24, '#ffb15c', 22, 210);
      keys.KeyK = false;
      state.shake = .22;
      level.crystals.forEach(c => {
        if (!c.broken && Math.hypot(c.x + c.w / 2 - (player.x + 16), c.y + c.h / 2 - (player.y + 24)) < 185) {
          c.broken = true;
          player.soil += 9;
          player.hope += 7;
          entities.burst(c.x + c.w / 2, c.y + c.h / 2, '#ffb15c', 34, 260);
        }
      });
      level.enemies.forEach(enemy => {
        if (
          enemy.alive
          && Math.hypot(enemy.x + enemy.w / 2 - (player.x + 16), enemy.y + enemy.h / 2 - (player.y + 24)) < 160
        ) hitRhizoctonia(enemy, player);
      });
    }

    const prevY = player.y;
    player.x += player.vx * dt;
    const maxX = level.endX !== undefined ? level.endX : PLAYER_MAX_X;
    player.x = clamp(player.x, 0, maxX - player.w);
    player.onGround = false;
    player.y += player.vy * dt;
    for (const p of level.platforms) {
      if (p.mycorrhizaStructure || p.oneWay) {
        const previousFeet = prevY + player.h;
        const currentFeet = player.y + player.h;
        const horizontalOverlap = player.x + player.w > p.x + 3 && player.x < p.x + p.w - 3;
        const crossedTopWhileFalling = player.vy >= 0
          && previousFeet <= p.y + 8
          && currentFeet >= p.y;

        if (horizontalOverlap && crossedTopWhileFalling) {
          player.y = p.y - player.h;
          player.vy = 0;
          player.onGround = true;
        }
        continue;
      }

      if (rects(player, p)) {
        if (prevY + player.h <= p.y + 10 && player.vy >= 0) {
          player.y = p.y - player.h;
          player.vy = 0;
          player.onGround = true;
        } else if (prevY >= p.y + p.h - 8 && player.vy < 0) {
          player.y = p.y + p.h;
          player.vy = 0;
        } else if (player.vx > 0) {
          player.x = p.x - player.w;
          player.vx = 0;
        } else if (player.vx < 0) {
          player.x = p.x + p.w;
          player.vx = 0;
        }
      }
    }
    for (const c of level.crystals) {
      if (!c.broken && rects(player, c)) {
        if (player.vx > 0) {
          player.x = c.x - player.w;
          player.vx = 0;
        } else if (player.vx < 0) {
          player.x = c.x + c.w;
          player.vx = 0;
        }
      }
    }
    if (player.y > 760 || level.hazards.some(h => rects(player, h))) {
      entities.damagePlayer?.(player.maxVitality || 5, 'queda na zona hostil', { fatal: true, invuln: 0 });
      return;
    }

    level.exudates.forEach(o => {
      if (!o.taken && Math.hypot(o.x - (player.x + 16), o.y - (player.y + 24)) < 34) {
        o.taken = true;
        player.exudates++;
        player.soil += 2.3;
        player.hope += 1.7;
        entities.burst(o.x, o.y, '#b7f36b', 12, 130);
      }
    });
    level.allies.forEach(a => {
      if (!a.taken && Math.hypot(a.x - (player.x + 16), a.y - (player.y + 24)) < 54) {
        a.taken = true;
        const color = collectCampaignUnlock(a, player);
        entities.burst(a.x, a.y, color, 42, 250);
        hud.showToast(a.name || 'Novo mecanismo desbloqueado', a.desc || 'Uma nova função do solo vivo foi liberada.', 4700);
        hud.updateHud();
      }
    });

    microbeEncounters.forEach(z => {
      if (z.collect || state.discoveredMicrobes.has(z.id)) return;
      if (Math.hypot(z.x - (player.x + 16), z.y - (player.y + 24)) < z.r) entities.discoverMicrobe(z.id, true);
    });
    level.checkpoints.forEach(c => {
      if (!c.active && Math.abs((player.x + 16) - c.x) < 46 && Math.abs((player.y + 24) - c.y) < 76) {
        c.active = true;
        state.currentCheckpoint = { x: c.x - 16, y: c.y - 54 };
        entities.burst(c.x, c.y, '#70e5d6', 28, 165);
        const first = !state.discoveredMicrobes.has('bacillus');
        if (first) entities.discoverMicrobe('bacillus', false);
        hud.showToast(
          first ? 'Colônia resistente de Bacillus' : 'Checkpoint de Bacillus ativado',
          first ? 'Biofilme e endósporos estabilizam este ponto. No jogo, a colônia funciona como checkpoint.' : 'Esta microcolônia passa a ser seu novo ponto de retorno.',
          4300,
        );
      }
    });

    for (const platform of level.platforms) {
      if (platform.type === 'root') platform.rhizoctoniaPressure = 0;
    }
    level.enemies.forEach(enemy => updateRhizoctonia(enemy, dt, player, level));

    level.particles.forEach(p => {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 180 * dt;
      p.vx *= Math.pow(.12, dt);
    });
    for (let i = level.particles.length - 1; i >= 0; i--) if (level.particles[i].life <= 0) level.particles.splice(i, 1);
    level.pulses.forEach(p => {
      p.life -= dt;
      p.r += 520 * dt;
    });
    for (let i = level.pulses.length - 1; i >= 0; i--) if (level.pulses[i].life <= 0) level.pulses.splice(i, 1);

    const endX = level.endX !== undefined ? level.endX : 4590;
    if (player.x > endX) player.x = endX - player.w;

    const maxCameraX = level.cameraMaxX !== undefined ? level.cameraMaxX : (4900 - W);
    state.cameraX = lerp(state.cameraX, clamp(player.x - 360, 0, maxCameraX), 1 - Math.pow(.0001, dt));
    state.shake = Math.max(0, state.shake - dt);
    hud.updateHud();
  }

  return { update };
}
