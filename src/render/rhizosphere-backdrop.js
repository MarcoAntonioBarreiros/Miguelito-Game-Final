const DEFAULT_SOURCE = 'assets/backgrounds/miguelito-rhizosphere.png';
const HORIZONTAL_FACTOR = 0.018;

function hashSeed(value) {
  const text = String(value ?? 'rhizosphere');
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function isMirroredTile(index) {
  return Math.abs(index % 2) === 1;
}

export function calculateBackdropTiles({
  sourceWidth,
  sourceHeight,
  viewportWidth,
  viewportHeight,
  cameraX = 0,
  seedPosition = 0,
  factor = HORIZONTAL_FACTOR,
}) {
  const sw = Math.max(1, Number(sourceWidth) || 1);
  const sh = Math.max(1, Number(sourceHeight) || 1);
  const vw = Math.max(1, Number(viewportWidth) || 1);
  const vh = Math.max(1, Number(viewportHeight) || 1);
  const scale = Math.max(vw / sw, vh / sh);
  const drawWidth = sw * scale;
  const drawHeight = sh * scale;
  const normalizedStart = ((Number(seedPosition) || 0) % 1 + 1) % 1;
  const effectiveX = normalizedStart * drawWidth + (Number(cameraX) || 0) * factor;
  const firstTile = Math.floor(effectiveX / drawWidth);
  const lastTile = Math.ceil((effectiveX + vw) / drawWidth);
  const tiles = [];

  for (let index = firstTile; index <= lastTile; index++) {
    tiles.push({
      index,
      x: index * drawWidth - effectiveX,
      y: (vh - drawHeight) / 2,
      width: drawWidth,
      height: drawHeight,
      mirrored: isMirroredTile(index),
    });
  }

  return tiles;
}

export function createRhizosphereBackdrop({
  src = DEFAULT_SOURCE,
  seed = 'rhizosphere',
  createImage = null,
} = {}) {
  const seedPosition = hashSeed(seed) / 4294967296;
  const image = createImage?.() || null;
  if (image) {
    image.decoding = 'async';
    image.src = src;
  }

  function render(ctx, camera = {}, viewport = {}) {
    if (!ctx || !image?.complete || !(image.naturalWidth > 0) || !(image.naturalHeight > 0)) {
      return false;
    }

    const width = Math.max(1, Number(viewport.width) || 1280);
    const height = Math.max(1, Number(viewport.height) || 720);
    const tiles = calculateBackdropTiles({
      sourceWidth: image.naturalWidth,
      sourceHeight: image.naturalHeight,
      viewportWidth: width,
      viewportHeight: height,
      cameraX: camera.cameraX,
      seedPosition,
    });

    ctx.save();
    ctx.globalAlpha = 0.82;
    for (const tile of tiles) {
      if (tile.mirrored) {
        ctx.save();
        ctx.translate(tile.x + tile.width, tile.y);
        ctx.scale(-1, 1);
        ctx.drawImage(image, 0, 0, tile.width, tile.height);
        ctx.restore();
      } else {
        ctx.drawImage(image, tile.x, tile.y, tile.width, tile.height);
      }
    }
    ctx.globalAlpha = 1;
    const veil = ctx.createLinearGradient(0, 0, 0, height);
    veil.addColorStop(0, 'rgba(1,13,20,.20)');
    veil.addColorStop(0.58, 'rgba(3,18,25,.34)');
    veil.addColorStop(1, 'rgba(10,8,18,.56)');
    ctx.fillStyle = veil;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
    return true;
  }

  return {
    render,
    image,
    source: src,
    seedPosition,
  };
}
