const coarsePointer = window.matchMedia('(pointer: coarse)').matches
  || navigator.maxTouchPoints > 0;

const root = document.documentElement;
const controls = document.getElementById('touch-controls');
const debug = document.getElementById('debug');
const debugButton = document.querySelector('[data-mobile-action="debug"]');
const resetButton = document.querySelector('[data-mobile-action="reset"]');
const fullscreenButton = document.querySelector('[data-mobile-action="fullscreen"]');

if (coarsePointer) root.classList.add('touch-device');

const pressed = new Map();

function emit(code, down) {
  window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', {
    code,
    key: code,
    bubbles: true,
    cancelable: true,
  }));
}

function releasePointer(pointerId) {
  const state = pressed.get(pointerId);
  if (!state) return;
  clearTimeout(state.timer);
  emit(state.code, false);
  state.button.classList.remove('pressed');
  pressed.delete(pointerId);
}

function pressButton(event) {
  const button = event.currentTarget;
  const code = button.dataset.key;
  if (!code) return;
  event.preventDefault();
  event.stopPropagation();

  try { button.setPointerCapture(event.pointerId); } catch (_) {}
  releasePointer(event.pointerId);
  emit(code, true);
  button.classList.add('pressed');

  const tapOnly = button.dataset.mode === 'tap';
  const state = { code, button, timer: null };
  if (tapOnly) {
    state.timer = setTimeout(() => releasePointer(event.pointerId), 115);
  }
  pressed.set(event.pointerId, state);
}

for (const button of document.querySelectorAll('.touch-key')) {
  button.addEventListener('pointerdown', pressButton, { passive: false });
  button.addEventListener('pointerup', event => releasePointer(event.pointerId));
  button.addEventListener('pointercancel', event => releasePointer(event.pointerId));
  button.addEventListener('lostpointercapture', event => releasePointer(event.pointerId));
  button.addEventListener('contextmenu', event => event.preventDefault());
}

function clearAllInputs() {
  for (const pointerId of [...pressed.keys()]) releasePointer(pointerId);
  for (const code of ['ArrowLeft', 'ArrowRight', 'Space', 'KeyE', 'ShiftLeft', 'KeyK']) {
    emit(code, false);
  }
}

window.addEventListener('blur', clearAllInputs);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) clearAllInputs();
});

resetButton?.addEventListener('click', event => {
  event.preventDefault();
  emit('KeyR', true);
  setTimeout(() => emit('KeyR', false), 80);
});

debugButton?.addEventListener('click', event => {
  event.preventDefault();
  const visible = debug?.classList.toggle('mobile-visible');
  debugButton.setAttribute('aria-pressed', String(Boolean(visible)));
});

fullscreenButton?.addEventListener('click', async event => {
  event.preventDefault();
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen?.();
    else await document.exitFullscreen?.();
  } catch (_) {
    // Alguns navegadores móveis não permitem fullscreen fora de apps instalados.
  }
});

document.addEventListener('fullscreenchange', () => {
  fullscreenButton?.classList.toggle('active', Boolean(document.fullscreenElement));
});

if (controls && coarsePointer) {
  controls.hidden = false;
  document.body.classList.add('touch-ready');
}
