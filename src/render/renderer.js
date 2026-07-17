import { H, W } from '../core/constants.js';
import { clamp } from '../core/math.js';
import { createMicrobeRenderer } from './microbes.js';

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

  function drawWorld() {
    const { time, cameraX, level } = state;
    const player = state.player;
    ctx.save();
    ctx.translate(-cameraX, 0);
    // Only draw hardcoded hyphal network and thick root in original level
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
      const grad = ctx.createLinearGradient(0, p.y, 0, p.y + p.h);
      grad.addColorStop(0, p.type === 'root' ? '#c79964' : '#77513b');
      grad.addColorStop(.15, p.type === 'root' ? '#9a6c4c' : '#5b392f');
      grad.addColorStop(1, '#241821');
      ctx.fillStyle = grad;
      roundedRect(p.x, p.y, p.w, p.h, p.type === 'root' ? 14 : 10);
      ctx.fill();
      ctx.fillStyle = p.type === 'root' ? 'rgba(255,226,170,.22)' : 'rgba(230,170,100,.12)';
      ctx.fillRect(p.x, p.y, p.w, 5);
      if (p.type !== 'root') {
        ctx.fillStyle = 'rgba(255,255,255,.045)';
        for (let i = 16; i < p.w; i += 32) ctx.fillRect(p.x + i, p.y + 18 + (i % 64), 5, 5);
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

    // Only draw hardcoded thick root in original level
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

    level.enemies.forEach((e, i) => {
      if (!e.alive) return;
      ctx.save();
      ctx.translate(e.x + e.w / 2, e.y + e.h / 2 + Math.sin(time * 3.5 + i) * 3);
      ctx.shadowBlur = 18;
      ctx.shadowColor = '#ff6f91';
      ctx.fillStyle = '#71334f';
      ctx.beginPath();
      for (let k = 0; k < 10; k++) {
        const a = k / 10 * Math.PI * 2;
        const r = (k % 2 ? 18 : 23) + Math.sin(time * 2 + k + i) * 2;
        const px = Math.cos(a) * r;
        const py = Math.sin(a) * r * .72;
        k ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#ff8297';
      ctx.lineWidth = 2;
      for (let k = 0; k < 5; k++) {
        const a = k / 5 * Math.PI * 2 + time * .18;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * 12, Math.sin(a) * 9);
        ctx.quadraticCurveTo(Math.cos(a + .4) * 28, Math.sin(a + .4) * 20, Math.cos(a) * 36, Math.sin(a) * 27);
        ctx.stroke();
      }
      ctx.fillStyle = '#ffbfd0';
      ctx.beginPath();
      ctx.arc(-6, -4, 2.7, 0, Math.PI * 2);
      ctx.arc(7, -4, 2.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
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

  function drawPlayer() {
    const player = state.player;
    const time = state.time;
    ctx.save();
    ctx.translate(player.x + 16, player.y + 24);
    ctx.scale(player.facing, 1);
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
    if (player.canPulse) {
      ctx.shadowBlur = 16;
      ctx.shadowColor = '#ffb15c';
      ctx.fillStyle = '#ffb15c';
      ctx.beginPath();
      ctx.arc(15, -2, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
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
