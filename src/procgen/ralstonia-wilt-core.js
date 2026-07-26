// Núcleo puro da murcha vascular (Ralstonia)
// ==========================================
//
// Tudo aqui é função pura: sem DOM, sem canvas, sem estado global. O runtime
// (ralstonia-vascular-wilt.js) usa estas funções e cuida do resto. A separação
// existe para o comportamento da doença ser testável sem montar um nível.
//
// A lição da fase está codificada nos limiares: abaixo de `vascularEntryThreshold`
// o foco ainda está do lado de fora e PODE ser neutralizado; a partir dele a
// bactéria está no xilema e não existe cura — só contenção. Nenhuma função aqui
// devolve um foco vascular ao estado "neutralizado".

// O bundler do projeto e simples: traduz `import { A, B }` para uma
// desestruturacao. Nada de `import { X as Y }` (viraria `const { X as Y }`, que
// nao e sintaxe valida) nem de `export { X }`. Por isso o import e direto e os
// limiares continuam morando no manifesto — quem precisa deles importa de la.
import { RALSTONIA_DEFAULTS } from './campaign-manifest.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const finite = (value, fallback = 0) => (Number.isFinite(value) ? value : fallback);

export const RALSTONIA_STATES = Object.freeze([
  'surface', 'entering', 'vascular', 'obstructed', 'critical', 'contained', 'neutralized',
]);

export const RALSTONIA_STATE_LABELS = Object.freeze({
  surface: 'contaminação superficial',
  entering: 'entrando no tecido',
  vascular: 'colonização vascular',
  obstructed: 'obstrução do xilema',
  critical: 'murcha vascular crítica',
  contained: 'infecção contida',
  neutralized: 'foco neutralizado',
});

// Estado derivado das cargas. `contained` e `neutralized` NÃO são deriváveis
// sozinhos — eles exigem tempo de controle sustentado, então entram como flags
// persistentes decididas pelo runtime e apenas respeitadas aqui.
export function ralstoniaStageForLoads({
  surfaceLoad = 0,
  vascularLoad = 0,
  contained = false,
  neutralized = false,
  config = RALSTONIA_DEFAULTS,
} = {}) {
  if (neutralized) return 'neutralized';
  const vascular = clamp(finite(vascularLoad), 0, 1);
  // Crítico vence a contenção: uma murcha crítica precisa ser lida como crítica
  // mesmo que o jogador tenha contido antes e deixado escapar.
  if (vascular >= config.criticalThreshold) return 'critical';
  if (contained) return 'contained';
  if (vascular >= config.obstructionThreshold) return 'obstructed';
  if (vascular >= config.vascularColonizationThreshold) return 'vascular';
  if (vascular >= config.vascularEntryThreshold) return 'entering';
  return 'surface';
}

// Um foco que já entrou no xilema nunca conta como prevenção.
export function ralstoniaEnteredVascular(focus, config = RALSTONIA_DEFAULTS) {
  return clamp(finite(focus?.vascularLoad), 0, 1) >= config.vascularEntryThreshold
    || Boolean(focus?.everEnteredVascular);
}

// Pressão de ENTRADA: o quanto aquela raiz está aberta para a bactéria. Raiz
// íntegra resiste; ferimento é porta. Some as fontes de lesão do jogo — inclusive
// as de outros patógenos, que é o que torna a fase 10 integrada mais dura.
export function ralstoniaWoundPressure(root) {
  if (!root) return 0;
  const authored = clamp(finite(root.ralstoniaEntryWound), 0, 1);
  const basal = clamp(finite(root.rootGameplayDamage) || (1 - clamp(finite(root.rootHealth, 1), 0, 1)), 0, 1);
  const nematode = clamp(finite(root.meloidogyneBurden), 0, 1);
  const rhizoctonia = clamp(
    Math.max(finite(root.rhizoctoniaColonization), finite(root.rhizoctoniaPressure)),
    0, 1,
  );
  // O marcador autoral manda: ele existe justamente para a estreia não depender
  // de já haver Meloidogyne ou Rhizoctonia em cena.
  return clamp(
    Math.max(authored, basal * .55 + nematode * .45 + rhizoctonia * .45),
    0, 1,
  );
}

// Força de controle combinada. A sinergia é um BÔNUS complementar (soma), nunca
// multiplicação exponencial, e pesa mais antes da entrada — depois que a bactéria
// está no vaso, nenhuma dupla de organismos faz milagre.
export function ralstoniaControlStrength({ bacillus = 0, pseudomonas = 0, stage = 'surface' } = {}) {
  const b = clamp(finite(bacillus), 0, 1);
  const p = clamp(finite(pseudomonas), 0, 1);
  const beforeEntry = stage === 'surface' || stage === 'entering';
  if (beforeEntry) {
    // Bacillus domina a prevenção: a barreira física fica sobre o ferimento.
    return clamp(b * .75 + p * .45 + Math.min(b, p) * .15, 0, 1.25);
  }
  // Depois da entrada a Pseudomonas pesa mais (supressão) e a sinergia encolhe.
  return clamp(b * .38 + p * .62 + Math.min(b, p) * .06, 0, 1.1);
}

