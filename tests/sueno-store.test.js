// Tests for the persistence of dream signals (S2, S3).
//
// A fake pool answers the SQL shapes the module uses and records every
// statement, so the properties that matter are observable from outside: one
// envelope plus its signals land in one transaction, a failure rolls the whole
// dream back, and the coincidence readers only count — they never hand back
// another dream's signals.

import test from 'node:test';
import assert from 'node:assert/strict';

import { guardarSueno, contarSenales, suenosParecidos } from '../src/sueno/store.js';

const ID = '11111111-1111-1111-1111-111111111111';

const SENALES = [
  { nombre: 'agua', peso: 0.9, numeros: [9, 33] },
  { nombre: 'pez', peso: 0.4, numeros: [9] },
  { nombre: 'camino', peso: 0.3, numeros: [44] },
];

/**
 * A pool whose transaction is visible: every statement of the client is
 * recorded in order, and `failOn` makes one signal insert blow up.
 */
function fakePool({ failOn = null, read = () => [] } = {}) {
  const statements = [];
  const reads = [];
  let released = 0;

  const client = {
    async query(sql, params = []) {
      const text = String(sql).trim();
      statements.push({ sql: text, params });
      if (/^begin$/i.test(text) || /^commit$/i.test(text) || /^rollback$/i.test(text)) {
        return { rows: [] };
      }
      if (/insert into suenos/i.test(text)) return { rows: [{ id: ID }] };
      if (/insert into sueno_senales/i.test(text)) {
        if (failOn && params[1] === failOn) throw new Error('boom');
        return { rows: [] };
      }
      throw new Error(`unexpected transaction SQL: ${text}`);
    },
    release() { released += 1; },
  };

  return {
    statements,
    reads,
    get released() { return released; },
    async connect() { return client; },
    async query(sql, params = []) {
      const text = String(sql).trim();
      reads.push({ sql: text, params });
      return { rows: read(text, params) };
    },
  };
}

test('a dream is one envelope plus its signals in one transaction', async () => {
  const pool = fakePool();

  const result = await guardarSueno(pool, { senales: SENALES, userId: 7, modelo: 'fake-model' });

  assert.deepEqual(result, { id: ID });
  assert.deepEqual(pool.statements.map((s) => s.sql), [
    'begin',
    pool.statements[1].sql,
    pool.statements[2].sql,
    pool.statements[3].sql,
    pool.statements[4].sql,
    'commit',
  ]);
  assert.match(pool.statements[1].sql, /insert into suenos/i);
  assert.deepEqual(pool.statements[1].params, [7, 'fake-model', 1]);

  const stored = pool.statements.slice(2, 5).map((s) => s.params);
  assert.deepEqual(stored, [
    [ID, 'agua', [9, 33], 0.9],
    [ID, 'pez', [9], 0.4],
    [ID, 'camino', [44], 0.3],
  ]);
  assert.equal(pool.released, 1);
});

test('the dream text never reaches the store', async () => {
  const pool = fakePool();
  await guardarSueno(pool, { senales: [{ nombre: 'agua', peso: 1, numeros: [9] }] });

  const everything = JSON.stringify(pool.statements);
  assert.doesNotMatch(everything, /soñé|soné|sof\u00e9/i);
  assert.equal(pool.statements.some((s) => /texto|text/i.test(s.sql)), false);
});

test('a failing signal rolls the whole dream back', async () => {
  const pool = fakePool({ failOn: 'pez' });

  await assert.rejects(() => guardarSueno(pool, { senales: SENALES }), /boom/);

  const sql = pool.statements.map((s) => s.sql);
  assert.ok(sql.includes('rollback'), 'the partial dream is discarded');
  assert.equal(sql.includes('commit'), false);
  assert.equal(pool.released, 1);
});

test('empty signals throw before touching the database', async () => {
  const pool = fakePool();

  await assert.rejects(
    () => guardarSueno(pool, { senales: [] }),
    (err) => err.code === 'sueno_sin_senales',
  );
  await assert.rejects(
    () => guardarSueno(pool, {}),
    (err) => err.code === 'sueno_sin_senales',
  );
  assert.equal(pool.statements.length, 0);
  assert.equal(pool.reads.length, 0);
});

test('the weekly counter counts distinct dreams per signal', async () => {
  const pool = fakePool({
    read: () => [{ senal: 'agua', suenos: '3' }, { senal: 'pez', suenos: 2 }],
  });

  const rows = await contarSenales(pool);

  assert.deepEqual(rows, [{ senal: 'agua', suenos: 3 }, { senal: 'pez', suenos: 2 }]);
  assert.equal(typeof rows[0].suenos, 'number');

  const [query] = pool.reads;
  assert.match(query.sql, /count\(distinct s\.sueno_id\)/i, 'two dreams with the same signal count once');
  assert.match(query.sql, /make_interval\(days => \$1\)/i, 'the window is the last days');
  assert.match(query.sql, /order by suenos desc, s\.senal asc/i, 'most frequent first, then alphabetical');
  assert.match(query.sql, /limit \$2/i);
  assert.deepEqual(query.params, [7, 12], 'seven days and twelve signals by default');
});

test('the window and the limit of the counter are the ones asked for', async () => {
  const pool = fakePool({ read: () => [] });
  await contarSenales(pool, { dias: 30, limite: 5 });
  assert.deepEqual(pool.reads[0].params, [30, 5]);
});

test('similar dreams exclude the dream itself and respect the minimum', async () => {
  const pool = fakePool({
    read: () => [
      { suenoId: 'a', compartidas: '3', total: '2' },
      { suenoId: 'b', compartidas: 2, total: 2 },
    ],
  });

  const out = await suenosParecidos(pool, {
    suenoId: 'self-id',
    senales: ['agua', 'pez'],
    dias: 7,
    minimo: 2,
  });

  assert.deepEqual(out, {
    total: 2,
    muestra: [{ suenoId: 'a', compartidas: 3 }, { suenoId: 'b', compartidas: 2 }],
  });

  const [query] = pool.reads;
  assert.match(query.sql, /d\.id <> \$1/i, 'the dream being analysed is not its own coincidence');
  assert.match(query.sql, /having count\(distinct s\.senal\) >= \$4/i);
  assert.match(query.sql, /order by compartidas desc/i, 'the closest dreams come first');
  assert.match(query.sql, /limit 5/i, 'the sample is capped');
  assert.deepEqual(query.params, ['self-id', ['agua', 'pez'], 7, 2]);
});

test('another dream is only ever a count, never its signals', async () => {
  const pool = fakePool({ read: () => [{ suenoId: 'a', compartidas: 2, total: 1 }] });
  const out = await suenosParecidos(pool, { suenoId: 'self-id', senales: ['agua', 'pez'] });

  for (const row of out.muestra) {
    assert.deepEqual(Object.keys(row).sort(), ['compartidas', 'suenoId']);
  }
  assert.doesNotMatch(JSON.stringify(out), /agua|pez/);
});

test('no signals to compare is no coincidence, without a query', async () => {
  const pool = fakePool();
  assert.deepEqual(await suenosParecidos(pool, { suenoId: 'self-id', senales: [] }), {
    total: 0,
    muestra: [],
  });
  assert.equal(pool.reads.length, 0);
});
