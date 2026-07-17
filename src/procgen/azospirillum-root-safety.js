const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function cloudKey(cloud, index) {
  return cloud.id ?? `${Math.round(cloud.x)}:${Math.round(cloud.y)}:${index}`;
}

export function createAzospirillumRootSafety({ state, rootGrowth }) {
  function availableLength(root) {
    let limit = 330;
    for (const platform of state.level.platforms || []) {
      if (
        platform === root.parent
        || platform.mycorrhizaStructure
        || platform.azospirillumStructure
      ) continue;
      const verticallyRelevant = platform.y < root.startY + 135
        && platform.y + platform.h > root.startY - 85;
      if (!verticallyRelevant) continue;

      if (root.direction > 0 && platform.x > root.startX) {
        limit = Math.min(limit, platform.x - root.startX - 16);
      } else if (root.direction < 0 && platform.x + platform.w < root.startX) {
        limit = Math.min(limit, root.startX - (platform.x + platform.w) - 16);
      }
    }
    return clamp(limit, 72, 330);
  }

  function resizeBeforeMaturity(root) {
    if (root.mature) return;
    const safeLength = availableLength(root);
    if (root.length <= safeLength + .5) return;
    root.length = safeLength;
    root.c1x = root.startX + root.direction * safeLength * .26;
    root.c2x = root.startX + root.direction * safeLength * .72;
    root.endX = root.startX + root.direction * safeLength;
  }

  function lockExistingClouds(root) {
    if (!root.mature || root.safetyMaturityRegistered) return;
    root.safetyMaturityRegistered = true;
    const site = root.site;
    if (!site?.usedClouds) return;
    (state.level.exudateClouds || []).forEach((cloud, index) => {
      const range = Math.max(170, cloud.radius * 2.25);
      if (Math.hypot(cloud.x - root.colony.x, cloud.y - root.colony.y) < range) {
        site.usedClouds.add(cloudKey(cloud, index));
      }
    });
  }

  function finalizeColonyLabel(root) {
    const site = root.site;
    if (!site || site.activeRoot || site.roots.length < 2) return;
    site.colony.stage = 'sistema radicular ampliado';
  }

  function update() {
    for (const root of state.level.azospirillumRoots || []) {
      resizeBeforeMaturity(root);
      lockExistingClouds(root);
      finalizeColonyLabel(root);
    }
  }

  return {
    get platformCount() { return rootGrowth.platformCount; },
    update,
  };
}
