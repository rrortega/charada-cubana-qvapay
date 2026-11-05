// Tests for the /api/analisis route.
//
// The table runs from 1 to 100, while a draw is matched by its last two digits.
// These cases pin that bridge — entry 100 analyses the "00" draws — and the
// bounds, which used to accept 0 and reject 100.

import test from 'node:test';
import assert from 'node:assert/strict';

import { handleApi } from '../src/http/routes.js';

function fakeRes() {
  return {
    status: null,
    headers: null,
    body: '',
    writeHead(status, headers) { this.status = status; this.headers = headers; return this; },
    end(chunk) { if (chunk !== undefined) this.body += chunk; return this; },
  };
}

/** The only query the route needs is the cargador history; empty is enough. */
const emptyPool = { query: async () => ({ rows: [] }) };

async function call(query) {
  const res = fakeRes();
  const handled = await handleApi(
    { method: 'GET', headers: {} },
    res,
    new URL(`http://localhost/api/analisis${query}`),
    emptyPool,
  );
  assert.equal(handled, true, 'the route must claim the request');
  return { res, json: res.body === '' ? null : JSON.parse(res.body) };
}

test('entry 1 is accepted', async () => {
  const { res, json } = await call('?numero=1');
  assert.equal(res.status, 200);
  assert.equal(json.target, 1);
  assert.ok(json.significado, 'entry 1 has a symbol');
});

test('entry 100 is accepted and analysed as the 00 draws', async () => {
  const { res, json } = await call('?numero=100');
  assert.equal(res.status, 200);
  assert.equal(json.target, 100, 'the screen shows the table entry');
  assert.equal(json.significado, 'Inodoro');
});

test('entry 0 is refused: the table starts at 1', async () => {
  const { res } = await call('?numero=0');
  assert.equal(res.status, 400);
});

test('an entry above 100 is refused', async () => {
  const { res } = await call('?numero=101');
  assert.equal(res.status, 400);
});

test('a non-numeric entry is refused', async () => {
  for (const raw of ['abc', '', '1.5', '-3']) {
    const { res } = await call(`?numero=${raw}`);
    assert.equal(res.status, 400, `numero=${raw}`);
  }
});
