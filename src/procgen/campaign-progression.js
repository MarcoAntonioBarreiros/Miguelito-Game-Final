import {
  CAMPAIGN_UNLOCKS,
  campaignManifest,
  getPathogenStartChunk,
  getPhaseManifest,
} from './campaign-manifest.js';
import { setLogicCampaignProfile } from './logic.js';

const MOVEMENT_FEATURES = new Set(['doubleJump', 'dash']);
const DEFAULT_START_PHASE = 1;
const campaignStorage = new WeakMap();

export const CAMPAIGN_STORAGE_KEY = 'miguelito:campaign:v2';

const FEATURE_ALLIES = Object.freeze({
  doubleJump: 'azo',
  dash: 'dash',
  phosphateSolubilization: 'phos-power',
  mycorrhizaStructures: 'myco',
  azospirillumRoots: 'azo',
});

function blankUnlocks(source = {}) {
  return Object.fromEntries(CAMPAIGN_UNLOCKS.map(feature => [feature, source[feature] === true]));
}

function randomCampaignSeed() {
  return `campanha-${Math.floor(Math.random() * 1000000)}`;
}

function validPhase(phase, fallback = DEFAULT_START_PHASE) {
  return Number.isInteger(phase) && getPhaseManifest(phase) ? phase : fallback;
}

function blankCampaign(seed) {
  return {
    seed,
    phase: DEFAULT_START_PHASE,
    unlocks: blankUnlocks(),
    totalScore: 0,
    history: [],
    transitionRequested: false,
    transitionAt: 0,
    transitionCaptured: false,
    pendingReport: null,
  };
}

function readStoredCampaign(storage) {
  if (!storage?.getItem) return null;
  try {
    const parsed = JSON.parse(storage.getItem(CAMPAIGN_STORAGE_KEY));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (_) {
    return null;
  }
}

export function campaignSnapshot(campaign) {
  return {
    seed: String(campaign.seed || randomCampaignSeed()),
    phase: validPhase(campaign.phase),
    unlocks: blankUnlocks(campaign.unlocks),
    totalScore: Number.isFinite(campaign.totalScore) ? campaign.totalScore : 0,
    history: Array.isArray(campaign.history) ? campaign.history : [],
    pendingReport: campaign.pendingReport ?? null,
  };
}

export function persistCampaign(campaign) {
  const storage = campaignStorage.get(campaign);
  if (!storage?.setItem) return false;
  try {
    storage.setItem(CAMPAIGN_STORAGE_KEY, JSON.stringify(campaignSnapshot(campaign)));
    return true;
  } catch (_) {
    return false;
  }
}

export function createCampaign(seed = randomCampaignSeed(), { storage = null } = {}) {
  const saved = readStoredCampaign(storage);
  const campaign = blankCampaign(saved?.seed ? String(saved.seed) : seed);
  if (saved) {
    campaign.phase = validPhase(saved.phase);
    campaign.unlocks = blankUnlocks(saved.unlocks);
    campaign.totalScore = Number.isFinite(saved.totalScore) ? saved.totalScore : 0;
    campaign.history = Array.isArray(saved.history) ? saved.history : [];
    campaign.pendingReport = saved.pendingReport ?? null;
  }
  if (storage) campaignStorage.set(campaign, storage);
  return campaign;
}

export function resetCampaign(campaign, seed = randomCampaignSeed()) {
  const fresh = blankCampaign(seed);
  Object.assign(campaign, fresh);
  persistCampaign(campaign);
  return campaign;
}

export function ensureCampaignUnlockShape(campaign) {
  campaign.unlocks = blankUnlocks(campaign.unlocks);
  return campaign.unlocks;
}

function tuningForPhase(phase) {
  if (phase === 0) return { hardChance: .02, enemyChance: 0, skillRequirementChance: 0 };
  if (phase === 1) return { hardChance: .08, enemyChance: .12, skillRequirementChance: .56 };
  if (phase === 2) return { hardChance: .10, enemyChance: .14, skillRequirementChance: .60 };
  if (phase === 3) return { hardChance: .14, enemyChance: .18, skillRequirementChance: .68 };
  return {
    hardChance: Math.min(.23, .15 + (phase - 4) * .012),
    enemyChance: Math.min(.28, .18 + (phase - 4) * .01),
    skillRequirementChance: Math.min(.78, .68 + (phase - 4) * .015),
  };
}

function runtimeUnlockEvent(event) {
  return {
    ...event,
    chunk: event.eventChunk,
    allyId: FEATURE_ALLIES[event.feature] || null,
  };
}

export function getPhaseProfile(campaign) {
  ensureCampaignUnlockShape(campaign);
  const manifest = getPhaseManifest(campaign.phase);
  if (!manifest) throw new RangeError(`Fase de campanha inexistente: ${campaign.phase}`);

  const tuning = tuningForPhase(manifest.phase);
  const initialUnlocks = blankUnlocks(campaign.unlocks);
  return {
    id: manifest.id,
    phase: manifest.phase,
    title: manifest.title,
    theme: manifest.theme,
    mission: manifest.mission,
    totalChunks: manifest.totalChunks,
    newConcepts: [...manifest.newConcepts],
    newCommand: manifest.newCommand,
    unlockEvents: manifest.unlockEvents.map(runtimeUnlockEvent),
    phosphateSolubilization: manifest.phosphateSolubilization
      ? { ...manifest.phosphateSolubilization }
      : undefined,
    initialUnlocks,
    initialAbilities: [...MOVEMENT_FEATURES].filter(feature => initialUnlocks[feature]),
    ...tuning,
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
      desc: 'A rede micorrízica agora pode orientar hifas finas horizontalmente e formar pontes laterais dirigidas por exsudatos.',
    };
  }
  if (feature === 'phosphateSolubilization') {
    return {
      name: 'Pulso de solubilização',
      desc: 'Selecione Solubilização P, carregue metabólitos perto da cepa de Bacillus e solte E para disparar no depósito.',
    };
  }
  return {
    name: 'Ari, o Azospirillum',
    desc: 'A sinalização hormonal do Azospirillum agora pode formar escadas de ramificações em raízes hospedeiras.',
  };
}

