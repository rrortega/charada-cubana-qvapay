// Tests for src/domain/stats.js
//
// These pin the descriptive behaviour and, importantly, the honesty guards:
// every function that could be read as predictive also returns the value
// expected under independence, so the UI cannot present a pattern as a signal.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  digitFrequencyByPosition,
  chiSquareUniform,
  classifyPattern,
  patternDistribution,
  PATTERN_THEORY,
  exactResultFrequency,
  charadaNumberFrequency,
  gapsForCharadaNumber,
  consecutiveRepetition,
} from '../src/domain/stats.js';

// --- Positional frequency ---------------------------------------------------

test('counts each digit per winning position, never mixing positions', () => {
  const r = digitFrequencyByPosition([[1, 2, 3], [1, 4, 3]]);
  assert.equal(r.fijo[1], 2);
  assert.equal(r.fijo[2], 0);
  assert.equal(r.corrido1[2], 1);
  assert.equal(r.corrido1[4], 1);
  assert.equal(r.corrido2[3], 2);
  assert.equal(r.total, 2);
});

test('ignores malformed rows instead of throwing', () => {
  const r = digitFrequencyByPosition([[1, 2, 3], [1, 2], null, 'x']);
  assert.equal(r.total, 4);
  assert.equal(r.fijo[1], 1);
});

test('handles an empty dataset', () => {
  const r = digitFrequencyByPosition([]);
  assert.deepEqual(r.fijo, new Array(10).fill(0));
  assert.equal(r.total, 0);
});

// --- Chi-square -------------------------------------------------------------

test('a perfectly uniform sample is reported as uniform', () => {
  const r = chiSquareUniform(new Array(10).fill(10));
  assert.equal(r.chiSquare, 0);
  assert.equal(r.uniform, true);
});

test('a heavily skewed sample is reported as not uniform', () => {
  const counts = new Array(10).fill(0);
  counts[0] = 100;
  const r = chiSquareUniform(counts);
  assert.equal(r.uniform, false);
  assert.ok(r.chiSquare > r.critical95);
});

test('chi-square on an empty sample does not divide by zero', () => {
  const r = chiSquareUniform(new Array(10).fill(0));
  assert.equal(r.chiSquare, 0);
  assert.equal(r.uniform, true);
});

// --- Patterns ---------------------------------------------------------------

test('classifies a triple', () => {
  assert.equal(classifyPattern([7, 7, 7]), 'triple');
});

test('classifies a pair', () => {
  assert.equal(classifyPattern([4, 6, 6]), 'pareja');
  assert.equal(classifyPattern([6, 4, 6]), 'pareja');
});

test('classifies all-different', () => {
  assert.equal(classifyPattern([1, 2, 3]), 'distintos');
});

test('counts pattern distribution', () => {
  const r = patternDistribution([[7, 7, 7], [4, 6, 6], [1, 2, 3], [2, 1, 3]]);
  assert.deepEqual(r, { triple: 1, pareja: 1, distintos: 2 });
});

test('the theoretical pattern probabilities sum to 1', () => {
  const sum = PATTERN_THEORY.triple + PATTERN_THEORY.pareja + PATTERN_THEORY.distintos;
  assert.ok(Math.abs(sum - 1) < 1e-9);
});

// --- Exact results ----------------------------------------------------------

test('counts exact results and sorts by frequency', () => {
  const r = exactResultFrequency([[5, 7, 0], [5, 7, 0], [1, 2, 3]]);
  assert.deepEqual(r[0], { value: '570', count: 2 });
  assert.deepEqual(r[1], { value: '123', count: 1 });
});

test('breaks frequency ties deterministically', () => {
  const a = exactResultFrequency([[1, 1, 1], [2, 2, 2]]);
  const b = exactResultFrequency([[2, 2, 2], [1, 1, 1]]);
  assert.deepEqual(a, b);
});

// --- Charada numbers --------------------------------------------------------

test('charada frequency uses the last two digits', () => {
  const counts = charadaNumberFrequency([[5, 7, 0], [1, 7, 0], [2, 0, 0]]);
  assert.equal(counts[70], 2);
  assert.equal(counts[0], 1);
  assert.equal(counts.length, 100);
});

test('charada frequency never keys on a single leading digit', () => {
  // Both draws end in 00 -> index 0, not index 5 and 1.
  const counts = charadaNumberFrequency([[5, 0, 0], [1, 0, 0]]);
  assert.equal(counts[0], 2);
  assert.equal(counts[5], 0);
});

// --- Gaps -------------------------------------------------------------------

test('reports gaps between appearances factually', () => {
  const draws = [[1, 7, 0], [2, 0, 0], [3, 7, 0], [4, 7, 0]];
  const r = gapsForCharadaNumber(draws, 70);
  assert.equal(r.appearances, 3);
  assert.deepEqual(r.gaps, [1, 0]);
  assert.equal(r.currentGap, 0);
  assert.equal(r.longestGap, 1);
});

test('a number that never appeared reports no appearances', () => {
  const r = gapsForCharadaNumber([[1, 2, 3]], 70);
  assert.equal(r.appearances, 0);
  assert.equal(r.currentGap, null);
  assert.equal(r.longestGap, null);
});

test('currentGap counts draws since the last appearance', () => {
  const r = gapsForCharadaNumber([[1, 7, 0], [2, 0, 1], [3, 0, 2]], 70);
  assert.equal(r.currentGap, 2);
});

// --- Consecutive repetition ("de corrido") ----------------------------------

test('reports repetition together with the value expected by chance', () => {
  const draws = [[1, 7, 0], [2, 7, 0], [3, 0, 1], [4, 0, 1]];
  const r = consecutiveRepetition(draws);
  assert.equal(r.pairs, 3);
  // 70 -> 70 repeats; 70 -> 01 does not; 01 -> 01 repeats.
  assert.equal(r.repeated, 2);
  assert.equal(r.expectedRate, 0.01);
  assert.equal(r.expected, 0.03);
});

test('never presents repetition as a signal: expectation is always returned', () => {
  const r = consecutiveRepetition([[1, 1, 1]]);
  assert.equal(r.pairs, 0);
  assert.equal(r.expected, 0);
  assert.equal(r.observedRate, 0);
});

test('a run with no repetition still carries the expected value', () => {
  const r = consecutiveRepetition([[1, 0, 1], [1, 0, 2], [1, 0, 3]]);
  assert.equal(r.repeated, 0);
  assert.equal(r.expected, 0.02);
});
