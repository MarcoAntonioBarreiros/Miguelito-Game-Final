import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateVerticalCameraTarget } from '../src/procgen/camera-view.js';
import {
  calculateResponsiveCanvasSize,
  createResponsiveCanvas,
} from '../src/procgen/responsive-canvas.js';

test('viewport ultrawide amplia o campo horizontal sem deformar a proporcao', () => {
  const size = calculateResponsiveCanvasSize(844, 390);
  assert.deepEqual(
    { width: size.width, height: size.height },
    { width: 1558, height: 720 },
  );
  assert.ok(Math.abs(size.width / size.height - 844 / 390) < 0.001);
});

test('viewport 16:9 preserva a resolucao logica historica', () => {
  assert.deepEqual(
    calculateResponsiveCanvasSize(1280, 720),
    { width: 1280, height: 720, aspectRatio: 16 / 9 },
  );
});

test('sincronizacao acompanha mudanca de orientacao sem multiplicar listeners', () => {
  let rect = { width: 844, height: 390 };
  const listeners = new Map();
  const visualListeners = new Map();
  const canvas = {
    width: 1280,
    height: 720,
    getBoundingClientRect: () => rect,
  };
  const windowObject = {
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type) { listeners.delete(type); },
    requestAnimationFrame(callback) { callback(); },
    visualViewport: {
      addEventListener(type, listener) { visualListeners.set(type, listener); },
      removeEventListener(type) { visualListeners.delete(type); },
    },
  };

  const responsive = createResponsiveCanvas({ canvas, windowObject });
  assert.equal(canvas.width, 1558);
  assert.equal(canvas.height, 720);
  assert.equal(listeners.size, 2);
  assert.equal(visualListeners.size, 1);

  rect = { width: 1280, height: 720 };
  listeners.get('resize')();
  assert.equal(canvas.width, 1280);
  assert.equal(canvas.height, 720);
  assert.equal(responsive.diagnostics().viewportWidth, 1280);

  responsive.destroy();
  assert.equal(listeners.size, 0);
  assert.equal(visualListeners.size, 0);
});

test('camera vertical segue integralmente o jogador acima de y zero', () => {
  const target = calculateVerticalCameraTarget({
    playerCenterY: -80,
    visibleHeight: 720 / 1.45,
    verticalAnchor: 0.56,
  });
  assert.ok(target < -300);
  assert.equal(
    target,
    -80 - (720 / 1.45) * 0.56,
    'o alvo negativo nao pode ser truncado em zero',
  );
});

test('camera vertical preserva o limite inferior historico', () => {
  const visibleHeight = 720 / 1.45;
  const target = calculateVerticalCameraTarget({
    playerCenterY: 900,
    visibleHeight,
    verticalAnchor: 0.61,
  });
  assert.equal(target, 720 - visibleHeight);
});
