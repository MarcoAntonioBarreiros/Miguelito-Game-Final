import assert from 'node:assert/strict';
import test from 'node:test';

import { PLAYER_SKINS, resolvePlayerSkin } from '../src/render/player-skins.js';
import { createPlayerSprite } from '../src/render/player-sprite.js';

function storageStub(initial = null) {
  let value = initial;
  return {
    getItem: () => value,
    setItem: (_key, next) => { value = next; },
    read: () => value,
  };
}

test('sem parametro nenhum o personagem e o astronauta', () => {
  assert.equal(resolvePlayerSkin({}).id, 'astronaut');
  assert.equal(resolvePlayerSkin({ locationLike: { search: '' }, storage: storageStub() }).id, 'astronaut');
});

test('?player=miguelito troca a skin e a escolha fica guardada', () => {
  const storage = storageStub();
  assert.equal(resolvePlayerSkin({ locationLike: { search: '?player=miguelito' }, storage }).id, 'miguelito');
  assert.equal(storage.read(), 'miguelito');
  // Sem o parametro, a escolha guardada continua valendo.
  assert.equal(resolvePlayerSkin({ locationLike: { search: '' }, storage }).id, 'miguelito');
  // E da para voltar.
  assert.equal(resolvePlayerSkin({ locationLike: { search: '?player=astronaut' }, storage }).id, 'astronaut');
});

test('skin desconhecida ou guardada invalida cai no astronauta', () => {
  // O jogo nunca pode ficar sem personagem por causa de um valor velho no
  // localStorage ou de um parametro digitado errado.
  assert.equal(resolvePlayerSkin({ locationLike: { search: '?player=nao-existe' }, storage: storageStub() }).id, 'astronaut');
  assert.equal(resolvePlayerSkin({ storage: storageStub('skin-que-foi-removida') }).id, 'astronaut');
});

test('o astronauta nao declara folha nenhuma: ele e desenhado, nao carregado', () => {
  assert.equal(PLAYER_SKINS.astronaut.states, null);
  assert.equal(createPlayerSprite(PLAYER_SKINS.astronaut), null);
});

test('enquanto a folha nao carrega, o astronauta continua desenhando', () => {
  // Sem DOM nao existe Image: e o caso do teste, mas tambem e o caso real dos
  // primeiros quadros e o de uma folha que deu 404.
  const sprite = createPlayerSprite(PLAYER_SKINS.miguelito);
  assert.ok(sprite, 'a skin com folhas precisa criar o renderizador de sprite');
  assert.equal(sprite.isFallback(), true, 'sem folha pronta o astronauta assume');

  let desenhou = false;
  const ctx = new Proxy({ drawImage: () => { desenhou = true; } },
    { get: (target, key) => target[key] || (() => {}) });
  const player = { x: 0, y: 0, w: 32, h: 48, vx: 0, vy: 0, onGround: true, alive: true, invuln: 0, dashTime: 0 };
  assert.equal(sprite.draw(ctx, player, 0), false, 'draw precisa avisar que nao desenhou');
  assert.equal(desenhou, false);
});

test('a folha declarada aponta para um arquivo e um numero de quadros', () => {
  const run = PLAYER_SKINS.miguelito.states.run;
  assert.match(run.src, /\.png$/);
  assert.ok(Number.isInteger(run.frames) && run.frames > 0, 'frames precisa ser inteiro positivo');
  assert.ok(run.fps > 0);
});

test('a caixa de colisao nao muda com a skin: so a arte escala', () => {
  // A fisica inteira — alturas de salto, alcances, os desafios-assinatura
  // validados por validateChunk — esta medida em cima de 32x48. Se uma skin
  // pudesse mexer nisso, cada arte nova invalidaria as travessias.
  for (const skin of Object.values(PLAYER_SKINS)) {
    assert.equal(skin.w, undefined, `${skin.id} nao pode declarar largura de colisao`);
    assert.equal(skin.h, undefined, `${skin.id} nao pode declarar altura de colisao`);
  }
  assert.ok(PLAYER_SKINS.miguelito.heightScale > 1, 'a arte do Miguelito passa da caixa, e isso e so visual');
});
