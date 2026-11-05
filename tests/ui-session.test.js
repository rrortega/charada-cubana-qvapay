// Tests for the session the browser sends with every request.
//
// The finding that motivated these (R3-1, reliability lens): the module added a
// Bearer-token fallback, but the app's own requests never sent it, so the
// fallback was dead code exactly when third-party cookies are dropped. The second
// test is deliberately structural: public/app.js cannot be imported without a
// DOM, and what has to be pinned is the wiring, not the helper.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { restoreSession, authHeaders, clearSession } from '../src/ui/session.js';

function fakeStorage(value = null) {
  let stored = value;
  return {
    getItem: () => stored,
    setItem: (_key, next) => { stored = next; },
    removeItem: () => { stored = null; },
  };
}

const noFetch = async () => ({ ok: true, json: async () => ({}) });

test('authHeaders adds the Bearer token when a session was restored', () => {
  restoreSession({
    storage: fakeStorage(JSON.stringify({ token: 'tok-123', uuid: 'u-1', username: 'mayo' })),
  });
  assert.deepEqual(authHeaders({ accept: 'application/json' }), {
    accept: 'application/json',
    authorization: 'Bearer tok-123',
  });
});

test('authHeaders leaves the request untouched without a session', async () => {
  await clearSession({ storage: fakeStorage(), fetchImpl: noFetch });
  assert.deepEqual(authHeaders({ accept: 'application/json' }), { accept: 'application/json' });
});

test('getJson sends the session headers and the cookie', async () => {
  const source = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const start = source.indexOf('async function getJson');
  assert.ok(start !== -1, 'getJson moved: update this test with it');
  const body = source.slice(start, start + 400);

  assert.match(body, /authHeaders\(/, 'getJson must send the session headers');
  assert.match(body, /credentials: 'include'/, 'getJson must send cookies too');
});
