// HTTP routes for the mini-app.
//
// All routes are read-only GETs. No route ever accepts credentials, and the
// QvaPay app-secret never leaves the server.

import crypto from 'node:crypto';
import { analyseNumber } from '../domain/analysis.js';
import { verifyInitData } from '../auth/verifyInitData.js';
import {
  createSessionToken,
  readSessionToken,
  sessionCookie,
  clearSessionCookie,
  parseCookies,
  COOKIE_NAME,
} from '../auth/session.js';
import {
  historyForAnalysis,
  meaningOf,
  drawsForDate,
  dayList,
  latestDate,
  availableRange,
  nextDrawInfo,
  toIsoDate,
} from './draws.js';

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };

function sendJson(res, status, body, extra = {}) {
  res.writeHead(status, { ...JSON_HEADERS, ...extra });
  res.end(JSON.stringify(body));
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Accept only a real calendar date in YYYY-MM-DD form. */
function validIsoDate(value) {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return null;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const round = dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  return round ? value : null;
}

function intParam(value, fallback, { min = 1, max = 365 } = {}) {
  const n = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** Resolve "hoy" / "ayer" / "hace-un-anio" / an ISO date to a concrete date. */
async function resolveDate(pool, raw) {
  const latest = await latestDate(pool);
  if (!latest) return null;
  switch (raw) {
    case 'hoy':
    case null:
    case '':
      return latest;
    case 'ayer': {
      const { rows } = await pool.query(
        "SELECT max(date) AS d FROM cargadores WHERE date < $1::date", [latest],
      );
      return toIsoDate(rows[0]?.d) ?? latest;
    }
    case 'hace-un-anio': {
      const { rows } = await pool.query(
        "SELECT max(date) AS d FROM cargadores WHERE date <= $1::date - INTERVAL '1 year'", [latest],
      );
      return toIsoDate(rows[0]?.d) ?? null;
    }
    default:
      return validIsoDate(raw) ? raw : null;
  }
}

/** Read the caller's session, or null when not linked. */
export function currentSession(req) {
  const cookies = parseCookies(req.headers.cookie);
  const secret = process.env.SESSION_SECRET;
  if (!secret) return null;
  return readSessionToken(cookies[COOKIE_NAME], secret);
}

/** Upsert the user row and return its id. */
async function upsertUser(pool, { uuid, username }) {
  const { rows } = await pool.query(
    `INSERT INTO users (qvapay_uuid, username)
     VALUES ($1, $2)
     ON CONFLICT (qvapay_uuid)
     DO UPDATE SET username = COALESCE(EXCLUDED.username, users.username),
                   last_seen_at = now()
     RETURNING id`,
    [uuid, username ?? null],
  );
  return rows[0].id;
}

/**
 * Handle POST /api/login and GET /api/sesion.
 * Returns true when handled.
 */
async function handleAuth(req, res, url, pool) {
  if (url.pathname === '/api/sesion') {
    if (req.method !== 'GET') return false;
    const s = currentSession(req);
    sendJson(res, 200, s
      ? { linked: true, uuid: s.uuid, username: s.username }
      : { linked: false, uuid: null, username: null }, { 'cache-control': 'no-store' });
    return true;
  }

  if (url.pathname === '/api/login') {
    if (req.method !== 'POST') return false;

    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
      if (chunks.reduce((n, c) => n + c.length, 0) > 64 * 1024) {
        sendJson(res, 413, { error: 'payload_too_large' });
        return true;
      }
    }
    const initData = Buffer.concat(chunks).toString('utf8');

    try {
      const verified = verifyInitData(initData, {
        appSecret: process.env.QVAPAY_APP_SECRET,
        appUuid: process.env.QVAPAY_APP_ID,
      });
      await upsertUser(pool, verified.user);
      const token = createSessionToken(verified.user, process.env.SESSION_SECRET);
      const secure = !String(process.env.PUBLIC_BASE_URL ?? '').startsWith('http://localhost');
      res.writeHead(200, {
        ...JSON_HEADERS,
        'set-cookie': sessionCookie(token, { secure }),
        'cache-control': 'no-store',
      });
      res.end(JSON.stringify({
        linked: true,
        uuid: verified.user.uuid,
        username: verified.user.username ?? null,
      }));
    } catch (err) {
      // Do not leak which check failed beyond the machine code.
      sendJson(res, 401, { error: err.code ?? 'INVALID' });
    }
    return true;
  }

  if (url.pathname === '/api/logout') {
    if (req.method !== 'POST') return false;
    res.writeHead(204, { 'set-cookie': clearSessionCookie({ secure: true }) });
    res.end();
    return true;
  }

  return false;
}

/** Public base URL, without a trailing slash. */
function baseUrl() {
  const raw = String(process.env.PUBLIC_BASE_URL ?? '').replace(/\/+$/, '');
  return raw;
}

/**
 * The three URLs QvaPay asks for when creating the mini-app.
 *
 * They must be absolute and reachable, so they are derived from
 * PUBLIC_BASE_URL rather than hardcoded: the same code serves localhost, a
 * preview and production.
 */
export function paymentUrls(base = baseUrl()) {
  // Normalise here too: callers may pass a base with a trailing slash and a
  // doubled slash would break the webhook route matching.
  const clean = String(base ?? '').replace(/\/+$/, '');
  if (!clean) return null;
  return {
    webhook: `${clean}/api/qvapay/webhook`,
    success: `${clean}/?pago=exito`,
    cancel: `${clean}/?pago=cancelado`,
  };
}

/**
 * Verify and store a QvaPay payment webhook.
 *
 * Signature is HMAC-SHA256 of the RAW body with the app-secret, sent in
 * `x-qvapay-signature` as `sha256=<hex>`. Responses: 2xx once stored (so QvaPay
 * stops retrying), 401 on a bad signature, 5xx only for real server faults.
 */
export async function handleQvapayWebhook(req, res, pool) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 256 * 1024) {
      sendJson(res, 413, { error: 'payload_too_large' });
      return;
    }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks);

  const secret = process.env.QVAPAY_APP_SECRET;
  if (!secret) {
    // Misconfiguration, not a client error: let QvaPay retry after a fix.
    console.error('webhook: QVAPAY_APP_SECRET is not set');
    sendJson(res, 503, { error: 'not_configured' });
    return;
  }

  const expected = `sha256=${crypto.createHmac('sha256', secret).update(raw).digest('hex')}`;
  const received = String(req.headers['x-qvapay-signature'] ?? '');
  const okLength = expected.length === received.length;
  const valid = okLength && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received));
  if (!valid) {
    sendJson(res, 401, { error: 'bad_signature' });
    return;
  }

  let event;
  try {
    event = JSON.parse(raw.toString('utf8'));
  } catch {
    sendJson(res, 400, { error: 'bad_json' });
    return;
  }

  const transactionUuid = event?.transaction_uuid;
  if (typeof transactionUuid !== 'string' || transactionUuid === '') {
    sendJson(res, 400, { error: 'missing_transaction' });
    return;
  }

  try {
    // Idempotent by transaction_uuid: a repeated delivery must not duplicate.
    await pool.query(
      `INSERT INTO subscriptions (status, transaction_uuid, amount, started_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (transaction_uuid) DO UPDATE SET status = EXCLUDED.status`,
      [event.status === 'paid' ? 'active' : 'pending', transactionUuid, event.amount ?? null],
    );
    sendJson(res, 200, { ok: true });
  } catch (err) {
    console.error('webhook: store failed:', err.message);
    sendJson(res, 500, { error: 'store_failed' });
  }
}

