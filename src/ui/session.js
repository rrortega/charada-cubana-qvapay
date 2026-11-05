// Session state for the mini-app.
//
// The QvaPay WebView never shares its session: identity arrives as a signed
// `init_data` blob that our server must verify with the app-secret.
//
// Persistence has two layers, on purpose:
//   1. an http-only cookie set by the server (the normal path), and
//   2. a signed token kept in localStorage, sent as `Authorization: Bearer`.
//
// The second exists because the WebView is a cross-site iframe: browsers may
// drop third-party cookies, which made the login look successful and then be
// forgotten on the next view. The token is signed by the same secret, so it is
// no less trustworthy than the cookie — and it is still verified server-side.
//
// Nothing in this module is trusted by the server: it only stores and presents
// what the server issued.

const SESSION_ENDPOINT = '/api/sesion';
const LOGIN_ENDPOINT = '/api/login';
const STORAGE_KEY = 'charada.sesion';

/**
 * @typedef {object} Session
 * @property {boolean} linked
 * @property {string|null} uuid
 * @property {string|null} username
 * @property {string|null} name
 * @property {string|null} avatar
 */

/** @type {Session & {token: string|null}} */
let session = { linked: false, uuid: null, username: null, name: null, lastname: null, avatar: null, token: null };

/** Storage helpers that never throw (private mode, disabled storage). */
function readStorage(storage) {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed.token === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

function writeStorage(storage, value) {
  try {
    if (value) storage?.setItem(STORAGE_KEY, JSON.stringify(value));
    else storage?.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable: the cookie path still works */
  }
}

/** Current cached session. Never proof of anything; the server re-checks. */
export function getSession() {
  const { token, ...rest } = session;
  return { ...rest };
}

/** True when we believe we are linked (cookie or stored token). */
export function isLinked() {
  return session.linked;
}

/** Auth headers for API calls, adding the bearer token when we have one. */
export function authHeaders(extra = {}) {
  const headers = { ...extra };
  if (session.token) headers.authorization = `Bearer ${session.token}`;
  return headers;
}

/**
 * Restore any persisted token into memory. Call once at boot.
 */
export function restoreSession({ storage = globalThis.localStorage } = {}) {
  const stored = readStorage(storage);
  if (stored) {
    session = {
      linked: true,
      uuid: stored.uuid ?? null,
      username: stored.username ?? null,
      name: stored.name ?? null,
      lastname: stored.lastname ?? null,
      avatar: stored.avatar ?? null,
      token: stored.token,
    };
  }
  return getSession();
}

/**
 * Ask the server whether this browser has a valid session.
 *
 * Sends the bearer token when present so it works with or without cookies.
 * A failure means "not linked", never an error page.
 */
export async function loadSession({ fetchImpl = globalThis.fetch, storage = globalThis.localStorage } = {}) {
  try {
    const res = await fetchImpl(SESSION_ENDPOINT, {
      headers: authHeaders({ accept: 'application/json' }),
      credentials: 'include',
    });
    if (!res.ok) {
      clearSession({ storage });
      return getSession();
    }
    const data = await res.json();
    if (!data.linked) {
      clearSession({ storage });
      return getSession();
    }
    session = {
      linked: true,
      uuid: data.uuid ?? null,
      username: data.username ?? null,
      name: data.name ?? session.name ?? null,
      lastname: data.lastname ?? session.lastname ?? null,
      avatar: data.avatar ?? session.avatar ?? null,
      token: session.token,
    };
    persist(storage);
  } catch {
    // Offline or blocked: keep whatever we restored from storage.
  }
  return getSession();
}

function persist(storage) {
  if (!session.token) return;
  writeStorage(storage, {
    token: session.token,
    uuid: session.uuid,
    username: session.username,
    name: session.name,
    lastname: session.lastname,
    avatar: session.avatar,
  });
}

/** Drop the session locally and on the server. */
export async function clearSession({ fetchImpl = globalThis.fetch, storage = globalThis.localStorage } = {}) {
  session = { linked: false, uuid: null, username: null, name: null, lastname: null, avatar: null, token: null };
  writeStorage(storage, null);
  try {
    await fetchImpl('/api/logout', { method: 'POST', credentials: 'include' });
  } catch {
    /* best effort */
  }
}

/**
 * Run the login handshake.
 *
 * `requestLogin` shows the consent sheet; the host returns a signed `init_data`
 * that is sent to our server verbatim (modifying it breaks the signature).
 *
 * @returns {Promise<{ok: boolean, code?: string, message?: string, session?: Session}>}
 */
export async function linkAccount(sdk, { scopes = ['profile'], fetchImpl = globalThis.fetch, storage = globalThis.localStorage } = {}) {
  if (!sdk?.auth?.requestLogin) {
    return { ok: false, code: 'NO_SDK', message: 'Abre la app de QvaPay para vincular tu cuenta.' };
  }

  let initData;
  try {
    const result = await sdk.auth.requestLogin({ scopes });
    initData = result?.init_data;
  } catch (err) {
    return { ok: false, code: err?.code ?? 'FAILED', message: err?.message ?? '' };
  }

  if (!initData) return { ok: false, code: 'FAILED', message: 'No se recibió la identidad.' };

  try {
    const res = await fetchImpl(LOGIN_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'text/plain', accept: 'application/json' },
      body: initData,
      credentials: 'include',
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { ok: false, code: body.error ?? 'LOGIN_REJECTED', message: '' };
    }
    const data = await res.json();
    session = {
      linked: true,
      uuid: data.uuid ?? null,
      username: data.username ?? null,
      name: data.name ?? null,
      lastname: data.lastname ?? null,
      avatar: data.avatar ?? null,
      token: data.token ?? null,
    };
    persist(storage);
    return { ok: true, session: getSession() };
  } catch {
    return { ok: false, code: 'NETWORK', message: '' };
  }
}

/** Test helper: reset the cached session. */
export function __setSessionForTests(next, { storage = globalThis.localStorage } = {}) {
  session = { linked: false, uuid: null, username: null, name: null, lastname: null, avatar: null, token: null, ...next };
  writeStorage(storage, null);
}
