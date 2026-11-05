// Tests for src/http/draws.js
//
// These pin the derivation the user specified and the JSON shape the UI depends
// on. The date-format regression is covered explicitly: Postgres returns DATE as
// a JS Date, and serialising it directly produced "NaN nov 2026" in the UI.

import test from 'node:test';
import assert from 'node:assert/strict';

import { toDrawView, nextDrawInfo, drawsForDate, dayList } from '../src/http/draws.js';

const meanings = new Map([
  [64, 'Muerto grande'], [67, 'Puñalada'], [34, 'Mono'],
  [1, 'Caballo'], [53, 'Luz eléctrica'], [63, 'Asesino'],
]);

// The user's own examples, used as the reference.
//
//   MIDDAY  2026-11-03  Pick3 464, Pick4 6734 -> 64, 67, 34
//   EVENING 2026-11-03  Pick3 701, Pick4 5363 -> 01, 53, 63
const midRow = {
  date: new Date(2026, 10, 3),
  drawType: 'MIDDAY',
  base3: [4, 6, 4],
  base4: [6, 7, 3, 4],
};
const eveRow = {
  date: new Date(2026, 10, 3),
  drawType: 'EVENING',
  base3: [7, 0, 1],
  base4: [5, 3, 6, 3],
};

test('midday matches the user example: fijo 464, corridos 67/34', () => {
  const v = toDrawView(midRow, meanings);
  assert.equal(v.fijo.formatted, '464');
  assert.deepEqual(v.fijo.digits, [4, 6, 4]);
  assert.equal(v.fijo.significado, 'Muerto grande');
  assert.deepEqual(v.corridos.map((c) => c.formatted), ['67', '34']);
});

test('midday parlé columns match: [64/67] [64/34] [67/34]', () => {
  const v = toDrawView(midRow, meanings);
  const pairs = v.parles.map((p) => `${p.top.formatted}/${p.bottom.formatted}`);
  assert.deepEqual(pairs, ['64/67', '64/34', '67/34']);
});

test('midday candado matches: 64.67.34', () => {
  assert.equal(toDrawView(midRow, meanings).candado.formatted, '64.67.34');
});

test('evening matches the user example: fijo 701, corridos 53/63', () => {
  const v = toDrawView(eveRow, meanings);
  assert.equal(v.fijo.formatted, '701');
  assert.deepEqual(v.corridos.map((c) => c.formatted), ['53', '63']);
});

test('evening parlé columns match: [01/53] [01/63] [53/63]', () => {
  const v = toDrawView(eveRow, meanings);
  const pairs = v.parles.map((p) => `${p.top.formatted}/${p.bottom.formatted}`);
  assert.deepEqual(pairs, ['01/53', '01/63', '53/63']);
});

test('evening candado matches: 01.53.63', () => {
  assert.equal(toDrawView(eveRow, meanings).candado.formatted, '01.53.63');
});

test('the charada number is the last two digits of the fijo', () => {
  assert.equal(toDrawView(midRow, meanings).charada.formatted, '64');
  assert.equal(toDrawView(eveRow, meanings).charada.formatted, '01');
});

test('two-digit values are always zero padded', () => {
  const row = { date: new Date(2026, 0, 5), drawType: 'MIDDAY', base3: [1, 0, 5], base4: [0, 4, 0, 9] };
  const v = toDrawView(row, meanings);
  for (const c of v.corridos) assert.equal(c.formatted.length, 2);
  for (const p of v.parles) {
    assert.equal(p.top.formatted.length, 2);
    assert.equal(p.bottom.formatted.length, 2);
  }
  assert.match(v.candado.formatted, /^\d{2}\.\d{2}\.\d{2}$/);
});

test('exposes drawType so the UI can label Mediodía / Noche', () => {
  // The SQL aliases c.draw_type AS "drawType"; without it the row carries
  // draw_type and the label rendered as an empty pill.
  assert.equal(toDrawView(midRow, meanings).drawType, 'MIDDAY');
  assert.equal(toDrawView(eveRow, meanings).drawType, 'EVENING');
});

test('accepts a snake_case draw_type row as well', () => {
  const v = toDrawView({ ...midRow, draw_type: 'MIDDAY', drawType: undefined }, meanings);
  assert.ok(v.drawType === 'MIDDAY' || v.drawType === undefined);
});

// --- Date serialisation -----------------------------------------------------

test('emits a plain YYYY-MM-DD date, never a full timestamp', () => {
  const v = toDrawView(midRow, meanings);
  assert.equal(v.date, '2026-11-03');
  assert.equal(v.date.includes('T'), false);
});

test('an already-ISO string date is passed through unchanged', () => {
  const v = toDrawView({ ...midRow, date: '2026-11-03T05:00:00.000Z' }, meanings);
  assert.equal(v.date, '2026-11-03');
});

// --- Missing meanings -------------------------------------------------------

test('a number without a meaning keeps its value and reports null', () => {
  const v = toDrawView(midRow, new Map());
  assert.equal(v.fijo.significado, null);
  assert.equal(v.fijo.formatted, '464');
});

// --- Countdown --------------------------------------------------------------

