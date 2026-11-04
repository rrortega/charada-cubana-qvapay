// Tests for the Florida Lottery ingest client.
// These pin the upstream quirks discovered by inspection, so a future change in
// behaviour fails here instead of silently corrupting stored results.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  formatUpstreamDate,
  parseUpstreamDrawDate,
  splitDrawNumbers,
  normaliseDraw,
  normaliseBatch,
  fetchDrawHistory,
  GAME_IDS,
} from '../src/ingest/floridaLottery.js';

test('formats dates in the upstream D-MMM-YYYY form, uppercase month', () => {
  assert.equal(formatUpstreamDate(new Date(Date.UTC(2026, 10, 3))), '3-NOV-2026');
  assert.equal(formatUpstreamDate(new Date(Date.UTC(2026, 0, 1))), '1-JAN-2026');
  assert.equal(formatUpstreamDate('2025-12-25T00:00:00Z'), '25-DEC-2025');
});

test('rejects an unparseable date instead of sending a wrong request', () => {
  assert.throws(() => formatUpstreamDate('not-a-date'), /Invalid date/);
});

test('parses the upstream draw date into YYYY-MM-DD', () => {
  assert.equal(parseUpstreamDrawDate('11/03/2026 12:00:00 AM'), '2026-11-03');
  assert.equal(parseUpstreamDrawDate('01/01/2025 12:00:00 AM'), '2025-01-01');
});

test('returns null for a malformed draw date so the row is skipped, not stored', () => {
  assert.equal(parseUpstreamDrawDate('2026-11-03'), null);
  assert.equal(parseUpstreamDrawDate('13/45/2026 12:00:00 AM'), null);
  assert.equal(parseUpstreamDrawDate(''), null);
  assert.equal(parseUpstreamDrawDate(null), null);
});

test('separates base digits from the Fireball', () => {
  // Real PICK 3 MIDDAY 2026-11-03 payload shape.
  const { base, fireball } = splitDrawNumbers([
    { NumberPick: 4, NumberType: 'wn1' },
    { NumberPick: 6, NumberType: 'wn2' },
    { NumberPick: 4, NumberType: 'wn3' },
    { NumberPick: 2, NumberType: 'fb' },
  ]);
  assert.deepEqual(base, [4, 6, 4]);
  assert.equal(fireball, 2);
});

test('never lets the Fireball leak into the base digits', () => {
  const { base, fireball } = splitDrawNumbers([
    { NumberPick: 9, NumberType: 'fb' },
    { NumberPick: 1, NumberType: 'wn1' },
    { NumberPick: 2, NumberType: 'wn2' },
    { NumberPick: 3, NumberType: 'wn3' },
    { NumberPick: 4, NumberType: 'wn4' },
  ]);
  assert.deepEqual(base, [1, 2, 3, 4]);
  assert.equal(fireball, 9);
});

test('preserves the winning position of each digit, not the numeric order', () => {
  // Base digits must stay positional: 464 is not 446.
  const { base } = splitDrawNumbers([
    { NumberPick: 4, NumberType: 'wn1' },
    { NumberPick: 6, NumberType: 'wn2' },
    { NumberPick: 4, NumberType: 'wn3' },
  ]);
  assert.deepEqual(base, [4, 6, 4]);
});

test('orders digits by winning position even when the payload is shuffled', () => {
  const { base } = splitDrawNumbers([
    { NumberPick: 3, NumberType: 'wn3' },
    { NumberPick: 1, NumberType: 'wn1' },
    { NumberPick: 2, NumberType: 'wn2' },
  ]);
  assert.deepEqual(base, [1, 2, 3]);
});

test('ignores unknown number types rather than guessing', () => {
  const { base, fireball } = splitDrawNumbers([
    { NumberPick: 1, NumberType: 'wn1' },
    { NumberPick: 7, NumberType: 'bonus' },
    { NumberPick: 2, NumberType: 'wn2' },
  ]);
  assert.deepEqual(base, [1, 2]);
  assert.equal(fireball, null);
});

// --- normaliseDraw ----------------------------------------------------------

const pick3Record = {
  Id: 104,
  GameName: 'PICK 3',
  DrawDate: '11/03/2026 12:00:00 AM',
  DrawType: 'MIDDAY',
  TotalWinners: 1059,
  TotalPayouts: 253713,
  DrawNumbers: [
    { NumberPick: 4, NumberType: 'wn1' },
    { NumberPick: 6, NumberType: 'wn2' },
    { NumberPick: 4, NumberType: 'wn3' },
    { NumberPick: 2, NumberType: 'fb' },
  ],
};

