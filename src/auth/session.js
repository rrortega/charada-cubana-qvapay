// Our own session cookie.
//
// The QvaPay token never reaches the WebView, so we mint a signed cookie after
// verifying init_data. The payload is small and signed with SESSION_SECRET:
// tampering is detectable, and nothing sensitive travels in the clear.
//
// Format: base64url(json) + "." + base64url(hmac)

import crypto from 'node:crypto';

export const COOKIE_NAME = 'charada_sesion';
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

const b64 = (buf) => Buffer.from(buf).toString('base64url');

function sign(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest();
}

/**
 * Create a signed session token.
 * @param {{uuid: string, username?: string|null}} user
 * @param {string} secret
 */
export function createSessionToken(user, secret, now = Math.floor(Date.now() / 1000)) {
  if (!secret) throw new Error('SESSION_SECRET is required');
  const body = JSON.stringify({ uuid: user.uuid, username: user.username ?? null, iat: now });
  const payload = b64(body);
  return `${payload}.${b64(sign(payload, secret))}`;
}

/**
 * Verify a session token. Returns null on any problem: tampered, malformed or
 * expired. Never throws, so a bad cookie degrades to "not logged in".
 */
export function readSessionToken(token, secret, { now = Math.floor(Date.now() / 1000), maxAgeSeconds = MAX_AGE_SECONDS } = {}) {
  if (typeof token !== 'string' || !token.includes('.') || !secret) return null;
  const [payload, mac] = token.split('.');
  if (!payload || !mac) return null;

  const expected = sign(payload, secret);
  const received = Buffer.from(mac, 'base64url');
  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) return null;

  let data;
  try {
    data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (typeof data?.uuid !== 'string' || data.uuid === '') return null;
  if (Number.isFinite(data.iat) && now - data.iat > maxAgeSeconds) return null;

  return { uuid: data.uuid, username: data.username ?? null };
}

/** Build the Set-Cookie header value. */
export function sessionCookie(token, { secure = true, maxAge = MAX_AGE_SECONDS } = {}) {
  const parts = [
    `${COOKIE_NAME}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

/** Build the clearing header value. */
export function clearSessionCookie({ secure = true } = {}) {
  const parts = [`${COOKIE_NAME}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

/** Parse the Cookie header into a plain object. */
export function parseCookies(header) {
  const out = {};
  for (const part of String(header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const key = part.slice(0, i).trim();
    if (key) out[key] = part.slice(i + 1).trim();
  }
  return out;
}
