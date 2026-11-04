// Tests for src/auth/verifyInitData.js and src/auth/session.js
//
// The signature check is the only thing standing between a client and someone
// else's account, so these tests build real payloads with the documented
// algorithm rather than trusting a fixture.

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { verifyInitData } from '../src/auth/verifyInitData.js';
import {
  createSessionToken,
  readSessionToken,
  parseCookies,
  sessionCookie,
  COOKIE_NAME,
} from '../src/auth/session.js';

const APP_SECRET = 'test-app-secret';
const APP_UUID = '11111111-2222-3333-4444-555555555555';
const USER = { uuid: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', username: 'erich', name: 'Erich' };

/** Build a correctly signed init_data exactly as QvaPay does. */
function signInitData(fields, { appSecret = APP_SECRET, appUuid = APP_UUID, authDate = Math.floor(Date.now() / 1000) } = {}) {
  const all = {
    auth_date: String(authDate),
    nonce: 'f'.repeat(32),
    app_uuid: appUuid,
    mini_app: 'charada-cubana',
    scopes: 'profile',
    user: JSON.stringify(USER),
    ...fields,
  };
  const dataCheckString = Object.entries(all)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  const secretKey = crypto.createHmac('sha256', 'QvaPayMiniApp').update(appSecret).digest();
  const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  const params = new URLSearchParams({ ...all, hash });
  return params.toString();
}

test('accepts a correctly signed payload', () => {
  const initData = signInitData();
  const out = verifyInitData(initData, { appSecret: APP_SECRET, appUuid: APP_UUID });
  assert.equal(out.user.uuid, USER.uuid);
  assert.equal(out.user.username, 'erich');
  assert.deepEqual(out.scopes, ['profile']);
});

test('rejects a tampered field', () => {
  const initData = signInitData();
  const tampered = initData.replace(encodeURIComponent('erich'), 'someoneelse');
  assert.throws(
    () => verifyInitData(tampered, { appSecret: APP_SECRET, appUuid: APP_UUID }),
    /Firma inválida/,
  );
});

test('rejects a payload signed with another app secret', () => {
  const initData = signInitData({}, { appSecret: 'other-secret' });
  assert.throws(
    () => verifyInitData(initData, { appSecret: APP_SECRET, appUuid: APP_UUID }),
    /Firma inválida/,
  );
});

test('rejects a payload issued for another app', () => {
  const initData = signInitData({ app_uuid: '99999999-0000-0000-0000-000000000000' });
  assert.throws(
    () => verifyInitData(initData, { appSecret: APP_SECRET, appUuid: APP_UUID }),
    /otra App/,
  );
});

test('rejects a stale payload', () => {
  const old = Math.floor(Date.now() / 1000) - 60 * 60 * 48;
  const initData = signInitData({}, { authDate: old });
  assert.throws(
    () => verifyInitData(initData, { appSecret: APP_SECRET, appUuid: APP_UUID }),
    /caducado/,
  );
});

test('rejects an empty payload', () => {
  assert.throws(() => verifyInitData('', { appSecret: APP_SECRET, appUuid: APP_UUID }), /vacío/);
  assert.throws(() => verifyInitData(null, { appSecret: APP_SECRET, appUuid: APP_UUID }), /vacío/);
});

test('rejects a missing signature rather than accepting it', () => {
  const initData = new URLSearchParams({ auth_date: '1', user: JSON.stringify(USER) }).toString();
  assert.throws(() => verifyInitData(initData, { appSecret: APP_SECRET, appUuid: APP_UUID }), /Firma inválida/);
});

test('rejects a payload whose user has no uuid', () => {
  const initData = signInitData({ user: JSON.stringify({ username: 'x' }) });
  assert.throws(
    () => verifyInitData(initData, { appSecret: APP_SECRET, appUuid: APP_UUID }),
    /sin uuid/,
  );
});

// --- Session cookie ---------------------------------------------------------

const SECRET = 'session-secret';

test('a session token round-trips', () => {
  const token = createSessionToken({ uuid: USER.uuid, username: 'erich' }, SECRET);
  const back = readSessionToken(token, SECRET);
  assert.equal(back.uuid, USER.uuid);
  assert.equal(back.username, 'erich');
});

test('a tampered token is rejected', () => {
  const token = createSessionToken({ uuid: USER.uuid }, SECRET);
  const [payload, mac] = token.split('.');
  const forged = `${Buffer.from(JSON.stringify({ uuid: 'attacker', iat: 1 })).toString('base64url')}.${mac}`;
  assert.equal(readSessionToken(forged, SECRET), null);
  assert.ok(payload.length > 0);
});

test('a token signed with another secret is rejected', () => {
  const token = createSessionToken({ uuid: USER.uuid }, 'other-secret');
  assert.equal(readSessionToken(token, SECRET), null);
});

test('an expired token is rejected', () => {
  const token = createSessionToken({ uuid: USER.uuid }, SECRET, 1000);
  assert.equal(readSessionToken(token, SECRET, { now: 1000 + 31 * 24 * 3600 }), null);
});

test('garbage never throws', () => {
  assert.equal(readSessionToken('', SECRET), null);
  assert.equal(readSessionToken('nope', SECRET), null);
  assert.equal(readSessionToken('a.b.c', SECRET), null);
  assert.equal(readSessionToken(null, SECRET), null);
});

test('the cookie is HttpOnly, SameSite and optionally Secure', () => {
  const c = sessionCookie('tok', { secure: true });
  assert.match(c, new RegExp(`^${COOKIE_NAME}=tok`));
  assert.match(c, /HttpOnly/);
  assert.match(c, /SameSite=Lax/);
  assert.match(c, /Secure/);
  assert.match(c, /Path=\//);
});

test('parseCookies reads a real header', () => {
  assert.deepEqual(parseCookies('a=1; charada_sesion=xyz; b=2'), { a: '1', charada_sesion: 'xyz', b: '2' });
  assert.deepEqual(parseCookies(''), {});
  assert.deepEqual(parseCookies(undefined), {});
});
