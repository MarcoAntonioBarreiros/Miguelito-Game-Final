// campaign-manifest.v2.js
// Fonte única de verdade da campanha didática "Beans for a Living Soil".
//
// Princípios obrigatórios:
// 1. Organismo novo: cartão obrigatório no PRIMEIRO ENCONTRO POR PROXIMIDADE.
// 2. Criação distante ou fora da câmera não abre cartão.
// 3. Após a entrada no raio de detecção, pacing/cooldown nunca silenciam organismo novo.
// 4. Organismos entram no procedural somente depois da zona de estreia.
// 5. Somente estruturas/processos do mesmo organismo são agrupados.
// 6. Cada zona de estreia contém no máximo um organismo ainda não explicado.
// 7. Poder previsto para a fase != poder já disponível naquele chunk.
// 8. Nenhum obstáculo/geometria pode exigir um poder ainda não desbloqueado.

export const ECOLOGY_ROAMING_TYPES = Object.freeze([
  'rhizobium', 'bacillus', 'azospirillum', 'pseudomonas', 'oportunista', 'trichoderma',
]);

export const PATHOGEN_SYSTEMS = Object.freeze(['rhizoctonia', 'meloidogyne', 'ralstonia']);
export const CAMPAIGN_UNLOCKS = Object.freeze([
  'doubleJump', 'dash', 'phosphateSolubilization', 'mycorrhizaStructures', 'azospirillumRoots',
]);
export const TUTORIAL_MODES = Object.freeze(['guided', 'silent', 'disabled']);
export const PRESENTATION_POLICIES = Object.freeze([
  'mandatory-first-appearance', 'event-immediate', 'guided-sequence', 'spaced-auto', 'silent-only',
]);
export const SEGMENT_KINDS = Object.freeze(['fixed', 'procedural', 'final']);
export const DERIVED_TRIGGER_BEHAVIORS = Object.freeze(['guide-only', 'open-in-guided']);
export const MVP_EXCLUDED_PATHOGENS = Object.freeze(['ralstonia']);
export const NITROGEN_ROOT_DEFAULTS = Object.freeze({
  enabled: true,
  count: 1,
  requiredFixationRate: 0.05,
  growthDurationSeconds: 4,
});
export const AZOSPIRILLUM_ROOT_LADDER_DEFAULTS = Object.freeze({
  enabled: true,
  count: 1,
  stepCount: 4,
  verticalSpacing: 85,
  growthDurationSeconds: 3,
});
export const AZOSPIRILLUM_NITROGEN_DEFAULTS = Object.freeze({
  associativeRate: 0.01,
  rhizobiumSynergyMultiplier: 1.2,
});
export const MYCORRHIZA_BRIDGE_DEFAULTS = Object.freeze({
  horizontalOnly: true,
});
export const OPPORTUNISTIC_FUNGUS_DEFAULTS = Object.freeze({
  contaminationRate: 1,
  movementSpeedReduction: .25,
  accelerationReduction: .35,
  jumpImpulseReduction: .15,
  recoveryRate: .12,
  hyphalGrowthRate: 1,
  sporulationRate: 1,
});
export const PSEUDOMONAS_IRON_CONTROL_DEFAULTS = Object.freeze({
  minimumIronReserve: 1,
  // Nome preservado conforme o brief; funciona como vigor máximo na prova.
  minimumFungalVigor: .25,
  growthSuppression: .7,
  sporulationSuppression: .8,
  adhesionSuppression: .7,
});
export const PHOSPHATE_SOLUBILIZATION_DEFAULTS = Object.freeze({
  absorptionRadius: 175,
  chargeTimeSeconds: 1.8,
  minimumCharge: .18,
  maximumCharge: 1,
  shotRange: 430,
  shotSpeed: 620,
  amountSolubilizedPerCharge: 1,
  metaboliteProductionRate: .11,
  exudateProductionMultiplier: 2.4,
  localPoolCaptureRadius: 92,
  mycorrhizalTransportRate: .16,
  minimumTransportedPhosphate: .65,
});

export const PRESENTATION_TRIGGER_CHAINS = Object.freeze({
  'action-exudate': Object.freeze(['action-exudate', 'action-inoculation']),
  'organism-bacillus': Object.freeze(['organism-bacillus', 'structure-biofilm']),
  'organism-rhizobium': Object.freeze(['organism-rhizobium', 'structure-nodule', 'process-fbn']),
  'organism-azospirillum': Object.freeze(['organism-azospirillum', 'structure-lateral-root']),
  'organism-mycorrhiza': Object.freeze(['organism-mycorrhiza', 'structure-arbuscule', 'structure-mycorrhiza-path']),
  'organism-pseudomonas': Object.freeze(['organism-pseudomonas', 'process-siderophore']),
  'organism-rhizoctonia': Object.freeze([
    'organism-rhizoctonia', 'process-root-health', 'process-root-recovery', 'process-root-collapse',
  ]),
  'organism-meloidogyne-j2': Object.freeze(['organism-meloidogyne-j2', 'structure-gall']),
  'organism-meloidogyne-female': Object.freeze(['organism-meloidogyne-female', 'structure-egg-mass']),
});

export const FINAL_TEST_KEYS = Object.freeze({
  playerUnlock: Object.freeze(['doubleJump', 'dash', 'phosphateSolubilization']),
  worldState: Object.freeze([
    'reachedFinalRoot', 'functionalBiofilmCount', 'activeMatureNoduleCount', 'totalFixationRate',
    'visibleLateralRootCount', 'functionalMycorrhizaPathCount', 'pseudomonasIronReserve',
    'neutralizedOpportunisticFungusCount', 'recoveredRootCount', 'brokenCrystalCount',
    'neutralizedEggMassCount', 'preservedRootCount', 'ecologicalScore',
    'deployedExudateCount', 'bacillusColonyCount',
    'opportunisticFungusVigor', 'solubilizedPhosphateDepositCount',
    'mycorrhizalPhosphateTransported', 'rootPhosphateStock',
  ]),
});

export const tutorialPacing = Object.freeze({
  distanceViewportFactor: 0.90,
  minimumWorldDistance: 600,
  fallbackSeconds: 60,
  firstAppearanceEvent: 'first-proximity-encounter',
  organismFirstAppearanceBypassesSpatialGate: true,
  powerUnlockBypassesSpatialGate: true,
  diagnosticEventName: 'miguelito:tutorial-unexpected-first-appearance',
  simultaneousFirstEncountersEventName: 'miguelito:tutorial-simultaneous-first-encounters',
});

