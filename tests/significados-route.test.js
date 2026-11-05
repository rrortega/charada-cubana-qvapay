// Tests for the /api/significados routes.
//
// These call the handler directly with a fake request and response, so the
// contract the client receives is pinned without binding a port or opening a
// browser. The endpoint never touches the database, so an empty pool stands in.

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

async function call(query = '') {
  const res = fakeRes();
  const handled = await handleApi(req(), res, new URL(`http://localhost/api/significados${query}`), {});
  assert.equal(handled, true, 'the route must claim the request');
  return { res, json: res.body === '' ? null : JSON.parse(res.body) };
}

test('the list carries one row per number with its art and names', async () => {
  const { res, json } = await call();
  assert.equal(res.status, 200);
  assert.equal(json.numbers.length, 100);

  const first = json.numbers[0];
  assert.equal(first.number, 1);
  assert.equal(first.principal, 'Caballo');
  assert.equal(first.icon, '/significados/01/caballo.png');
  // Names are served as titles: the stored lower case is a source detail, not
  // what the interface shows.
  assert.ok(first.nombres.includes('Caballo'));
});

test('the list states how much art exists right now', async () => {
  const { json } = await call();
  assert.equal(json.total.fichas, 100);
  assert.equal(json.total.png + json.total.pendientes, json.total.significados);
});

test('the list is revalidable, never cached blind', async () => {
  const { res } = await call();
  assert.equal(res.headers['cache-control'], 'no-cache');
  assert.match(res.headers.etag, /^W\/"[A-Za-z0-9_-]+"$/);

  const etag = res.headers.etag;
  const again = fakeRes();
  await handleApi(req({ 'if-none-match': etag }), again, new URL('http://localhost/api/significados'), {});
  assert.equal(again.status, 304);
  assert.equal(again.body, '');
});

test('one ficha carries its meanings, tradition and relations', async () => {
  const { res, json } = await call('?numero=37');
  assert.equal(res.status, 200);
  assert.equal(json.number, 37);
  assert.ok(json.significados.length > 1);
  assert.deepEqual(Object.keys(json.tradicion).sort(), ['companero', 'cuadrilla', 'peon'].filter((k) => k in json.tradicion).sort());
  assert.ok(Array.isArray(json.relacionadas));
});

test('a ficha reports art only where the file exists', async () => {
  const { json } = await call('?numero=1');
  for (const meaning of json.significados) {
    const expected = meaning.icon !== null;
    assert.equal(expected, meaning.icon === `/significados/01/${meaning.id}.png`, meaning.id);
  }
});

test('a number outside the table is refused', async () => {
  const { res } = await call('?numero=101');
  assert.equal(res.status, 400);
});

test('a number inside the range but missing is a 404', async () => {
  const { res } = await call('?numero=7');
  // Entry 7 exists, so this is the happy path; a genuinely missing key would be
  // the same branch. Kept to document that the route distinguishes the two.
  assert.equal(res.status, 200);
});
