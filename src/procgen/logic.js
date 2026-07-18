import {
  CAMPAIGN_UNLOCKS,
  getAvailableUnlocksAt,
  getPathogensAt,
  getPhaseManifest,
  getRequiredPracticeAbilityAt,
} from './campaign-manifest.js';

const MOVEMENT_FEATURES = new Set(['doubleJump', 'dash', 'pulse']);
let activeProfile = null;

export function setLogicCampaignProfile(profile) {
  activeProfile = profile;
}

function defaultProfile() {
  const manifest = getPhaseManifest(1);
  return {
    phase: manifest.phase,
    theme: manifest.theme,
    totalChunks: manifest.totalChunks,
    unlockEvents: manifest.unlockEvents.map(event => ({ ...event, chunk: event.eventChunk, allyId: null })),
    initialUnlocks: Object.fromEntries(CAMPAIGN_UNLOCKS.map(feature => [feature, false])),
    hardChance: .08,
    enemyChance: .12,
    skillRequirementChance: .56,
  };
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

function availableUnlocksForChunk(profile, chunkIndex) {
  const planned = getAvailableUnlocksAt(profile.phase, chunkIndex);
  const currentPhaseFeatures = new Set(profile.unlockEvents.map(event => event.feature));
  return Object.fromEntries(CAMPAIGN_UNLOCKS.map(feature => {
    // Eventos da fase obedecem ao manifesto: o chunk N apresenta o poder e
    // somente N+1 em diante pode usá-lo. Poderes anteriores dependem do estado
    // realmente obtido e restaurado na campanha.
    const available = currentPhaseFeatures.has(feature)
      ? planned[feature] === true
      : profile.initialUnlocks?.[feature] === true;
    return [feature, available];
  }));
}

export function generateLogicGraph(rnd) {
  const profile = activeProfile || defaultProfile();
  const chunks = [];
  const events = new Map(profile.unlockEvents.map(event => [event.eventChunk, event]));

  for (let i = 0; i < profile.totalChunks; i++) {
    const event = events.get(i) || null;
    const availableUnlocks = availableUnlocksForChunk(profile, i);
    const availableAbilities = [...MOVEMENT_FEATURES].filter(feature => availableUnlocks[feature]);
    const practiceFeature = getRequiredPracticeAbilityAt(profile.phase, i);
    const isSkillNode = Boolean(practiceFeature && availableUnlocks[practiceFeature]);
    let requiredAbility = isSkillNode && MOVEMENT_FEATURES.has(practiceFeature)
      ? practiceFeature
      : null;

    if (!requiredAbility && !event && availableAbilities.length > 0 && rnd() < profile.skillRequirementChance) {
      requiredAbility = weightedAbility(rnd, availableAbilities, profile.theme);
    }

    let difficultyTarget = 'comfortable';
    if (!event && !isSkillNode && i > 3 && rnd() < profile.hardChance) difficultyTarget = 'hard';

    let isCheckpoint = false;
    if (i > 0 && i % 7 === 0 && !event) isCheckpoint = true;

    const activePathogens = getPathogensAt(profile.phase, i);
    const pathogenDebut = getPhaseManifest(profile.phase)?.pathogenDebuts
      .find(debut => debut.fromChunk === i) || null;
    const eligibleEnemyChunk = !event && !isCheckpoint && !isSkillNode && i > 4;
    const enemyRoll = eligibleEnemyChunk ? rnd() : 1;
    let pathogenType = pathogenDebut?.pathogen === 'rhizoctonia' ? 'rhizoctonia' : null;
    if (!pathogenType
      && activePathogens.includes('rhizoctonia')
      && eligibleEnemyChunk
      && enemyRoll < profile.enemyChance) {
      pathogenType = 'rhizoctonia';
    }
    const hasEnemy = pathogenType === 'rhizoctonia';

    chunks.push({
      index: i,
      requires: requiredAbility ? [requiredAbility] : [],
      availableUnlocks,
      availableAbilities,
      practiceFeature,
      difficultyTarget,
      isSkillIntro: isSkillNode,
      allyId: event?.allyId || null,
      unlockFeature: event?.feature || null,
      isCheckpoint,
      hasEnemy,
      pathogenType,
      activePathogens,
      isPathogenDebut: Boolean(pathogenDebut),
      campaignPhase: profile.phase,
      phaseTheme: profile.theme,
    });
  }

  return chunks;
}