const phases = [
  {
    id: 'prologue', phase: 0, totalChunks: 16,
    title: 'Primeiros passos na rizosfera', theme: 'movimento',
    mission: 'Aprenda a se mover e a saltar; alcance a raiz principal.',
    newConcepts: ['movimento', 'plataforma-vs-queda'], newCommand: null,
    presentations: [{
      id: 'presentation-welcome', cardId: 'system-welcome',
      triggerIds: ['system-welcome'], autoOpenTrigger: 'system-welcome',
      policy: 'guided-sequence', suppressIndividualCards: false,
      debutChunk: 0, moduleId: 'p0-intro',
      pages: ['pausa', 'GUIA', 'como os cartões funcionam'],
    }],
    unlockEvents: [], pathogenDebuts: [],
    segments: [
      { id: 'p0-intro', kind: 'fixed', from: 0, to: 3, tutorialMode: 'guided',
        debutPresentationIds: ['presentation-welcome'], mechanicsRequired: [],
        beats: ['andar', 'parar', 'mudar de direção', 'câmera', 'pulo simples'] },
      { id: 'p0-challenge', kind: 'procedural', from: 4, to: 12, tutorialMode: 'silent',
        mechanicsRequired: [], beats: ['plataformas', 'desníveis', 'vãos', 'sem organismos'] },
      { id: 'p0-final', kind: 'final', from: 13, to: 15, tutorialMode: 'silent',
        mechanicsRequired: [], beats: ['três saltos', 'raiz principal'] },
    ],
    finalTest: { id: 'p0-test', goal: 'Entrar na raiz principal.', requires: [
      { type: 'worldState', key: 'reachedFinalRoot', operator: '===', value: true },
    ]},
    notes: [],
  },

  {
    id: 'phase-1', phase: 1, totalChunks: 13,
    title: 'Recrutar e estabelecer', theme: 'fundamentos',
    mission: 'Recrute Bacillus com exsudatos e forme o primeiro biofilme funcional.',
    newConcepts: ['exsudato→recrutamento→inoculação', 'Bacillus→biofilme'], newCommand: null,
    presentations: [
      { id: 'presentation-recruitment', cardId: 'action-exudate',
        triggerIds: ['action-exudate', 'action-inoculation'], autoOpenTrigger: 'action-exudate',
        policy: 'guided-sequence', suppressIndividualCards: true,
        derivedTriggerBehavior: 'guide-only',
        pageUnlocks: [
          { triggerId: 'action-exudate', pages: [0, 1, 2] },
          { triggerId: 'action-inoculation', pages: [3] },
        ],
        debutChunk: 4, moduleId: 'p1-intro',
        pages: ['exsudato', 'atração/alimentação', 'recrutamento', 'inoculação'] },
      { id: 'presentation-bacillus', cardId: 'organism-bacillus',
        triggerIds: ['organism-bacillus', 'structure-biofilm'], autoOpenTrigger: 'organism-bacillus',
        policy: 'mandatory-first-appearance', suppressIndividualCards: true,
        roamingType: 'bacillus', debutChunk: 6, poolFromChunk: 9,
        moduleId: 'p1-intro', debutZoneId: 'p1-bacillus-debut', tetherUntilSeen: true,
        derivedTriggerBehavior: 'guide-only',
        pageUnlocks: [
          { triggerId: 'organism-bacillus', pages: [0] },
          { triggerId: 'structure-biofilm', pages: [1, 2, 3] },
        ],
        pages: ['quem é', 'colonização', 'biofilme', 'proteção/checkpoint no jogo'] },
    ],
    unlockEvents: [], pathogenDebuts: [],
    segments: [
      { id: 'p1-warmup', kind: 'procedural', from: 0, to: 3, tutorialMode: 'silent', mechanicsRequired: [] },
      { id: 'p1-intro', kind: 'fixed', from: 4, to: 8, tutorialMode: 'guided',
        debutPresentationIds: ['presentation-recruitment', 'presentation-bacillus'],
        mechanicsRequired: ['exudate', 'inoculation'],
        fixedBlock: {
          template: 'phase1-intro-v1',
          objective: 'Libere exsudato, recrute Bacillus e inocule a raiz com halo amarelo.',
          completion: [
            { type: 'worldState', key: 'deployedExudateCount', operator: '>=', value: 1 },
            { type: 'worldState', key: 'functionalBiofilmCount', target: 'p1-intro-root', operator: '>=', value: 1 },
          ],
          exitGate: true,
        } },
      { id: 'p1-challenge', kind: 'procedural', from: 9, to: 12, tutorialMode: 'silent',
        mechanicsRequired: ['exudate', 'inoculation'] },
    ],
    finalTest: { id: 'p1-test', goal: 'Criar e ativar o primeiro checkpoint de Bacillus.', requires: [
      { type: 'worldState', key: 'functionalBiofilmCount', target: 'p1-intro-root', operator: '>=', value: 1 },
    ]}, notes: [],
  },

  {
    id: 'phase-2', phase: 2, totalChunks: 40,
    nitrogenRoot: { ...NITROGEN_ROOT_DEFAULTS },
    title: 'Rhizobium, nódulo e FBN', theme: 'simbiose',
    mission: 'Estabeleça um nódulo maduro e mantenha a fixação de nitrogênio ativa.',
    newConcepts: ['Rhizobium→nódulo→FBN'], newCommand: null,
    presentations: [{
      id: 'presentation-rhizobium', cardId: 'organism-rhizobium',
      triggerIds: ['organism-rhizobium', 'structure-nodule', 'process-fbn'],
      autoOpenTrigger: 'organism-rhizobium', policy: 'mandatory-first-appearance',
      suppressIndividualCards: true, roamingType: 'rhizobium', debutChunk: 4, poolFromChunk: 9,
      moduleId: 'p2-intro', debutZoneId: 'p2-rhizobium-debut', tetherUntilSeen: true,
      derivedTriggerBehavior: 'guide-only',
      pageUnlocks: [
        { triggerId: 'organism-rhizobium', pages: [0] },
        { triggerId: 'structure-nodule', pages: [1, 2] },
        { triggerId: 'process-fbn', pages: [3] },
      ],
      pages: ['quem é/compatibilidade', 'nodulação', 'nódulo maduro', 'FBN e função no jogo'],
    }],
    unlockEvents: [], pathogenDebuts: [],
    segments: [
      { id: 'p2-warmup', kind: 'procedural', from: 0, to: 3, tutorialMode: 'silent', mechanicsRequired: ['exudate', 'inoculation'] },
      { id: 'p2-intro', kind: 'fixed', from: 4, to: 8, tutorialMode: 'guided',
        debutPresentationIds: ['presentation-rhizobium'], mechanicsRequired: ['exudate', 'inoculation'] },
      { id: 'p2-challenge', kind: 'procedural', from: 9, to: 34, tutorialMode: 'silent', mechanicsRequired: ['exudate', 'inoculation'] },
      { id: 'p2-final', kind: 'final', from: 35, to: 39, tutorialMode: 'silent', mechanicsRequired: ['inoculation'] },
    ],
    finalTest: { id: 'p2-test', goal: 'Chegar à raiz final com nódulo maduro fixando N₂.', requires: [
      { type: 'worldState', key: 'activeMatureNoduleCount', operator: '>=', value: 1 },
      { type: 'worldState', key: 'totalFixationRate', operator: '>', value: 0.05 },
    ]}, notes: [],
  },

  {
    id: 'phase-3', phase: 3, totalChunks: 40,
    nitrogenRoot: { ...NITROGEN_ROOT_DEFAULTS },
    azospirillumRootLadder: { ...AZOSPIRILLUM_ROOT_LADDER_DEFAULTS },
    azospirillumNitrogen: { ...AZOSPIRILLUM_NITROGEN_DEFAULTS },
    title: 'Azospirillum e arquitetura radicular', theme: 'arquitetura',
    mission: 'Induza raízes laterais e use o salto duplo para alcançar novas rotas.',
    newConcepts: ['Azospirillum→raiz lateral'], newCommand: 'doubleJump',
    presentations: [
      { id: 'presentation-azospirillum', cardId: 'organism-azospirillum',
        triggerIds: ['organism-azospirillum', 'structure-lateral-root'], autoOpenTrigger: 'organism-azospirillum',
        policy: 'mandatory-first-appearance', suppressIndividualCards: true,
        roamingType: 'azospirillum', debutChunk: 4, poolFromChunk: 9,
        moduleId: 'p3-azo-intro', debutZoneId: 'p3-azospirillum-debut', tetherUntilSeen: true,
        derivedTriggerBehavior: 'guide-only',
        pageUnlocks: [
          { triggerId: 'organism-azospirillum', pages: [0] },
          { triggerId: 'structure-lateral-root', pages: [1, 2, 3] },
        ],
        pages: ['quem é', 'promoção de crescimento', 'arquitetura radicular', 'raiz lateral no jogo'] },
      { id: 'presentation-double-jump', cardId: 'power-double-jump',
        triggerIds: ['power-double-jump'], autoOpenTrigger: 'power-double-jump',
        policy: 'event-immediate', suppressIndividualCards: false,
        debutChunk: 18, moduleId: 'p3-power-intro',
        pages: ['mecânica de gameplay', 'segundo impulso no ar'] },
    ],
    unlockEvents: [
      { feature: 'azospirillumRoots', eventChunk: 8, afterModule: 'p3-azo-intro', practiceWindowChunks: 3, mandatory: true },
      { feature: 'doubleJump', eventChunk: 20, afterModule: 'p3-power-intro', practiceWindowChunks: 3, mandatory: true },
    ], pathogenDebuts: [],
    segments: [
      { id: 'p3-warmup', kind: 'procedural', from: 0, to: 3, tutorialMode: 'silent', mechanicsRequired: ['inoculation'] },
      { id: 'p3-azo-intro', kind: 'fixed', from: 4, to: 8, tutorialMode: 'guided', debutPresentationIds: ['presentation-azospirillum'], mechanicsRequired: ['inoculation'] },
      { id: 'p3-azo-practice', kind: 'procedural', from: 9, to: 17, tutorialMode: 'silent', mechanicsRequired: ['azospirillumRoots'] },
      { id: 'p3-power-intro', kind: 'fixed', from: 18, to: 20, tutorialMode: 'guided', debutPresentationIds: ['presentation-double-jump'], mechanicsRequired: [] },
      { id: 'p3-challenge', kind: 'procedural', from: 21, to: 35, tutorialMode: 'silent', mechanicsRequired: ['doubleJump', 'azospirillumRoots'] },
      { id: 'p3-final', kind: 'final', from: 36, to: 39, tutorialMode: 'silent', mechanicsRequired: ['doubleJump', 'azospirillumRoots'] },
    ],
    finalTest: { id: 'p3-test', goal: 'Induzir raiz lateral e usar salto duplo.', requires: [
      { type: 'playerUnlock', key: 'doubleJump', operator: '===', value: true },
      { type: 'worldState', key: 'visibleLateralRootCount', operator: '>=', value: 1 },
    ]}, notes: [],
  },

  {
    id: 'phase-4', phase: 4, totalChunks: 40,
    nitrogenRoot: { ...NITROGEN_ROOT_DEFAULTS },
    mycorrhizaBridge: {
      ...MYCORRHIZA_BRIDGE_DEFAULTS,
      introSourceChunk: 3,
      introTargetChunk: 4,
      introGap: 325,
      introVerticalOffset: 54,
    },
    title: 'Micorriza e expansão do solo explorado', theme: 'expansão',
    mission: 'Estabeleça a micorriza, atravesse uma ponte hifal e domine o Dash.',
    newConcepts: ['micorriza→arbúsculo→absorção→ponte'], newCommand: 'dash',
    presentations: [
      { id: 'presentation-mycorrhiza', cardId: 'organism-mycorrhiza',
        triggerIds: ['organism-mycorrhiza', 'structure-arbuscule', 'structure-mycorrhiza-path'],
        autoOpenTrigger: 'organism-mycorrhiza', policy: 'mandatory-first-appearance', suppressIndividualCards: true,
        debutChunk: 3, moduleId: 'p4-myco-intro', debutZoneId: 'p4-mycorrhiza-debut',
        derivedTriggerBehavior: 'guide-only',
        pageUnlocks: [
          { triggerId: 'organism-mycorrhiza', pages: [0] },
          { triggerId: 'structure-arbuscule', pages: [1, 2] },
          { triggerId: 'structure-mycorrhiza-path', pages: [3] },
        ],
        pages: ['quem é', 'arbúsculo/troca', 'absorção', 'ponte como metáfora de gameplay'] },
      { id: 'presentation-dash', cardId: 'power-dash', triggerIds: ['power-dash'],
        autoOpenTrigger: 'power-dash', policy: 'event-immediate', suppressIndividualCards: false,
        debutChunk: 18, moduleId: 'p4-power-intro', pages: ['mecânica de gameplay', 'impulso horizontal'] },
    ],
    unlockEvents: [
      { feature: 'mycorrhizaStructures', eventChunk: 3, afterModule: 'p4-myco-intro', practiceWindowChunks: 3, mandatory: true },
      { feature: 'dash', eventChunk: 20, afterModule: 'p4-power-intro', practiceWindowChunks: 3, mandatory: true },
    ], pathogenDebuts: [],
    segments: [
      { id: 'p4-warmup', kind: 'procedural', from: 0, to: 2, tutorialMode: 'silent', mechanicsRequired: ['doubleJump'] },
      { id: 'p4-myco-intro', kind: 'fixed', from: 3, to: 8, tutorialMode: 'guided', debutPresentationIds: ['presentation-mycorrhiza'], mechanicsRequired: ['inoculation'] },
      { id: 'p4-myco-practice', kind: 'procedural', from: 9, to: 17, tutorialMode: 'silent', mechanicsRequired: ['mycorrhizaStructures', 'doubleJump'] },
      { id: 'p4-power-intro', kind: 'fixed', from: 18, to: 20, tutorialMode: 'guided', debutPresentationIds: ['presentation-dash'], mechanicsRequired: ['doubleJump'] },
      { id: 'p4-challenge', kind: 'procedural', from: 21, to: 35, tutorialMode: 'silent', mechanicsRequired: ['dash', 'doubleJump', 'mycorrhizaStructures'] },
      { id: 'p4-final', kind: 'final', from: 36, to: 39, tutorialMode: 'silent', mechanicsRequired: ['dash', 'mycorrhizaStructures'] },
    ],
    finalTest: { id: 'p4-test', goal: 'Completar travessia com ponte micorrízica e Dash.', requires: [
      { type: 'playerUnlock', key: 'dash', operator: '===', value: true },
      { type: 'worldState', key: 'functionalMycorrhizaPathCount', operator: '>=', value: 1 },
    ]}, notes: [],
  },

  {
    id: 'phase-5', phase: 5, totalChunks: 20,
    nitrogenRoot: { ...NITROGEN_ROOT_DEFAULTS },
    opportunisticFungus: { ...OPPORTUNISTIC_FUNGUS_DEFAULTS },
    pseudomonasIronControl: { ...PSEUDOMONAS_IRON_CONTROL_DEFAULTS },
    title: 'Ferro e biocontrole fúngico', theme: 'equilíbrio',
    mission: 'Perceba a contaminação fúngica e use Pseudomonas para limitar o vigor do fungo por competição por ferro.',
    newConcepts: ['oportunista→contaminação', 'Pseudomonas→sideróforo→ferro→competição'], newCommand: null,
    presentations: [
      { id: 'presentation-opportunistic-fungus', cardId: 'organism-opportunistic-fungus',
        triggerIds: ['organism-opportunistic-fungus'], autoOpenTrigger: 'organism-opportunistic-fungus',
        policy: 'mandatory-first-appearance', suppressIndividualCards: false,
        roamingType: 'oportunista', debutChunk: 2, poolFromChunk: 6,
        moduleId: 'p5-fungus-intro', debutZoneId: 'p5-opportunistic-fungus-debut', tetherUntilSeen: true,
        pages: ['Quem é?', 'Rede de hifas', 'Contaminação', 'Recuperação'] },
      { id: 'presentation-pseudomonas', cardId: 'organism-pseudomonas',
        triggerIds: ['organism-pseudomonas', 'process-siderophore'], autoOpenTrigger: 'organism-pseudomonas',
        policy: 'mandatory-first-appearance', suppressIndividualCards: true,
        roamingType: 'pseudomonas', debutChunk: 8, poolFromChunk: 12,
        moduleId: 'p5-pseudo-intro', debutZoneId: 'p5-pseudomonas-debut', tetherUntilSeen: true,
        derivedTriggerBehavior: 'guide-only',
        pageUnlocks: [
          { triggerId: 'organism-pseudomonas', pages: [0] },
          { triggerId: 'process-siderophore', pages: [1, 2, 3] },
        ],
        pages: ['quem é', 'sideróforo', 'Fe³⁺', 'reserva de ferro'] },
      { id: 'presentation-iron-competition', cardId: 'process-iron-competition',
        triggerIds: ['process-iron-competition'], autoOpenTrigger: 'process-iron-competition',
        policy: 'guided-sequence', suppressIndividualCards: false,
        prerequisitePresentationIds: ['presentation-opportunistic-fungus', 'presentation-pseudomonas'],
        debutChunk: 13, moduleId: 'p5-interaction',
        pages: ['Competição por ferro', 'Vigor reduzido', 'Efeito no jogo', 'Sem eliminação direta'] },
    ],
    unlockEvents: [], pathogenDebuts: [],
    segments: [
      { id: 'p5-fungus-intro', kind: 'fixed', from: 0, to: 5, tutorialMode: 'guided',
        debutPresentationIds: ['presentation-opportunistic-fungus'], mechanicsRequired: [] },
      { id: 'p5-pseudo-intro', kind: 'fixed', from: 6, to: 11, tutorialMode: 'guided',
        debutPresentationIds: ['presentation-pseudomonas'], mechanicsRequired: ['inoculation'] },
      { id: 'p5-interaction', kind: 'fixed', from: 12, to: 14, tutorialMode: 'guided',
        debutPresentationIds: ['presentation-iron-competition'], mechanicsRequired: ['inoculation'] },
      { id: 'p5-challenge', kind: 'procedural', from: 15, to: 17, tutorialMode: 'silent', mechanicsRequired: ['inoculation', 'doubleJump', 'dash'] },
      { id: 'p5-final', kind: 'final', from: 18, to: 19, tutorialMode: 'silent', mechanicsRequired: ['inoculation'] },
    ],
    finalTest: { id: 'p5-test', goal: 'Controle o vigor do fungo com a reserva de ferro e alcance a raiz final.', requires: [
      { type: 'worldState', key: 'pseudomonasIronReserve', operator: '>=', value: 1 },
      { type: 'worldState', key: 'opportunisticFungusVigor', operator: '<=', value: .25 },
      { type: 'worldState', key: 'reachedFinalRoot', operator: '===', value: true },
    ]}, notes: [],
  },

  {
    id: 'phase-6', phase: 6, totalChunks: 40,
    nitrogenRoot: { ...NITROGEN_ROOT_DEFAULTS },
    title: 'Trichoderma contra Rhizoctonia', theme: 'patologia',
    mission: 'Observe a lesão de Rhizoctonia, recrute Trichoderma e inocule-o próximo ao foco para recuperar a raiz.',
    newConcepts: ['Rhizoctonia→lesão', 'Trichoderma→micoparasitismo→recuperação'], newCommand: null,
    presentations: [
      { id: 'presentation-root-health', cardId: 'organism-rhizoctonia',
        triggerIds: ['organism-rhizoctonia', 'process-root-health', 'process-root-recovery', 'process-root-collapse'],
        autoOpenTrigger: 'organism-rhizoctonia', policy: 'mandatory-first-appearance', suppressIndividualCards: true,
        debutChunk: 1, moduleId: 'p6-rhizo-intro', debutZoneId: 'p6-rhizoctonia-debut',
        derivedTriggerBehavior: 'guide-only',
        pageUnlocks: [
          { triggerId: 'organism-rhizoctonia', pages: [0] },
          { triggerId: 'process-root-health', pages: [1] },
          { triggerId: 'process-root-collapse', pages: [2] },
          { triggerId: 'process-root-recovery', pages: [3] },
        ],
        pages: ['Rhizoctonia', 'lesão progressiva', 'estados de saúde', 'recuperação/sustentação'] },
      { id: 'presentation-trichoderma', cardId: 'organism-trichoderma',
        triggerIds: ['organism-trichoderma'], autoOpenTrigger: 'organism-trichoderma',
        policy: 'mandatory-first-appearance', suppressIndividualCards: false,
        roamingType: 'trichoderma', debutChunk: 3, poolFromChunk: 11,
        moduleId: 'p6-tricho-intro', debutZoneId: 'p6-trichoderma-debut', tetherUntilSeen: true,
        pages: ['Quem é?', 'Crescimento hifal', 'Alvos', 'Vigor da colônia'] },
      { id: 'presentation-mycoparasitism', cardId: 'process-mycoparasitism',
        triggerIds: ['process-mycoparasitism'], autoOpenTrigger: 'process-mycoparasitism',
        policy: 'event-immediate', suppressIndividualCards: false,
        prerequisitePresentationIds: ['presentation-root-health', 'presentation-trichoderma'],
        debutChunk: 4, moduleId: 'p6-tricho-intro',
        pages: ['Micoparasitismo', 'Reconhecimento', 'Enovelamento e lise', 'Recuperação da raiz'] },
    ],
    unlockEvents: [],
    pathogenDebuts: [{ pathogen: 'rhizoctonia', fromChunk: 1, presentationId: 'presentation-root-health' }],
    segments: [
      { id: 'p6-rhizo-intro', kind: 'fixed', from: 0, to: 1, tutorialMode: 'guided',
        debutPresentationIds: ['presentation-root-health'], mechanicsRequired: [] },
      { id: 'p6-tricho-intro', kind: 'fixed', from: 2, to: 10, tutorialMode: 'guided',
        debutPresentationIds: ['presentation-trichoderma', 'presentation-mycoparasitism'], mechanicsRequired: ['exudate', 'inoculation'] },
      { id: 'p6-rhizo-practice', kind: 'procedural', from: 11, to: 35, tutorialMode: 'silent', mechanicsRequired: ['inoculation', 'doubleJump', 'dash'] },
      { id: 'p6-final', kind: 'final', from: 36, to: 39, tutorialMode: 'silent', mechanicsRequired: ['inoculation'] },
    ],
    finalTest: { id: 'p6-test', goal: 'Conter Rhizoctonia com Trichoderma e recuperar uma raiz.', requires: [
      { type: 'worldState', key: 'recoveredRootCount', operator: '>=', value: 1 },
    ]}, notes: [],
  },

  {
    id: 'phase-7', phase: 7, totalChunks: 16,
    nitrogenRoot: { ...NITROGEN_ROOT_DEFAULTS },
    phosphateSolubilization: { ...PHOSPHATE_SOLUBILIZATION_DEFAULTS },
    title: 'Fósforo: solubilização e transporte', theme: 'fósforo',
    mission: 'Use uma cepa solubilizadora de Bacillus para liberar o fósforo preso no mineral e permita que a micorriza o transporte até a raiz.',
    newConcepts: ['Bacillus solubilizador→P disponível', 'micorriza→transporte→raiz'], newCommand: 'phosphateSolubilization',
    presentations: [
      { id: 'presentation-phosphate-solubilizer', cardId: 'organism-phosphate-solubilizer',
        triggerIds: ['organism-phosphate-solubilizer'], autoOpenTrigger: 'organism-phosphate-solubilizer',
        policy: 'mandatory-first-appearance', suppressIndividualCards: false,
        debutChunk: 2, moduleId: 'p7-solubilizer-intro', debutZoneId: 'p7-phosphate-solubilizer-debut',
        pages: ['Cepa específica', 'Metabólitos solubilizadores', 'Como carregar', 'Solubilização e transporte'] },
      { id: 'presentation-pulse', cardId: 'power-pulse',
        triggerIds: ['power-pulse'], autoOpenTrigger: 'power-pulse',
        policy: 'event-immediate', suppressIndividualCards: false,
        debutChunk: 3, moduleId: 'p7-solubilizer-intro',
        pages: ['Selecionar', 'Carregar', 'Disparar', 'Alvo exclusivo'] },
    ],
    unlockEvents: [
      { feature: 'phosphateSolubilization', eventChunk: 3, afterModule: 'p7-solubilizer-intro', practiceWindowChunks: 4, mandatory: true },
    ],
    pathogenDebuts: [],
    segments: [
      { id: 'p7-solubilizer-intro', kind: 'fixed', from: 0, to: 3, tutorialMode: 'guided',
        debutPresentationIds: ['presentation-phosphate-solubilizer', 'presentation-pulse'], mechanicsRequired: [] },
      { id: 'p7-phosphate-chain', kind: 'fixed', from: 4, to: 11, tutorialMode: 'guided',
        debutPresentationIds: [], mechanicsRequired: ['phosphateSolubilization', 'mycorrhizaStructures'] },
      { id: 'p7-short-challenge', kind: 'procedural', from: 12, to: 13, tutorialMode: 'silent',
        mechanicsRequired: ['doubleJump', 'dash'] },
      { id: 'p7-final', kind: 'final', from: 14, to: 15, tutorialMode: 'silent',
        mechanicsRequired: ['phosphateSolubilization'] },
    ],
    finalTest: { id: 'p7-test', goal: 'Solubilizar o depósito, transportar P pela micorriza e entregá-lo à raiz final.', requires: [
      { type: 'worldState', key: 'solubilizedPhosphateDepositCount', operator: '>=', value: 1 },
      { type: 'worldState', key: 'mycorrhizalPhosphateTransported', operator: '>=', value: PHOSPHATE_SOLUBILIZATION_DEFAULTS.minimumTransportedPhosphate },
      { type: 'worldState', key: 'rootPhosphateStock', operator: '>=', value: PHOSPHATE_SOLUBILIZATION_DEFAULTS.minimumTransportedPhosphate },
      { type: 'worldState', key: 'reachedFinalRoot', operator: '===', value: true },
    ]}, notes: [],
  },

  {
    id: 'phase-8', phase: 8, totalChunks: 40,
    nitrogenRoot: { ...NITROGEN_ROOT_DEFAULTS },
    title: 'Meloidogyne: infecção, reprodução e sequela', theme: 'infestação',
    mission: 'Impeça novas penetrações, neutralize massas de ovos e preserve uma raiz.',
    newConcepts: ['J2→penetração→galha', 'fêmea→massa de ovos→sequela'], newCommand: null,
    presentations: [
      { id: 'presentation-meloidogyne-infection', cardId: 'organism-meloidogyne-j2',
        triggerIds: ['organism-meloidogyne-j2', 'structure-gall'], autoOpenTrigger: 'organism-meloidogyne-j2',
        policy: 'mandatory-first-appearance', suppressIndividualCards: true,
        debutChunk: 4, moduleId: 'p8-infection-intro', debutZoneId: 'p8-meloidogyne-j2-debut',
        derivedTriggerBehavior: 'guide-only',
        pageUnlocks: [
          { triggerId: 'organism-meloidogyne-j2', pages: [0] },
          { triggerId: 'structure-gall', pages: [1, 2, 3] },
        ],
        pages: ['J2', 'busca da raiz', 'penetração/migração', 'galha'] },
      { id: 'presentation-meloidogyne-reproduction', cardId: 'organism-meloidogyne-female',
        triggerIds: ['organism-meloidogyne-female', 'structure-egg-mass'], autoOpenTrigger: 'organism-meloidogyne-female',
        policy: 'mandatory-first-appearance', suppressIndividualCards: true,
        debutChunk: 18, moduleId: 'p8-reproduction-intro', debutZoneId: 'p8-meloidogyne-female-debut',
        derivedTriggerBehavior: 'guide-only',
        pageUnlocks: [
          { triggerId: 'organism-meloidogyne-female', pages: [0] },
          { triggerId: 'structure-egg-mass', pages: [1, 2, 3] },
        ],
        pages: ['fêmea adulta', 'oviposição', 'massa/eclosão', 'saúde máxima/cicatriz'] },
    ],
    unlockEvents: [],
    pathogenDebuts: [{ pathogen: 'meloidogyne', fromChunk: 4, presentationId: 'presentation-meloidogyne-infection' }],
    segments: [
      { id: 'p8-warmup', kind: 'procedural', from: 0, to: 3, tutorialMode: 'silent', mechanicsRequired: ['doubleJump', 'dash'] },
      { id: 'p8-infection-intro', kind: 'fixed', from: 4, to: 10, tutorialMode: 'guided', debutPresentationIds: ['presentation-meloidogyne-infection'], mechanicsRequired: [] },
      { id: 'p8-infection-practice', kind: 'procedural', from: 11, to: 17, tutorialMode: 'silent', mechanicsRequired: ['inoculation'] },
      { id: 'p8-reproduction-intro', kind: 'fixed', from: 18, to: 23, tutorialMode: 'guided', debutPresentationIds: ['presentation-meloidogyne-reproduction'], mechanicsRequired: [] },
      { id: 'p8-challenge', kind: 'procedural', from: 24, to: 35, tutorialMode: 'silent', mechanicsRequired: ['inoculation', 'doubleJump', 'dash'] },
      { id: 'p8-final', kind: 'final', from: 36, to: 39, tutorialMode: 'silent', mechanicsRequired: ['inoculation'] },
    ],
    finalTest: { id: 'p8-test', goal: 'Neutralizar uma massa de ovos e preservar uma raiz.', requires: [
      { type: 'worldState', key: 'neutralizedEggMassCount', operator: '>=', value: 1 },
      { type: 'worldState', key: 'preservedRootCount', operator: '>=', value: 1 },
    ]}, notes: [],
  },

  {
    id: 'phase-9', phase: 9, totalChunks: 40,
    nitrogenRoot: { ...NITROGEN_ROOT_DEFAULTS },
    title: 'Ecossistema integrado', theme: 'síntese',
    mission: 'Proteja, controle, recupere e atravesse usando tudo o que aprendeu.',
    newConcepts: [], newCommand: null,
    presentations: [], unlockEvents: [],
    pathogenDebuts: [
      { pathogen: 'rhizoctonia', fromChunk: 0, presentationId: null },
      { pathogen: 'meloidogyne', fromChunk: 0, presentationId: null },
    ],
    segments: [
      { id: 'p9-integrated', kind: 'procedural', from: 0, to: 35, tutorialMode: 'silent',
        mechanicsRequired: ['doubleJump', 'dash', 'inoculation'] },
      { id: 'p9-final', kind: 'final', from: 36, to: 39, tutorialMode: 'silent',
        mechanicsRequired: ['doubleJump', 'dash', 'inoculation'] },
    ],
    finalTest: { id: 'p9-test', goal: 'Concluir o desafio integrado com pontuação mínima.', requires: [
      { type: 'worldState', key: 'ecologicalScore', operator: '>=', value: 1 },
      { type: 'worldState', key: 'reachedFinalRoot', operator: '===', value: true },
    ]},
    notes: ['Ralstonia fica para expansão pós-piloto.', 'Nenhum cartão holográfico automático nesta fase.'],
  },
];

