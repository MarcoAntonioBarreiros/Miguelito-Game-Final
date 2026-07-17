export function generateLogicGraph(rnd) {
  const chunks = [];
  const totalChunks = 40;
  
  // Progression milestones (adjusted for 40 chunks)
  const DOUBLE_JUMP_CHUNK = 8;
  const DASH_CHUNK = 20;
  const PULSE_CHUNK = 32;
  
  let currentAbilities = [];

  for (let i = 0; i < totalChunks; i++) {
    // Progressão de habilidades
    if (i === DOUBLE_JUMP_CHUNK && !currentAbilities.includes('doubleJump')) {
      currentAbilities.push('doubleJump');
    }
    if (i === DASH_CHUNK && !currentAbilities.includes('dash')) {
      currentAbilities.push('dash');
    }
    if (i === PULSE_CHUNK && !currentAbilities.includes('pulse')) {
      currentAbilities.push('pulse');
    }

    let isSkillNode = false;
    let requiredAbility = null;
    let difficultyTarget = 'comfortable';
    let allyId = null;
    let isCheckpoint = false;
    let hasEnemy = false;

    // Ally placement at skill milestones
    if (i === DOUBLE_JUMP_CHUNK) allyId = 'azo';
    if (i === DASH_CHUNK) allyId = 'myco';
    if (i === PULSE_CHUNK) allyId = 'phos';
    
    // Checkpoints every 7 chunks (except at ally chunks)
    if (i > 0 && i % 7 === 0 && !allyId) {
      isCheckpoint = true;
    }

    // Skill introduction windows (3 chunks of guided practice after each ability)
    if (i >= DOUBLE_JUMP_CHUNK && i <= DOUBLE_JUMP_CHUNK + 2) {
      isSkillNode = true;
      requiredAbility = 'doubleJump';
    } else if (i >= DASH_CHUNK && i <= DASH_CHUNK + 2) {
      isSkillNode = true;
      requiredAbility = 'dash';
    } else if (i >= PULSE_CHUNK && i <= PULSE_CHUNK + 2) {
      isSkillNode = true;
      requiredAbility = 'pulse';
    } else {
      // Normal chunk — randomly select abilities to test
      if (currentAbilities.length > 0) {
        if (rnd() > 0.4) { // 60% chance to require a skill
          const idx = Math.floor(rnd() * currentAbilities.length);
          requiredAbility = currentAbilities[idx];
        }
      }
      
      // 12% chance of hard transition (not on special chunks)
      if (rnd() < 0.12 && !allyId && !isCheckpoint && i > 3) {
        difficultyTarget = 'hard';
      }
      
      // 18% chance of enemy on comfortable normal chunks
      if (rnd() < 0.18 && difficultyTarget === 'comfortable' && !allyId && !isCheckpoint && i > 4) {
        hasEnemy = true;
      }
    }

    chunks.push({
      index: i,
      requires: requiredAbility ? [requiredAbility] : [],
      difficultyTarget,
      isSkillIntro: isSkillNode,
      allyId,
      isCheckpoint,
      hasEnemy
    });
  }

  return chunks;
}
