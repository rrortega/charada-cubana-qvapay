// QvaPay init_data verification.
//
// The signed payload is a urlencoded query string. Per the official docs:
//   * remove `hash`
//   * sort the remaining fields by key, join as `key=value` with "\n"
//   * secret_key = HMAC_SHA256(key = "QvaPayMiniApp", message = appSecret)
//   * expected = hex(HMAC_SHA256(key = secret_key, message = data_check_string))
//   * compare in constant time
// Then reject stale payloads and payloads issued for another app.

import crypto from 'node:crypto';

const MAX_AGE_SECONDS = 24 * 60 * 60;

/**
 * Verify and parse a QvaPay `init_data` string.
 *
 * @param {string} initData raw payload, exactly as the host returned it
 * @param {object} opts
 * @param {string} opts.appSecret
 * @param {string} opts.appUuid
 * @param {number} [opts.maxAgeSeconds]
 * @param {number} [opts.now] unix seconds, for tests
 * @returns {{user: object, scopes: string[], nonce: string, authDate: number}}
 * @throws {Error} with a `code` property when the payload is rejected
 */
export function verifyInitData(initData, { appSecret, appUuid, maxAgeSeconds = MAX_AGE_SECONDS, now = Math.floor(Date.now() / 1000) } = {}) {
  if (typeof initData !== 'string' || initData.trim() === '') {
    throw Object.assign(new Error('init_data vacío'), { code: 'EMPTY' });
  }
  if (!appSecret) throw Object.assign(new Error('app-secret no configurado'), { code: 'NO_SECRET' });
  if (!appUuid) throw Object.assign(new Error('app-id no configurado'), { code: 'NO_APP_ID' });

  const params = new URLSearchParams(initData);
  const hash = params.get('hash') ?? '';
  if (!/^[0-9a-f]{64}$/i.test(hash)) {
    throw Object.assign(new Error('Firma inválida'), { code: 'BAD_SIGNATURE' });
  }
  params.delete('hash');

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  const secretKey = crypto.createHmac('sha256', 'QvaPayMiniApp').update(appSecret).digest();
  const expected = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(hash, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw Object.assign(new Error('Firma inválida'), { code: 'BAD_SIGNATURE' });
  }

  const authDate = Number(params.get('auth_date'));
  if (!Number.isFinite(authDate)) {
    throw Object.assign(new Error('auth_date ausente'), { code: 'BAD_SIGNATURE' });
  }
  if (now - authDate > maxAgeSeconds) {
    throw Object.assign(new Error('init_data caducado'), { code: 'EXPIRED' });
  }
  if (params.get('app_uuid') !== appUuid) {
    throw Object.assign(new Error('init_data de otra App'), { code: 'WRONG_APP' });
  }

  let user;
  try {
    user = JSON.parse(params.get('user') ?? 'null');
  } catch {
    throw Object.assign(new Error('user ilegible'), { code: 'BAD_PAYLOAD' });
  }
  if (!user || typeof user.uuid !== 'string' || user.uuid === '') {
    throw Object.assign(new Error('user sin uuid'), { code: 'BAD_PAYLOAD' });
  }

  return {
    user,
    scopes: (params.get('scopes') ?? '').split(',').filter(Boolean),
    nonce: params.get('nonce') ?? '',
    authDate,
  };
}