export const campaignManifest = Object.freeze(phases);

const phaseManifestOverrides = new Map();

function cloneManifestValue(value) {
  return JSON.parse(JSON.stringify(value));
}

export function getActiveCampaignManifest() {
  return campaignManifest.map(entry => phaseManifestOverrides.get(entry.phase) || entry);
}

export function setPhaseManifestOverride(phaseManifest) {
  if (!phaseManifest || !Number.isInteger(phaseManifest.phase)) {
    throw new TypeError('Override de fase precisa informar um numero de fase inteiro.');
  }
  if (!campaignManifest.some(entry => entry.phase === phaseManifest.phase)) {
    throw new RangeError(`Fase inexistente no manifesto: ${phaseManifest.phase}.`);
  }
  const candidate = cloneManifestValue(phaseManifest);
  const manifest = campaignManifest.map(entry => entry.phase === candidate.phase ? candidate : entry);
  const errors = validateCampaignManifest({ manifest });
  if (errors.length) {
    throw new Error(`Override de fase invalido:\n${errors.join('\n')}`);
  }
  phaseManifestOverrides.set(candidate.phase, candidate);
  return candidate;
}

export function clearPhaseManifestOverride(phase = null) {
  if (phase === null) phaseManifestOverrides.clear();
  else phaseManifestOverrides.delete(phase);
}

