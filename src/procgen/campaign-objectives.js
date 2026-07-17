const OPERATORS = Object.freeze({
  '===': (actual, expected) => actual === expected,
  '!==': (actual, expected) => actual !== expected,
  '>': (actual, expected) => actual > expected,
  '>=': (actual, expected) => actual >= expected,
  '<': (actual, expected) => actual < expected,
  '<=': (actual, expected) => actual <= expected,
});

function functionalBiofilms(state, target = null) {
  return (state.level.biofilms || []).filter(film => (
    film.functional === true
    && (!target || film.platform?.objectiveTarget === target)
  ));
}

function activeNodules(state) {
  return (state.level.rhizobiumNodules || []).filter(site => (
    site.mature === true || site.stage === 'mature' || (site.fixationRate || 0) > 0.05
  ));
}

export function createCampaignObjectiveEvaluator({ state, systems = {} }) {
  function worldValue(condition) {
    const key = condition.key;
    if (key === 'reachedFinalRoot') return Boolean(state.level.goal?.completed);
    if (key === 'functionalBiofilmCount') return functionalBiofilms(state, condition.target).length;
    if (key === 'deployedExudateCount') return systems.gameplay?.deployedCloudCount || 0;
    if (key === 'bacillusColonyCount') {
      return (systems.inoculants?.colonies || []).filter(colony => colony.type === 'bacillus').length;
    }
    if (key === 'activeMatureNoduleCount') return activeNodules(state).length;
    if (key === 'totalFixationRate') {
      return (state.level.rhizobiumNodules || []).reduce((sum, site) => sum + (site.fixationRate || 0), 0);
    }
    if (key === 'visibleLateralRootCount') return (state.level.azospirillumRoots || []).filter(root => root.visible !== false).length;
    if (key === 'functionalMycorrhizaPathCount') {
      return (state.level.platforms || []).filter(platform => platform.mycorrhizaStructure && platform.mature !== false).length;
    }
    if (key === 'pseudomonasIronReserve') return systems.pseudomonas?.ironRecovered || 0;
    if (key === 'neutralizedOpportunisticFungusCount') return systems.trichoderma?.eliminatedCount || 0;
    if (key === 'recoveredRootCount') {
      return (state.level.platforms || []).filter(root => root.type === 'root' && root.healthTrend > 0 && (root.rootHealth || 0) >= .75).length;
    }
    if (key === 'brokenCrystalCount') return (state.level.crystals || []).filter(crystal => crystal.broken).length;
    if (key === 'neutralizedEggMassCount') return systems.meloidogyneControl?.eggMassesNeutralized || 0;
    if (key === 'preservedRootCount') {
      return (state.level.platforms || []).filter(root => root.type === 'root' && (root.rootHealth ?? 1) >= .75).length;
    }
    if (key === 'ecologicalScore') return Number(state.level.ecologicalScore || 0);
    return undefined;
  }

  function conditionValue(condition) {
    if (condition.type === 'worldState') return worldValue(condition);
    if (condition.type === 'playerUnlock') return Boolean(state.campaign?.unlocks?.[condition.key]);
    return undefined;
  }

  function evaluate(testOrConditions) {
    const conditions = Array.isArray(testOrConditions)
      ? testOrConditions
      : testOrConditions?.requires || [];
    const results = conditions.map(condition => {
      const actual = conditionValue(condition);
      const compare = OPERATORS[condition.operator];
      return {
        condition,
        actual,
        passed: Boolean(compare && compare(actual, condition.value)),
      };
    });
    return {
      passed: results.length > 0 && results.every(result => result.passed),
      results,
    };
  }

  return { evaluate, worldValue };
}

