// Tests for the conditional caching of the content endpoints.
//
// The point of the contract: the browser may keep the payload, but it has to
// ask again. A long max-age on a payload whose shape follows the code turns a
// deploy into a client crash, which is exactly what these tests prevent.

import test from 'node:test';
import assert from 'node:assert/strict';

import { sendRevalidatedJson } from '../src/http/routes.js';

/** Minimal response double: records what the handler wrote. */
function fakeRes() {
  return {
    status: null,
    headers: null,
    body: '',
    ended: false,
    writeHead(status, headers) {
      this.status = status;
      this.headers = headers;
      return this;
    },
    end(chunk) {
      this.ended = true;
      if (chunk !== undefined) this.body += chunk;
      return this;
    },
  };
}

const req = (headers = {}) => ({ headers });

test('a first request sends the payload with a weak etag and revalidation', () => {
  const res = fakeRes();
  sendRevalidatedJson(req(), res, { items: [1, 2, 3] });
  assert.equal(res.status, 200);
  assert.equal(res.headers['cache-control'], 'no-cache');
  assert.match(res.headers.etag, /^W\/"[A-Za-z0-9_-]+"$/);
  assert.equal(res.body, '{"items":[1,2,3]}');
});

test('a client that already has the payload gets a bodyless 304', () => {
  const first = fakeRes();
  sendRevalidatedJson(req(), first, { items: [] });

  const second = fakeRes();
  sendRevalidatedJson(req({ 'if-none-match': first.headers.etag }), second, { items: [] });

  assert.equal(second.status, 304);
  assert.equal(second.body, '');
  assert.equal(second.headers.etag, first.headers.etag);
});

test('a changed payload has a different etag, so it is sent again', () => {
  const before = fakeRes();
  sendRevalidatedJson(req(), before, { items: [1] });

  const after = fakeRes();
  sendRevalidatedJson(req({ 'if-none-match': before.headers.etag }), after, { items: [1, 2] });

  assert.equal(after.status, 200);
  assert.notEqual(after.headers.etag, before.headers.etag);
  assert.equal(after.body, '{"items":[1,2]}');
});

test('the same payload always produces the same etag', () => {
  const a = fakeRes();
  const b = fakeRes();
  sendRevalidatedJson(req(), a, { items: [1, 2] });
  sendRevalidatedJson(req(), b, { items: [1, 2] });
  assert.equal(a.headers.etag, b.headers.etag);
});

test('a stale etag from an unrelated payload does not match', () => {
  const res = fakeRes();
  sendRevalidatedJson(req({ 'if-none-match': 'W/"nope"' }), res, { items: [] });
  assert.equal(res.status, 200);
});
