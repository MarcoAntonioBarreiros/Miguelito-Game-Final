let activeProfile = null;

export function setLogicCampaignProfile(profile) {
  activeProfile = profile;
}

function weightedAbility(rnd, abilities, theme) {
  const weighted = [];
  for (const ability of abilities) {
    let weight = 1;
    if (theme === 'mineral' && ability === 'pulse') weight = 3;
    if (theme === 'arquitetura' && (ability === 'doubleJump' || ability === 'dash')) weight = 2;
    if (theme === 'infestação' && ability === 'dash') weight = 1.6;
    for (let i = 0; i < Math.ceil(weight * 2); i++) weighted.push(ability);
  }
  return weighted[Math.floor(rnd() * weighted.length)] || null;
}

export function generateLogicGraph(rnd) {
  const profile = activeProfile || {
    phase: 1,
    theme: 'fundamentos',
    totalChunks: 40,
    unlockEvents: [
      { chunk: 8, allyId: 'azo', feature: 'doubleJump' },
      { chunk: 25, allyId: 'dash', feature: 'dash' },
    ],
    initialAbilities: [],
    hardChance: .08,
    enemyChance: .12,
    skillRequirementChance: .56,
  };

  const chunks = [];
  const events = new Map(profile.unlockEvents.map(event => [event.chunk, event]));
  const movementFeatures = new Set(['doubleJump', 'dash', 'pulse']);
  const currentAbilities = [...profile.initialAbilities];

  for (let i = 0; i < profile.totalChunks; i++) {
    const event = events.get(i) || null;
    let requiredAbility = null;
    let isSkillNode = false;

    for (const unlockEvent of profile.unlockEvents) {
      if (!movementFeatures.has(unlockEvent.feature)) continue;
      if (i >= unlockEvent.chunk + 1 && i <= unlockEvent.chunk + 3) {
        requiredAbility = unlockEvent.feature;
        isSkillNode = true;
        break;
      }
    }

    if (!requiredAbility && !event && currentAbilities.length > 0 && rnd() < profile.skillRequirementChance) {
      requiredAbility = weightedAbility(rnd, currentAbilities, profile.theme);
    }

    let difficultyTarget = 'comfortable';
    if (!event && !isSkillNode && i > 3 && rnd() < profile.hardChance) difficultyTarget = 'hard';

    let isCheckpoint = false;
    if (i > 0 && i % 7 === 0 && !event) isCheckpoint = true;

    let hasEnemy = false;
    if (!event && !isCheckpoint && !isSkillNode && i > 4 && rnd() < profile.enemyChance) hasEnemy = true;

    chunks.push({
      index: i,
      requires: requiredAbility ? [requiredAbility] : [],
      difficultyTarget,
      isSkillIntro: isSkillNode,
      allyId: event?.allyId || null,
      unlockFeature: event?.feature || null,
      isCheckpoint,
      hasEnemy,
      campaignPhase: profile.phase,
      phaseTheme: profile.theme,
    });

    if (event && movementFeatures.has(event.feature) && !currentAbilities.includes(event.feature)) {
      currentAbilities.push(event.feature);
    }
  }

  return chunks;
}
