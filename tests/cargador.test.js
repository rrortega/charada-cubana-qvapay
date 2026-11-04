// Contract tests for docs/cargador-contract.md.
// Run: npm test

import test from 'node:test';
import assert from 'node:assert/strict';

import { computeCargador, formatCargador, describeCargador } from '../src/domain/cargador.js';

// --- The cargador is the full Pick 3 number --------------------------------

test('the cargador is the full three-digit Pick 3 number', () => {
  assert.deepEqual(computeCargador([4, 6, 4]), {
    fijo: 464, pick3: '464', prefijo: 4, dosUltimos: 64,
  });
});

test('a leading zero is preserved in the pick3 string', () => {
  const r = computeCargador([0, 4, 5]);
  assert.equal(r.fijo, 45);
  assert.equal(r.pick3, '045');
  assert.equal(r.prefijo, 0);
  assert.equal(r.dosUltimos, 45);
});

test('the lookup uses the last two digits, never each digit separately', () => {
  // 570 must resolve to 70, not to 5, 7 and 0.
  const r = computeCargador([5, 7, 0]);
  assert.equal(r.fijo, 570);
  assert.equal(r.dosUltimos, 70);
  assert.equal(r.prefijo, 5);
});

// --- Digit positions are meaningful ----------------------------------------

test('digit order is preserved, not sorted', () => {
  // 464 must not become 446.
  assert.equal(computeCargador([4, 6, 4]).fijo, 464);
  assert.equal(computeCargador([4, 4, 6]).fijo, 446);
});

test('all-same digits are valid', () => {
  assert.equal(computeCargador([7, 7, 7]).fijo, 777);
});

test('the lowest and highest draws are valid', () => {
  assert.equal(computeCargador([0, 0, 0]).fijo, 0);
  assert.equal(computeCargador([9, 9, 9]).fijo, 999);
});

// --- Input validation -------------------------------------------------------

test('rejects an input that is not 3 digits', () => {
  assert.throws(() => computeCargador([1, 2]), /base3 must be an array of 3 digits/);
  assert.throws(() => computeCargador([1, 2, 3, 4]), /base3 must be an array of 3 digits/);
  assert.throws(() => computeCargador(null), /base3 must be an array of 3 digits/);
});

test('rejects non-digit values', () => {
  assert.throws(() => computeCargador([1, 2, 10]), /Invalid digit/);
  assert.throws(() => computeCargador([1, 2, -1]), /Invalid digit/);
  assert.throws(() => computeCargador([1, 2, 1.5]), /Invalid digit/);
});

// --- Formatting -------------------------------------------------------------

test('formats the cargador always with three digits', () => {
  assert.equal(formatCargador(464), '464');
  assert.equal(formatCargador(45), '045');
  assert.equal(formatCargador(0), '000');
  assert.equal(formatCargador(999), '999');
});

test('rejects an out-of-range fijo when formatting', () => {
  assert.throws(() => formatCargador(1000), /Invalid fijo/);
  assert.throws(() => formatCargador(-1), /Invalid fijo/);
});

// --- Charada lookup and spoken form ----------------------------------------

const table = new Map([
  [64, 'Muerto grande'],
  [1, 'Caballo'],
  [70, 'Coco'],
  [66, 'Tarro, Pareja de yeguas'],
  [45, 'Marinero, Niño Chiquito'],
]);

test('names the cargador by its last two digits', () => {
  const r = describeCargador(computeCargador([4, 6, 4]), table);
  assert.equal(r.numeroCharada, 64);
  assert.equal(r.significado, 'Muerto grande');
  assert.equal(r.dicho, 'el 4 con Muerto grande');
});

test('570 is spoken as "el 5 con Coco", not decoded digit by digit', () => {
  const r = describeCargador(computeCargador([5, 7, 0]), table);
  assert.equal(r.fijo, 570);
  assert.equal(r.numeroCharada, 70);
  assert.equal(r.significado, 'Coco');
  assert.equal(r.dicho, 'el 5 con Coco');
});

test('a draw under 100 is spoken as the number alone', () => {
  const r = describeCargador(computeCargador([0, 4, 5]), table);
  assert.equal(r.dicho, 'el 45');
});

test('a draw ending in 00 has no charada name but keeps its number', () => {
  const r = describeCargador(computeCargador([5, 0, 0]), table);
  assert.equal(r.numeroCharada, 0);
  assert.equal(r.significado, null);
  assert.equal(r.dicho, 'el 500');
});

test('an unknown lookup number yields null rather than guessing', () => {
  const r = describeCargador(computeCargador([2, 3, 4]), table);
  assert.equal(r.numeroCharada, 34);
  assert.equal(r.significado, null);
  assert.equal(r.dicho, 'el 234');
});
