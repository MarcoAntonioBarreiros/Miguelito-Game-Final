import { setLogicCampaignProfile } from './logic.js';

const MOVEMENT_FEATURES = new Set(['doubleJump', 'dash', 'pulse']);
const LATE_THEMES = ['equilíbrio', 'infestação', 'mineral', 'arquitetura', 'simbiose'];

function blankUnlocks() {
  return {
    doubleJump: false,
    dash: false,
    pulse: false,
    mycorrhizaStructures: false,
    azospirillumRoots: false,
  };
}

export function createCampaign(seed = `campanha-${Math.floor(Math.random() * 1000000)}`) {
  return {
    seed,
    phase: 1,
    unlocks: blankUnlocks(),
    totalScore: 0,
    history: [],
    transitionRequested: false,
    transitionAt: 0,
    transitionCaptured: false,
    pendingReport: null,
  };
}

export function resetCampaign(campaign, seed = `campanha-${Math.floor(Math.random() * 1000000)}`) {
  campaign.seed = seed;
  campaign.phase = 1;
  campaign.unlocks = blankUnlocks();
  campaign.totalScore = 0;
  campaign.history = [];
  campaign.transitionRequested = false;
  campaign.transitionAt = 0;
  campaign.transitionCaptured = false;
  campaign.pendingReport = null;
  return campaign;
}

export function ensurePhaseMinimumUnlocks(campaign) {
  if (campaign.phase >= 2) {
    campaign.unlocks.doubleJump = true;
    campaign.unlocks.dash = true;
  }
  if (campaign.phase >= 3) {
    campaign.unlocks.mycorrhizaStructures = true;
    campaign.unlocks.pulse = true;
  }
  if (campaign.phase >= 4) campaign.unlocks.azospirillumRoots = true;
}

function phaseEvents(phase) {
  if (phase === 1) {
    return [
      { chunk: 8, allyId: 'azo', feature: 'doubleJump' },
      { chunk: 25, allyId: 'dash', feature: 'dash' },
    ];
  }
  if (phase === 2) {
    return [
      { chunk: 8, allyId: 'myco', feature: 'mycorrhizaStructures' },
      { chunk: 26, allyId: 'phos', feature: 'pulse' },
    ];
  }
  if (phase === 3) {
    return [{ chunk: 9, allyId: 'azo', feature: 'azospirillumRoots' }];
  }
  return [];
}

export function getPhaseProfile(campaign) {
  ensurePhaseMinimumUnlocks(campaign);
  const phase = campaign.phase;
  let title;
  let theme;
  let mission;
  let hardChance;
  let enemyChance;
  let skillRequirementChance;

  if (phase === 1) {
    title = 'Fundamentos do solo vivo';
    theme = 'fundamentos';
    mission = 'Aprenda a recrutar microrganismos e atravesse a primeira rede radicular';
    hardChance = .08;
    enemyChance = .12;
    skillRequirementChance = .56;
  } else if (phase === 2) {
    title = 'Micorriza e fósforo mineral';
    theme = 'mineral';
    mission = 'Construa conexões micorrízicas e libere o pulso mineral';
    hardChance = .11;
    enemyChance = .16;
    skillRequirementChance = .64;
  } else if (phase === 3) {
    title = 'Arquitetura do sistema radicular';
    theme = 'arquitetura';
    mission = 'Use Azospirillum para induzir novas raízes laterais';
    hardChance = .14;
    enemyChance = .18;
    skillRequirementChance = .68;
  } else {
    theme = LATE_THEMES[(phase - 4) % LATE_THEMES.length];
    title = `Ecossistema integrado — ${theme}`;
    mission = `Combine todos os mecanismos para restaurar uma fase de ${theme}`;
    hardChance = Math.min(.23, .15 + (phase - 4) * .012);
    enemyChance = Math.min(.28, .18 + (phase - 4) * .01);
    skillRequirementChance = Math.min(.78, .68 + (phase - 4) * .015);
  }

  const initialAbilities = [...MOVEMENT_FEATURES].filter(feature => campaign.unlocks[feature]);
  return {
    phase,
    title,
    theme,
    mission,
    totalChunks: 40,
    unlockEvents: phaseEvents(phase),
    initialAbilities,
    hardChance,
    enemyChance,
    skillRequirementChance,
  };
}

