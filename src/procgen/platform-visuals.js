import { H, W } from '../core/constants.js';

const TAU = Math.PI * 2;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function platformSeed(platform) {
  const x = Math.round(platform.x || 0);
  const y = Math.round(platform.rootBaseY ?? platform.y ?? 0);
  const w = Math.round(platform.w || 0);
  return Math.abs((x * 73856093) ^ (y * 19349663) ^ (w * 83492791));
}

function pseudo(seed, index) {
  const value = Math.sin(seed * .000013 + index * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

function roundedPath(ctx, platform, radius) {
  ctx.beginPath();
  ctx.roundRect(platform.x, platform.y, platform.w, platform.h, radius);
}

function stateInfo(platform) {
  const health = clamp(platform.rootHealth ?? 1, 0, 1);
  const name = platform.rootState || (health >= .75 ? 'healthy' : health >= .5 ? 'stressed' : health >= .25 ? 'compromised' : 'collapse');
  if (name === 'healthy') return { label: 'saudável', color: '#9bea8f', overlay: 'rgba(99,208,127,.08)' };
  if (name === 'stressed') return { label: 'estressada', color: '#ffd36f', overlay: 'rgba(244,177,70,.12)' };
  if (name === 'compromised') return { label: 'comprometida', color: '#ff9c70', overlay: 'rgba(214,84,67,.18)' };
  return { label: 'em colapso', color: '#ff657f', overlay: 'rgba(79,25,38,.36)' };
}

export function createPlatformVisuals({ state }) {
  function drawRoot(ctx, platform) {
    const seed = platformSeed(platform);
    const radius = platform.final ? 18 : 15;
    const health = clamp(platform.rootHealth ?? 1, 0, 1);
    const maxHealth = clamp(platform.rootMaxHealth ?? 1, .01, 1);
    const permanentDamage = clamp(platform.permanentDamage || 0, 0, .7);
    const support = clamp(platform.supportIntegrity ?? health, 0, 1);
    const stateStyle = stateInfo(platform);

    ctx.save();
    roundedPath(ctx, platform, radius);
    ctx.clip();

    const fill = ctx.createLinearGradient(0, platform.y, 0, platform.y + platform.h);
    fill.addColorStop(0, platform.final ? '#e6c88f' : health < .25 ? '#765141' : health < .5 ? '#b47a58' : '#d9b477');
    fill.addColorStop(.18, platform.final ? '#bd8c58' : health < .25 ? '#593934' : '#ad774e');
    fill.addColorStop(.72, health < .25 ? '#38272c' : '#5a382f');
    fill.addColorStop(1, '#2b1c25');
    ctx.fillStyle = fill;
    ctx.fillRect(platform.x, platform.y, platform.w, platform.h);

    const top = ctx.createLinearGradient(platform.x, platform.y, platform.x + platform.w, platform.y);
    top.addColorStop(0, `rgba(255,240,194,${.18 + health * .2})`);
    top.addColorStop(.5, `rgba(255,220,151,${.25 + health * .47})`);
    top.addColorStop(1, `rgba(255,240,194,${.12 + health * .16})`);
    ctx.fillStyle = top;
    ctx.fillRect(platform.x, platform.y, platform.w, 7);

    ctx.fillStyle = stateStyle.overlay;
    ctx.fillRect(platform.x, platform.y, platform.w, platform.h);

    if (permanentDamage > .01) {
      const scarWidth = platform.w * permanentDamage;
      const scarX = platform.x + platform.w - scarWidth;
      const scar = ctx.createLinearGradient(scarX, platform.y, platform.x + platform.w, platform.y + platform.h);
      scar.addColorStop(0, 'rgba(80,42,47,.04)');
      scar.addColorStop(.45, `rgba(72,33,43,${.2 + permanentDamage * .55})`);
      scar.addColorStop(1, `rgba(37,20,31,${.28 + permanentDamage * .5})`);
      ctx.fillStyle = scar;
      ctx.fillRect(scarX, platform.y, scarWidth, platform.h);
      ctx.strokeStyle = `rgba(255,126,118,${.24 + permanentDamage * .48})`;
      ctx.lineWidth = 1.2;
      for (let i = 0; i < 2 + Math.floor(permanentDamage * 8); i++) {
        const x = scarX + pseudo(seed, i + 301) * Math.max(4, scarWidth);
        ctx.beginPath();
        ctx.moveTo(x, platform.y + 5);
        ctx.bezierCurveTo(x - 8, platform.y + platform.h * .3, x + 9, platform.y + platform.h * .58, x - 3, platform.y + platform.h - 5);
        ctx.stroke();
      }
    }

    const rootDamage = clamp(platform.rootDamage || 0, 0, 1);
    if (rootDamage > .025) {
      const stress = ctx.createLinearGradient(platform.x, platform.y, platform.x + platform.w, platform.y + platform.h);
      stress.addColorStop(0, `rgba(255,116,105,${rootDamage * .16})`);
      stress.addColorStop(.55, `rgba(128,42,54,${rootDamage * .24})`);
      stress.addColorStop(1, `rgba(72,22,40,${rootDamage * .12})`);
      ctx.fillStyle = stress;
      ctx.fillRect(platform.x, platform.y, platform.w, platform.h);

      const crackCount = 2 + Math.floor((1 - support) * 7);
      ctx.strokeStyle = `rgba(255,145,118,${.12 + rootDamage * .42})`;
      ctx.lineWidth = 1 + rootDamage * 1.8;
      for (let i = 0; i < crackCount; i++) {
        const xx = platform.x + platform.w * (.12 + pseudo(seed, i + 211) * .76);
        ctx.beginPath();
        ctx.moveTo(xx, platform.y + 6);
        ctx.bezierCurveTo(xx - 12, platform.y + platform.h * .28, xx + 18, platform.y + platform.h * .56, xx - 5, platform.y + platform.h * .82);
        ctx.stroke();
      }
    }

    if ((platform.healthTrend || 0) > 0 || (platform.recoveryPulse || 0) > .05) {
      const pulse = clamp(platform.recoveryPulse || .25, 0, 1);
      const flowCount = 3 + Math.floor((platform.noduleRecovery || 0) * 3 + (platform.mycorrhizaRecovery || 0) * 4);
      ctx.lineWidth = 1.1 + pulse;
      for (let i = 0; i < flowCount; i++) {
        const phase = (state.time * (.18 + i * .02) + pseudo(seed, i + 411)) % 1;
        const x = platform.x + 14 + phase * Math.max(12, platform.w - 28);
        const y = platform.y + 9 + (i % 3) * Math.min(12, platform.h * .18);
        ctx.strokeStyle = i % 2 ? `rgba(155,234,143,${.18 + pulse * .5})` : `rgba(255,211,111,${.16 + pulse * .44})`;
        ctx.beginPath();
        ctx.moveTo(x - 16, y + Math.sin(state.time * 3 + i) * 2);
        ctx.quadraticCurveTo(x, y - 5, x + 16, y + 1);
        ctx.stroke();
      }
    }

    ctx.lineCap = 'round';
    for (let i = 0; i < Math.max(3, Math.floor(platform.w / 68)); i++) {
      const startX = platform.x + 18 + pseudo(seed, i) * Math.max(10, platform.w - 36);
      const depth = 13 + pseudo(seed, i + 17) * Math.max(12, platform.h * .62);
      const sway = (pseudo(seed, i + 31) - .5) * 34;
      ctx.strokeStyle = i % 2
        ? `rgba(255,220,158,${.08 + health * .11})`
        : `rgba(104,65,48,${.18 + health * .24})`;
      ctx.lineWidth = 1.1 + pseudo(seed, i + 43) * 1.6;
      ctx.beginPath();
      ctx.moveTo(startX, platform.y + 5);
      ctx.bezierCurveTo(
        startX + sway * .25,
        platform.y + depth * .32,
        startX - sway * .4,
        platform.y + depth * .7,
        startX + sway,
        platform.y + depth,
      );
      ctx.stroke();
    }

    ctx.strokeStyle = `rgba(255,229,174,${.08 + health * .15})`;
    ctx.lineWidth = 1;
    for (let y = platform.y + 18; y < platform.y + platform.h - 8; y += 17) {
      ctx.beginPath();
      ctx.moveTo(platform.x + 9, y);
      ctx.bezierCurveTo(
        platform.x + platform.w * .28,
        y + Math.sin(seed + y) * 3,
        platform.x + platform.w * .68,
        y - 3,
        platform.x + platform.w - 9,
        y + 1,
      );
      ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = platform.final ? 'rgba(255,235,185,.9)' : platform.healthTrend > 0 ? 'rgba(155,234,143,.92)' : `${stateStyle.color}cc`;
    ctx.lineWidth = 1.4 + (1 - support) * 1.2;
    if (platform.rootState === 'collapse') ctx.setLineDash([5, 5]);
    roundedPath(ctx, platform, radius);
    ctx.stroke();
    ctx.setLineDash([]);

    if (!platform.mycorrhizaStructure) {
      const hairCount = Math.max(0, Math.min(9, Math.floor(platform.w / 44 * health)));
      ctx.strokeStyle = platform.healthTrend > 0 ? 'rgba(184,255,198,.78)' : `rgba(233,213,180,${.12 + health * .46})`;
      ctx.lineWidth = 1;
      for (let i = 0; i < hairCount; i++) {
        const x = platform.x + 14 + (i + .5) / Math.max(1, hairCount) * Math.max(12, platform.w - 28);
        const length = 5 + health * (5 + pseudo(seed, i + 71) * 9);
        const lean = (pseudo(seed, i + 83) - .5) * 8;
        ctx.beginPath();
        ctx.moveTo(x, platform.y + 1);
        ctx.quadraticCurveTo(x + lean * .35, platform.y - length * .55, x + lean, platform.y - length);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawSoil(ctx, platform) {
    const seed = platformSeed(platform);
    const radius = 10;
    ctx.save();
    roundedPath(ctx, platform, radius);
    ctx.clip();

    const fill = ctx.createLinearGradient(0, platform.y, 0, platform.y + platform.h);
    fill.addColorStop(0, '#745044');
    fill.addColorStop(.16, '#563831');
    fill.addColorStop(.68, '#352329');
    fill.addColorStop(1, '#211720');
    ctx.fillStyle = fill;
    ctx.fillRect(platform.x, platform.y, platform.w, platform.h);

    ctx.fillStyle = 'rgba(188,130,85,.25)';
    ctx.fillRect(platform.x, platform.y, platform.w, 5);

    ctx.strokeStyle = 'rgba(218,164,118,.14)';
    ctx.lineWidth = 1.2;
    for (let y = platform.y + 16; y < platform.y + platform.h; y += 15) {
      const offset = (pseudo(seed, Math.floor(y)) - .5) * 5;
      ctx.beginPath();
      ctx.moveTo(platform.x + 7, y);
      ctx.bezierCurveTo(
        platform.x + platform.w * .26,
        y + offset,
        platform.x + platform.w * .72,
        y - offset,
        platform.x + platform.w - 7,
        y + offset * .4,
      );
      ctx.stroke();
    }

    const grains = Math.max(7, Math.floor(platform.w * platform.h / 1250));
    for (let i = 0; i < grains; i++) {
      const x = platform.x + 9 + pseudo(seed, i + 101) * Math.max(5, platform.w - 18);
      const y = platform.y + 11 + pseudo(seed, i + 149) * Math.max(5, platform.h - 18);
      const r = 1.1 + pseudo(seed, i + 191) * 2.2;
      ctx.fillStyle = i % 3 === 0 ? 'rgba(222,165,116,.22)' : 'rgba(25,16,22,.32)';
      ctx.beginPath();
      ctx.ellipse(x, y, r * 1.25, r, pseudo(seed, i + 211) * TAU, 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    ctx.strokeStyle = 'rgba(151,103,82,.52)';
    ctx.lineWidth = 1.2;
    roundedPath(ctx, platform, radius);
    ctx.stroke();
  }

  function drawWorld(ctx) {
    ctx.save();
    ctx.translate(-state.cameraX, 0);
    for (const platform of state.level.platforms || []) {
      if (platform.mycorrhizaStructure || platform.azospirillumStructure) continue;
      if (platform.x + platform.w < state.cameraX - 80 || platform.x > state.cameraX + W + 80) continue;
      if (platform.type === 'root') drawRoot(ctx, platform);
      else drawSoil(ctx, platform);
    }
    ctx.restore();
  }

  function nearbyPlatform() {
    const player = state.player;
    const centerX = player.x + player.w / 2;
    const feetY = player.y + player.h;
    let best = null;
    let bestScore = 76;

    for (const platform of state.level.platforms || []) {
      if (platform.mycorrhizaStructure) continue;
      const horizontal = centerX < platform.x
        ? platform.x - centerX
        : centerX > platform.x + platform.w
          ? centerX - (platform.x + platform.w)
          : 0;
      const vertical = Math.abs(feetY - platform.y);
      const score = horizontal * 1.25 + vertical;
      if (score < bestScore) {
        best = platform;
        bestScore = score;
      }
    }
    return best ? { platform: best, score: bestScore } : null;
  }

  function labelFor(platform) {
    const health = Math.round(clamp(platform.rootHealth ?? 1, 0, 1) * 100);
    const maxHealth = Math.round(clamp(platform.rootMaxHealth ?? 1, 0, 1) * 100);
    const stateStyle = stateInfo(platform);
    const scar = maxHealth < 100 ? ` · máx. ${maxHealth}%` : '';
    if (platform.azospirillumStructure) {
      return { text: `Raiz lateral ${stateStyle.label} · ${health}%${scar}`, color: stateStyle.color };
    }
    if (platform.recovery) return { text: 'Raiz de recuperação', color: '#d6afff' };
    if (platform.final) return { text: 'Raiz principal', color: '#ffe0a2' };
    if (platform.type === 'root') {
      const recovery = platform.healthTrend > 0 ? ' · recuperando' : platform.unstable ? ' · sustentação instável' : '';
      return { text: `Raiz ${stateStyle.label} · ${health}%${scar}${recovery}`, color: stateStyle.color };
    }
    return { text: 'Solo', color: '#c99475' };
  }

  function renderLabel(ctx) {
    if (state.gameState !== 'play') return;
    const nearby = nearbyPlatform();
    if (!nearby) return;
    const { text, color } = labelFor(nearby.platform);
    const alpha = clamp(1 - nearby.score / 82, .25, 1);
    const player = state.player;
    const screenX = clamp(player.x + player.w / 2 - state.cameraX, 82, W - 82);
    const screenY = clamp(player.y - 38, 54, H - 70);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = '700 11px Inter,system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const width = ctx.measureText(text).width + 26;
    ctx.fillStyle = 'rgba(3,18,24,.78)';
    ctx.strokeStyle = `${color}aa`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(screenX - width / 2, screenY - 12, width, 24, 12);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.fillText(text, screenX, screenY + .5);
    ctx.restore();
  }

  return { drawWorld, renderLabel };
}
