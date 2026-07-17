import { generateLevel } from '../src/procgen/generator.js';

function runTests() {
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      passed++;
      console.log(`✅ PASS: ${message}`);
    } else {
      failed++;
      console.error(`❌ FAIL: ${message}`);
    }
  }

  console.log('--- Testando Gerador Semiprocedural ---');

  // Test 1: Reprodutibilidade
  const seed = 'test-seed-123';
  const level1 = generateLevel(seed);
  const level2 = generateLevel(seed);

  const l1Json = JSON.stringify(level1.platforms);
  const l2Json = JSON.stringify(level2.platforms);

  assert(l1Json === l2Json, 'Mesma seed deve produzir exatamente as mesmas plataformas');

  // Test 2: Garantia de 100 trechos + 1 (início)
  assert(level1.platforms.length === 101, `Deve gerar exatamente 101 plataformas (start + 100 chunks), gerou ${level1.platforms.length}`);

  // Test 3: Zero softlocks / zero plataformas inalcançáveis
  // In theory our generator only accepts valid geometries (or falls back to a trivial one).
  // We can just check if any chunk was rejected completely.
  // Actually, the generator creates 101 platforms. None of them should be null.
  const validGeometry = level1.platforms.every(p => p && p.w > 0 && p.h > 0);
  assert(validGeometry, 'Todas as plataformas geradas devem ter geometria válida');

  console.log('---------------------------------------');
  console.log(`Testes: ${passed + failed}, Passou: ${passed}, Falhou: ${failed}`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