/**
 * Handle /api/*. Returns true when the request was handled.
 */
export async function handleApi(req, res, url, pool) {
  if (!url.pathname.startsWith('/api/')) return false;

  // QvaPay webhook: the only source of truth for a payment. Must accept POST and
  // read the RAW body, because the signature covers the exact bytes sent.
  if (url.pathname === '/api/qvapay/webhook' && req.method === 'POST') {
    await handleQvapayWebhook(req, res, pool);
    return true;
  }

  if (url.pathname === '/api/sesion' && req.method === 'GET') return handleAuth(req, res, url, pool);
  if (url.pathname === '/api/login' && req.method === 'POST') return handleAuth(req, res, url, pool);
  if (url.pathname === '/api/logout' && req.method === 'POST') return handleAuth(req, res, url, pool);

  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'method_not_allowed' });
    return true;
  }

  try {
    switch (url.pathname) {
      // One day, resolved from a quick option or an explicit date.
      case '/api/tiro': {
        const wanted = url.searchParams.get('fecha');
        const iso = await resolveDate(pool, wanted);
        if (!iso) {
          sendJson(res, 400, { error: 'fecha_invalida' });
          return true;
        }
        const out = await drawsForDate(pool, iso);
        sendJson(res, 200, out, { 'cache-control': 'public, max-age=300' });
        return true;
      }

      // The 365-day list, newest first.
      case '/api/dias': {
        const limit = intParam(url.searchParams.get('limite'), 365, { max: 365 });
        const endRaw = url.searchParams.get('hasta');
        const endDate = endRaw ? validIsoDate(endRaw) : null;
        if (endRaw && !endDate) {
          sendJson(res, 400, { error: 'fecha_invalida' });
          return true;
        }
        const out = await dayList(pool, { endDate, limit });
        sendJson(res, 200, out, { 'cache-control': 'public, max-age=600' });
        return true;
      }

      // Bounds for the calendar.
      case '/api/rango':
        sendJson(res, 200, await availableRange(pool), { 'cache-control': 'public, max-age=3600' });
        return true;

      // Historical analysis of one lookup number (0..99).
      case '/api/analisis': {
        const raw = url.searchParams.get('numero');
        if (raw === null || !/^\d{1,2}$/.test(raw)) {
          sendJson(res, 400, { error: 'numero_invalido' });
          return true;
        }
        const numero = Number(raw);
        if (numero > 99) {
          sendJson(res, 400, { error: 'numero_invalido' });
          return true;
        }
        const draws = await historyForAnalysis(pool);
        const analysis = analyseNumber(draws, numero);
        const significado = await meaningOf(pool, numero);
        sendJson(res, 200, { ...analysis, significado }, { 'cache-control': 'public, max-age=600' });
        return true;
      }

      // The three URLs QvaPay needs, ready to copy into the developer panel.
      case '/api/config/pagos': {
        const urls = paymentUrls();
        sendJson(res, urls ? 200 : 500,
          urls ? { ...urls } : { error: 'PUBLIC_BASE_URL_not_set' },
          { 'cache-control': 'no-store' });
        return true;
      }

      case '/api/proximo-tiro':
        // Computed per request: a countdown cannot be cached.
        sendJson(res, 200, nextDrawInfo(), { 'cache-control': 'no-store' });
        return true;

      default:
        sendJson(res, 404, { error: 'not_found' });
        return true;
    }
  } catch (err) {
    console.error(`${url.pathname} failed:`, err.message);
    sendJson(res, 500, { error: 'internal_error' });
    return true;
  }
}
