import { createRandom } from './random.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function platformAt(level, chunk) {
  return (level.platforms || []).find(platform => (
    !platform.recovery && !platform.final && platform.logicIndex === chunk
  ));
}

function movePlatform(level, platform, { x = platform.x, y = platform.y, w = platform.w } = {}) {
  if (!platform) return;
  const dx = x - platform.x;
  const dy = y - platform.y;
  platform.x = x;
  platform.y = y;
  platform.w = w;
  for (const collection of [
    level.exudates,
    level.crystals,
    level.enemies,
    level.allies,
    level.checkpoints,
  ]) {
    for (const entity of collection || []) {
      if (entity.logicIndex !== platform.logicIndex) continue;
      if (Number.isFinite(entity.x)) entity.x += dx;
      if (Number.isFinite(entity.y)) entity.y += dy;
    }
  }
}

function addExudate(level, chunk, lateral = .5) {
  const platform = platformAt(level, chunk);
  if (!platform) return;
  const duplicate = (level.exudates || []).some(item => item.logicIndex === chunk);
  if (duplicate) return;
  level.exudates.push({
    logicIndex: chunk,
    x: platform.x + platform.w * lateral,
    y: platform.y - 34,
    taken: false,
    authored: true,
  });
}

export function applyPhaseFiveTutorialGeometry(level, phase = level.campaignPhase) {
  if (phase !== 5) return level;
  const route = (level.platforms || [])
    .filter(platform => !platform.recovery && !platform.final && platform.logicIndex >= 0)
    .sort((a, b) => a.logicIndex - b.logicIndex || a.x - b.x);

  for (const platform of route) {
    platform.type = 'root';
    platform.authoredPhaseFive = true;
    platform.h = Math.max(64, platform.h || 0);
    if (platform.logicIndex <= 14) {
      platform.y = clamp(455 + Math.sin(platform.logicIndex * .72) * 34, 405, 515);
      platform.w = Math.max(platform.w, 190);
    }
  }

  // Recapitulação com duas soluções reais. A raiz 4 fica no mesmo nível da
  // raiz 6 e pode originar uma ponte micorrízica horizontal. A raiz 5 fica
  // abaixo e é o hospedeiro da escada vertical de Azospirillum.
  const recapEntry = platformAt(level, 3);
  const mycorrhizaHost = platformAt(level, 4);
  const azospirillumHost = platformAt(level, 5);
  const recapDestination = platformAt(level, 6);
  if (recapEntry && mycorrhizaHost && azospirillumHost && recapDestination) {
    movePlatform(level, mycorrhizaHost, {
      x: recapEntry.x + recapEntry.w + 92,
      y: 315,
      w: Math.max(210, mycorrhizaHost.w),
    });
    movePlatform(level, azospirillumHost, {
      x: mycorrhizaHost.x + mycorrhizaHost.w + 80,
      y: 525,
      w: 170,
    });
    movePlatform(level, recapDestination, {
      x: azospirillumHost.x + azospirillumHost.w + 80,
      y: 315,
      w: Math.max(220, recapDestination.w),
    });

    let previous = recapDestination;
    for (let chunk = 7; chunk <= 14; chunk++) {
      const platform = platformAt(level, chunk);
      if (!platform) continue;
      movePlatform(level, platform, {
        x: previous.x + previous.w + 92,
        y: clamp(455 + Math.sin(chunk * .72) * 34, 405, 515),
        w: Math.max(platform.w, 200),
      });
      previous = platform;
    }
  }

  // Corredor final curto: sem a limitação por ferro, a rede hifal alcança
  // Miguelito durante a travessia; com Pseudomonas, o mesmo percurso é controlável.
  const corridor = [15, 16, 17, 18, 19].map(chunk => platformAt(level, chunk)).filter(Boolean);
  corridor.forEach((platform, index) => {
    platform.y = index < 3 ? 470 - index * 18 : 442 + (index - 3) * 12;
    platform.w = index === 1 ? 210 : index < 3 ? 185 : 220;
    platform.fungalChallenge = index < 3;
    if (index === 0) {
      const previous = platformAt(level, 14);
      if (previous) platform.x = previous.x + previous.w + 110;
    } else {
      const previous = corridor[index - 1];
      platform.x = previous.x + previous.w + (index < 3 ? 148 : 92);
    }
  });

  level.exudates = (level.exudates || []).filter(item => item.logicIndex < 18);
  addExudate(level, 4, .86);
  addExudate(level, 5, .56);
  addExudate(level, 7, .55);
  addExudate(level, 9, .42);
  addExudate(level, 12, .5);
  addExudate(level, 13, .48);
  addExudate(level, 15, .38);

  const ironHost = platformAt(level, 8) || platformAt(level, 9);
  const interactionHost = platformAt(level, 13);
  const challengeHost = platformAt(level, 15);
  level.ironDeposits = [];
  for (const [index, platform] of [ironHost, interactionHost, challengeHost].filter(Boolean).entries()) {
    level.ironDeposits.push({
      id: `p5-authored-iron-${index}`,
      platform,
      x: platform.x + platform.w * .68,
      y: platform.y + 28,
      stock: 7,
      maxStock: 7,
      radius: 13,
      phase: index * 1.7,
      exposed: true,
      authored: true,
    });
  }
  return level;
}

function encounterAt(level, chunk, id, source, seedValue, options = {}) {
  const platform = platformAt(level, chunk);
  if (!platform) return null;
  const random = createRandom(`${seedValue}:phase-five:${chunk}:${id}:${source}`);
  return {
    id,
    x: platform.x + platform.w * (.46 + (random() - .5) * .08),
    y: platform.y - 94 - random() * 16,
    r: options.r || 150,
    territory: options.territory || 360,
    collect: false,
    logicIndex: chunk,
    source,
    requiresSeenCardId: options.requiresSeenCardId || null,
    tetherUntilSeen: false,
    authoredPhaseFive: true,
  };
}

export function applyPhaseFiveTutorialEncounters(level, encounters, phase, seedValue) {
  if (phase !== 5) return encounters;
  // Mantém apenas as duas estreias curriculares; repetições autorais abaixo
  // demonstram a interação sem ruído de comunidades procedurais extras.
  const result = encounters.filter(encounter => (
    encounter.source === 'debut'
    || !['oportunista', 'pseudomonas', 'trichoderma'].includes(encounter.id)
  ));
  const azospirillumRecap = encounterAt(level, 3, 'azospirillum', 'recap-access', seedValue, {
    r: 120,
    territory: 230,
  });
  const interactionSupport = encounterAt(level, 13, 'pseudomonas', 'interaction-support', seedValue, {
    r: 118,
    territory: 210,
    requiresSeenCardId: 'organism-pseudomonas',
  });
  const interaction = encounterAt(level, 13, 'oportunista', 'interaction', seedValue, {
    r: 125,
    territory: 250,
    requiresSeenCardId: 'organism-opportunistic-fungus',
  });
  const challenge = encounterAt(level, 16, 'oportunista', 'challenge', seedValue, {
    r: 170,
    territory: 310,
    requiresSeenCardId: 'organism-opportunistic-fungus',
  });
  if (azospirillumRecap) result.push(azospirillumRecap);
  if (interactionSupport) result.push(interactionSupport);
  if (interaction) result.push(interaction);
  if (challenge) result.push(challenge);
  level.authoredEncounters = [
    azospirillumRecap,
    interactionSupport,
    interaction,
    challenge,
  ].filter(Boolean);
  return result;
}