export function decorateCampaignLevel(level, campaign, profile = getPhaseProfile(campaign)) {
  level.campaignPhase = campaign.phase;
  level.phaseTheme = profile.theme;
  level.phaseTitle = profile.title;
  level.phaseProfile = profile;
  level.pathogenSchedule = {
    rhizoctonia: getPathogenStartChunk(campaign.phase, 'rhizoctonia'),
    meloidogyne: getPathogenStartChunk(campaign.phase, 'meloidogyne'),
  };

  const fixedDebutTypes = {
    'organism-mycorrhiza': {
      id: 'myco', name: 'Micorriza arbuscular',
      desc: 'Estrutura fixa de estreia da associação micorrízica.',
    },
    'organism-phosphate-solubilizer': {
      id: 'phos', name: 'Microrganismo solubilizador de fosfato',
      desc: 'Estrutura fixa de estreia da comunidade solubilizadora.',
    },
  };
  const manifest = getPhaseManifest(campaign.phase);
  for (const presentation of manifest.presentations) {
    const fixed = fixedDebutTypes[presentation.cardId];
    if (!fixed || presentation.roamingType || presentation.roamingTypes) continue;
    const functionalDebut = (level.allies || []).find(ally => (
      ally.id === fixed.id && ally.logicIndex === presentation.debutChunk && !ally.presentationOnly
    ));
    if (functionalDebut) {
      Object.assign(functionalDebut, fixed, {
        fixedDebut: true,
        cardId: presentation.cardId,
        presentationId: presentation.id,
        debutZoneId: presentation.debutZoneId,
        mycorrhizaArbusculeDebut: presentation.cardId === 'organism-mycorrhiza',
      });
      continue;
    }
    const platform = (level.platforms || []).find(candidate => (
      !candidate.recovery && !candidate.final && candidate.logicIndex === presentation.debutChunk
    ));
    if (!platform) continue;
    level.allies.push({
      ...fixed,
      x: platform.x + platform.w / 2,
      y: platform.y - 44,
      r: 32,
      taken: false,
      presentationOnly: true,
      cardId: presentation.cardId,
      presentationId: presentation.id,
      debutZoneId: presentation.debutZoneId,
      logicIndex: presentation.debutChunk,
    });
  }

  const queues = new Map();
  for (const event of profile.unlockEvents) {
    if (!event.allyId) continue;
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

export function unlockCampaignFeature(state, feature) {
  const campaign = state.campaign;
  if (!campaign || !CAMPAIGN_UNLOCKS.includes(feature)) return false;
  ensureCampaignUnlockShape(campaign);
  const firstUnlock = !campaign.unlocks[feature];
  campaign.unlocks[feature] = true;
  applyPersistentUnlocks(state.player, campaign);
  persistCampaign(campaign);
  return firstUnlock;
}

export function applyPersistentUnlocks(player, campaign) {
  const unlocks = blankUnlocks(campaign?.unlocks);
  player.canDoubleJump = unlocks.doubleJump;
  player.canDash = unlocks.dash;
  player.canPhosphateSolubilization = unlocks.phosphateSolubilization;
  player.airJumpAvailable = player.canDoubleJump;
}

export function recordPhaseResult(campaign, report) {
  campaign.history.push(report);
  campaign.totalScore += report.score;
  campaign.pendingReport = report;
  campaign.transitionCaptured = true;
  persistCampaign(campaign);
}

export function advanceCampaignPhase(campaign) {
  const currentIndex = campaignManifest.findIndex(entry => entry.phase === campaign.phase);
  if (currentIndex < 0) return false;
  const next = campaignManifest[currentIndex + 1];
  if (!next) return false;
  campaign.phase = next.phase;
  ensureCampaignUnlockShape(campaign);
  campaign.transitionRequested = false;
  campaign.transitionAt = 0;
  campaign.transitionCaptured = false;
  campaign.pendingReport = null;
  persistCampaign(campaign);
  return true;
}
