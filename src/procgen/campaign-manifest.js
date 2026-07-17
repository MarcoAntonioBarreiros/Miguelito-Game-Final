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
  'doubleJump', 'dash', 'pulse', 'mycorrhizaStructures', 'azospirillumRoots',
]);
export const TUTORIAL_MODES = Object.freeze(['guided', 'silent', 'disabled']);
export const PRESENTATION_POLICIES = Object.freeze([
  'mandatory-first-appearance', 'event-immediate', 'guided-sequence', 'spaced-auto', 'silent-only',
]);
export const SEGMENT_KINDS = Object.freeze(['fixed', 'procedural', 'final']);
export const DERIVED_TRIGGER_BEHAVIORS = Object.freeze(['guide-only', 'open-in-guided']);
export const MVP_EXCLUDED_PATHOGENS = Object.freeze(['ralstonia']);

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
  playerUnlock: Object.freeze(['doubleJump', 'dash', 'pulse']),
  worldState: Object.freeze([
    'reachedFinalRoot', 'functionalBiofilmCount', 'activeMatureNoduleCount', 'totalFixationRate',
    'visibleLateralRootCount', 'functionalMycorrhizaPathCount', 'pseudomonasIronReserve',
    'neutralizedOpportunisticFungusCount', 'recoveredRootCount', 'brokenCrystalCount',
    'neutralizedEggMassCount', 'preservedRootCount', 'ecologicalScore',
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
    id: 'phase-1', phase: 1, totalChunks: 40,
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
        mechanicsRequired: ['exudate', 'inoculation'] },
      { id: 'p1-challenge', kind: 'procedural', from: 9, to: 34, tutorialMode: 'silent',
        mechanicsRequired: ['exudate', 'inoculation'] },
      { id: 'p1-final', kind: 'final', from: 35, to: 39, tutorialMode: 'silent',
        mechanicsRequired: ['exudate', 'inoculation'] },
    ],
    finalTest: { id: 'p1-test', goal: 'Criar um biofilme funcional na raiz de saída.', requires: [
      { type: 'worldState', key: 'functionalBiofilmCount', operator: '>=', value: 1 },
    ]}, notes: [],
  },

  {
    id: 'phase-2', phase: 2, totalChunks: 40,
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
    title: 'Micorriza e expansão do solo explorado', theme: 'expansão',
    mission: 'Estabeleça a micorriza, atravesse uma ponte hifal e domine o Dash.',
    newConcepts: ['micorriza→arbúsculo→absorção→ponte'], newCommand: 'dash',
    presentations: [
      { id: 'presentation-mycorrhiza', cardId: 'organism-mycorrhiza',
        triggerIds: ['organism-mycorrhiza', 'structure-arbuscule', 'structure-mycorrhiza-path'],
        autoOpenTrigger: 'organism-mycorrhiza', policy: 'mandatory-first-appearance', suppressIndividualCards: true,
        debutChunk: 4, moduleId: 'p4-myco-intro', debutZoneId: 'p4-mycorrhiza-debut',
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
      { feature: 'mycorrhizaStructures', eventChunk: 8, afterModule: 'p4-myco-intro', practiceWindowChunks: 3, mandatory: true },
      { feature: 'dash', eventChunk: 20, afterModule: 'p4-power-intro', practiceWindowChunks: 3, mandatory: true },
    ], pathogenDebuts: [],
    segments: [
      { id: 'p4-warmup', kind: 'procedural', from: 0, to: 3, tutorialMode: 'silent', mechanicsRequired: ['doubleJump', 'azospirillumRoots'] },
      { id: 'p4-myco-intro', kind: 'fixed', from: 4, to: 8, tutorialMode: 'guided', debutPresentationIds: ['presentation-mycorrhiza'], mechanicsRequired: ['inoculation'] },
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
    id: 'phase-5', phase: 5, totalChunks: 40,
    title: 'Ferro e biocontrole fúngico', theme: 'equilíbrio',
    mission: 'Construa reserva de ferro e use Trichoderma contra fungos oportunistas.',
    newConcepts: ['Pseudomonas→sideróforo→ferro', 'oportunista→Trichoderma→micoparasitismo'], newCommand: null,
    presentations: [
      { id: 'presentation-pseudomonas', cardId: 'organism-pseudomonas',
        triggerIds: ['organism-pseudomonas', 'process-siderophore'], autoOpenTrigger: 'organism-pseudomonas',
        policy: 'mandatory-first-appearance', suppressIndividualCards: true,
        roamingType: 'pseudomonas', debutChunk: 4, poolFromChunk: 9,
        moduleId: 'p5-pseudo-intro', debutZoneId: 'p5-pseudomonas-debut', tetherUntilSeen: true,
        derivedTriggerBehavior: 'guide-only',
        pageUnlocks: [
          { triggerId: 'organism-pseudomonas', pages: [0] },
          { triggerId: 'process-siderophore', pages: [1, 2, 3] },
        ],
        pages: ['quem é', 'sideróforo', 'Fe³⁺', 'reserva de ferro'] },
      { id: 'presentation-opportunistic-fungus', cardId: 'organism-opportunistic-fungus',
        triggerIds: ['organism-opportunistic-fungus'], autoOpenTrigger: 'organism-opportunistic-fungus',
        policy: 'mandatory-first-appearance', suppressIndividualCards: false,
        roamingType: 'oportunista', debutChunk: 18, poolFromChunk: 23,
        moduleId: 'p5-biocontrol-intro', debutZoneId: 'p5-opportunistic-fungus-debut', tetherUntilSeen: true,
        pages: ['Quem é?', 'Função biológica', 'Função no jogo', 'Como controlar'] },
      { id: 'presentation-trichoderma', cardId: 'organism-trichoderma',
        triggerIds: ['organism-trichoderma'], autoOpenTrigger: 'organism-trichoderma',
        policy: 'mandatory-first-appearance', suppressIndividualCards: false,
        roamingType: 'trichoderma', debutChunk: 20, poolFromChunk: 23,
        moduleId: 'p5-biocontrol-intro', debutZoneId: 'p5-trichoderma-debut', tetherUntilSeen: true,
        pages: ['Quem é?', 'Função biológica', 'Função no jogo', 'Atenção didática'] },
      { id: 'presentation-mycoparasitism', cardId: 'process-mycoparasitism',
        triggerIds: ['process-mycoparasitism'], autoOpenTrigger: 'process-mycoparasitism',
        policy: 'guided-sequence', suppressIndividualCards: false,
        prerequisitePresentationIds: ['presentation-opportunistic-fungus', 'presentation-trichoderma'],
        debutChunk: 22, moduleId: 'p5-biocontrol-intro',
        pages: ['O que é?', 'Mecanismos', 'Função no jogo', 'Sinergias'] },
    ],
    unlockEvents: [], pathogenDebuts: [],
    segments: [
      { id: 'p5-warmup', kind: 'procedural', from: 0, to: 3, tutorialMode: 'silent', mechanicsRequired: ['doubleJump', 'dash'] },
      { id: 'p5-pseudo-intro', kind: 'fixed', from: 4, to: 8, tutorialMode: 'guided', debutPresentationIds: ['presentation-pseudomonas'], mechanicsRequired: ['inoculation'] },
      { id: 'p5-pseudo-practice', kind: 'procedural', from: 9, to: 17, tutorialMode: 'silent', mechanicsRequired: ['inoculation'] },
      { id: 'p5-biocontrol-intro', kind: 'fixed', from: 18, to: 22, tutorialMode: 'guided',
        debutPresentationIds: ['presentation-opportunistic-fungus', 'presentation-trichoderma', 'presentation-mycoparasitism'],
        mechanicsRequired: ['inoculation'] },
      { id: 'p5-challenge', kind: 'procedural', from: 23, to: 35, tutorialMode: 'silent', mechanicsRequired: ['inoculation', 'doubleJump', 'dash'] },
      { id: 'p5-final', kind: 'final', from: 36, to: 39, tutorialMode: 'silent', mechanicsRequired: ['inoculation'] },
    ],
    finalTest: { id: 'p5-test', goal: 'Atingir reserva de ferro e neutralizar um foco oportunista.', requires: [
      { type: 'worldState', key: 'pseudomonasIronReserve', operator: '>=', value: 1 },
      { type: 'worldState', key: 'neutralizedOpportunisticFungusCount', operator: '>=', value: 1 },
    ]}, notes: [],
  },

  {
    id: 'phase-6', phase: 6, totalChunks: 40,
    title: 'Rhizoctonia, saúde da raiz e Pulso', theme: 'patologia',
    mission: 'Controle Rhizoctonia, recupere a sustentação da raiz e libere o Pulso.',
    newConcepts: ['Rhizoctonia→lesão→saúde/recuperação'], newCommand: 'pulse',
    presentations: [
      { id: 'presentation-root-health', cardId: 'organism-rhizoctonia',
        triggerIds: ['organism-rhizoctonia', 'process-root-health', 'process-root-recovery', 'process-root-collapse'],
        autoOpenTrigger: 'organism-rhizoctonia', policy: 'mandatory-first-appearance', suppressIndividualCards: true,
        debutChunk: 4, moduleId: 'p6-rhizo-intro', debutZoneId: 'p6-rhizoctonia-debut',
        derivedTriggerBehavior: 'guide-only',
        pageUnlocks: [
          { triggerId: 'organism-rhizoctonia', pages: [0] },
          { triggerId: 'process-root-health', pages: [1] },
          { triggerId: 'process-root-collapse', pages: [2] },
          { triggerId: 'process-root-recovery', pages: [3] },
        ],
        pages: ['Rhizoctonia', 'lesão progressiva', 'estados de saúde', 'recuperação/sustentação'] },
      { id: 'presentation-phosphate-solubilizer', cardId: 'organism-phosphate-solubilizer',
        triggerIds: ['organism-phosphate-solubilizer'], autoOpenTrigger: 'organism-phosphate-solubilizer',
        policy: 'mandatory-first-appearance', suppressIndividualCards: false,
        debutChunk: 18, moduleId: 'p6-pulse-intro', debutZoneId: 'p6-phosphate-solubilizer-debut',
        pages: ['Quem é?', 'Função biológica', 'Função no jogo', 'Atenção didática'] },
      { id: 'presentation-pulse', cardId: 'power-pulse',
        triggerIds: ['power-pulse'], autoOpenTrigger: 'power-pulse',
        policy: 'event-immediate', suppressIndividualCards: false,
        debutChunk: 20, moduleId: 'p6-pulse-intro',
        pages: ['Função no jogo', 'Relação com a biologia', 'Como usar'] },
    ],
    unlockEvents: [
      { feature: 'pulse', eventChunk: 20, afterModule: 'p6-pulse-intro', practiceWindowChunks: 3, mandatory: true },
    ],
    pathogenDebuts: [{ pathogen: 'rhizoctonia', fromChunk: 4, presentationId: 'presentation-root-health' }],
    segments: [
      { id: 'p6-warmup', kind: 'procedural', from: 0, to: 3, tutorialMode: 'silent', mechanicsRequired: ['doubleJump', 'dash', 'inoculation'] },
      { id: 'p6-rhizo-intro', kind: 'fixed', from: 4, to: 10, tutorialMode: 'guided', debutPresentationIds: ['presentation-root-health'], mechanicsRequired: ['inoculation'] },
      { id: 'p6-rhizo-practice', kind: 'procedural', from: 11, to: 17, tutorialMode: 'silent', mechanicsRequired: ['inoculation', 'doubleJump', 'dash'] },
      { id: 'p6-pulse-intro', kind: 'fixed', from: 18, to: 20, tutorialMode: 'guided',
        debutPresentationIds: ['presentation-phosphate-solubilizer', 'presentation-pulse'], mechanicsRequired: [] },
      { id: 'p6-challenge', kind: 'procedural', from: 21, to: 35, tutorialMode: 'silent', mechanicsRequired: ['pulse', 'doubleJump', 'dash', 'inoculation'] },
      { id: 'p6-final', kind: 'final', from: 36, to: 39, tutorialMode: 'silent', mechanicsRequired: ['pulse'] },
    ],
    finalTest: { id: 'p6-test', goal: 'Recuperar uma raiz e quebrar o cristal da saída.', requires: [
      { type: 'playerUnlock', key: 'pulse', operator: '===', value: true },
      { type: 'worldState', key: 'recoveredRootCount', operator: '>=', value: 1 },
      { type: 'worldState', key: 'brokenCrystalCount', operator: '>=', value: 1 },
    ]}, notes: [],
  },

  {
    id: 'phase-7', phase: 7, totalChunks: 40,
    title: 'Meloidogyne: infecção, reprodução e sequela', theme: 'infestação',
    mission: 'Impeça novas penetrações, neutralize massas de ovos e preserve uma raiz.',
    newConcepts: ['J2→penetração→galha', 'fêmea→massa de ovos→sequela'], newCommand: null,
    presentations: [
      { id: 'presentation-meloidogyne-infection', cardId: 'organism-meloidogyne-j2',
        triggerIds: ['organism-meloidogyne-j2', 'structure-gall'], autoOpenTrigger: 'organism-meloidogyne-j2',
        policy: 'mandatory-first-appearance', suppressIndividualCards: true,
        debutChunk: 4, moduleId: 'p7-infection-intro', debutZoneId: 'p7-meloidogyne-j2-debut',
        derivedTriggerBehavior: 'guide-only',
        pageUnlocks: [
          { triggerId: 'organism-meloidogyne-j2', pages: [0] },
          { triggerId: 'structure-gall', pages: [1, 2, 3] },
        ],
        pages: ['J2', 'busca da raiz', 'penetração/migração', 'galha'] },
      { id: 'presentation-meloidogyne-reproduction', cardId: 'organism-meloidogyne-female',
        triggerIds: ['organism-meloidogyne-female', 'structure-egg-mass'], autoOpenTrigger: 'organism-meloidogyne-female',
        policy: 'mandatory-first-appearance', suppressIndividualCards: true,
        debutChunk: 18, moduleId: 'p7-reproduction-intro', debutZoneId: 'p7-meloidogyne-female-debut',
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
      { id: 'p7-warmup', kind: 'procedural', from: 0, to: 3, tutorialMode: 'silent', mechanicsRequired: ['doubleJump', 'dash', 'pulse'] },
      { id: 'p7-infection-intro', kind: 'fixed', from: 4, to: 10, tutorialMode: 'guided', debutPresentationIds: ['presentation-meloidogyne-infection'], mechanicsRequired: [] },
      { id: 'p7-infection-practice', kind: 'procedural', from: 11, to: 17, tutorialMode: 'silent', mechanicsRequired: ['inoculation'] },
      { id: 'p7-reproduction-intro', kind: 'fixed', from: 18, to: 23, tutorialMode: 'guided', debutPresentationIds: ['presentation-meloidogyne-reproduction'], mechanicsRequired: [] },
      { id: 'p7-challenge', kind: 'procedural', from: 24, to: 35, tutorialMode: 'silent', mechanicsRequired: ['inoculation', 'doubleJump', 'dash', 'pulse'] },
      { id: 'p7-final', kind: 'final', from: 36, to: 39, tutorialMode: 'silent', mechanicsRequired: ['inoculation'] },
    ],
    finalTest: { id: 'p7-test', goal: 'Neutralizar uma massa de ovos e preservar uma raiz.', requires: [
      { type: 'worldState', key: 'neutralizedEggMassCount', operator: '>=', value: 1 },
      { type: 'worldState', key: 'preservedRootCount', operator: '>=', value: 1 },
    ]}, notes: [],
  },

  {
    id: 'phase-8', phase: 8, totalChunks: 40,
    title: 'Ecossistema integrado', theme: 'síntese',
    mission: 'Proteja, controle, recupere e atravesse usando tudo o que aprendeu.',
    newConcepts: [], newCommand: null,
    presentations: [], unlockEvents: [],
    pathogenDebuts: [
      { pathogen: 'rhizoctonia', fromChunk: 0, presentationId: null },
      { pathogen: 'meloidogyne', fromChunk: 0, presentationId: null },
    ],
    segments: [
      { id: 'p8-integrated', kind: 'procedural', from: 0, to: 35, tutorialMode: 'silent',
        mechanicsRequired: ['doubleJump', 'dash', 'pulse', 'inoculation'] },
      { id: 'p8-final', kind: 'final', from: 36, to: 39, tutorialMode: 'silent',
        mechanicsRequired: ['doubleJump', 'dash', 'pulse', 'inoculation'] },
    ],
    finalTest: { id: 'p8-test', goal: 'Concluir o desafio integrado com pontuação mínima.', requires: [
      { type: 'worldState', key: 'ecologicalScore', operator: '>=', value: 1 },
      { type: 'worldState', key: 'reachedFinalRoot', operator: '===', value: true },
    ]},
    notes: ['Ralstonia fica para expansão pós-piloto.', 'Nenhum cartão holográfico automático nesta fase.'],
  },
];

export const campaignManifest = Object.freeze(phases);

export function getPhaseManifest(phase) {
  return campaignManifest.find(entry => entry.phase === phase) || null;
}

export function getSegmentAt(phase, chunkIndex) {
  return getPhaseManifest(phase)?.segments.find(s => chunkIndex >= s.from && chunkIndex <= s.to) || null;
}

export function getTutorialModeAt(phase, chunkIndex) {
  return getSegmentAt(phase, chunkIndex)?.tutorialMode || 'disabled';
}

export function getPresentationById(id) {
  for (const phase of campaignManifest) {
    const found = phase.presentations.find(p => p.id === id);
    if (found) return found;
  }
  return null;
}

export function getPresentationForTrigger(triggerId) {
  for (const phase of campaignManifest) {
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

export function getProceduralPoolAt(phase, chunkIndex) {
  const types = new Set();
  for (const entry of campaignManifest) {
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
  const active = new Set();
  for (const entry of campaignManifest) {
    if (entry.phase > phase) break;
    for (const debut of entry.pathogenDebuts) {
      if (entry.phase < phase || chunkIndex >= debut.fromChunk) active.add(debut.pathogen);
    }
  }
  return [...active];
}

export function getPersistentUnlocksBeforePhase(phase) {
  const active = Object.fromEntries(CAMPAIGN_UNLOCKS.map(flag => [flag, false]));
  for (const entry of campaignManifest) {
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
  return campaignManifest
    .flatMap(entry => entry.presentations.map(p => ({ phase: entry.phase, ...p })))
    .sort((a, b) => a.phase - b.phase || a.debutChunk - b.debutChunk);
}

const VALID_FINAL_TYPES = new Set(['worldState', 'playerUnlock']);
const VALID_OPERATORS = new Set(['===', '!==', '>', '>=', '<', '<=']);
const VALID_COMMANDS = new Set(['doubleJump', 'dash', 'pulse']);

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
