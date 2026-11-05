// Tests for the coherence rule: which numbers a dream points at (S6).
//
// The whole product rule lives here, so it is pinned one behaviour at a time:
// the greedy pick, the discount a signal pays when it is used twice, the tie
// broken by ascending number, the cut, and the signals that carried each number.

import test from 'node:test';
import assert from 'node:assert/strict';

import { score, elegirConjunto, PESO_REPETIDO } from '../src/sueno/coherencia.js';

const signal = (nombre, peso, numeros) => ({ nombre, peso, numeros });

const SENALES = [
  signal('agua', 1, [9, 33]),
  signal('rio', 1, [9, 33]),
  signal('perro', 0.9, [9]),
  signal('fuego', 0.8, [45]),
];

const close = (actual, expected) => assert.ok(
  Math.abs(actual - expected) < 1e-9,
  `${actual} is not ${expected}`,
);

test('the score of a number is the weight of the signals that point at it', () => {
  close(score(9, SENALES), 2.9);
  close(score(33, SENALES), 2);
  close(score(45, SENALES), 0.8);
  assert.equal(score(7, SENALES), 0);
});

test('the set is chosen greedily, in the order it was chosen', () => {
  const { numeros } = elegirConjunto(SENALES, { max: 2 });
  assert.deepEqual(numeros, [9, 45]);
});

test('a signal already used weighs PESO_REPETIDO, not its whole weight', () => {
  assert.equal(PESO_REPETIDO, 0.35);
  // Without the discount 33 would score 2 and beat 45's 0,8.
  const { soporte, puntaje } = elegirConjunto(SENALES, { max: 2 });
  assert.deepEqual(soporte[1], { numero: 45, senales: ['fuego'] });
  close(puntaje, 3.7);
});

test('a tie is broken by the ascending number', () => {
  const tied = [signal('tres', 1, [3]), signal('siete', 1, [7])];
  assert.deepEqual(elegirConjunto(tied, { max: 2 }).numeros, [3, 7]);
  assert.deepEqual(elegirConjunto(tied, { max: 1 }).numeros, [3]);
});

test('the cut is the max asked for', () => {
  const many = Array.from({ length: 6 }, (_, i) => signal(`s${i + 1}`, 1, [i + 1]));
  assert.equal(elegirConjunto(many, { max: 3 }).numeros.length, 3);
  // Default is three.
  assert.equal(elegirConjunto(many).numeros.length, 3);
});

test('nothing to choose from is an empty set, not an error', () => {
  assert.deepEqual(elegirConjunto([]), { numeros: [], soporte: [], puntaje: 0 });
  const noNumbers = [signal('agua', 1, []), signal('rio', 0.5, [])];
  assert.deepEqual(elegirConjunto(noNumbers), { numeros: [], soporte: [], puntaje: 0 });
});

test('the support names the signals that carried every number', () => {
  const { soporte } = elegirConjunto(SENALES, { max: 2 });
  assert.deepEqual(soporte, [
    { numero: 9, senales: ['agua', 'rio', 'perro'] },
    { numero: 45, senales: ['fuego'] },
  ]);
  // The support is in the order the numbers were chosen, not sorted.
  assert.deepEqual(soporte.map((row) => row.numero), elegirConjunto(SENALES, { max: 2 }).numeros);
});

test('a number points back at only the signals of the input, once', () => {
  const duplicated = [
    signal('agua', 0.6, [9, 9]),
    signal('rio', 0.4, [9]),
  ];
  const { soporte, puntaje } = elegirConjunto(duplicated, { max: 1 });
  assert.deepEqual(soporte, [{ numero: 9, senales: ['agua', 'rio'] }]);
  close(puntaje, 1);
});