export function getPhaseManifest(phase) {
  return phaseManifestOverrides.get(phase)
    || campaignManifest.find(entry => entry.phase === phase)
    || null;
}

export function getSegmentAt(phase, chunkIndex) {
  return getPhaseManifest(phase)?.segments.find(s => chunkIndex >= s.from && chunkIndex <= s.to) || null;
}

export function getTutorialModeAt(phase, chunkIndex) {
  return getSegmentAt(phase, chunkIndex)?.tutorialMode || 'disabled';
}

export function getPresentationById(id) {
  for (const phase of getActiveCampaignManifest()) {
    const found = phase.presentations.find(p => p.id === id);
    if (found) return found;
  }
  return null;
}

export function getPresentationForTrigger(triggerId) {
  for (const phase of getActiveCampaignManifest()) {
    const found = phase.presentations.find(p => p.triggerIds.includes(triggerId));
    if (found) return found;
  }
  return null;
}

function roamingTypesOf(presentation) {
  if (presentation.roamingType) return [presentation.roamingType];
  if (Array.isArray(presentation.roamingTypes)) return presentation.roamingTypes.slice();
  return [];
}

export function getRoamingDebutsAt(phase, chunkIndex) {
  const entry = getPhaseManifest(phase);
  if (!entry) return [];
  const allowed = Array.isArray(entry.phaseLab?.allowedOrganisms)
    ? new Set(entry.phaseLab.allowedOrganisms)
    : null;
  return entry.presentations
    .filter(presentation => presentation.debutChunk === chunkIndex)
    .flatMap(presentation => roamingTypesOf(presentation)
      .filter(type => !allowed || allowed.has(type))
      .map(type => ({
      type,
      cardId: presentation.cardId,
      presentationId: presentation.id,
      debutZoneId: presentation.debutZoneId || `${presentation.id}-debut`,
      tetherUntilSeen: presentation.tetherUntilSeen === true,
    })));
}

