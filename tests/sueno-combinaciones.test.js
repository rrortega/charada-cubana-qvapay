// Tests for the week's playable combinations.
//
// The rule is the whole product here, so it is pinned number by number: which
// number becomes the prefix, which one the charada, how the corridos order and
// how many parles three numbers make.

import test from 'node:test';
import assert from 'node:assert/strict';

import { combinacionesDeLaSemana } from '../src/sueno/combinaciones.js';

const weigh = (...pairs) => pairs.map(([numero, peso]) => ({ numero, peso }));

test('the fijo is the heaviest single digit in front of the heaviest two-digit', () => {
  const out = combinacionesDeLaSemana(weigh([25, 3], [7, 2], [61, 1]));

  assert.deepEqual(out.fijos, [{
    valor: 725, formatted: '725', prefijo: 7, charada: 25,
  }]);
});

test('without a single digit or without a two-digit there is no fijo', () => {
  assert.deepEqual(combinacionesDeLaSemana(weigh([25, 3], [61, 1])).fijos, []);
  assert.deepEqual(combinacionesDeLaSemana(weigh([3, 3], [7, 1])).fijos, []);
});

test('the corridos are the two heaviest numbers, padded to two digits', () => {
  const out = combinacionesDeLaSemana(weigh([9, 3], [6, 2], [37, 1]));
  assert.deepEqual(out.corridos, [
    { valor: 9, formatted: '09' },
    { valor: 6, formatted: '06' },
  ]);
});

test('three numbers make three parles, heaviest pair first', () => {
  const out = combinacionesDeLaSemana(weigh([9, 3], [6, 2], [37, 1]));
  assert.deepEqual(out.parles.map((p) => `${p.top.formatted}-${p.bottom.formatted}`),
    ['09-06', '09-37', '06-37']);
});

test('two numbers make one parle; one number makes none', () => {
  assert.equal(combinacionesDeLaSemana(weigh([9, 3], [6, 2])).parles.length, 1);
  assert.equal(combinacionesDeLaSemana(weigh([9, 3])).parles.length, 0);
});

test('duplicates merge their weight instead of competing', () => {
  const out = combinacionesDeLaSemana(weigh([9, 1], [9, 2], [6, 1]));

  // 9 now weighs 3, so it leads the corridos and the prefix.
  assert.deepEqual(out.corridos.map((c) => c.formatted), ['09', '06']);
});

test('the heaviest wins even when it comes last, and ties break by number', () => {
  const heavy = combinacionesDeLaSemana(weigh([6, 0.5], [37, 4], [9, 0.6]));
  assert.deepEqual(heavy.corridos.map((c) => c.formatted), ['37', '09']);

  const tie = combinacionesDeLaSemana(weigh([37, 1], [6, 1]));
  assert.deepEqual(tie.corridos.map((c) => c.formatted), ['06', '37']);
});

test('numbers outside 1..100 and weights that make no sense are ignored', () => {
  const out = combinacionesDeLaSemana([
    { numero: 0, peso: 9 },
    { numero: 101, peso: 9 },
    { numero: 9, peso: 0 },
    { numero: '37', peso: '2' },
  ]);

  assert.deepEqual(out.corridos.map((c) => c.formatted), ['37']);
  assert.deepEqual(out.fijos, []);
});

test('nothing to weigh is nothing to play', () => {
  assert.deepEqual(combinacionesDeLaSemana([]), { fijos: [], corridos: [], parles: [] });
  assert.deepEqual(combinacionesDeLaSemana(undefined), { fijos: [], corridos: [], parles: [] });
});