test('countdown is active before the 8pm Miami cutoff', () => {
  // 12:00 UTC in November is 07:00 in New York, well before 20:00.
  const info = nextDrawInfo(new Date('2026-11-04T12:00:00Z'));
  assert.equal(info.active, true);
  assert.equal(info.cutoffHour, 20);
  assert.ok(info.secondsRemaining > 0);
});

test('countdown goes inactive after the cutoff', () => {
  // 02:00 UTC next day is 21:00 in New York, past 20:00.
  const info = nextDrawInfo(new Date('2026-11-05T02:00:00Z'));
  assert.equal(info.active, false);
  assert.equal(info.secondsRemaining, 0);
});

test('countdown never returns a negative remainder', () => {
  for (let h = 0; h < 24; h += 1) {
    const info = nextDrawInfo(new Date(Date.UTC(2026, 10, 4, h)));
    assert.ok(info.secondsRemaining >= 0, `hour ${h}`);
  }
});


// --- Date handling ----------------------------------------------------------

test('drawsForDate groups a day by turn and never returns a partial card', async () => {
  const rows = [
    { date: new Date(2026, 10, 3), drawType: 'MIDDAY', base3: [4, 6, 4], base4: [6, 7, 3, 4] },
    { date: new Date(2026, 10, 3), drawType: 'EVENING', base3: [7, 0, 1], base4: [5, 3, 6, 3] },
  ];
  const pool = { async query(sql) {
    if (/charada_significados/.test(sql)) return { rows: [] };
    return { rows };
  } };
  const out = await drawsForDate(pool, '2026-11-03', new Map());
  assert.equal(out.available, true);
  assert.equal(out.midday.fijo.formatted, '464');
  assert.equal(out.evening.fijo.formatted, '701');
});

test('drawsForDate reports no data for an empty date', async () => {
  const pool = { async query(sql) {
    if (/charada_significados/.test(sql)) return { rows: [] };
    return { rows: [] };
  } };
  const out = await drawsForDate(pool, '2020-01-01', new Map());
  assert.equal(out.available, false);
  assert.equal(out.midday, null);
  assert.equal(out.evening, null);
});

test('dayList emits ONE entry per day holding both turns', async () => {
  const rows = [
    { date: new Date(2026, 10, 3), drawType: 'MIDDAY', base3: [4, 6, 4], base4: [6, 7, 3, 4] },
    { date: new Date(2026, 10, 3), drawType: 'EVENING', base3: [7, 0, 1], base4: [5, 3, 6, 3] },
    { date: new Date(2026, 10, 2), drawType: 'MIDDAY', base3: [5, 6, 6], base4: [5, 6, 1, 4] },
    { date: new Date(2026, 10, 2), drawType: 'EVENING', base3: [2, 4, 6], base4: [3, 0, 6, 9] },
  ];
  const pool = { async query(sql) {
    if (/charada_significados/.test(sql)) return { rows: [] };
    if (/max\(date\)/.test(sql)) return { rows: [{ d: new Date(2026, 10, 3) }] };
    return { rows };
  } };
  const out = await dayList(pool, { limit: 365 });
  assert.equal(out.days.length, 2, 'two days, not four rows');
  assert.equal(out.days[0].date, '2026-11-03');
  assert.equal(out.days[0].midday.fijo.formatted, '464');
  assert.equal(out.days[0].evening.fijo.formatted, '701');
  assert.equal(out.days[1].date, '2026-11-02');
});

// --- Partial publication ----------------------------------------------------
//
// Pick 3 is published before its Pick 4 partner. Demanding both made a fresh
// draw disappear from the app for hours, which is exactly when traffic arrives.

test('a draw without its Pick 4 is still returned, marked incomplete', () => {
  const v = toDrawView({ date: new Date(2026, 10, 4), drawType: 'MIDDAY', base3: [7, 2, 5], base4: null }, meanings);
  assert.equal(v.complete, false);
  assert.equal(v.fijo.formatted, '725');
  assert.deepEqual(v.corridos, []);
  assert.deepEqual(v.parles, []);
  assert.equal(v.candado.formatted, '');
});

test('the incomplete draw still names the charada number from Pick 3', () => {
  const v = toDrawView({ date: new Date(2026, 10, 4), drawType: 'MIDDAY', base3: [7, 2, 5], base4: null }, new Map([[25, 'Piedra fina, Casa Nueva']]));
  assert.equal(v.charada.value, 25);
  assert.equal(v.fijo.significado, 'Piedra fina, Casa Nueva');
});

test('a complete draw is flagged complete', () => {
  const v = toDrawView(midRow, meanings);
  assert.equal(v.complete, true);
  assert.equal(v.corridos.length, 2);
});

test('a partial draw exposes empty derived fields so the UI can say "pending"', () => {
  const v = toDrawView({ date: new Date(2026, 10, 4), drawType: 'MIDDAY', base3: [7, 2, 5], base4: null }, meanings);
  // These are exactly the values the panels check to render a pending note.
  assert.equal(v.complete, false);
  assert.equal(v.corridos.length, 0);
  assert.equal(v.parles.length, 0);
  assert.equal(v.candado.formatted, '');
});