export function getProceduralPoolAt(phase, chunkIndex) {
  const current = getPhaseManifest(phase);
  if (Array.isArray(current?.phaseLab?.allowedOrganisms)) {
    return [...new Set(current.phaseLab.allowedOrganisms)]
      .filter(type => ECOLOGY_ROAMING_TYPES.includes(type));
  }
  const types = new Set();
  for (const entry of getActiveCampaignManifest()) {
    if (entry.phase > phase) break;
    for (const presentation of entry.presentations) {
      const roaming = roamingTypesOf(presentation);
      if (!roaming.length) continue;
      if (entry.phase < phase || (entry.phase === phase && chunkIndex >= presentation.poolFromChunk)) {
        roaming.forEach(type => types.add(type));
      }
    }
  }
  return [...types];
}

export function getPathogensAt(phase, chunkIndex) {
  const current = getPhaseManifest(phase);
  if (Array.isArray(current?.phaseLab?.allowedPathogens)) {
    return [...new Set(current.phaseLab.allowedPathogens)]
      .filter(type => PATHOGEN_SYSTEMS.includes(type) && !MVP_EXCLUDED_PATHOGENS.includes(type));
  }
  const active = new Set();
  for (const entry of getActiveCampaignManifest()) {
    if (entry.phase > phase) break;
    for (const debut of entry.pathogenDebuts) {
      if (entry.phase < phase || chunkIndex >= debut.fromChunk) active.add(debut.pathogen);
    }
  }
  return [...active];
}

