import { PLAYER_MAX_X, W } from './core/constants.js';
import { clamp, lerp, rects } from './core/math.js';
import { microbeEncounters } from './data/microbes.js';

export function createPhysicsSystem({ state, input, entities, hud, audio }) {
  function update(dt) {
    state.time += dt;
    if (state.gameState !== 'play') return;

    const player = state.player;
    const level = state.level;
    const keys = input.keys;

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
      player.vx = player.facing * 660;
      player.vy = 0;
    } else {
      const target = (right ? 1 : 0) - (left ? 1 : 0);
      if (target) player.facing = target;
      player.vx = lerp(player.vx, target * 245, 1 - Math.pow(.0008, dt));
      if (!target) player.vx *= Math.pow(.00002, dt);
      player.vy += 1180 * dt;
      player.vy = Math.min(player.vy, 720);
      if (player.jumpBuffer > 0 && player.coyote > 0) {
        player.vy = -465;
        player.jumpBuffer = 0;
        player.coyote = 0;
        entities.burst(player.x + 16, player.y + 48, '#d9ffc1', 8, 80);
      } else if (player.jumpBuffer > 0 && player.canDoubleJump && player.airJumpAvailable) {
        player.vy = -445;
        player.jumpBuffer = 0;
        player.airJumpAvailable = false;
        entities.burst(player.x + 16, player.y + 39, '#72e8dd', 22, 165);
        audio.toneNow(330, .11, 'triangle', .07);
      }
    }

    if (player.canDash && (keys.ShiftLeft || keys.ShiftRight || keys.KeyJ) && player.dashCooldown <= 0 && player.dashTime <= 0) {
      player.dashTime = .16;
      player.dashCooldown = .82;
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
      level.enemies.forEach(e => {
        if (e.alive && Math.hypot(e.x + e.w / 2 - (player.x + 16), e.y + e.h / 2 - (player.y + 24)) < 160) {
          e.alive = false;
          entities.burst(e.x + 20, e.y + 20, '#ff6f91', 24, 220);
        }
      });
    }

    const prevY = player.y;
    player.x += player.vx * dt;
    const maxX = level.endX !== undefined ? level.endX : PLAYER_MAX_X;
    player.x = clamp(player.x, 0, maxX - player.w);
    player.onGround = false;
    player.y += player.vy * dt;
    for (const p of level.platforms) {
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
    // Unbroken crystals act as solid walls — must use Pulse K to break through
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
    if (player.y > 760 || level.hazards.some(h => rects(player, h))) entities.respawn(false);

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
        let color = '#72e8dd';
        if (a.id === 'azo') {
          player.canDoubleJump = true;
          player.airJumpAvailable = true;
          player.soil += 6;
          player.hope += 5;
          hud.setMission('Use o salto duplo para alcançar a Micorriza');
          entities.discoverMicrobe('azospirillum', false);
        } else if (a.id === 'myco') {
          player.canDash = true;
          player.soil += 8;
          color = '#d6afff';
          hud.setMission('Atravesse o Cofre do Fósforo');
          entities.discoverMicrobe('myco', false);
        } else {
          player.canPulse = true;
          player.soil += 9;
          player.hope += 6;
          color = '#8db8ff';
          hud.setMission('Rompa os cristais e alcance a raiz principal');
          entities.discoverMicrobe('phos', false);
        }
        entities.burst(a.x, a.y, color, 42, 250);
        hud.showToast(a.name, a.desc, 4700);
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
    level.enemies.forEach(e => {
      if (!e.alive) return;
      e.x += e.vx * dt;
      if (e.x < e.left || e.x > e.right) e.vx *= -1;
      if (rects(player, e) && player.invuln <= 0) {
        player.vx = -player.facing * 260;
        player.vy = -260;
        player.invuln = .9;
        player.hope = Math.max(20, player.hope - 3);
        state.shake = .25;
        entities.burst(player.x + 16, player.y + 24, '#ff6f91', 16, 170);
      }
    });

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
    if (player.x > endX) {
      state.gameState = 'end';
      hud.showEnd();
      hud.setMission('Fase concluída');
    }
    if (player.x > 3600 && player.canPulse && level.endX === undefined) hud.setMission('Leve a energia mineral até a raiz principal');
    
    const maxCameraX = level.cameraMaxX !== undefined ? level.cameraMaxX : (4900 - W);
    state.cameraX = lerp(state.cameraX, clamp(player.x - 360, 0, maxCameraX), 1 - Math.pow(.0001, dt));
    state.shake = Math.max(0, state.shake - dt);
    hud.updateHud();
  }

  return { update };
}
