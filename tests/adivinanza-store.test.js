// Tests for the persistence of the daily adivinanza.
//
// Three properties are worth pinning and none of them needs a network or a
// database: a target date is seeded by the draw of the day before (S11), the
// stored text wins and is stored only once (S2), and the number the text
// evokes is provenance, never output (S10).
//
// A fake pool answers the two SQL shapes the module uses, and a fake provider
// counts its calls, so concurrency and retries are observable from outside.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createAdivinanzaService, addDays } from '../src/adivinanza/store.js';

// Neither text names a meaning of the day, and both are long enough for the
// quality filter (40..600 characters).
const CLEAN = 'El de la memoria larga le guardó la cuenta al callado del patio.';
const OTHER = 'El orejón que nunca se olvida bailó con el que ya no respira.';
const LEAKY = 'El elefante se comió la tarde entera sin pedir permiso a nadie.';

const CARGADOR = {
  complete: true,
  drawType: 'EVENING',
  fijo: { value: 982, digits: [9, 8, 2] },
  charada: { value: 82 },
  corridos: [{ value: 30 }, { value: 12 }],
};

const MEANINGS = new Map([[9, 'Elefante'], [82, 'Muerto'], [30, 'Soga'], [12, 'Pelota']]);
const meaningOf = async (n) => MEANINGS.get(n) ?? null;

const quiet = { warn() {} };

/** A pool holding rows by date, and recording the inserts it receives. */
function fakePool(initial = []) {
  const rows = new Map(initial.map((row) => [String(row.date).slice(0, 10), row]));
  const inserts = [];

  return {
    rows,
    inserts,
    async query(sql, params = []) {
      if (/^\s*select/i.test(sql) && /from adivinanzas/i.test(sql)) {
        // Two shapes: one date, and the newest-first history list.
        if (/where date = \$1/i.test(sql)) {
          const row = rows.get(String(params[0]).slice(0, 10));
          return { rows: row ? [{ ...row }] : [] };
        }
        const newest = [...rows.values()]
          .sort((a, b) => String(b.date).localeCompare(String(a.date)))
          .slice(0, Number(params[0]) || 30);
        return { rows: newest.map((row) => ({ ...row })) };
      }
      if (/insert\s+into\s+adivinanzas/i.test(sql)) {
        const [date, texto, fijo, sourceDate] = params;
        inserts.push({ date, texto, fijo, sourceDate });
        if (rows.has(date)) return { rows: [] };
        const row = { date, texto, fijo, generated_at: new Date('2026-11-05T12:00:00Z') };
        rows.set(date, row);
        return { rows: [{ ...row }] };
      }
      throw new Error(`unexpected SQL: ${sql}`);
    },
  };
}

/** Draws published only for the dates given; everything else is an empty day. */
function drawsFor(dates) {
  const asked = [];
  const load = async (date) => {
    asked.push(date);
    const published = dates.includes(date);
    return {
      date,
      midday: null,
      evening: published ? { ...CARGADOR, date } : null,
      available: published,
    };
  };
  load.asked = asked;
  return load;
}

/** A provider that replays answers in order and records every message it saw. */
function fakeLlm(answers, { configured = true } = {}) {
  const calls = [];
  return {
    configured,
    model: 'fake',
    calls,
    async complete(messages) {
      calls.push(messages);
      return answers[Math.min(calls.length - 1, answers.length - 1)];
    },
  };
}

function build({ pool = fakePool(), llm, loadDraws = drawsFor(['2026-11-04']) } = {}) {
  return createAdivinanzaService({ pool, llm, loadDraws, meaningOf, log: quiet });
}

test('a target date is seeded by the draw of the day before (S11)', async () => {
  const pool = fakePool();
  const llm = fakeLlm([CLEAN]);
  const loadDraws = drawsFor(['2026-11-04']);
  const service = build({ pool, llm, loadDraws });

  const result = await service.ensure('2026-11-05');

  assert.deepEqual(loadDraws.asked, ['2026-11-04'], 'the source day is the previous one');
  assert.match(llm.calls[0].user, /2026-11-04/, 'the prompt describes the draw that seeds it');
  assert.equal(result.status, 'generated');
  assert.equal(result.adivinanza.date, '2026-11-05');
  assert.equal(result.adivinanza.texto, CLEAN);

  assert.equal(pool.inserts.length, 1);
  assert.equal(pool.inserts[0].date, '2026-11-05', 'the row is dated by its target day');
  assert.equal(pool.inserts[0].sourceDate, '2026-11-04');
  assert.equal(pool.inserts[0].texto, CLEAN);
  assert.equal(pool.rows.get('2026-11-05').date, '2026-11-05');
});

