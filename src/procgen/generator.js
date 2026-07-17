import { createRandom } from './random.js';
import { generateLogicGraph } from './logic.js';
import { generatePrimitives } from './primitives.js';
import { generateGeometry } from './geometry.js';
import { validateChunk } from './agents.js';

const TAU = Math.PI * 2;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function traversalLimits(chunk, primitive, index) {
  const requiresDouble = primitive.requires.includes('doubleJump');
  const requiresDash = primitive.requires.includes('dash');
  const isLearning = chunk.isSkillIntro || chunk.allyId || chunk.isCheckpoint;

  if (index < 4) {
    return { minGap: 42, maxGap: 92, maxRise: 28, maxDrop: 58, minWidth: 175 };
  }
  if (isLearning) {
    return { minGap: 45, maxGap: 108, maxRise: 38, maxDrop: 68, minWidth: 185 };
  }
  if (requiresDash) {
    return {
      minGap: 100,
      maxGap: chunk.difficultyTarget === 'hard' ? 288 : 246,
      maxRise: 48,
      maxDrop: 92,
      minWidth: 118,
    };
  }
  if (requiresDouble) {
    return {
      minGap: 78,
      maxGap: chunk.difficultyTarget === 'hard' ? 238 : 205,
      maxRise: 112,
      maxDrop: 142,
      minWidth: 118,
    };
  }
  return {
    minGap: 45,
    maxGap: chunk.difficultyTarget === 'hard' ? 142 : 122,
    maxRise: chunk.difficultyTarget === 'hard' ? 58 : 46,
    maxDrop: chunk.difficultyTarget === 'hard' ? 96 : 82,
    minWidth: chunk.difficultyTarget === 'hard' ? 102 : 132,
  };
}

function stabilizeGeometry(candidate, previous, chunk, primitive, index) {
  const limits = traversalLimits(chunk, primitive, index);
  const previousEnd = previous.x + previous.w;
  const rawGap = candidate.x - previousEnd;
  const rawDeltaY = candidate.y - previous.y;

  candidate.x = previousEnd + clamp(rawGap, limits.minGap, limits.maxGap);
  candidate.y = previous.y + clamp(rawDeltaY, -limits.maxRise, limits.maxDrop);
  candidate.y = clamp(candidate.y, 235, 565);
  candidate.w = Math.max(candidate.w, limits.minWidth);
  candidate.h = clamp(candidate.h, 42, 88);
  candidate.logicIndex = index;
  return candidate;
}

function isForgivingChunk(chunk, index) {
  return index < 4 || chunk.isSkillIntro || chunk.allyId || chunk.isCheckpoint || chunk.difficultyTarget !== 'hard';
}

function validated(candidate, previous, primitive, chunk, index) {
  if (!validateChunk(previous, candidate, primitive, 'normal')) return false;
  if (isForgivingChunk(chunk, index) && !validateChunk(previous, candidate, primitive, 'conservative')) return false;
  return true;
}

function createSafeFallback(previous, chunk, primitives, rnd, index) {
  const basic = primitives.find(p => p.id === 'running-jump-short')
    || primitives.find(p => p.requires.length === 0)
    || primitives[0];

  const baseDelta = (rnd() - .5) * (index < 4 ? 24 : 42);
  for (let attempt = 0; attempt < 8; attempt++) {
    const gap = Math.max(28, (index < 4 ? 82 : 102) - attempt * 9);
    const candidate = {
      x: previous.x + previous.w + gap,
      y: clamp(previous.y + baseDelta * (1 - attempt / 10), 250, 555),
      w: 185 + rnd() * 55,
      h: 48 + rnd() * 28,
      type: rnd() > .25 ? 'root' : 'soil',
      logicIndex: index,
      repaired: true,
    };
    if (validated(candidate, previous, basic, chunk, index)) return { platform: candidate, primitive: basic };
  }

  return {
    platform: {
      x: previous.x + previous.w + 24,
      y: previous.y,
      w: 230,
      h: 58,
      type: 'root',
      logicIndex: index,
      repaired: true,
    },
    primitive: basic,
  };
}

function createRecoveryRoots(previous, next, chunk, rnd, index) {
  const previousEnd = previous.x + previous.w;
  const gap = next.x - previousEnd;
  const ordinaryTraversal = !chunk.requires.includes('doubleJump') && !chunk.requires.includes('dash');
  const shouldAdd = (ordinaryTraversal && gap > 104) || index < 3;
  if (!shouldAdd || gap < 82) return [];

  const width = clamp(gap * .52, 82, 138);
  const midpoint = previousEnd + gap * (.48 + (rnd() - .5) * .08);
  const top = clamp(Math.max(previous.y, next.y) + 92 + rnd() * 22, 535, 620);
  return [{
    x: midpoint - width / 2,
    y: top,
    w: width,
    h: 34,
    type: 'root',
    recovery: true,
    logicIndex: index,
  }];
}

