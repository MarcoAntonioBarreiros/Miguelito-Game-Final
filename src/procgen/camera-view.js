import { H, W } from '../core/constants.js';
import { clamp, lerp } from '../core/math.js';

const DEFAULT_ZOOM = 1.45;
const MIN_ZOOM = 1;
const MAX_ZOOM = 1.8;
const ZOOM_STEP = .1;

const coarsePointer = window.matchMedia('(pointer: coarse)').matches
  || navigator.maxTouchPoints > 0;

function roundedZoom(value) {
  return Math.round(value * 20) / 20;
}

export function createCameraView({ canvas, state }) {
  let zoom = DEFAULT_ZOOM;
  let targetZoom = DEFAULT_ZOOM;
  const readout = document.querySelector('[data-camera-readout]');

  state.cameraZoom = zoom;
  state.cameraY = 0;
  state.cameraIsTouch = coarsePointer;

  function refreshReadout() {
    if (readout) readout.textContent = `${targetZoom.toFixed(2)}×`;
  }

  function setZoom(value) {
    targetZoom = roundedZoom(clamp(value, MIN_ZOOM, MAX_ZOOM));
    refreshReadout();
  }

  function zoomIn() {
    setZoom(targetZoom + ZOOM_STEP);
  }

  function zoomOut() {
    setZoom(targetZoom - ZOOM_STEP);
  }

  function resetZoom() {
    setZoom(DEFAULT_ZOOM);
  }

  function resetTracking() {
    state.cameraX = 0;
    state.cameraY = 0;
  }

  function update(dt) {
    const zoomBlend = 1 - Math.pow(.0007, dt);
    zoom = lerp(zoom, targetZoom, zoomBlend);
    if (Math.abs(zoom - targetZoom) < .001) zoom = targetZoom;
    state.cameraZoom = zoom;

    const player = state.player;
    if (!player) return;

    const visibleW = W / zoom;
    const visibleH = H / zoom;
    const playerCenterX = player.x + player.w / 2;
    const playerCenterY = player.y + player.h / 2;
    const direction = player.facing || 1;
    const speedLookAhead = clamp(Math.abs(player.vx || 0) * .34, 0, 120);
    const lookAhead = direction * (58 + speedLookAhead);
    const levelEndX = state.level.endX !== undefined ? state.level.endX : 4900;
    const maxCameraX = Math.max(0, levelEndX - visibleW);
    const targetCameraX = clamp(
      playerCenterX + lookAhead - visibleW * .5,
      0,
      maxCameraX,
    );

    const horizontalBlend = 1 - Math.pow(.004, dt);
    state.cameraX = lerp(state.cameraX || 0, targetCameraX, horizontalBlend);

    const verticalAnchor = coarsePointer ? .56 : .61;
    const maxCameraY = Math.max(0, H - visibleH);
    const targetCameraY = clamp(
      playerCenterY - visibleH * verticalAnchor,
      0,
      maxCameraY,
    );
    const verticalBlend = 1 - Math.pow(.012, dt);
    state.cameraY = lerp(state.cameraY || 0, targetCameraY, verticalBlend);
  }

  function apply(ctx) {
    ctx.scale(zoom, zoom);
    ctx.translate(0, -(state.cameraY || 0));
  }

  function handleKey(event) {
    if (event.repeat) return;
    if (event.code === 'Equal' || event.code === 'NumpadAdd') {
      event.preventDefault();
      zoomIn();
    } else if (event.code === 'Minus' || event.code === 'NumpadSubtract') {
      event.preventDefault();
      zoomOut();
    } else if (event.code === 'Digit0' || event.code === 'Numpad0') {
      event.preventDefault();
      resetZoom();
    }
  }

  window.addEventListener('keydown', handleKey);
  canvas.addEventListener('wheel', event => {
    event.preventDefault();
    if (event.deltaY < 0) zoomIn();
    else if (event.deltaY > 0) zoomOut();
  }, { passive: false });

  for (const button of document.querySelectorAll('[data-camera-action]')) {
    button.addEventListener('click', event => {
      event.preventDefault();
      const action = button.dataset.cameraAction;
      if (action === 'in') zoomIn();
      else if (action === 'out') zoomOut();
      else resetZoom();
    });
  }

  refreshReadout();
  window.miguelitoCamera = {
    zoomIn,
    zoomOut,
    resetZoom,
    setZoom,
    get zoom() { return zoom; },
    get targetZoom() { return targetZoom; },
  };

  return {
    update,
    apply,
    resetTracking,
    zoomIn,
    zoomOut,
    resetZoom,
    get zoom() { return zoom; },
    get targetZoom() { return targetZoom; },
  };
}
