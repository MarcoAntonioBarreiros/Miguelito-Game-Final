import { createRandom } from './random.js';
import { generateLogicGraph } from './logic.js';
import { generatePrimitives } from './primitives.js';
import { generateGeometry } from './geometry.js';
import { validateChunk } from './agents.js';

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
  
  // Starting platform
  let prevPlatform = { x: 50, y: 500, w: 200, h: 100, type: 'root' };
  platforms.push(prevPlatform);

  for (let i = 0; i < logic.length; i++) {
    const chunk = logic[i];
    
    // Select valid primitives for this chunk
    // Step 1: Get all primitives whose requirements are satisfied by current abilities
    const currentAbilities = chunk.requires.concat(
      chunk.isSkillIntro ? chunk.requires : []
    );
    
    let validPrims;
    
    if (chunk.requires.length > 0) {
      // When chunk requires a skill, ONLY use primitives that USE that skill
      validPrims = primitives.filter(p => 
        p.requires.length > 0 && p.requires.every(r => chunk.requires.includes(r))
      );
    } else {
      // No skill required — use basic primitives only (no special abilities)
      validPrims = primitives.filter(p => p.requires.length === 0);
    }

    if (validPrims.length === 0) {
      // Fallback: use basic primitives
      validPrims = primitives.filter(p => p.requires.length === 0);
    }

    let attempts = 0;
    let nextPlatform = null;
    let accepted = false;
    let prim = null;

    while (attempts < 5 && !accepted) {
      // Pick a primitive
      prim = validPrims[Math.floor(rnd() * validPrims.length)];
      
      // Generate geometry
      nextPlatform = generateGeometry(chunk, prevPlatform, prim, rnd);

      // Validate: only require normal agent to pass
      accepted = validateChunk(prevPlatform, nextPlatform, prim, 'normal');
      
      // If normal fails, try a geometric safety check as fallback
      if (!accepted) {
        const dx = nextPlatform.x - (prevPlatform.x + prevPlatform.w);
        const dy = nextPlatform.y - prevPlatform.y;
        const maxDx = Math.abs(prim.displacement.x) * 1.1;
        const maxDy = Math.abs(prim.displacement.y) * 1.2;
        // Accept if gap is within 80% of primitive's known displacement
        if (dx >= 0 && dx < maxDx * 0.8 && Math.abs(dy) < maxDy * 1.5) {
          accepted = true;
        }
      }

      attempts++;
    }

    if (!accepted) {
      // Fallback: create a reachable platform with height variation
      const fallbackDy = (rnd() - 0.5) * 80;
      let fallbackY = prevPlatform.y + fallbackDy;
      // Keep within visible area
      fallbackY = Math.max(230, Math.min(560, fallbackY));
      nextPlatform = {
        x: prevPlatform.x + prevPlatform.w + 40 + rnd() * 60,
        y: fallbackY,
        w: 90 + rnd() * 60,
        h: 40 + rnd() * 40,
        type: 'root'
      };
      prim = primitives[0];
    }

    if (chunk.isCheckpoint) {
      nextPlatform.w = Math.max(nextPlatform.w, 150); // Ensure enough space
      checkpoints.push({ x: nextPlatform.x + nextPlatform.w / 2, y: nextPlatform.y - 10, active: false });
    }

    if (chunk.allyId) {
      nextPlatform.w = Math.max(nextPlatform.w, 150);
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

    if (chunk.hasEnemy && !chunk.requires.includes('pulse')) {
      let ew = 42;
      let eh = 38;
      if (nextPlatform.w > 120) {
        enemies.push({
          x: nextPlatform.x + nextPlatform.w / 2,
          y: nextPlatform.y - eh - 10,
          w: ew,
          h: eh,
          vx: 45 + (rnd() * 20),
          left: nextPlatform.x + 20,
          right: nextPlatform.x + nextPlatform.w - ew - 20,
          alive: true
        });
      }
    }

    if (chunk.requires.includes('pulse')) {
      // Place crystal as a wall barrier at the right edge of the platform
      // Player must use Pulse K to break through before advancing
      const cw = 56;
      const ch = 110;
      crystals.push({
        x: nextPlatform.x + nextPlatform.w - cw - 5,
        y: nextPlatform.y - ch,
        w: cw,
        h: ch,
        hp: 1,
        broken: false
      });
    }

    platforms.push(nextPlatform);
    debugInfo.push({
      index: i,
      logic: chunk,
      primitive: prim.id,
      repairs: attempts - (accepted ? 1 : 0),
      accepted: accepted
    });

    prevPlatform = nextPlatform;
  }

  const finalWidth = prevPlatform.x + prevPlatform.w + 1000; // Extra margin

  // Piso de espinhos contínuo
  const hazardWidth = 500;
  const numHazards = Math.ceil(finalWidth / hazardWidth);
  for (let i = 0; i < numHazards; i++) {
    hazards.push({
      x: i * hazardWidth,
      y: 674,
      w: hazardWidth,
      h: 46
    });
  }

  // Generate background elements scaling with finalWidth
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

  const numSpores = Math.min(400, Math.ceil(finalWidth / 25)); // Cap to avoid lag
  const spores = Array.from({ length: numSpores }, () => ({
    x: rnd() * finalWidth,
    y: 90 + rnd() * 570,
    r: .7 + rnd() * 2.2,
    s: .2 + rnd() * .7,
    p: rnd() * 6.28
  }));

  const lastPlat = platforms[platforms.length - 1];
  const endX = lastPlat.x + lastPlat.w + 500;

  // Generate exudates (collectible green orbs) across platforms
  const exudates = [];
  for (let i = 2; i < platforms.length; i++) {
    if (rnd() < 0.35) { // ~35% chance per platform
      const plat = platforms[i];
      exudates.push({
        x: plat.x + 30 + rnd() * (plat.w - 60),
        y: plat.y - 25 - rnd() * 15,
        taken: false
      });
    }
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
    endX: endX,
    cameraMaxX: endX - 1000
  };
}