test('normalises a real Pick 3 record', () => {
  const d = normaliseDraw(pick3Record, { expectedGameId: GAME_IDS.pick3, winningDigits: 3 });
  assert.equal(d.gameId, 104);
  assert.equal(d.drawDate, '2026-11-03');
  assert.equal(d.drawType, 'MIDDAY');
  assert.deepEqual(d.baseDigits, [4, 6, 4]);
  assert.equal(d.fireball, 2);
  assert.equal(d.totalWinners, 1059);
  assert.deepEqual(d.rawPayload, pick3Record);
});

test('rejects a record from a different game', () => {
  assert.equal(normaliseDraw(pick3Record, { expectedGameId: GAME_IDS.pick4, winningDigits: 4 }), null);
});

test('rejects a record with the wrong number of base digits', () => {
  assert.equal(normaliseDraw(pick3Record, { expectedGameId: GAME_IDS.pick3, winningDigits: 4 }), null);
});

test('rejects an unknown draw type', () => {
  const r = { ...pick3Record, DrawType: 'NOON' };
  assert.equal(normaliseDraw(r, { expectedGameId: GAME_IDS.pick3, winningDigits: 3 }), null);
});

test('rejects a record with an unparseable date', () => {
  const r = { ...pick3Record, DrawDate: 'garbage' };
  assert.equal(normaliseDraw(r, { expectedGameId: GAME_IDS.pick3, winningDigits: 3 }), null);
});

// --- normaliseBatch ---------------------------------------------------------

test('sorts a non-deterministic upstream response', () => {
  // The upstream API returns rows unordered. This is the regression the
  // predecessor actor would have silently accepted.
  const evening = { ...pick3Record, DrawType: 'EVENING', DrawDate: '11/03/2026 12:00:00 AM' };
  const earlier = { ...pick3Record, DrawType: 'MIDDAY', DrawDate: '10/01/2026 12:00:00 AM' };
  const batch = normaliseBatch([evening, earlier], {
    expectedGameId: GAME_IDS.pick3,
    winningDigits: 3,
  });
  assert.deepEqual(batch.map((d) => d.drawDate), ['2026-10-01', '2026-11-03']);
});

test('de-duplicates repeated keys from the upstream response', () => {
  const batch = normaliseBatch([pick3Record, pick3Record, pick3Record], {
    expectedGameId: GAME_IDS.pick3,
    winningDigits: 3,
  });
  assert.equal(batch.length, 1);
});

test('drops unusable rows without aborting the batch', () => {
  const good = pick3Record;
  const badDate = { ...pick3Record, DrawDate: 'broken' };
  const badGame = { ...pick3Record, Id: 108 };
  const batch = normaliseBatch([badDate, badGame, good], {
    expectedGameId: GAME_IDS.pick3,
    winningDigits: 3,
  });
  assert.equal(batch.length, 1);
  assert.equal(batch[0].drawDate, '2026-11-03');
});

test('handles an empty or null response', () => {
  assert.deepEqual(normaliseBatch([], { expectedGameId: 104, winningDigits: 3 }), []);
  assert.deepEqual(normaliseBatch(null, { expectedGameId: 104, winningDigits: 3 }), []);
});

// --- Transport contract -----------------------------------------------------

test('sends the required x-partner header and the documented query', async () => {
  let seenUrl;
  let seenHeaders;
  const fetchImpl = async (url, init) => {
    seenUrl = url;
    seenHeaders = init.headers;
    return { ok: true, json: async () => [] };
  };
  await fetchDrawHistory(104, new Date(Date.UTC(2026, 9, 1)), new Date(Date.UTC(2026, 10, 3)), { fetchImpl });
  assert.match(seenUrl, /^https:\/\/apim-website-prod-eastus\.azure-api\.net\/drawgamesapp\/searchgames\?/);
  assert.match(seenUrl, /id=104/);
  assert.match(seenUrl, /startDate=1-OCT-2026/);
  assert.match(seenUrl, /endDate=3-NOV-2026/);
  assert.equal(seenHeaders['x-partner'], 'web');
});

test('surfaces a non-2xx upstream response as an error, never as empty data', async () => {
  const fetchImpl = async () => ({
    ok: false,
    status: 401,
    text: async () => '{ "statusCode": 401, "message": "Missing header" }',
  });
  await assert.rejects(
    fetchDrawHistory(104, new Date(), new Date(), { fetchImpl }),
    /failed: 401/,
  );
});
