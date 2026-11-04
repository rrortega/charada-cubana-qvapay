// Tests for the QvaPay payment surfaces: the three URLs the developer panel
// requires, and the webhook that is the only authority on a payment.
//
// The webhook tests sign real payloads with HMAC-SHA256 exactly as QvaPay does,
// because the signature is what stops a forged "paid" event from granting
// premium access.

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';

import { paymentUrls, handleQvapayWebhook } from '../src/http/routes.js';

const SECRET = 'whsec-test';

/** Minimal request double carrying a raw body and headers. */
function fakeReq(rawBody, headers = {}) {
  const req = Readable.from([Buffer.from(rawBody, 'utf8')]);
  req.headers = headers;
  req.method = 'POST';
  return req;
}

/** Minimal response double capturing what the handler writes. */
function fakeRes() {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    writeHead(code, headers) {
      this.statusCode = code;
      this.headers = headers ?? {};
      return this;
    },
    end(chunk) {
      this.body = chunk ? String(chunk) : '';
    },
  };
}

const sign = (body, secret = SECRET) =>
  `sha256=${crypto.createHmac('sha256', secret).update(Buffer.from(body, 'utf8')).digest('hex')}`;

/** Pool double recording the SQL calls. */
function fakePool({ fail = false } = {}) {
  const calls = [];
  return {
    calls,
    async query(sql, params) {
      if (fail) throw new Error('db down');
      calls.push({ sql, params });
      return { rows: [] };
    },
  };
}

// --- The three URLs ---------------------------------------------------------

test('derives the three URLs QvaPay asks for', () => {
  const urls = paymentUrls('https://charada.example.com');
  assert.equal(urls.webhook, 'https://charada.example.com/api/qvapay/webhook');
  assert.equal(urls.success, 'https://charada.example.com/?pago=exito');
  assert.equal(urls.cancel, 'https://charada.example.com/?pago=cancelado');
});

test('all three URLs are absolute https, ready to paste in the panel', () => {
  const urls = paymentUrls('https://charada.example.com');
  for (const [kind, value] of Object.entries(urls)) {
    assert.match(value, /^https:\/\//, `${kind} must be https`);
    assert.equal(value.includes(' '), false, `${kind} must not contain spaces`);
  }
});

test('a trailing slash in the base does not double up', () => {
  const urls = paymentUrls('https://charada.example.com/');
  assert.equal(urls.webhook, 'https://charada.example.com/api/qvapay/webhook');
});

test('no base URL means no URLs, rather than a broken relative path', () => {
  assert.equal(paymentUrls(''), null);
  assert.equal(paymentUrls(null), null);
});

// --- Webhook ----------------------------------------------------------------

test('accepts a correctly signed paid event', async () => {
  process.env.QVAPAY_APP_SECRET = SECRET;
  const body = JSON.stringify({ transaction_uuid: 'tx-1', status: 'paid', amount: '5.00' });
  const res = fakeRes();
  const pool = fakePool();

  await handleQvapayWebhook(fakeReq(body, { 'x-qvapay-signature': sign(body) }), res, pool);

  assert.equal(res.statusCode, 200);
  assert.equal(pool.calls.length, 1);
  assert.match(pool.calls[0].sql, /INSERT INTO subscriptions/);
  assert.deepEqual(pool.calls[0].params.slice(0, 2), ['active', 'tx-1']);
});

test('rejects a forged signature and stores nothing', async () => {
  process.env.QVAPAY_APP_SECRET = SECRET;
  const body = JSON.stringify({ transaction_uuid: 'tx-2', status: 'paid' });
  const res = fakeRes();
  const pool = fakePool();

  await handleQvapayWebhook(fakeReq(body, { 'x-qvapay-signature': sign(body, 'wrong-secret') }), res, pool);

  assert.equal(res.statusCode, 401);
  assert.equal(pool.calls.length, 0, 'a forged event must never reach the database');
});

test('rejects a body altered after signing', async () => {
  process.env.QVAPAY_APP_SECRET = SECRET;
  const original = JSON.stringify({ transaction_uuid: 'tx-3', status: 'paid' });
  const altered = JSON.stringify({ transaction_uuid: 'tx-3', status: 'paid', amount: '999' });
  const res = fakeRes();
  const pool = fakePool();

  await handleQvapayWebhook(fakeReq(altered, { 'x-qvapay-signature': sign(original) }), res, pool);

  assert.equal(res.statusCode, 401);
  assert.equal(pool.calls.length, 0);
});

test('rejects a missing signature header', async () => {
  process.env.QVAPAY_APP_SECRET = SECRET;
  const body = JSON.stringify({ transaction_uuid: 'tx-4', status: 'paid' });
  const res = fakeRes();
  await handleQvapayWebhook(fakeReq(body, {}), res, fakePool());
  assert.equal(res.statusCode, 401);
});

test('is idempotent: the same transaction twice writes twice but upserts', async () => {
  process.env.QVAPAY_APP_SECRET = SECRET;
  const body = JSON.stringify({ transaction_uuid: 'tx-5', status: 'paid' });
  const pool = fakePool();

  await handleQvapayWebhook(fakeReq(body, { 'x-qvapay-signature': sign(body) }), fakeRes(), pool);
  await handleQvapayWebhook(fakeReq(body, { 'x-qvapay-signature': sign(body) }), fakeRes(), pool);

  assert.equal(pool.calls.length, 2);
  for (const call of pool.calls) {
    assert.match(call.sql, /ON CONFLICT \(transaction_uuid\) DO UPDATE/);
  }
});

test('a non-paid status is stored as pending, not active', async () => {
  process.env.QVAPAY_APP_SECRET = SECRET;
  const body = JSON.stringify({ transaction_uuid: 'tx-6', status: 'expired' });
  const pool = fakePool();
  await handleQvapayWebhook(fakeReq(body, { 'x-qvapay-signature': sign(body) }), fakeRes(), pool);
  assert.equal(pool.calls[0].params[0], 'pending');
});

test('rejects a signed payload with no transaction uuid', async () => {
  process.env.QVAPAY_APP_SECRET = SECRET;
  const body = JSON.stringify({ status: 'paid' });
  const res = fakeRes();
  await handleQvapayWebhook(fakeReq(body, { 'x-qvapay-signature': sign(body) }), res, fakePool());
  assert.equal(res.statusCode, 400);
});

test('reports 503 when the app secret is missing, so QvaPay retries', async () => {
  delete process.env.QVAPAY_APP_SECRET;
  const body = JSON.stringify({ transaction_uuid: 'tx-7', status: 'paid' });
  const res = fakeRes();
  await handleQvapayWebhook(fakeReq(body, { 'x-qvapay-signature': sign(body) }), res, fakePool());
  assert.equal(res.statusCode, 503);
});

test('a storage failure is a 5xx, never a false success', async () => {
  process.env.QVAPAY_APP_SECRET = SECRET;
  const body = JSON.stringify({ transaction_uuid: 'tx-8', status: 'paid' });
  const res = fakeRes();
  await handleQvapayWebhook(fakeReq(body, { 'x-qvapay-signature': sign(body) }), res, fakePool({ fail: true }));
  assert.equal(res.statusCode, 500);
});
