import { H, W } from '../core/constants.js';

const TAU = Math.PI * 2;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function platformSeed(platform) {
  const x = Math.round(platform.x || 0);
  const y = Math.round(platform.y || 0);
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

export function createPlatformVisuals({ state }) {
  function drawRoot(ctx, platform) {
    const seed = platformSeed(platform);
    const radius = platform.final ? 18 : 15;
    ctx.save();
    roundedPath(ctx, platform, radius);
    ctx.clip();

    const fill = ctx.createLinearGradient(0, platform.y, 0, platform.y + platform.h);
    fill.addColorStop(0, platform.final ? '#e6c88f' : '#d9b477');
    fill.addColorStop(.18, platform.final ? '#bd8c58' : '#ad774e');
    fill.addColorStop(.72, '#5a382f');
    fill.addColorStop(1, '#2b1c25');
    ctx.fillStyle = fill;
    ctx.fillRect(platform.x, platform.y, platform.w, platform.h);

    const top = ctx.createLinearGradient(platform.x, platform.y, platform.x + platform.w, platform.y);
    top.addColorStop(0, 'rgba(255,240,194,.38)');
    top.addColorStop(.5, 'rgba(255,220,151,.72)');
    top.addColorStop(1, 'rgba(255,240,194,.28)');
    ctx.fillStyle = top;
    ctx.fillRect(platform.x, platform.y, platform.w, 7);

    ctx.lineCap = 'round';
    for (let i = 0; i < Math.max(3, Math.floor(platform.w / 68)); i++) {
      const startX = platform.x + 18 + pseudo(seed, i) * Math.max(10, platform.w - 36);
      const depth = 13 + pseudo(seed, i + 17) * Math.max(12, platform.h * .62);
      const sway = (pseudo(seed, i + 31) - .5) * 34;
      ctx.strokeStyle = i % 2
        ? 'rgba(255,220,158,.19)'
        : 'rgba(104,65,48,.42)';
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

    ctx.strokeStyle = 'rgba(255,229,174,.23)';
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
    ctx.strokeStyle = platform.final ? 'rgba(255,235,185,.9)' : 'rgba(246,213,157,.78)';
    ctx.lineWidth = 1.5;
    roundedPath(ctx, platform, radius);
    ctx.stroke();

    if (!platform.mycorrhizaStructure) {
      const hairCount = Math.max(2, Math.min(8, Math.floor(platform.w / 44)));
      ctx.strokeStyle = 'rgba(233,213,180,.58)';
      ctx.lineWidth = 1;
      for (let i = 0; i < hairCount; i++) {
        const x = platform.x + 14 + (i + .5) / hairCount * Math.max(12, platform.w - 28);
        const length = 7 + pseudo(seed, i + 71) * 10;
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
      if (platform.mycorrhizaStructure) continue;
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
    if (platform.recovery) return { text: 'Raiz de recuperação', color: '#d6afff' };
    if (platform.final) return { text: 'Raiz principal', color: '#ffe0a2' };
    if (platform.type === 'root') return { text: 'Raiz hospedeira', color: '#ffe0a2' };
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
