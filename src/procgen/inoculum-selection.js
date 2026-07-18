const LABELS = Object.freeze({
  rhizobium: 'Rhizobium',
  azospirillum: 'Azospirillum',
  bacillus: 'Bacillus',
  pseudomonas: 'Pseudomonas',
  myco: 'Micorriza',
  trichoderma: 'Trichoderma',
});

// Carregando mais de um organismo, o E soltava todos de uma vez ou obedecia a
// uma ordem fixa de prioridade — nao havia como escolher. Aqui existe uma
// selecao unica: cada sistema so responde ao E quando e ele o selecionado, e o
// exsudato disputa a mesma vaga, para decidir entre inocular e capturar.
export function createInoculumSelection({ state, input, inoculants, trichodermaColonies }) {
  let index = 0;
  let cycleHeldLast = false;
  let lastToastAt = -Infinity;

  function options() {
    const list = [];
    for (const [type, agents] of inoculants.followerGroups()) {
      list.push({ kind: 'organism', type, count: agents.length, label: LABELS[type] || type });
    }
    const trichoderma = trichodermaColonies?.followerCount || 0;
    if (trichoderma > 0) {
      list.push({ kind: 'trichoderma', type: 'trichoderma', count: trichoderma, label: LABELS.trichoderma });
    }
    const exudates = state.player.exudates || 0;
    if (exudates > 0) {
      list.push({ kind: 'exudate', type: 'exudate', count: exudates, label: 'Exsudato' });
    }
    return list;
  }

  function current() {
    const list = options();
    if (!list.length) return null;
    if (index >= list.length) index = 0;
    return list[index];
  }

  function isSelected(kind, type) {
    const selected = current();
    if (!selected) return false;
    if (kind === 'organism') return selected.kind === 'organism' && selected.type === type;
    return selected.kind === kind;
  }

  function announce(selected) {
    if (state.time - lastToastAt < .5) return;
    state.toast = selected.kind === 'exudate'
      ? `Selecionado: exsudato (${selected.count}) — E lança para capturar ou reforçar colônia.`
      : `Selecionado: ${selected.label} (${selected.count}) — E inocula na raiz.`;
    state.toastTime = 2.4;
    lastToastAt = state.time;
  }

  function cycle() {
    const list = options();
    if (list.length < 2) return false;
    index = (index + 1) % list.length;
    announce(list[index]);
    return true;
  }

  function prepare() {
    if (state.gameState !== 'play') return;
    const pressed = Boolean(input.keys.ArrowDown);
    if (pressed && !cycleHeldLast) cycle();
    cycleHeldLast = pressed;
  }

  function reset() {
    index = 0;
    cycleHeldLast = false;
    lastToastAt = -Infinity;
  }

  return {
    prepare,
    reset,
    cycle,
    options,
    isSelected,
    get current() { return current(); },
    get summary() {
      const selected = current();
      if (!selected) return '';
      const total = options().length;
      const posicao = total > 1 ? ` ${index + 1}/${total}` : '';
      return `${selected.label} (${selected.count})${posicao}`;
    },
  };
}
