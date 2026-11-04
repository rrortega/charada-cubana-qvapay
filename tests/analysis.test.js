// Tests for src/domain/analysis.js
//
// The analysis is descriptive, so the tests pin two things: the arithmetic, and
// that every metric ships the value expected under independence alongside it.
// Without that pairing the UI could present a gap as "it's due".

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  countHits,
  averageSpacing,
  currentGap,
  distribution,
  streaks,
  analyseNumber,
} from '../src/domain/analysis.js';

/** Build a chronological draw list from lookup numbers. */
function drawsFrom(lookups, { startDate = '2026-01-01' } = {}) {
  // Parse the ISO date as LOCAL, not UTC: `new Date('2026-01-01')` is midnight UTC
  // and lands on Dec 31 in negative-offset zones, which would shift every weekday.
  const [sy, sm, sd] = startDate.split('-').map(Number);
  const start = new Date(sy, sm - 1, sd);
  return lookups.map((lookup, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return { date: iso, drawType: i % 2 === 0 ? 'MIDDAY' : 'EVENING', lookup };
  });
}

// --- Counting ---------------------------------------------------------------

test('counts only draws whose lookup number matches', () => {
  const draws = drawsFrom([64, 1, 64, 99]);
  assert.equal(countHits(draws, 64), 2);
  assert.equal(countHits(draws, 99), 1);
  assert.equal(countHits(draws, 5), 0);
});

// --- Spacing ----------------------------------------------------------------

test('average spacing is the mean distance between hits', () => {
  // Hits at indexes 0, 2 and 5 -> gaps 2 and 3 -> mean 2.5
  const draws = drawsFrom([7, 1, 7, 2, 3, 7]);
  const s = averageSpacing(draws, 7);
  assert.equal(s.hits, 3);
  assert.equal(s.draws, 2.5);
});

test('spacing is null with fewer than two hits', () => {
  assert.equal(averageSpacing(drawsFrom([7, 1, 2]), 7), null);
  assert.equal(averageSpacing(drawsFrom([]), 7), null);
});

// --- Gaps -------------------------------------------------------------------

test('current gap counts draws since the last hit', () => {
  const draws = drawsFrom([7, 1, 2, 3]);
  const g = currentGap(draws, 7);
  assert.equal(g.current, 3);
  assert.equal(g.neverSeen, false);
});

test('a hit on the last draw has a current gap of zero', () => {
  assert.equal(currentGap(drawsFrom([1, 2, 7]), 7).current, 0);
});

test('max gap is the longest run without the number', () => {
  // hits at 0 and 5 -> 4 draws in between
  const draws = drawsFrom([7, 1, 1, 1, 1, 7]);
  assert.equal(currentGap(draws, 7).max, 4);
});

test('a number that never appeared reports neverSeen rather than a fake gap', () => {
  const g = currentGap(drawsFrom([1, 2, 3]), 7);
  assert.equal(g.neverSeen, true);
  assert.equal(g.current, null);
});

// --- Distribution -----------------------------------------------------------

test('weekday distribution counts only draws that happened', () => {
  // 2026-01-01 is a Thursday; 7 consecutive days cover every weekday once.
  const draws = drawsFrom([0, 0, 0, 0, 0, 0, 0], { startDate: '2026-01-01' });
  const d = distribution(draws, 0);
  assert.equal(d.byWeekday.length, 7);
  for (const day of d.byWeekday) assert.equal(day.draws, 1, `${day.name} denominator`);
});

test('hits are attributed to the right weekday', () => {
  // Draws on Thu 2026-01-01 .. Wed 2026-01-07; hit only on the first (Thursday).
  const draws = drawsFrom([0, 1, 1, 1, 1, 1, 1], { startDate: '2026-01-01' });
  const d = distribution(draws, 0);
  const thursday = d.byWeekday.find((x) => x.name === 'Jueves');
  assert.equal(thursday.hits, 1);
  assert.equal(d.byWeekday.find((x) => x.name === 'Lunes').hits, 0);
});

test('month distribution labels are stable', () => {
  const draws = drawsFrom([0, 1], { startDate: '2026-03-15' });
  const d = distribution(draws, 0);
  assert.equal(d.byMonth.length, 12);
  assert.equal(d.byMonth[2].name, 'Mar');
  assert.equal(d.byMonth[2].hits, 1);
});

test('draw type split counts both turns', () => {
  const draws = drawsFrom([0, 1, 0, 2]);
  const d = distribution(draws, 0);
  assert.equal(d.byDrawType.MIDDAY.draws, 2);
  assert.equal(d.byDrawType.EVENING.draws, 2);
  assert.equal(d.byDrawType.MIDDAY.hits, 2);
  assert.equal(d.byDrawType.EVENING.hits, 0);
});

// --- Streaks ----------------------------------------------------------------

test('longest streak counts consecutive hits', () => {
  const draws = drawsFrom([7, 7, 7, 1, 7]);
  assert.equal(streaks(draws, 7).longest, 3);
});

test('streaks carry the expected repeat value so they are never sold as a signal', () => {
  // Draws: 7 7 1 1 1 -> one repeat, and 2 adjacent pairs to compare against.
  const draws = drawsFrom([7, 7, 1, 1, 1]);
  const s = streaks(draws, 7);
  assert.equal(s.consecutiveRepeats, 1);
  assert.equal(s.expectedRepeats, 0.02); // 2 pairs / 100
});

// --- Full analysis ----------------------------------------------------------

test('analyseNumber reports share against the 1-in-100 expectation', () => {
  const draws = drawsFrom([64, 1, 64, 2]);
  const a = analyseNumber(draws, 64);
  assert.equal(a.hits, 2);
  assert.equal(a.totalDraws, 4);
  assert.equal(a.share, 50);
  assert.equal(a.expectedShare, 1);
});

test('analyseNumber never divides by zero on an empty history', () => {
  const a = analyseNumber([], 64);
  assert.equal(a.totalDraws, 0);
  assert.equal(a.share, 0);
  assert.equal(a.averageSpacing, null);
  assert.equal(a.gap.neverSeen, true);
});

test('analyseNumber exposes the covered date range', () => {
  const draws = drawsFrom([1, 2, 3], { startDate: '2026-01-01' });
  const a = analyseNumber(draws, 1);
  assert.equal(a.range.from, '2026-01-01');
  assert.equal(a.range.to, '2026-01-03');
});