export function getPathogenStartChunk(phase, pathogen) {
  const current = getPhaseManifest(phase);
  if (!current || MVP_EXCLUDED_PATHOGENS.includes(pathogen)) return null;
  if (Array.isArray(current.phaseLab?.allowedPathogens)) {
    return current.phaseLab.allowedPathogens.includes(pathogen) ? 0 : null;
  }
  for (const entry of getActiveCampaignManifest()) {
    if (entry.phase > phase) break;
    const debut = entry.pathogenDebuts.find(candidate => candidate.pathogen === pathogen);
    if (!debut) continue;
    return entry.phase < phase ? 0 : debut.fromChunk;
  }
  return null;
}

export function getPersistentUnlocksBeforePhase(phase) {
  const active = Object.fromEntries(CAMPAIGN_UNLOCKS.map(flag => [flag, false]));
  for (const entry of getActiveCampaignManifest()) {
    if (entry.phase >= phase) break;
    for (const event of entry.unlockEvents) active[event.feature] = true;
  }
  return active;
}

export function getAvailableUnlocksAt(phase, chunkIndex) {
  const active = getPersistentUnlocksBeforePhase(phase);
  const entry = getPhaseManifest(phase);
  if (!entry) return active;
  for (const event of entry.unlockEvents) {
    if (event.eventChunk < chunkIndex) active[event.feature] = true;
  }
  return active;
}

export function getRequiredPracticeAbilityAt(phase, chunkIndex) {
  const entry = getPhaseManifest(phase);
  if (!entry) return null;
  for (const event of entry.unlockEvents) {
    const start = event.eventChunk + 1;
    const end = event.eventChunk + Math.max(0, event.practiceWindowChunks || 0);
    if (chunkIndex >= start && chunkIndex <= end) return event.feature;
  }
  return null;
}

export function getTetheredDebutsAt(phase, chunkIndex) {
  const entry = getPhaseManifest(phase);
  const segment = getSegmentAt(phase, chunkIndex);
  if (!entry || !segment || segment.kind !== 'fixed') return [];
  return entry.presentations
    .filter(p => p.tetherUntilSeen && segment.debutPresentationIds?.includes(p.id))
    .flatMap(p => roamingTypesOf(p).map(type => ({ type, cardId: p.cardId, presentationId: p.id })));
}

export function globalPresentationOrder() {
  return getActiveCampaignManifest()
    .flatMap(entry => entry.presentations.map(p => ({ phase: entry.phase, ...p })))
    .sort((a, b) => a.phase - b.phase || a.debutChunk - b.debutChunk);
}

const VALID_FINAL_TYPES = new Set(['worldState', 'playerUnlock']);
const VALID_OPERATORS = new Set(['===', '!==', '>', '>=', '<', '<=']);
const VALID_COMMANDS = new Set(['doubleJump', 'dash', 'phosphateSolubilization']);

function availableUnlocksIn(manifest, phaseNumber, chunkIndex, knownUnlocks) {
  const active = Object.fromEntries(knownUnlocks.map(flag => [flag, false]));
  for (const phase of manifest) {
    if (phase.phase > phaseNumber) break;
    for (const event of phase.unlockEvents || []) {
      if (phase.phase < phaseNumber || event.eventChunk < chunkIndex) active[event.feature] = true;
    }
  }
  return active;
}

export function validateFirstEncounterProximity({
  nearbyOrganismCardIds = [],
  explainedCardIds = [],
} = {}) {
  const explained = new Set(explainedCardIds);
  const unexplained = [...new Set(nearbyOrganismCardIds)]
    .filter(id => id.startsWith('organism-') && !explained.has(id));
  if (unexplained.length <= 1) return [];
  return [`Raio de proximidade contém organismos ainda não explicados simultaneamente: ${unexplained.join(', ')}.`];
}

function validateProgressivePages(presentation, errors) {
  if (presentation.triggerIds.length <= 1) return;
  if (!presentation.suppressIndividualCards) {
    errors.push(`${presentation.id}: cadeia agrupada deve suprimir cartões individuais.`);
  }
  if (presentation.derivedTriggerBehavior !== 'guide-only') {
    errors.push(`${presentation.id}: gatilhos derivados devem atualizar somente o GUIA.`);
  }
  if (!Array.isArray(presentation.pageUnlocks)) {
    errors.push(`${presentation.id}: cadeia agrupada sem pageUnlocks.`);
    return;
  }

  const unlockByTrigger = new Map();
  const coveredPages = new Set();
  for (const unlock of presentation.pageUnlocks) {
    if (!presentation.triggerIds.includes(unlock.triggerId)) {
      errors.push(`${presentation.id}: pageUnlock usa gatilho externo ${unlock.triggerId}.`);
    }
    if (unlockByTrigger.has(unlock.triggerId)) {
      errors.push(`${presentation.id}: pageUnlock duplicado para ${unlock.triggerId}.`);
    }
    unlockByTrigger.set(unlock.triggerId, unlock.pages);
    for (const pageIndex of unlock.pages || []) {
      if (!Number.isInteger(pageIndex) || pageIndex < 0 || pageIndex >= presentation.pages.length) {
        errors.push(`${presentation.id}: índice de página inválido ${pageIndex}.`);
      } else if (coveredPages.has(pageIndex)) {
        errors.push(`${presentation.id}: página ${pageIndex} desbloqueada mais de uma vez.`);
      } else {
        coveredPages.add(pageIndex);
      }
    }
  }

  for (const triggerId of presentation.triggerIds) {
    if (!unlockByTrigger.has(triggerId)) errors.push(`${presentation.id}: gatilho ${triggerId} sem pageUnlock.`);
  }
  presentation.pages.forEach((_, pageIndex) => {
    if (!coveredPages.has(pageIndex)) errors.push(`${presentation.id}: página ${pageIndex} nunca é desbloqueada.`);
  });

  if (presentation.policy === 'mandatory-first-appearance') {
    const firstPages = unlockByTrigger.get(presentation.autoOpenTrigger) || [];
    if (firstPages.length !== 1 || firstPages[0] !== 0) {
      errors.push(`${presentation.id}: primeiro encontro deve desbloquear somente a página 0.`);
    }
  }
}

