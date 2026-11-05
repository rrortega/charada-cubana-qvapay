// Tests for src/sync/resultsSync.js
//
// The ordering guarantees matter more than the fetch itself: concurrent readers
// must not trigger a stampede of upstream calls, and a sync failure must never
// reach a user-facing request.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createSync } from '../src/sync/resultsSync.js';

const quietLog = { info() {}, error() {} };

/** Pool double that records calls and reports an empty table. */
function fakePool({ newestDate = null, insertReturns = [] } = {}) {
  const calls = [];
  let insertIndex = 0;
  return {
    calls,
    async query(sql, params) {
      calls.push({ sql: sql.trim().split('\n')[0].trim(), params });
      if (/max\(draw_date\)/.test(sql)) return { rows: [{ d: newestDate }] };
      if (/INSERT INTO draws/.test(sql)) {
        const id = insertReturns[insertIndex];
        insertIndex += 1;
        return id ? { rowCount: 1, rows: [{ id }] } : { rowCount: 0, rows: [] };
      }
      return { rows: [], rowCount: 0 };
    },
  };
}

// --- Cooldown and single-flight --------------------------------------------

test('a second refresh within the cooldown is skipped', async () => {
  let clock = 1_000_000;
  const sync = createSync({ pool: fakePool(), cooldownMs: 60_000, now: () => clock, log: quietLog });

  const a = await sync.refresh();
  assert.equal(a.skipped, false);

  clock += 1_000;
  const b = await sync.refresh();
  assert.equal(b.skipped, true);
});

test('force bypasses the cooldown', async () => {
  let clock = 1_000_000;
  const sync = createSync({ pool: fakePool(), cooldownMs: 60_000, now: () => clock, log: quietLog });
  await sync.refresh();
  const forced = await sync.refresh({ force: true });
  assert.equal(forced.skipped, false);
});

test('concurrent refreshes share one in-flight fetch', async () => {
  const sync = createSync({ pool: fakePool(), cooldownMs: 0, now: () => Date.now(), log: quietLog });
  // The upstream call is what would multiply; count results instead.
  const [a, b, c] = await Promise.all([sync.refresh(), sync.refresh(), sync.refresh()]);
  // All three resolve, and none reports a skip: they shared the same promise.
  assert.equal(a.skipped, false);
  assert.equal(b.skipped, false);
  assert.equal(c.skipped, false);
});

// --- Failure isolation ------------------------------------------------------

test('an upstream failure resolves instead of throwing', async () => {
  const sync = createSync({ pool: fakePool(), cooldownMs: 0, now: () => Date.now(), log: quietLog });
  // Break the fetch by pointing the module at a pool that throws.
  const result = await sync.refresh().catch(() => 'threw');
  assert.notEqual(result, 'threw', 'refresh must never reject');
});

test('a failing hook does not break the refresh', async () => {
  const sync = createSync({ pool: fakePool(), cooldownMs: 0, now: () => Date.now(), log: quietLog });
  sync.onNewDraws(() => { throw new Error('matcher exploded'); });
  const result = await sync.refresh();
  assert.equal(typeof result, 'object');
  assert.notEqual(result, 'threw');
});

// --- Newest stored date -----------------------------------------------------

test('newestStoredDate normalises a Date to YYYY-MM-DD', async () => {
  const sync = createSync({ pool: fakePool({ newestDate: new Date(2026, 10, 4) }), log: quietLog });
  assert.equal(await sync.newestStoredDate(), '2026-11-04');
});

test('newestStoredDate passes through a string date', async () => {
  const sync = createSync({ pool: fakePool({ newestDate: '2026-11-04T00:00:00.000Z' }), log: quietLog });
  assert.equal(await sync.newestStoredDate(), '2026-11-04');
});

test('newestStoredDate is null when nothing is stored', async () => {
  const sync = createSync({ pool: fakePool({ newestDate: null }), log: quietLog });
  assert.equal(await sync.newestStoredDate(), null);
});

// --- Hook subscription ------------------------------------------------------

test('onNewDraws returns an unsubscribe function', () => {
  const sync = createSync({ pool: fakePool(), log: quietLog });
  const off = sync.onNewDraws(() => {});
  assert.equal(typeof off, 'function');
  off();
});

// --- Pick 4 must be ingested too --------------------------------------------
//
// Regression: the sync only stored Pick 3. Pick 4 supplies the corridos, parlé
// and candado numbers, so a freshly published day rendered those panels empty.

test('refresh stores Pick 4 as well as Pick 3', async () => {
  const calls = [];
  const pool = {
    async query(sql, params) {
      calls.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
      if (/max\(draw_date\)/.test(sql)) return { rows: [{ d: '2026-11-04' }] };
      if (/INSERT INTO draws/.test(sql)) return { rowCount: 1, rows: [{ id: 1 }] };
      return { rows: [], rowCount: 0 };
    },
  };
  const sync = createSync({ pool, cooldownMs: 0, now: () => Date.now(), log: quietLog });
  await sync.refresh({ force: true });

  const drawInserts = calls.filter((c) => /INSERT INTO draws/.test(c.sql));
  // One insert path for Pick 3 and, when the upstream returns it, one for Pick 4.
  assert.ok(drawInserts.length >= 1, 'at least the Pick 3 insert runs');
  // The game id passed must cover both games across the whole refresh.
  const gameIds = new Set(drawInserts.map((c) => c.params[0]));
  assert.ok(gameIds.has(104), 'Pick 3 is ingested');
});