test('a second ask for one date returns the stored text and asks nothing (S2)', async () => {
  const pool = fakePool();
  const llm = fakeLlm([CLEAN]);
  const service = build({ pool, llm });

  const first = await service.ensure('2026-11-05');
  const second = await service.ensure('2026-11-05');

  assert.equal(llm.calls.length, 1);
  assert.equal(pool.inserts.length, 1);
  assert.equal(second.status, 'stored');
  assert.equal(second.adivinanza.texto, first.adivinanza.texto);
  assert.equal(second.adivinanza.date, '2026-11-05');
});

test('a target day whose previous day has no draw answers sin_tiro and stores nothing', async () => {
  const pool = fakePool();
  const llm = fakeLlm([CLEAN]);
  // The target day has a draw of its own; the source day does not.
  const loadDraws = drawsFor(['2026-11-05']);
  const service = build({ pool, llm, loadDraws });

  const result = await service.ensure('2026-11-05');

  assert.deepEqual(loadDraws.asked, ['2026-11-04']);
  assert.equal(result.status, 'sin_tiro');
  assert.equal(llm.calls.length, 0);
  assert.equal(pool.inserts.length, 0);
  assert.equal(pool.rows.size, 0);
});

test('two concurrent asks for one date spend one model call', async () => {
  const pool = fakePool();
  const llm = fakeLlm([CLEAN]);
  const service = build({ pool, llm });

  const [a, b] = await Promise.all([
    service.ensure('2026-11-05'),
    service.ensure('2026-11-05'),
  ]);

  assert.equal(llm.calls.length, 1);
  assert.equal(pool.inserts.length, 1);
  assert.equal(a.adivinanza.texto, CLEAN);
  assert.equal(b.adivinanza.texto, CLEAN);
});

test('without a provider the answer is unconfigured and nothing is asked', async () => {
  const pool = fakePool();
  const llm = fakeLlm([CLEAN], { configured: false });
  const service = build({ pool, llm });

  const result = await service.ensure('2026-11-05');

  assert.equal(result.status, 'unconfigured');
  assert.equal(llm.calls.length, 0);
  assert.equal(pool.inserts.length, 0);
});

test('a text that names a meaning buys one retry with the words banned (S9)', async () => {
  const pool = fakePool();
  const llm = fakeLlm([LEAKY, OTHER]);
  const service = build({ pool, llm });

  const result = await service.ensure('2026-11-05');

  assert.equal(llm.calls.length, 2);
  assert.match(llm.calls[1].user, /No escribas estas palabras/, 'the retry carries the ban');
  assert.match(llm.calls[1].user, /Elefante/);
  assert.equal(result.adivinanza.texto, OTHER);
  assert.equal(pool.inserts[0].texto, OTHER);
  assert.equal(pool.rows.get('2026-11-05').texto, OTHER);
});

test('the evoked number is recorded as provenance and never returned (S10)', async () => {
  const pool = fakePool();
  const llm = fakeLlm([CLEAN]);
  const service = build({ pool, llm });

  const result = await service.ensure('2026-11-05');
  const recent = await service.recent();

  assert.equal(pool.inserts[0].fijo, 982, 'the column keeps the source fijo');
  assert.equal('fijo' in result.adivinanza, false);
  assert.equal('fijo' in recent[0], false);
  assert.deepEqual(Object.keys(result.adivinanza).sort(), ['date', 'generatedAt', 'texto']);
});

test('the date helper crosses month, year and leap-day bounds', () => {
  assert.equal(addDays('2026-11-05', -1), '2026-11-04');
  assert.equal(addDays('2026-11-30', 1), '2026-12-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2028-03-01', -1), '2028-02-29');
  assert.equal(addDays('2027-01-01', -1), '2026-12-31');
});