export function validateCampaignManifest({
  manifest = campaignManifest,
  knownCardIds = null,
  knownRoamingTypes = ECOLOGY_ROAMING_TYPES,
  knownPathogens = PATHOGEN_SYSTEMS,
  knownUnlocks = CAMPAIGN_UNLOCKS,
  knownFinalTestKeys = FINAL_TEST_KEYS,
  excludedPathogens = MVP_EXCLUDED_PATHOGENS,
} = {}) {
  const errors = [];
  const phaseIds = new Set();
  const presentationIds = new Set();
  const triggerOwners = new Map();
  const allPresentationIds = new Set(manifest.flatMap(phase => phase.presentations.map(p => p.id)));
  const knownCards = knownCardIds ? new Set(knownCardIds) : null;
  const validateCondition = (condition, scope) => {
    if (!VALID_FINAL_TYPES.has(condition.type)) errors.push(`${scope}: tipo de condiÃ§Ã£o invÃ¡lido.`);
    if (!VALID_OPERATORS.has(condition.operator)) errors.push(`${scope}: operador invÃ¡lido.`);
    if (knownFinalTestKeys[condition.type] && !knownFinalTestKeys[condition.type].includes(condition.key)) {
      errors.push(`${scope}: chave de prova desconhecida ${condition.type}.${condition.key}.`);
    }
  };

  manifest.forEach((phase, expectedPhase) => {
    if (phase.phase !== expectedPhase) errors.push(`Fase fora de ordem: ${phase.phase}; esperado ${expectedPhase}.`);
    if (phaseIds.has(phase.id)) errors.push(`ID de fase duplicado: ${phase.id}.`);
    phaseIds.add(phase.id);
    if (!Array.isArray(phase.newConcepts) || phase.newConcepts.length > 2) {
      errors.push(`${phase.id}: deve ter no máximo dois grupos conceituais.`);
    }
    if (phase.newCommand !== null && !VALID_COMMANDS.has(phase.newCommand)) {
      errors.push(`${phase.id}: comando novo inválido ${phase.newCommand}.`);
    }
    if (!Number.isInteger(phase.totalChunks) || phase.totalChunks <= 0) {
      errors.push(`${phase.id}: totalChunks inválido.`);
      return;
    }

    if (phase.nitrogenRoot) {
      const nitrogenRoot = phase.nitrogenRoot;
      if (typeof nitrogenRoot.enabled !== 'boolean') errors.push(`${phase.id}: nitrogenRoot.enabled invalido.`);
      if (nitrogenRoot.enabled && phase.phase < 2) errors.push(`${phase.id}: nitrogenRoot nao pode existir antes da fase 2.`);
      if (!Number.isInteger(nitrogenRoot.count) || nitrogenRoot.count < 0 || nitrogenRoot.count > 8) {
        errors.push(`${phase.id}: nitrogenRoot.count invalido.`);
      }
      if (!Number.isFinite(nitrogenRoot.requiredFixationRate) || nitrogenRoot.requiredFixationRate <= 0) {
        errors.push(`${phase.id}: nitrogenRoot.requiredFixationRate invalido.`);
      }
      if (!Number.isFinite(nitrogenRoot.growthDurationSeconds) || nitrogenRoot.growthDurationSeconds <= 0) {
        errors.push(`${phase.id}: nitrogenRoot.growthDurationSeconds invalido.`);
      }
    }

    if (phase.phosphateSolubilization) {
      const phosphate = phase.phosphateSolubilization;
      for (const key of Object.keys(PHOSPHATE_SOLUBILIZATION_DEFAULTS)) {
        if (!Number.isFinite(phosphate[key]) || phosphate[key] < 0) {
          errors.push(`${phase.id}: phosphateSolubilization.${key} invalido.`);
        }
      }
      if (phosphate.minimumCharge <= 0 || phosphate.minimumCharge > phosphate.maximumCharge) {
        errors.push(`${phase.id}: faixa de carga da solubilizacao de P invalida.`);
      }
      if (phosphate.minimumTransportedPhosphate <= 0) {
        errors.push(`${phase.id}: phosphateSolubilization.minimumTransportedPhosphate invalido.`);
      }
    }

    if (phase.azospirillumRootLadder) {
      const ladder = phase.azospirillumRootLadder;
      if (typeof ladder.enabled !== 'boolean') errors.push(`${phase.id}: azospirillumRootLadder.enabled invalido.`);
      if (ladder.enabled && phase.phase < 3) errors.push(`${phase.id}: azospirillumRootLadder nao pode existir antes da fase 3.`);
      if (!Number.isInteger(ladder.count) || ladder.count < 0 || ladder.count > 8) {
        errors.push(`${phase.id}: azospirillumRootLadder.count invalido.`);
      }
      if (!Number.isInteger(ladder.stepCount) || ladder.stepCount < 2 || ladder.stepCount > 10) {
        errors.push(`${phase.id}: azospirillumRootLadder.stepCount invalido.`);
      }
      if (!Number.isFinite(ladder.verticalSpacing) || ladder.verticalSpacing < 45 || ladder.verticalSpacing > 110) {
        errors.push(`${phase.id}: azospirillumRootLadder.verticalSpacing invalido.`);
      }
      if (!Number.isFinite(ladder.growthDurationSeconds) || ladder.growthDurationSeconds <= 0) {
        errors.push(`${phase.id}: azospirillumRootLadder.growthDurationSeconds invalido.`);
      }
    }

    if (phase.azospirillumNitrogen) {
      const nitrogen = phase.azospirillumNitrogen;
      if (!Number.isFinite(nitrogen.associativeRate) || nitrogen.associativeRate <= 0 || nitrogen.associativeRate >= .05) {
        errors.push(`${phase.id}: azospirillumNitrogen.associativeRate deve ser positivo e inferior a FBN nodular.`);
      }
      if (!Number.isFinite(nitrogen.rhizobiumSynergyMultiplier) || nitrogen.rhizobiumSynergyMultiplier < 1) {
        errors.push(`${phase.id}: azospirillumNitrogen.rhizobiumSynergyMultiplier invalido.`);
      }
    }

    if (phase.mycorrhizaBridge) {
      const bridge = phase.mycorrhizaBridge;
      if (typeof bridge.horizontalOnly !== 'boolean') {
        errors.push(`${phase.id}: mycorrhizaBridge.horizontalOnly invalido.`);
      }
      for (const key of ['introSourceChunk', 'introTargetChunk']) {
        if (bridge[key] !== undefined && (!Number.isInteger(bridge[key]) || bridge[key] < 0 || bridge[key] >= phase.totalChunks)) {
          errors.push(`${phase.id}: mycorrhizaBridge.${key} invalido.`);
        }
      }
      if (bridge.introGap !== undefined && (!Number.isFinite(bridge.introGap) || bridge.introGap < 58 || bridge.introGap > 340)) {
        errors.push(`${phase.id}: mycorrhizaBridge.introGap invalido.`);
      }
      if (bridge.introVerticalOffset !== undefined
        && (!Number.isFinite(bridge.introVerticalOffset) || Math.abs(bridge.introVerticalOffset) > 68)) {
        errors.push(`${phase.id}: mycorrhizaBridge.introVerticalOffset invalido.`);
      }
    }

    if (phase.opportunisticFungus) {
      for (const key of ['contaminationRate', 'recoveryRate', 'hyphalGrowthRate', 'sporulationRate']) {
        if (!Number.isFinite(phase.opportunisticFungus[key]) || phase.opportunisticFungus[key] < 0) {
          errors.push(`${phase.id}: opportunisticFungus.${key} inválido.`);
        }
      }
      for (const key of ['movementSpeedReduction', 'accelerationReduction', 'jumpImpulseReduction']) {
        const value = phase.opportunisticFungus[key];
        if (!Number.isFinite(value) || value < 0 || value >= 1) {
          errors.push(`${phase.id}: opportunisticFungus.${key} deve estar entre 0 e 1.`);
        }
      }
    }

    if (phase.pseudomonasIronControl) {
      const control = phase.pseudomonasIronControl;
      if (!Number.isFinite(control.minimumIronReserve) || control.minimumIronReserve < 0) {
        errors.push(`${phase.id}: pseudomonasIronControl.minimumIronReserve inválido.`);
      }
      for (const key of ['minimumFungalVigor', 'growthSuppression', 'sporulationSuppression', 'adhesionSuppression']) {
        const value = control[key];
        if (!Number.isFinite(value) || value < 0 || value > 1) {
          errors.push(`${phase.id}: pseudomonasIronControl.${key} deve estar entre 0 e 1.`);
        }
      }
    }

    const coverage = new Array(phase.totalChunks).fill(0);
    const segmentIds = new Set();
    const segmentById = new Map();
    for (const segment of phase.segments) {
      if (segmentIds.has(segment.id)) errors.push(`${phase.id}: segmento duplicado ${segment.id}.`);
      segmentIds.add(segment.id);
      segmentById.set(segment.id, segment);
      if (!SEGMENT_KINDS.includes(segment.kind)) errors.push(`${phase.id}/${segment.id}: kind inválido.`);
      if (!TUTORIAL_MODES.includes(segment.tutorialMode)) errors.push(`${phase.id}/${segment.id}: tutorialMode inválido.`);
      if (segment.from < 0 || segment.to >= phase.totalChunks || segment.from > segment.to) {
        errors.push(`${phase.id}/${segment.id}: intervalo inválido.`); continue;
      }
      if (segment.fixedBlock) {
        if (!['fixed', 'final'].includes(segment.kind)) errors.push(`${phase.id}/${segment.id}: bloco autoral exige kind fixed ou final.`);
        if (!segment.fixedBlock.template) errors.push(`${phase.id}/${segment.id}: bloco autoral sem template.`);
        if (!segment.fixedBlock.objective) errors.push(`${phase.id}/${segment.id}: bloco autoral sem objetivo.`);
        const completion = segment.fixedBlock.completion || [];
        if (segment.fixedBlock.completionRef !== 'finalTest' && completion.length === 0) {
          errors.push(`${phase.id}/${segment.id}: bloco autoral sem condição de conclusão.`);
        }
        for (const condition of completion) validateCondition(condition, `${phase.id}/${segment.id}`);
      }
      for (let i = segment.from; i <= segment.to; i++) coverage[i]++;
    }
    coverage.forEach((count, chunk) => {
      if (count === 0) errors.push(`${phase.id}: chunk ${chunk} sem segmento.`);
      if (count > 1) errors.push(`${phase.id}: chunk ${chunk} sobreposto.`);
    });

    const debutZoneOwners = new Map();
    for (const p of phase.presentations) {
      if (presentationIds.has(p.id)) errors.push(`Apresentação duplicada: ${p.id}.`);
      presentationIds.add(p.id);
      if (!PRESENTATION_POLICIES.includes(p.policy)) errors.push(`${p.id}: policy inválida.`);
      if (!Array.isArray(p.pages) || p.pages.length === 0) errors.push(`${p.id}: apresentação sem páginas.`);
      if (!p.triggerIds.includes(p.autoOpenTrigger)) errors.push(`${p.id}: autoOpenTrigger fora de triggerIds.`);
      if (p.autoOpenTrigger !== p.cardId) errors.push(`${p.id}: autoOpenTrigger deve corresponder ao cardId.`);
      if (knownCards && !knownCards.has(p.cardId)) errors.push(`${p.id}: cardId inexistente ${p.cardId}.`);
      for (const triggerId of p.triggerIds) {
        if (knownCards && !knownCards.has(triggerId)) errors.push(`${p.id}: triggerId inexistente ${triggerId}.`);
        const owner = triggerOwners.get(triggerId);
        if (owner && owner !== p.id) errors.push(`Gatilho ${triggerId} pertence a ${owner} e ${p.id}.`);
        triggerOwners.set(triggerId, p.id);
      }

      const organismTriggers = p.triggerIds.filter(id => id.startsWith('organism-'));
      if (organismTriggers.length > 1) {
        errors.push(`${p.id}: organismos diferentes não podem compartilhar apresentação inicial.`);
      }
      const allowedChain = PRESENTATION_TRIGGER_CHAINS[p.cardId];
      if (p.triggerIds.length > 1 && (!allowedChain || p.triggerIds.some(id => !allowedChain.includes(id)))) {
        errors.push(`${p.id}: cadeia de gatilhos não pertence ao mesmo organismo ou processo.`);
      }
      validateProgressivePages(p, errors);

      const roamingTypes = roamingTypesOf(p);
      if (roamingTypes.length > 1) errors.push(`${p.id}: apresentação não pode agrupar roamingTypes diferentes.`);
      for (const type of roamingTypes) {
        if (!knownRoamingTypes.includes(type)) errors.push(`${p.id}: roaming type desconhecido ${type}.`);
      }
      if (roamingTypes.length) {
        if (!Number.isInteger(p.poolFromChunk)) errors.push(`${p.id}: falta poolFromChunk.`);
        else if (p.poolFromChunk <= p.debutChunk || p.poolFromChunk >= phase.totalChunks) {
          errors.push(`${p.id}: poolFromChunk deve ser posterior à estreia e pertencer à fase.`);
        }
        if (!p.tetherUntilSeen) errors.push(`${p.id}: estreia vagante deve permanecer tethered até ser explicada.`);
      }

      if (p.policy === 'mandatory-first-appearance') {
        if (!p.cardId.startsWith('organism-')) errors.push(`${p.id}: primeira aparição obrigatória exige cardId de organismo.`);
        if (!p.debutZoneId) errors.push(`${p.id}: organismo novo sem debutZoneId.`);
        else if (debutZoneOwners.has(p.debutZoneId)) {
          errors.push(`${phase.id}/${p.debutZoneId}: mais de um organismo novo na mesma zona de estreia.`);
        } else {
          debutZoneOwners.set(p.debutZoneId, p.id);
        }
      }

      const module = segmentById.get(p.moduleId);
      if (!module) errors.push(`${p.id}: moduleId inexistente ${p.moduleId}.`);
      else if (p.debutChunk < module.from || p.debutChunk > module.to) {
        errors.push(`${p.id}: debutChunk fora do módulo ${p.moduleId}.`);
      }
      for (const prerequisiteId of p.prerequisitePresentationIds || []) {
        if (!allPresentationIds.has(prerequisiteId)) errors.push(`${p.id}: pré-requisito inexistente ${prerequisiteId}.`);
      }
    }

    for (const segment of phase.segments) {
      for (const presentationId of segment.debutPresentationIds || []) {
        if (!allPresentationIds.has(presentationId)) {
          errors.push(`${phase.id}/${segment.id}: apresentação de estreia inexistente ${presentationId}.`);
        } else {
          const presentation = phase.presentations.find(p => p.id === presentationId);
          if (!presentation || presentation.moduleId !== segment.id) {
            errors.push(`${phase.id}/${segment.id}: apresentação ${presentationId} pertence a outro módulo ou fase.`);
          }
        }
      }
    }

    for (const event of phase.unlockEvents) {
      if (!knownUnlocks.includes(event.feature)) errors.push(`${phase.id}: unlock desconhecido ${event.feature}.`);
      if (event.eventChunk < 0 || event.eventChunk >= phase.totalChunks) errors.push(`${phase.id}: eventChunk inválido.`);
      if (!phase.segments.some(s => s.id === event.afterModule)) errors.push(`${phase.id}: afterModule inexistente ${event.afterModule}.`);
    }

    for (const debut of phase.pathogenDebuts) {
      if (!knownPathogens.includes(debut.pathogen)) errors.push(`${phase.id}: patógeno desconhecido ${debut.pathogen}.`);
      if (excludedPathogens.includes(debut.pathogen)) errors.push(`${phase.id}: patógeno excluído do MVP ${debut.pathogen}.`);
      if (debut.presentationId && !allPresentationIds.has(debut.presentationId)) {
        errors.push(`${phase.id}: apresentação de patógeno inexistente ${debut.presentationId}.`);
      }
    }

    for (const condition of phase.finalTest.requires) {
      if (!VALID_FINAL_TYPES.has(condition.type)) errors.push(`${phase.id}: tipo de condição inválido.`);
      if (!VALID_OPERATORS.has(condition.operator)) errors.push(`${phase.id}: operador inválido.`);
      if (knownFinalTestKeys[condition.type] && !knownFinalTestKeys[condition.type].includes(condition.key)) {
        errors.push(`${phase.id}: chave de prova desconhecida ${condition.type}.${condition.key}.`);
      }
    }

    for (const segment of phase.segments) {
      for (const mechanic of segment.mechanicsRequired || []) {
        if (!knownUnlocks.includes(mechanic)) continue;
        for (let chunk = segment.from; chunk <= segment.to; chunk++) {
          if (!availableUnlocksIn(manifest, phase.phase, chunk, knownUnlocks)[mechanic]) {
            errors.push(`${phase.id}/${segment.id}: ${mechanic} exigido antes do unlock no chunk ${chunk}.`);
            break;
          }
        }
      }
    }
  });

  return errors;
}
