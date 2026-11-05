// Tests for POST /api/sueno and GET /api/sueno/senales (S2, S4, S7).
//
// The handler is called directly with fake request, response, pool and service,
// the same way tests/significados-route.test.js does: the contract the client
// receives is pinned without a port or a database. What matters here is the
// gate (a linked account), the size limits, the shape of the answer with the
// artwork of the chosen numbers, and that the POST is reachable without opening
// POST on every other path.

import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';

import { handleApi } from '../src/http/routes.js';
import { createSessionToken } from '../src/auth/session.js';
import { getFicha } from '../src/content/charada.js';

const SECRET = 'sueno-route-test-secret';
const DREAM = 'Soñé que un caballo bebia agua del mar y me miraba.';

let previousSecret;
before(() => {
  previousSecret = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = SECRET;
});
after(() => {
  if (previousSecret === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = previousSecret;
});

function sessionCookie() {
  const token = createSessionToken({ uuid: 'uuid-1', username: 'erich' }, SECRET);
  return { cookie: `charada_sesion=${token}` };
}

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

/** A request whose body can be walked the way the route walks it. */
function fakeReq({ method = 'POST', headers = {}, body } = {}) {
  return {
    method,
    headers,
    async *[Symbol.asyncIterator]() {
      if (body !== undefined) yield Buffer.from(body);
    },
  };
}

/** The pool only answers the one read the route needs before storing. */
function fakePool() {
  const queries = [];
  return {
    queries,
    async query(sql, params = []) {
      queries.push({ sql: String(sql), params });
      if (/from users where qvapay_uuid/i.test(sql)) return { rows: [{ id: 7 }] };
      return { rows: [] };
    },
  };
}

const RESULT = {
  senales: [
    { nombre: 'agua', peso: 0.9, numeros: [9, 33] },
    { nombre: 'caballo', peso: 0.6, numeros: [9] },
  ],
  numeros: [9, 33],
  soporte: [
    { numero: 9, senales: ['agua', 'caballo'] },
    { numero: 33, senales: ['agua'] },
  ],
  coincidencias: {
    senales: [{ senal: 'agua', suenos: 2 }],
    parecidos: { total: 1, muestra: [{ suenoId: 'otro', compartidas: 2 }] },
  },
};

function fakeService({ configured = true, result = RESULT, error = null } = {}) {
  const calls = [];
  const asked = [];
  return {
    configured,
    model: 'fake-model',
    calls,
    asked,
    async analizar(input) {
      calls.push(input);
      if (error) throw error;
      return result;
    },
    async senales({ dias }) {
      asked.push(dias);
      return [{ senal: 'agua', suenos: 2 }];
    },
  };
}

const body = (value) => JSON.stringify({ sueno: value });

async function call(path, { method = 'POST', headers = {}, payload, service, pool = fakePool() } = {}) {
  const res = fakeRes();
  const req = fakeReq({ method, headers, body: payload });
  const handled = await handleApi(req, res, new URL(`http://localhost${path}`), pool, {
    sueno: service ?? fakeService(),
  });
  assert.equal(handled, true, 'the route must claim the request');
  return { res, pool, json: res.body === '' ? null : JSON.parse(res.body) };
}

test('a dream without a linked account is refused before anything else (S7)', async () => {
  const service = fakeService();
  const { res, json, pool } = await call('/api/sueno', { payload: body(DREAM), service });

  assert.equal(res.status, 401);
  assert.deepEqual(json, { error: 'cuenta_requerida' });
  assert.deepEqual(service.calls, [], 'the model is never called for a stranger');
  assert.equal(pool.queries.length, 0);
});

test('an empty dream is refused', async () => {
  const service = fakeService();
  const { res, json } = await call('/api/sueno', {
    payload: body('   '), headers: sessionCookie(), service,
  });

  assert.equal(res.status, 400);
  assert.deepEqual(json, { error: 'sueno_vacio' });
  assert.deepEqual(service.calls, []);
});

test('a dream over two thousand characters is refused', async () => {
  const service = fakeService();
  const { res, json } = await call('/api/sueno', {
    payload: body('a'.repeat(2001)), headers: sessionCookie(), service,
  });

  assert.equal(res.status, 413);
  assert.deepEqual(json, { error: 'sueno_largo' });
  assert.deepEqual(service.calls, []);
});

test('a body over four thousand bytes is refused before it is parsed', async () => {
  const service = fakeService();
  const { res, json } = await call('/api/sueno', {
    payload: body('a'.repeat(5000)), headers: sessionCookie(), service,
  });

  assert.equal(res.status, 413);
  assert.deepEqual(json, { error: 'sueno_largo' });
  assert.deepEqual(service.calls, []);
});

test('the answer carries the set, the coincidences and the artwork (S4, S5)', async () => {
  const service = fakeService();
  const { res, json } = await call('/api/sueno', {
    payload: body(DREAM), headers: sessionCookie(), service,
  });

  assert.equal(res.status, 200);
  assert.deepEqual(json.senales, RESULT.senales);
  assert.deepEqual(json.numeros, [9, 33]);
  assert.deepEqual(json.soporte, RESULT.soporte);
  assert.deepEqual(json.coincidencias, RESULT.coincidencias);

  // One entry per chosen number, with the same art the Significados screens use.
  assert.deepEqual(json.elementos.map((row) => row.numero), [9, 33]);
  const ficha = await getFicha(9);
  assert.equal(json.elementos[0].significado, ficha.principal);
  assert.equal(json.elementos[0].icono, ficha.icon);
  for (const row of json.elementos) {
    assert.match(row.icono, /^\/significados\/\d{2,3}\//);
  }
});

test('the route hands the account id and the written dream to the service', async () => {
  const service = fakeService();
  await call('/api/sueno', {
    payload: body(`  ${DREAM}  `), headers: sessionCookie(), service,
  });

  assert.deepEqual(service.calls, [{ texto: DREAM, userId: 7 }]);
});

test('without a configured provider the answer is 503 and nothing is stored', async () => {
  const service = fakeService({ configured: false });
  const { res, json } = await call('/api/sueno', {
    payload: body(DREAM), headers: sessionCookie(), service,
  });

  assert.equal(res.status, 503);
  assert.deepEqual(json, { error: 'no_configurado' });
  assert.deepEqual(service.calls, []);
});

test('a provider failure keeps its machine code', async () => {
  const error = new Error('no answer in 30000 ms');
  error.code = 'llm_timeout';
  const service = fakeService({ error });
  const { res, json } = await call('/api/sueno', {
    payload: body(DREAM), headers: sessionCookie(), service,
  });

  assert.equal(res.status, 502);
  assert.deepEqual(json, { error: 'llm_timeout' });
});

test('the weekly counter answers alone and is revalidable', async () => {
  const service = fakeService();
  const { res, json } = await call('/api/sueno/senales?dias=3', {
    method: 'GET', headers: sessionCookie(), service,
  });

  assert.equal(res.status, 200);
  assert.deepEqual(json, { dias: 3, senales: [{ senal: 'agua', suenos: 2 }] });
  assert.deepEqual(service.asked, [3]);
  assert.equal(res.headers['cache-control'], 'no-cache');
  assert.match(res.headers.etag, /^W\/"[A-Za-z0-9_-]+"$/);
});

test('the counter defaults to the week', async () => {
  const service = fakeService();
  const { json } = await call('/api/sueno/senales', { method: 'GET', service });
  assert.equal(json.dias, 7);
  assert.deepEqual(service.asked, [7]);
});

test('a broken pool answers 500 instead of crashing the route', async () => {
  const service = fakeService();
  const pool = {
    async query() { throw new Error('invalid input syntax for type uuid'); },
  };
  const { res, json } = await call('/api/sueno', {
    payload: body(DREAM), headers: sessionCookie(), service, pool,
  });

  assert.equal(res.status, 500);
  assert.deepEqual(json, { error: 'internal_error' });
  assert.deepEqual(service.calls, []);
});

// PRESERVE: the POST is the only path that opened. Everything else stays GET-only.
test('other non-GET paths still answer 405', async () => {
  for (const path of ['/api/significados', '/api/sueno/senales', '/api/tiro']) {
    const { res, json } = await call(path, { payload: body(DREAM) });
    assert.equal(res.status, 405, path);
    assert.deepEqual(json, { error: 'method_not_allowed' }, path);
  }
});
