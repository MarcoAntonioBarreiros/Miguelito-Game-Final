import { getTutorialCard, tutorialCardIds, tutorialCards } from './tutorial-registry.js';

const SEEN_KEY = 'miguelito:tutorial:seen:v1';
const UNLOCKED_KEY = 'miguelito:tutorial:unlocked:v1';

function readStoredSet(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]');
    return new Set(Array.isArray(value) ? value : []);
  } catch (_) {
    return new Set();
  }
}

function writeStoredSet(key, set) {
  try {
    localStorage.setItem(key, JSON.stringify([...set]));
  } catch (_) {
    // O jogo continua funcionando mesmo quando o navegador bloqueia armazenamento local.
  }
}

function setText(element, value) {
  if (element) element.textContent = value || '';
}

export function createTutorialManager({ state }) {
  const mount = document.getElementById('tutorial-root');
  if (!mount) throw new Error('Elemento #tutorial-root não encontrado.');

  mount.innerHTML = `
    <div class="tutorial-overlay" hidden aria-hidden="true">
      <div class="tutorial-backdrop"></div>
      <section class="tutorial-panel" role="dialog" aria-modal="true" aria-labelledby="tutorial-title">
        <div class="tutorial-scanlines" aria-hidden="true"></div>
        <button class="tutorial-close" type="button" aria-label="Fechar cartão">×</button>

        <div class="tutorial-card-view">
          <header class="tutorial-header">
            <div class="tutorial-heading-meta">
              <span class="tutorial-category"></span>
              <span class="tutorial-new-badge">NOVA DESCOBERTA</span>
            </div>
            <h1 id="tutorial-title" class="tutorial-title"></h1>
            <p class="tutorial-subtitle"></p>
          </header>

          <div class="tutorial-content">
            <aside class="tutorial-visual" aria-hidden="true">
              <div class="tutorial-hologram-ring ring-one"></div>
              <div class="tutorial-hologram-ring ring-two"></div>
              <div class="tutorial-glyph"></div>
              <div class="tutorial-cycle-block">
                <span class="tutorial-cycle-label"></span>
                <div class="tutorial-cycle"></div>
              </div>
            </aside>

            <main class="tutorial-page" tabindex="0">
              <div class="tutorial-page-counter"></div>
              <h2 class="tutorial-page-title"></h2>
              <p class="tutorial-page-body"></p>
              <ul class="tutorial-page-points"></ul>
            </main>
          </div>

          <footer class="tutorial-footer">
            <button class="tutorial-button tutorial-prev" type="button">← Voltar</button>
            <div class="tutorial-page-dots" aria-label="Páginas do cartão"></div>
            <button class="tutorial-button tutorial-next" type="button">Próximo →</button>
          </footer>
        </div>

        <div class="tutorial-library-view" hidden>
          <header class="tutorial-library-header">
            <div>
              <span class="tutorial-category">Biblioteca didática</span>
              <h1 class="tutorial-library-title">Descobertas da rizosfera</h1>
              <p class="tutorial-library-description">Reabra os cartões já encontrados durante a campanha.</p>
            </div>
            <div class="tutorial-library-count"></div>
          </header>
          <div class="tutorial-library-grid"></div>
          <p class="tutorial-library-empty" hidden>Nenhum cartão foi descoberto ainda.</p>
          <footer class="tutorial-library-footer">
            <button class="tutorial-button tutorial-reset-seen" type="button">Reexibir tutoriais automaticamente</button>
            <button class="tutorial-button tutorial-library-close" type="button">Voltar ao jogo</button>
          </footer>
          <p class="tutorial-library-status" aria-live="polite"></p>
        </div>
      </section>
    </div>
  `;

  const overlay = mount.querySelector('.tutorial-overlay');
  const panel = mount.querySelector('.tutorial-panel');
  const cardView = mount.querySelector('.tutorial-card-view');
  const libraryView = mount.querySelector('.tutorial-library-view');
  const closeButton = mount.querySelector('.tutorial-close');
  const category = mount.querySelector('.tutorial-card-view .tutorial-category');
  const newBadge = mount.querySelector('.tutorial-new-badge');
  const title = mount.querySelector('.tutorial-title');
  const subtitle = mount.querySelector('.tutorial-subtitle');
  const glyph = mount.querySelector('.tutorial-glyph');
  const cycleLabel = mount.querySelector('.tutorial-cycle-label');
  const cycle = mount.querySelector('.tutorial-cycle');
  const pageCounter = mount.querySelector('.tutorial-page-counter');
  const pageTitle = mount.querySelector('.tutorial-page-title');
  const pageBody = mount.querySelector('.tutorial-page-body');
  const pagePoints = mount.querySelector('.tutorial-page-points');
  const pageDots = mount.querySelector('.tutorial-page-dots');
  const previousButton = mount.querySelector('.tutorial-prev');
  const nextButton = mount.querySelector('.tutorial-next');
  const libraryGrid = mount.querySelector('.tutorial-library-grid');
  const libraryEmpty = mount.querySelector('.tutorial-library-empty');
  const libraryCount = mount.querySelector('.tutorial-library-count');
  const libraryClose = mount.querySelector('.tutorial-library-close');
  const resetSeenButton = mount.querySelector('.tutorial-reset-seen');
  const libraryStatus = mount.querySelector('.tutorial-library-status');
  const desktopLibraryButton = document.getElementById('tutorial-library-button');
  const mobileLibraryButton = document.querySelector('[data-mobile-action="tutorial"]');

  let seen = readStoredSet(SEEN_KEY);
  let unlocked = readStoredSet(UNLOCKED_KEY);
  let queue = [];
  let activeId = null;
  let pageIndex = 0;
  let mode = 'closed';
  let previousGameState = 'play';
  let returnToLibrary = false;
  let activeFirstSeen = false;

  function persist() {
    writeStoredSet(SEEN_KEY, seen);
    writeStoredSet(UNLOCKED_KEY, unlocked);
  }

  function unlock(id) {
    if (!getTutorialCard(id) || unlocked.has(id)) return;
    unlocked.add(id);
    persist();
  }

  function pauseGame() {
    if (mode === 'closed') {
      previousGameState = state.gameState === 'tutorial' ? 'play' : state.gameState;
    }
    state.gameState = 'tutorial';
    document.documentElement.classList.add('tutorial-open');
    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');
    window.dispatchEvent(new CustomEvent('miguelito:tutorial-open'));
  }

  function resumeGame() {
    overlay.hidden = true;
    overlay.setAttribute('aria-hidden', 'true');
    document.documentElement.classList.remove('tutorial-open');
    state.gameState = previousGameState === 'tutorial' ? 'play' : previousGameState;
    mode = 'closed';
    activeId = null;
    returnToLibrary = false;
    window.dispatchEvent(new CustomEvent('miguelito:tutorial-close'));
  }

  function renderCycle(card) {
    cycle.replaceChildren();
    setText(cycleLabel, card.cycleLabel || 'Ciclo ou etapas');
    for (const [index, step] of (card.cycle || []).entries()) {
      const chip = document.createElement('span');
      chip.className = 'tutorial-cycle-step';
      chip.textContent = step;
      cycle.appendChild(chip);
      if (index < card.cycle.length - 1) {
        const arrow = document.createElement('span');
        arrow.className = 'tutorial-cycle-arrow';
        arrow.textContent = '›';
        cycle.appendChild(arrow);
      }
    }
  }

  function renderDots(card) {
    pageDots.replaceChildren();
    card.pages.forEach((_, index) => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = `tutorial-page-dot${index === pageIndex ? ' active' : ''}`;
      dot.setAttribute('aria-label', `Ir para página ${index + 1}`);
      dot.addEventListener('click', () => {
        pageIndex = index;
        renderCard();
      });
      pageDots.appendChild(dot);
    });
  }

  function renderCard() {
    const card = getTutorialCard(activeId);
    if (!card) return;
    const currentPage = card.pages[pageIndex] || card.pages[0];

    panel.style.setProperty('--tutorial-accent', card.accent || '#70e5d6');
    setText(category, card.category);
    setText(title, card.title);
    setText(subtitle, card.subtitle);
    setText(glyph, card.glyph);
    setText(pageCounter, `${pageIndex + 1} / ${card.pages.length}`);
    setText(pageTitle, currentPage.title);
    setText(pageBody, currentPage.body);
    newBadge.hidden = !activeFirstSeen;

    pagePoints.replaceChildren();
    for (const point of currentPage.points || []) {
      const item = document.createElement('li');
      item.textContent = point;
      pagePoints.appendChild(item);
    }
    pagePoints.hidden = !(currentPage.points || []).length;

    renderCycle(card);
    renderDots(card);
    previousButton.disabled = pageIndex === 0;
    nextButton.textContent = pageIndex >= card.pages.length - 1
      ? returnToLibrary ? 'Voltar à biblioteca' : 'Continuar'
      : 'Próximo →';
  }

  function openCard(id, { fromLibrary = false, firstSeen = !seen.has(id) } = {}) {
    const card = getTutorialCard(id);
    if (!card) return false;
    unlock(id);
    pauseGame();
    mode = 'card';
    activeId = id;
    pageIndex = 0;
    returnToLibrary = fromLibrary;
    activeFirstSeen = firstSeen;
    cardView.hidden = false;
    libraryView.hidden = true;
    closeButton.hidden = false;
    renderCard();
    requestAnimationFrame(() => nextButton.focus());
    return true;
  }

  function openNextQueuedCard() {
    const id = queue.shift();
    if (!id) {
      resumeGame();
      return;
    }
    openCard(id, { firstSeen: !seen.has(id) });
  }

  function finishActiveCard() {
    if (activeId) {
      seen.add(activeId);
      unlocked.add(activeId);
      persist();
    }
    if (returnToLibrary) {
      openLibrary();
      return;
    }
    if (queue.length) openNextQueuedCard();
    else resumeGame();
  }

  function nextPage() {
    const card = getTutorialCard(activeId);
    if (!card) return;
    if (pageIndex < card.pages.length - 1) {
      pageIndex += 1;
      renderCard();
      return;
    }
    finishActiveCard();
  }

  function previousPage() {
    if (pageIndex <= 0) return;
    pageIndex -= 1;
    renderCard();
  }

  function createLibraryCard(id) {
    const card = tutorialCards[id];
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tutorial-library-card';
    button.style.setProperty('--card-accent', card.accent || '#70e5d6');

    const icon = document.createElement('span');
    icon.className = 'tutorial-library-card-glyph';
    icon.textContent = card.glyph;

    const copy = document.createElement('span');
    copy.className = 'tutorial-library-card-copy';
    const name = document.createElement('strong');
    name.textContent = card.title;
    const type = document.createElement('small');
    type.textContent = card.category;
    copy.append(name, type);

    const unread = document.createElement('span');
    unread.className = 'tutorial-library-card-state';
    unread.textContent = seen.has(id) ? '✓' : 'NOVO';

    button.append(icon, copy, unread);
    button.addEventListener('click', () => openCard(id, { fromLibrary: true, firstSeen: !seen.has(id) }));
    return button;
  }

  function renderLibrary() {
    libraryGrid.replaceChildren();
    const ids = tutorialCardIds.filter(id => unlocked.has(id));
    ids.forEach(id => libraryGrid.appendChild(createLibraryCard(id)));
    libraryEmpty.hidden = ids.length > 0;
    setText(libraryCount, `${ids.length} / ${tutorialCardIds.length} descobertos`);
  }

  function openLibrary() {
    pauseGame();
    mode = 'library';
    activeId = null;
    returnToLibrary = false;
    cardView.hidden = true;
    libraryView.hidden = false;
    closeButton.hidden = true;
    setText(libraryStatus, '');
    renderLibrary();
    requestAnimationFrame(() => libraryClose.focus());
  }

  function closeLibrary() {
    if (queue.length) openNextQueuedCard();
    else resumeGame();
  }

  function trigger(id, { force = false } = {}) {
    if (!getTutorialCard(id)) return false;
    unlock(id);
    if (!force && seen.has(id)) return false;
    if (activeId === id || queue.includes(id)) return false;
    queue.push(id);
    if (mode === 'closed') openNextQueuedCard();
    return true;
  }

  function resetAutomaticTutorials() {
    seen = new Set();
    writeStoredSet(SEEN_KEY, seen);
    setText(libraryStatus, 'Os cartões descobertos voltarão a pausar o jogo quando seus gatilhos aparecerem novamente.');
    renderLibrary();
  }

  previousButton.addEventListener('click', previousPage);
  nextButton.addEventListener('click', nextPage);
  closeButton.addEventListener('click', finishActiveCard);
  libraryClose.addEventListener('click', closeLibrary);
  resetSeenButton.addEventListener('click', resetAutomaticTutorials);
  desktopLibraryButton?.addEventListener('click', openLibrary);
  mobileLibraryButton?.addEventListener('click', event => {
    event.preventDefault();
    openLibrary();
  });
  window.addEventListener('miguelito:tutorial-library', openLibrary);

  window.addEventListener('keydown', event => {
    if (mode === 'closed') {
      if (event.code === 'KeyH' || event.code === 'F1') {
        event.preventDefault();
        event.stopImmediatePropagation();
        openLibrary();
      }
      return;
    }

    if (event.code === 'Tab') return;
    event.preventDefault();
    event.stopImmediatePropagation();

    if (event.code === 'Escape') {
      if (mode === 'library') closeLibrary();
      else finishActiveCard();
    } else if (mode === 'card' && (event.code === 'ArrowRight' || event.code === 'Enter' || event.code === 'Space')) {
      nextPage();
    } else if (mode === 'card' && event.code === 'ArrowLeft') {
      previousPage();
    }
  }, true);

  return {
    get isOpen() { return mode !== 'closed'; },
    get currentCardId() { return activeId; },
    get discoveredCount() { return unlocked.size; },
    hasSeen: id => seen.has(id),
    isUnlocked: id => unlocked.has(id),
    trigger,
    openCard: id => openCard(id, { fromLibrary: false, firstSeen: !seen.has(id) }),
    openLibrary,
    resetAutomaticTutorials,
  };
}