export function prepareCampaignGeneration(campaign) {
  const profile = getPhaseProfile(campaign);
  setLogicCampaignProfile(profile);
  return profile;
}

export function campaignPhaseSeed(campaign) {
  return `${campaign.seed}:fase-${campaign.phase}`;
}

function featurePresentation(feature) {
  if (feature === 'doubleJump') {
    return {
      name: 'Ari, o Azospirillum',
      desc: 'O impulso radicular libera o salto duplo. Pressione salto novamente enquanto estiver no ar.',
    };
  }
  if (feature === 'dash') {
    return {
      name: 'Impulso da Rizósfera',
      desc: 'A energia do solo vivo libera o dash. Use Shift ou o botão DASH para atravessar vãos rapidamente.',
    };
  }
  if (feature === 'mycorrhizaStructures') {
    return {
      name: 'Mira, a Micorriza',
      desc: 'A rede micorrízica agora pode espessar hifas e formar pontes ou escadas dirigidas por exsudatos.',
    };
  }
  if (feature === 'pulse') {
    return {
      name: 'Sol, a Solubilizadora',
      desc: 'O pulso mineral rompe cristais alaranjados e libera nutrientes antes inacessíveis.',
    };
  }
  return {
    name: 'Ari, o Azospirillum',
    desc: 'A sinalização hormonal do Azospirillum agora pode induzir raízes laterais em raízes hospedeiras.',
  };
}

export function decorateCampaignLevel(level, campaign, profile = getPhaseProfile(campaign)) {
  level.campaignPhase = campaign.phase;
  level.phaseTheme = profile.theme;
  level.phaseTitle = profile.title;
  level.phaseProfile = profile;

  const queues = new Map();
  for (const event of profile.unlockEvents) {
    if (!queues.has(event.allyId)) queues.set(event.allyId, []);
    queues.get(event.allyId).push(event);
  }

  for (const ally of level.allies || []) {
    const event = queues.get(ally.id)?.shift();
    if (!event) continue;
    ally.unlockFeature = event.feature;
    const presentation = featurePresentation(event.feature);
    ally.name = presentation.name;
    ally.desc = presentation.desc;
  }
  return level;
}

export function campaignEncounterTypes(campaign) {
  const common = ['rhizobium', 'oportunista', 'trichoderma', 'pseudomonas', 'bacillus'];
  if (campaign.phase >= 3) common.push('azospirillum');
  if (campaign.phase >= 4 && campaign.phase % 2 === 0) common.push('oportunista');
  return common;
}

export function unlockCampaignFeature(state, feature) {
  const campaign = state.campaign;
  if (!campaign || !feature || !(feature in campaign.unlocks)) return false;
  const firstUnlock = !campaign.unlocks[feature];
  campaign.unlocks[feature] = true;
  applyPersistentUnlocks(state.player, campaign);
  return firstUnlock;
}

export function applyPersistentUnlocks(player, campaign) {
  const unlocks = campaign?.unlocks || {};
  player.canDoubleJump = Boolean(unlocks.doubleJump);
  player.canDash = Boolean(unlocks.dash);
  player.canPulse = Boolean(unlocks.pulse);
  if (player.canDoubleJump) player.airJumpAvailable = true;
}

export function recordPhaseResult(campaign, report) {
  campaign.history.push(report);
  campaign.totalScore += report.score;
  campaign.pendingReport = report;
  campaign.transitionCaptured = true;
}

export function advanceCampaignPhase(campaign) {
  campaign.phase += 1;
  ensurePhaseMinimumUnlocks(campaign);
  campaign.transitionRequested = false;
  campaign.transitionAt = 0;
  campaign.transitionCaptured = false;
  campaign.pendingReport = null;
}
