import { H, W } from '../core/constants.js';
import { clamp } from '../core/math.js';
import { createMicrobeRenderer } from './microbes.js';

function mixHex(a, b, t) {
  const value = clamp(t, 0, 1);
  const parse = color => [
    parseInt(color.slice(1, 3), 16),
    parseInt(color.slice(3, 5), 16),
    parseInt(color.slice(5, 7), 16),
  ];
  const [ar, ag, ab] = parse(a);
  const [br, bg, bb] = parse(b);
  const channel = (x, y) => Math.round(x + (y - x) * value).toString(16).padStart(2, '0');
  return `#${channel(ar, br)}${channel(ag, bg)}${channel(ab, bb)}`;
}

export function createRenderer({ canvas, state, entities }) {
  const ctx = canvas.getContext('2d');
  const microbes = createMicrobeRenderer({ ctx, state, entities });

  function roundedRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  }

  function drawBackground() {
    const time = state.time;
    const cameraX = state.cameraX;
    const level = state.level;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0d2f37');
    g.addColorStop(.45, '#10262e');
    g.addColorStop(1, '#170f1b');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.globalAlpha = .22;
    for (let i = 0; i < 9; i++) {
      const x = ((i * 240 - cameraX * .18) % 1800) - 180;
      ctx.fillStyle = i % 2 ? '#4d7866' : '#285b64';
      ctx.beginPath();
      ctx.ellipse(x, 210 + i % 3 * 34, 240, 120, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.save();
    ctx.translate(-cameraX * .5, 0);
    ctx.globalAlpha = .27;
    level.roots.forEach(r => {
      ctx.strokeStyle = r.layer > .5 ? '#b7a071' : '#769873';
      ctx.lineWidth = r.thick;
      ctx.beginPath();
      ctx.moveTo(r.x, 60);
      ctx.bezierCurveTo(r.x + Math.sin(r.ang) * 50, 180, r.x + Math.sin(r.ang) * 100, 300, r.x + Math.sin(r.ang) * r.len, 60 + r.len);
      ctx.stroke();
    });
    ctx.restore();
    level.spores.forEach(s => {
      const sx = s.x - cameraX * .3;
      if (sx < -10 || sx > W + 10) return;
      ctx.globalAlpha = .16 + .14 * Math.sin(time * s.s + s.p);
      ctx.fillStyle = s.p > 3 ? '#6ce7df' : '#b7f36b';
      ctx.beginPath();
      ctx.arc(sx, s.y + Math.sin(time * s.s + s.p) * 5, s.r, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  function drawRootStress(platform, health, time) {
    const damage = 1 - health;
    if (damage <= .08) return;

    const veinCount = Math.max(2, Math.floor(damage * 8));
    ctx.save();
    ctx.globalAlpha = .18 + damage * .55;
    ctx.strokeStyle = damage > .62 ? '#4d1f31' : '#813f3d';
    ctx.lineWidth = 1 + damage * 1.6;
    for (let i = 0; i < veinCount; i++) {
      const x = platform.x + 14 + ((i * 47 + platform.logicIndex * 19) % Math.max(20, platform.w - 28));
      const y = platform.y + 8 + (i % 3) * Math.min(14, platform.h * .18);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 7 + damage * 10, y + 8);
      ctx.lineTo(x + 3, y + 15 + damage * 10);
      ctx.stroke();
    }
    ctx.restore();

    if (platform.healthTrend) {
      const alpha = clamp(platform.healthTrendTime || 0, 0, 1) * .34;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = platform.healthTrend > 0 ? '#9dffb1' : '#ff6f91';
      ctx.lineWidth = 3;
      roundedRect(platform.x - 2, platform.y - 2, platform.w + 4, platform.h + 4, 15);
      ctx.stroke();
      ctx.restore();
    }

    if (damage > .55) {
      ctx.save();
      ctx.globalAlpha = .12 + damage * .18;
      ctx.fillStyle = '#ff6f91';
      const pulse = 3 + Math.sin(time * 2.5 + platform.x * .01) * 1.2;
      for (let i = 0; i < 5; i++) {
        const x = platform.x + platform.w * (i + .5) / 5;
        ctx.beginPath();
        ctx.arc(x, platform.y + 9, pulse, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawRhizoctonia(enemy, index, time) {
    const hpRatio = clamp((enemy.hp ?? 3) / Math.max(1, enemy.maxHp || 3), 0, 1);
    const charge = clamp(enemy.attackCharge || 0, 0, 1);
    const lunge = enemy.mode === 'lunge' ? 1 : 0;
    const stunned = enemy.mode === 'stunned';
    const pulse = 1 + Math.sin(time * 2.4 + index) * .05;

    ctx.save();
    ctx.translate(enemy.x + enemy.w / 2, enemy.y + enemy.h / 2 + 4);
    ctx.scale(pulse * (1 + charge * .12), pulse * .76);

    ctx.fillStyle = 'rgba(35,17,25,.9)';
    ctx.beginPath();
    ctx.ellipse(0, 7, 30, 19, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 18 + charge * 16;
    ctx.shadowColor = stunned ? '#ffca7d' : '#ff5d82';
    const cushion = ctx.createRadialGradient(-5, -5, 2, 0, 2, 25);
    cushion.addColorStop(0, stunned ? '#c98560' : '#b54c64');
    cushion.addColorStop(.58, '#71334f');
    cushion.addColorStop(1, '#3b1f31');
    ctx.fillStyle = cushion;
    ctx.beginPath();
    ctx.ellipse(0, 0, 22 + charge * 4, 13 + lunge * 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.strokeStyle = stunned ? '#ffd38b' : '#ff8297';
    ctx.lineWidth = 1.7 + charge;
    for (let k = 0; k < 8; k++) {
      const direction = k < 4 ? -1 : 1;
      const row = k % 4;
      const startX = direction * (8 + row * 3);
      const endX = direction * (27 + row * 7 + charge * 13);
      const endY = 7 + (row - 1.5) * 6;
      ctx.beginPath();
      ctx.moveTo(startX, 2 + row);
      ctx.bezierCurveTo(
        direction * (16 + row * 4),
        -8 + row * 5,
        direction * (22 + row * 5),
        12 + row * 2,
        endX,
        endY,
      );
      ctx.stroke();
    }

    ctx.fillStyle = '#3a1726';
    for (let k = 0; k < 7; k++) {
      const angle = k / 7 * Math.PI * 2 + time * .08;
      ctx.beginPath();
      ctx.arc(Math.cos(angle) * 13, Math.sin(angle) * 7, 2.2 + (k % 2), 0, Math.PI * 2);
      ctx.fill();
    }

    if (charge > .05) {
      ctx.globalAlpha = .28 + charge * .6;
      ctx.strokeStyle = '#ff416d';
      ctx.lineWidth = 2 + charge * 2;
      ctx.beginPath();
      ctx.ellipse(0, 0, 29 + charge * 14, 19 + charge * 7, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    ctx.save();
    ctx.font = '700 9px Inter,system-ui';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd5df';
    ctx.fillText('Rhizoctonia', enemy.x + enemy.w / 2, enemy.y - 13);
    ctx.fillStyle = 'rgba(22,12,18,.78)';
    ctx.fillRect(enemy.x - 1, enemy.y - 8, enemy.w + 2, 5);
    ctx.fillStyle = hpRatio > .5 ? '#ff8297' : '#ffb15c';
    ctx.fillRect(enemy.x, enemy.y - 7, enemy.w * hpRatio, 3);
    ctx.restore();
  }

  function drawWorld() {
    const { time, cameraX, level } = state;
    const player = state.player;
    ctx.save();
    ctx.translate(-cameraX, 0);
    if (level.endX === undefined) {
      ctx.strokeStyle = 'rgba(108,231,223,.22)';
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 10]);
      for (let x = 1180; x < 3120; x += 150) {
        ctx.beginPath();
        ctx.moveTo(x, 640);
        ctx.bezierCurveTo(x + 40, 520, x - 60, 430, x + 70, 300);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    level.platforms.forEach(p => {
      const health = p.type === 'root' ? clamp(p.rootHealth ?? 1, .06, 1) : 1;
      const damage = 1 - health;
      const grad = ctx.createLinearGradient(0, p.y, 0, p.y + p.h);
      const rootTop = mixHex('#c79964', '#703445', damage);
      const rootMiddle = mixHex('#9a6c4c', '#4a2634', damage);
      grad.addColorStop(0, p.type === 'root' ? rootTop : '#77513b');
      grad.addColorStop(.15, p.type === 'root' ? rootMiddle : '#5b392f');
      grad.addColorStop(1, mixHex('#241821', '#190f18', damage));
      ctx.fillStyle = grad;
      roundedRect(p.x, p.y, p.w, p.h, p.type === 'root' ? 14 : 10);
      ctx.fill();
      ctx.fillStyle = p.type === 'root'
        ? `rgba(${Math.round(255 - damage * 60)},${Math.round(226 - damage * 115)},${Math.round(170 - damage * 70)},${.22 - damage * .08})`
        : 'rgba(230,170,100,.12)';
      ctx.fillRect(p.x, p.y, p.w, 5);
      if (p.type !== 'root') {
        ctx.fillStyle = 'rgba(255,255,255,.045)';
        for (let i = 16; i < p.w; i += 32) ctx.fillRect(p.x + i, p.y + 18 + (i % 64), 5, 5);
      } else {
        drawRootStress(p, health, time);
      }
    });

    level.hazards.forEach(h => {
      const g = ctx.createLinearGradient(0, h.y, 0, h.y + h.h);
      g.addColorStop(0, 'rgba(255,111,145,.15)');
      g.addColorStop(1, 'rgba(255,111,145,.02)');
      ctx.fillStyle = g;
      ctx.fillRect(h.x, h.y, h.w, h.h);
      for (let i = 0; i < h.w; i += 18) {
        ctx.fillStyle = 'rgba(255,111,145,.35)';
        ctx.beginPath();
        ctx.moveTo(h.x + i, h.y + h.h);
        ctx.lineTo(h.x + i + 9, h.y + 4);
        ctx.lineTo(h.x + i + 18, h.y + h.h);
        ctx.fill();
      }
    });

    if (level.endX === undefined) {
      ctx.strokeStyle = '#cfaa72';
      ctx.lineWidth = 14;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(3850, 465);
      ctx.bezierCurveTo(4040, 360, 4290, 370, 4740, 520);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,233,182,.5)';
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    level.crystals.forEach(c => {
      if (c.broken) return;
      ctx.save();
      ctx.translate(c.x + c.w / 2, c.y + c.h);
      const glow = ctx.createRadialGradient(0, -c.h * .55, 4, 0, -c.h * .55, c.h);
      glow.addColorStop(0, 'rgba(255,177,92,.65)');
      glow.addColorStop(1, 'rgba(255,177,92,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(-c.w, -c.h * 1.6, c.w * 2, c.h * 1.8);
      ctx.fillStyle = '#d78353';
      ctx.strokeStyle = '#ffca7d';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-c.w * .48, 0);
      ctx.lineTo(-c.w * .32, -c.h * .52);
      ctx.lineTo(-c.w * .1, -c.h);
      ctx.lineTo(c.w * .12, -c.h * .6);
      ctx.lineTo(c.w * .34, -c.h * .88);
      ctx.lineTo(c.w * .48, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    });

    level.exudates.forEach((o, i) => {
      if (o.taken) return;
      const bob = Math.sin(time * 2 + i) * 7;
      ctx.shadowBlur = 18;
      ctx.shadowColor = '#b7f36b';
      ctx.fillStyle = '#cfff88';
      ctx.beginPath();
      ctx.arc(o.x, o.y + bob, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(183,243,107,.5)';
      ctx.beginPath();
      ctx.arc(o.x, o.y + bob, 14 + Math.sin(time * 3 + i) * 2, 0, Math.PI * 2);
      ctx.stroke();
    });

    microbes.discoverVisibleEncounters();
    level.checkpoints.forEach((c, ci) => {
      ctx.save();
      ctx.translate(c.x, c.y);
      const col = c.active ? '#70e5d6' : 'rgba(185,220,207,.35)';
      const glow = c.active ? .20 : .06;
      ctx.fillStyle = `rgba(112,229,214,${glow})`;
      for (let i = 0; i < 7; i++) {
        const a = i / 7 * Math.PI * 2 + time * .12;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * 18, Math.sin(a) * 13, 17 + Math.sin(time + i) * 2, 0, Math.PI * 2);
        ctx.fill();
      }
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * Math.PI * 2 + ci * .45;
        microbes.drawBacteriumWithFlags(Math.cos(a) * 19, Math.sin(a) * 13, a + Math.PI / 2, .55, col, i + ci, 'short', 'peri', c.active && i % 3 === 0 ? .9 : 0);
      }
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.4;
      ctx.setLineDash([3, 5]);
      ctx.beginPath();
      ctx.arc(0, 0, 31 + Math.sin(time * 2 + ci) * 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    });

    microbes.drawMicrobeEcosystems();
    level.allies.forEach((a, i) => {
      if (a.taken) return;
      ctx.save();
      ctx.translate(a.x, a.y + Math.sin(time * 2 + i) * 7);
      if (a.id === 'azo') {
        ctx.shadowBlur = 25;
        ctx.shadowColor = '#72e8dd';
        microbes.drawBacteriumWithFlags(0, 0, -.35, 1.45, '#72e8dd', i, 'curved', 'single');
        ctx.strokeStyle = 'rgba(199,165,255,.55)';
        ctx.lineWidth = 1.4;
        for (let k = 0; k < 3; k++) {
          ctx.beginPath();
          ctx.arc(0, 0, 22 + k * 9 + Math.sin(time * 2 + k) * 2, 0, Math.PI * 2);
          ctx.stroke();
        }
      } else if (a.id === 'myco') {
        ctx.shadowBlur = 26;
        ctx.shadowColor = '#d6afff';
        ctx.strokeStyle = '#d6afff';
        ctx.lineWidth = 2.4;
        for (let k = 0; k < 7; k++) {
          const ang = k / 7 * Math.PI * 2 + time * .06;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.bezierCurveTo(Math.cos(ang) * 18, Math.sin(ang) * 12, Math.cos(ang + .4) * 30, Math.sin(ang + .4) * 24, Math.cos(ang) * 38, Math.sin(ang) * 30);
          ctx.stroke();
        }
        ctx.fillStyle = '#f0dcff';
        ctx.beginPath();
        ctx.arc(0, 0, 11, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.shadowBlur = 24;
        ctx.shadowColor = '#8db8ff';
        ctx.fillStyle = '#65768b';
        ctx.strokeStyle = '#ffd176';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-22, 15);
        ctx.lineTo(-15, -18);
        ctx.lineTo(3, -28);
        ctx.lineTo(24, -8);
        ctx.lineTo(20, 17);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        for (let k = 0; k < 5; k++) {
          const ang = k / 5 * Math.PI * 2 + time * .15;
          microbes.drawOrganicBacterium(Math.cos(ang) * 33, Math.sin(ang) * 22, ang + 1.5, .62, '#8db8ff', k, 'short');
        }
      }
      ctx.shadowBlur = 0;
      ctx.restore();
    });

    level.enemies.forEach((enemy, index) => {
      if (!enemy.alive) return;
      drawRhizoctonia(enemy, index, time);
    });

    level.particles.forEach(p => {
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
    level.pulses.forEach(p => {
      ctx.globalAlpha = clamp(p.life / .34, 0, 1);
      ctx.strokeStyle = '#ffb15c';
      ctx.lineWidth = 6 * ctx.globalAlpha;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.stroke();
    });
    ctx.globalAlpha = 1;
    drawPlayer();
    ctx.restore();
  }

  function drawFungalAttachment(player, time) {
    const infection = clamp(player.infection || 0, 0, 1);
    if (infection < .06) return;
    const count = 2 + Math.floor(infection * 10);
    ctx.save();
    ctx.globalAlpha = .28 + infection * .65;
    ctx.strokeStyle = infection > .7 ? '#ff657f' : '#c86b85';
    ctx.fillStyle = infection > .7 ? '#8e2949' : '#71334f';
    ctx.lineWidth = 1 + infection * 1.2;
    for (let i = 0; i < count; i++) {
      const seed = i * 1.73;
      const x = -10 + ((i * 7) % 21);
      const y = -12 + ((i * 11) % 31);
      const radius = 1.4 + (i % 3) * .7 + infection;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
      if (i % 2 === 0) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(
          x + Math.sin(time * 2 + seed) * 6,
          y - 5 - infection * 5,
          x + Math.cos(time + seed) * (7 + infection * 6),
          y + Math.sin(seed) * 6,
        );
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawPlayer() {
    const player = state.player;
    const time = state.time;
    ctx.save();
    ctx.translate(player.x + 16, player.y + 24);
    ctx.scale(player.facing, 1);
    if (!player.alive) {
      ctx.rotate(-.28);
      ctx.globalAlpha = .42;
    }
    const blink = player.invuln > 0 && Math.floor(time * 14) % 2 === 0;
    if (blink) ctx.globalAlpha = .35;
    ctx.strokeStyle = '#ff6f91';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-8, -8);
    ctx.quadraticCurveTo(-28 - player.vx * .02, -2, -34 - player.vx * .035, 7);
    ctx.stroke();
    ctx.shadowBlur = 18;
    ctx.shadowColor = '#6ce7df';
    ctx.fillStyle = '#172f39';
    roundedRect(-13, -18, 26, 36, 10);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#6ce7df';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#dffdf4';
    ctx.beginPath();
    ctx.arc(0, -18, 12, Math.PI, 0);
    ctx.lineTo(12, -10);
    ctx.lineTo(-12, -10);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#173e47';
    ctx.beginPath();
    ctx.ellipse(2, -17, 7, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#dffdf4';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(-7, 16);
    ctx.lineTo(-8, 24);
    ctx.moveTo(7, 16);
    ctx.lineTo(9, 24);
    ctx.stroke();

    drawFungalAttachment(player, time);

    if (player.canPulse) {
      ctx.shadowBlur = 16;
      ctx.shadowColor = '#ffb15c';
      ctx.fillStyle = '#ffb15c';
      ctx.beginPath();
      ctx.arc(15, -2, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    if ((player.nematodeLoad || 0) >= 2) {
      ctx.fillStyle = '#ffd7a0';
      ctx.font = '800 8px Inter,system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('DASH BLOQUEADO', 0, -36);
    }
    ctx.restore();
  }

  function drawIntroBackdrop() {
    drawBackground();
    ctx.save();
    ctx.globalAlpha = .6;
    ctx.translate(-120, 0);
    ctx.fillStyle = '#51382f';
    ctx.fillRect(0, 575, 1500, 200);
    for (let i = 0; i < 14; i++) {
      ctx.strokeStyle = 'rgba(210,169,105,.4)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(i * 120 + 40, 590);
      ctx.quadraticCurveTo(i * 120 + 80, 500, i * 120 + 100, 380);
      ctx.stroke();
    }
    ctx.restore();
  }

  function render() {
    const sx = state.shake ? (Math.random() - .5) * state.shake * 24 : 0;
    const sy = state.shake ? (Math.random() - .5) * state.shake * 16 : 0;
    ctx.save();
    ctx.translate(sx, sy);
    if (state.gameState === 'intro') drawIntroBackdrop();
    else {
      drawBackground();
      drawWorld();
    }
    ctx.restore();
  }

  return { render, drawBackground, drawWorld, drawPlayer };
}
