// Tests for the /api/adivinanza and /api/adivinanzas routes.
//
// The handler is called directly with fake request, response and service, the
// same way tests/significados-route.test.js does: the contract the client
// receives is pinned without a port or a database. What matters here is the
// shape of the payload — above all that the number never reaches the client
// (S10) — and the default date, the riddle for the next draw (S12).

import test from 'node:test';
import assert from 'node:assert/strict';

import { handleApi } from '../src/http/routes.js';

/** Minimal response double: records status, headers and body. */
function fakeRes() {
  return {
    status: null,
    headers: null,
    body: '',
    writeHead(status, headers) {
      this.status = status;
      this.headers = headers;
      return this;
    },
    end(chunk) {
      if (chunk !== undefined) this.body += chunk;
      return this;
    },
  };
}

const req = (headers = {}) => ({ method: 'GET', headers });

// The routes only need the latest draw date to resolve a default, and an empty
// draw list for the tiros screen; the service itself is injected.
const pool = {
  async query(sql) {
    if (/max\(date\)/i.test(sql)) return { rows: [{ d: '2026-11-04' }] };
    if (/from cargadores c/i.test(sql)) return { rows: [] };
    throw new Error(`unexpected SQL: ${sql}`);
  },
};

/** A service double that records the dates the route asks for. */
function fakeService({ result, history = [] } = {}) {
  const asked = [];
  return {
    asked,
    async ensure(date) {
      asked.push(date);
      return typeof result === 'function' ? result(date) : result;
    },
    async recent() {
      return history;
    },
  };
}

const STORED = {
  status: 'stored',
  adivinanza: { date: '2026-11-05', texto: 'El de la memoria larga guardó la cuenta.', fijo: 982 },
};

async function call(path, { service = fakeService({ result: STORED }) } = {}) {
  const res = fakeRes();
  const handled = await handleApi(req(), res, new URL(`http://localhost${path}`), pool, {
    adivinanza: service,
  });
  assert.equal(handled, true, 'the route must claim the request');
  return { res, json: res.body === '' ? null : JSON.parse(res.body), service };
}

test('the riddle of the day answers without the number it evokes (S10)', async () => {
  const { res, json } = await call('/api/adivinanza');

  assert.equal(res.status, 200);
  assert.equal(json.disponible, true);
  assert.equal(json.date, '2026-11-05');
  assert.equal(json.texto, STORED.adivinanza.texto);
  assert.equal('fijo' in json, false);
  assert.doesNotMatch(res.body, /fijo|982/);
});

test('with no date it asks for the day after the latest draw (S12)', async () => {
  const { service } = await call('/api/adivinanza');
  assert.deepEqual(service.asked, ['2026-11-05']);
});

test('an explicit date is the target date, untouched (S12)', async () => {
  const { json, service } = await call('/api/adivinanza?fecha=2026-10-01');

  assert.deepEqual(service.asked, ['2026-10-01']);
  assert.equal(json.date, '2026-11-05', 'the stored row answers with its own target date');
});

test('an unavailable riddle says why instead of inventing text (S7)', async () => {
  const service = fakeService({ result: { status: 'sin_tiro' } });
  const { res, json } = await call('/api/adivinanza?fecha=2026-11-05', { service });

  assert.equal(res.status, 200);
  assert.equal(json.disponible, false);
  assert.equal(json.motivo, 'sin_tiro');
  assert.equal(json.date, '2026-11-05');
  assert.equal('texto' in json, false);
  assert.equal('fijo' in json, false);
});

test('a provider error keeps its machine code and no number', async () => {
  const service = fakeService({ result: { status: 'error', code: 'llm_http_500' } });
  const { json } = await call('/api/adivinanza', { service });

  assert.equal(json.disponible, false);
  assert.equal(json.motivo, 'error');
  assert.equal(json.code, 'llm_http_500');
  assert.equal('fijo' in json, false);
});

test('the history rows carry the target date and the text, never the number', async () => {
  const service = fakeService({
    result: STORED,
    history: [
      { date: '2026-11-04', texto: 'El orejón que nunca se olvida.', fijo: 982, generatedAt: null },
      { date: '2026-11-03', texto: 'El callado del patio.', fijo: 100, generatedAt: null },
    ],
  });
  const { res, json } = await call('/api/adivinanzas', { service });

  assert.equal(res.status, 200);
  assert.deepEqual(json.items.map((row) => row.date), ['2026-11-04', '2026-11-03']);
  assert.equal(json.items[0].texto, 'El orejón que nunca se olvida.');
  for (const row of json.items) {
    assert.equal('fijo' in row, false, `row ${row.date} must not reveal the number`);
  }
  assert.doesNotMatch(res.body, /fijo|982/);
});

test('a date that is not a calendar date is refused', async () => {
  const service = fakeService({ result: STORED });
  const { res } = await call('/api/adivinanza?fecha=2026-02-31', { service });

  assert.equal(res.status, 400);
  assert.deepEqual(service.asked, [], 'an invalid date never reaches the service');
});

// PRESERVE: the tiros screen shares this handler and the same warm-up path, and
// must keep answering the draw of the date it was asked for.
test('the tiros screen still answers its draw and warms the riddle that follows it', async () => {
  const service = fakeService({ result: STORED });
  const res = fakeRes();

  await handleApi(
    req(), res, new URL('http://localhost/api/tiro?fecha=2026-11-04'), pool, { adivinanza: service },
  );

  assert.equal(res.status, 200);
  const json = JSON.parse(res.body);
  assert.equal(json.date, '2026-11-04', 'the draw screen keeps its own date');
  assert.equal(json.available, false);
  assert.deepEqual(service.asked, ['2026-11-05'], 'the warm-up targets the riddle of that draw');
});
