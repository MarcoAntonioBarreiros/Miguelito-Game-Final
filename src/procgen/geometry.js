export function generateGeometry(logicChunk, prevPlatform, primitive, rnd) {
  // Use primitive displacement to calculate target platform position
  let dx = primitive.displacement.x;
  let dy = primitive.displacement.y;
  
  // Stretch factor: comfortable = 60-85%, hard = 80-95%
  let stretch;
  if (logicChunk.difficultyTarget === 'hard') {
    stretch = 0.80 + rnd() * 0.15;
  } else {
    stretch = 0.60 + rnd() * 0.25;
  }

  // Calculate horizontal gap
  dx = Math.abs(dx) * stretch;
  // Ensure minimum gap so platforms don't overlap
  dx = Math.max(dx, 60);

  // Vertical variation: create wave-like terrain
  // Use chunk index to create natural ups and downs
  const chunkIndex = logicChunk.index || 0;
  const wavePhase = chunkIndex * 0.31; // creates organic-feeling waves
  const waveAmplitude = 120; // max vertical swing
  const baseWave = Math.sin(wavePhase) * waveAmplitude;
  
  // Add local randomness on top of the wave
  const localVariation = (rnd() - 0.5) * 80;
  
  // For skill intro chunks, keep height difference moderate
  let targetDy;
  if (logicChunk.isSkillIntro || logicChunk.allyId) {
    targetDy = (rnd() - 0.5) * 40; // gentle variation for learning moments
  } else {
    targetDy = baseWave * 0.3 + localVariation;
    
    // For double jump, allow reaching higher platforms
    if (primitive.requires.includes('doubleJump')) {
      targetDy = -40 - rnd() * 80; // tend upward
    }
    // For dash, keep roughly same height
    if (primitive.requires.includes('dash')) {
      targetDy = (rnd() - 0.5) * 30;
    }
  }

  // Platform width variation
  let platW;
  if (logicChunk.isSkillIntro || logicChunk.allyId || logicChunk.isCheckpoint) {
    platW = 150 + rnd() * 80; // wide safe platforms for important moments
  } else if (logicChunk.difficultyTarget === 'hard') {
    platW = 60 + rnd() * 40; // narrow for challenge
  } else {
    platW = 80 + rnd() * 100; // medium variety
  }

  let platH = 40 + rnd() * 60;

  let newPlat = {
    x: prevPlatform.x + prevPlatform.w + dx,
    y: prevPlatform.y + targetDy,
    w: platW,
    h: platH,
    type: rnd() > 0.3 ? 'root' : 'soil'
  };

  // Clamp Y to keep within visible play area (200 to 580)
  // But use soft clamping — nudge rather than snap
  if (newPlat.y < 220) {
    newPlat.y = 220 + rnd() * 60;
  } else if (newPlat.y > 560) {
    newPlat.y = 560 - rnd() * 60;
  }

  return newPlat;
}