export function generateLevel(seedString) {
  const rnd = createRandom(seedString);
  const primitives = generatePrimitives();
  const logic = generateLogicGraph(rnd);

  const platforms = [];
  const debugInfo = [];
  const allies = [];
  const checkpoints = [];
  const enemies = [];
  const hazards = [];
  const crystals = [];

  let prevPlatform = { x: 50, y: 500, w: 240, h: 100, type: 'root', logicIndex: -1 };
  platforms.push(prevPlatform);

  for (let i = 0; i < logic.length; i++) {
    const chunk = logic[i];
    let validPrims;

    if (chunk.requires.length > 0) {
      validPrims = primitives.filter(p => p.requires.length > 0 && p.requires.every(r => chunk.requires.includes(r)));
    } else {
      validPrims = primitives.filter(p => p.requires.length === 0);
    }
    if (validPrims.length === 0) validPrims = primitives.filter(p => p.requires.length === 0);

    let attempts = 0;
    let nextPlatform = null;
    let accepted = false;
    let prim = null;

    while (attempts < 12 && !accepted) {
      prim = validPrims[Math.floor(rnd() * validPrims.length)];
      nextPlatform = stabilizeGeometry(generateGeometry(chunk, prevPlatform, prim, rnd), prevPlatform, chunk, prim, i);
      accepted = validated(nextPlatform, prevPlatform, prim, chunk, i);
      attempts++;
    }

    if (!accepted) {
      const fallback = createSafeFallback(prevPlatform, chunk, primitives, rnd, i);
      nextPlatform = fallback.platform;
      prim = fallback.primitive;
      accepted = true;
    }

    if (chunk.isCheckpoint) {
      nextPlatform.w = Math.max(nextPlatform.w, 180);
      checkpoints.push({ x: nextPlatform.x + nextPlatform.w / 2, y: nextPlatform.y - 10, active: false });
    }

    if (chunk.allyId) {
      nextPlatform.w = Math.max(nextPlatform.w, 190);
      let desc = '';
      let name = '';
      if (chunk.allyId === 'azo') {
        name = 'Ari, o Azospirillum';
        desc = 'Azospirillum está associado ao desenvolvimento radicular. No jogo, ele libera o Impulso Radicular: pressione salto novamente no ar.';
      }
      if (chunk.allyId === 'myco') {
        name = 'Mira, a Micorriza';
        desc = 'As hifas ampliam o volume de solo explorado e ajudam a transportar fósforo e água até a raiz. No jogo, pressione Shift para o Impulso de Hifa.';
      }
      if (chunk.allyId === 'phos') {
        name = 'Sol, a Solubilizadora';
        desc = 'A comunidade concentra secreções junto ao mineral e libera parte do fósforo antes inacessível. Pressione K para o Pulso Mineral.';
      }
      allies.push({ id: chunk.allyId, x: nextPlatform.x + nextPlatform.w / 2, y: nextPlatform.y - 40, r: 28, taken: false, name, desc });
    }

    if (chunk.hasEnemy && !chunk.requires.includes('pulse') && nextPlatform.w > 130) {
      const ew = 42;
      const eh = 38;
      enemies.push({
        x: nextPlatform.x + nextPlatform.w / 2,
        y: nextPlatform.y - eh - 10,
        w: ew,
        h: eh,
        vx: 45 + rnd() * 20,
        left: nextPlatform.x + 20,
        right: nextPlatform.x + nextPlatform.w - ew - 20,
        alive: true,
      });
    }

    if (chunk.requires.includes('pulse')) {
      const cw = 56;
      const ch = 110;
      crystals.push({
        x: nextPlatform.x + nextPlatform.w - cw - 5,
        y: nextPlatform.y - ch,
        w: cw,
        h: ch,
        hp: 1,
        broken: false,
      });
    }

    const recoveryRoots = createRecoveryRoots(prevPlatform, nextPlatform, chunk, rnd, i);
    platforms.push(...recoveryRoots, nextPlatform);
    debugInfo.push({
      index: i,
      logic: chunk,
      primitive: prim.id,
      repairs: attempts,
      accepted,
      recoveryRoots: recoveryRoots.length,
      gap: Math.round(nextPlatform.x - (prevPlatform.x + prevPlatform.w)),
    });
    prevPlatform = nextPlatform;
  }

  const finalWidth = prevPlatform.x + prevPlatform.w + 1000;
  const hazardWidth = 500;
  const numHazards = Math.ceil(finalWidth / hazardWidth);
  for (let i = 0; i < numHazards; i++) {
    hazards.push({ x: i * hazardWidth, y: 674, w: hazardWidth, h: 46 });
  }

  const rootSpacing = 70;
  const numRoots = Math.ceil(finalWidth / rootSpacing);
  const roots = Array.from({ length: numRoots }, (_, i) => ({
    x: i * rootSpacing + rnd() * 60,
    y: 140 + rnd() * 500,
    len: 60 + rnd() * 190,
    ang: -.7 + rnd() * 1.4,
    thick: 1 + rnd() * 3,
    layer: rnd(),
  }));

  const numSpores = Math.min(400, Math.ceil(finalWidth / 25));
  const spores = Array.from({ length: numSpores }, () => ({
    x: rnd() * finalWidth,
    y: 90 + rnd() * 570,
    r: .7 + rnd() * 2.2,
    s: .2 + rnd() * .7,
    p: rnd() * TAU,
  }));

  const lastPlat = platforms[platforms.length - 1];
  const endX = lastPlat.x + lastPlat.w + 500;
  const exudates = [];
  for (let i = 2; i < platforms.length; i++) {
    const plat = platforms[i];
    if (plat.recovery || plat.w < 75 || rnd() >= .35) continue;
    exudates.push({
      x: plat.x + 30 + rnd() * Math.max(1, plat.w - 60),
      y: plat.y - 25 - rnd() * 15,
      taken: false,
    });
  }

  return {
    platforms,
    hazards,
    crystals,
    enemies,
    exudates,
    allies,
    checkpoints,
    roots,
    spores,
    particles: [],
    pulses: [],
    debugInfo,
    primitives,
    endX,
    cameraMaxX: Math.max(0, endX - 1000),
  };
}