// Crescimento LÍQUIDO por segundo, separado em superfície e xilema.
//
// Nenhum controle empurra a carga vascular para baixo de
// `minimumVascularFloorAfterEntry`: conter é segurar, não curar. A superfície,
// essa sim, pode ser zerada — é toda a diferença entre prevenir e remediar.
export function ralstoniaNetGrowth({
  surfaceLoad = 0,
  vascularLoad = 0,
  woundPressure = 0,
  bacillusControl = 0,
  pseudomonasControl = 0,
  config = RALSTONIA_DEFAULTS,
} = {}) {
  const surface = clamp(finite(surfaceLoad), 0, 1);
  const vascular = clamp(finite(vascularLoad), 0, 1);
  const wound = clamp(finite(woundPressure), 0, 1);
  const stage = ralstoniaStageForLoads({ surfaceLoad: surface, vascularLoad: vascular, config });
  const control = ralstoniaControlStrength({
    bacillus: bacillusControl, pseudomonas: pseudomonasControl, stage,
  });

  // Superfície: cresce com a ferida disponível, cai com o controle.
  const surfaceGrowth = .055 * (.35 + wound * .85);
  const surfaceDecay = control * .085;
  const surfaceRate = surfaceGrowth - surfaceDecay;

  // Entrada no xilema: só acontece com população superficial E ferida aberta.
  // É aqui que a barreira do Bacillus decide a fase.
  const entryPressure = surface * wound;
  const entryRate = vascular < config.vascularEntryThreshold
    ? Math.max(0, entryPressure * .085 - control * .075)
    : 0;

  // Dentro do vaso a multiplicação é própria: não depende mais da ferida.
  const vascularGrowth = vascular >= config.vascularEntryThreshold
    ? vascular * .055 + .012
    : 0;
  const vascularSuppression = vascular >= config.vascularEntryThreshold
    ? control * .062
    : 0;
  const vascularRate = entryRate + vascularGrowth - vascularSuppression;

  return {
    stage,
    control,
    surfaceRate,
    vascularRate,
    // O jogador "está segurando" quando o avanço no xilema parou de subir.
    holdingVascular: vascular >= config.vascularEntryThreshold && vascularRate <= 0,
    // E "está prevenindo" quando a superfície está encolhendo antes da entrada.
    holdingSurface: vascular < config.vascularEntryThreshold && surfaceRate < 0,
  };
}

// Transporte remanescente do xilema. É o número que liga a doença a tudo o mais:
// FBN, recuperação, transporte micorrízico e — indiretamente, via saúde da raiz —
// o teto de recarga da Propulsão da Rizósfera.
export function ralstoniaVascularEfficiency({ surfaceLoad = 0, vascularLoad = 0 } = {}) {
  return clamp(
    1 - clamp(finite(vascularLoad), 0, 1) * 0.86 - clamp(finite(surfaceLoad), 0, 1) * 0.08,
    0.08,
    1,
  );
}

// Raiz que pode receber um foco. A raiz FINAL nunca entra: contaminar a chegada
// transformaria a fase num beco sem saída.
export function isRalstoniaRootEligible(root) {
  return Boolean(
    root
    && root.type === 'root'
    && !root.final
    && !root.recovery
    && !root.safetyStep
    && !root.mycorrhizaStructure
    && !root.azospirillumStructure
    && !root.azospirillumLadderStep
    && !root.temporary
    && Number.isInteger(root.logicIndex)
    && root.w >= 120,
  );
}

// Alvo da disseminação. Determinístico: recebe o `random` de fora, nunca chama
// Math.random. Só raiz FERIDA é contaminável — raiz íntegra resiste mesmo perto.
export function selectRalstoniaSpreadTarget({
  source,
  roots = [],
  config = RALSTONIA_DEFAULTS,
  random = () => 0.5,
  occupied = new Set(),
} = {}) {
  if (!source?.root) return null;
  const origin = source.root.x + source.root.w / 2;
  const candidates = roots.filter(root => {
    if (!isRalstoniaRootEligible(root)) return false;
    if (root === source.root || occupied.has(root)) return false;
    const distance = Math.abs((root.x + root.w / 2) - origin);
    if (distance < config.minimumSpreadDistance || distance > config.maximumSpreadDistance) return false;
    // Sem ferimento não há entrada: a bactéria chega e não coloniza.
    return ralstoniaWoundPressure(root) > 0.12;
  });
  if (!candidates.length) return null;

  // Prefere adiante na rota (o jogador ainda vai passar por lá e pode defender).
  const ordered = candidates.sort((a, b) => {
    const aheadA = a.x > source.root.x ? 0 : 1;
    const aheadB = b.x > source.root.x ? 0 : 1;
    if (aheadA !== aheadB) return aheadA - aheadB;
    return ralstoniaWoundPressure(b) - ralstoniaWoundPressure(a);
  });
  // Sorteio determinístico entre os dois melhores, para não ser sempre o mesmo.
  const pool = ordered.slice(0, Math.min(2, ordered.length));
  return pool[Math.min(pool.length - 1, Math.floor(clamp(random(), 0, .999) * pool.length))];
}

// Proteção da raiz-alvo no momento da chegada. Acima de 0.5 o evento é bloqueado.
export function ralstoniaTargetProtection({ bacillus = 0, pseudomonas = 0 } = {}) {
  return clamp(finite(bacillus) * .7 + finite(pseudomonas) * .5, 0, 1);
}
