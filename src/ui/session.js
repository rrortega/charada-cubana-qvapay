// Session state for the mini-app.
//
// The QvaPay WebView never shares its session: identity arrives as a signed
// `init_data` blob that our server must verify with the app-secret. This module
// only handles the browser side: ask the host for a login, hand the blob to our
// server, and remember whether we are linked.
//
// Nothing here trusts the client. The server sets an http-only cookie and is the
// only authority on whether the user is authenticated.

const SESSION_ENDPOINT = '/api/sesion';
const LOGIN_ENDPOINT = '/api/login';

/**
 * @typedef {object} Session
 * @property {boolean} linked   true when our server confirmed the init_data
 * @property {string|null} uuid the stable QvaPay user id, when linked
 * @property {string|null} username
 */

/** @type {Session} */
let session = { linked: false, uuid: null, username: null };

/** Current cached session. Never proof of anything; the server re-checks. */
export function getSession() {
  return { ...session };
}

/**
 * Ask the server whether this browser already has a valid session.
 * Safe to call on boot: a failure means "not linked", never an error page.
 */
export async function loadSession({ fetchImpl = globalThis.fetch } = {}) {
  try {
    const res = await fetchImpl(SESSION_ENDPOINT, { headers: { accept: 'application/json' } });
    if (!res.ok) {
      session = { linked: false, uuid: null, username: null };
      return getSession();
    }
    const data = await res.json();
    session = {
      linked: Boolean(data.linked),
      uuid: data.uuid ?? null,
      username: data.username ?? null,
    };
  } catch {
    session = { linked: false, uuid: null, username: null };
  }
  return getSession();
}

/**
 * Run the login handshake.
 *
 * `requestLogin` shows the consent sheet; the host returns a signed `init_data`
 * string that is sent to our server verbatim (it must not be modified, or the
 * signature breaks).
 *
 * @returns {Promise<{ok: boolean, code?: string, message?: string, session?: Session}>}
 */
export async function linkAccount(sdk, { scopes = ['profile'], fetchImpl = globalThis.fetch } = {}) {
  if (!sdk?.auth?.requestLogin) {
    return { ok: false, code: 'NO_SDK', message: 'Abre la app de QvaPay para vincular tu cuenta.' };
  }

  let initData;
  try {
    const result = await sdk.auth.requestLogin({ scopes });
    initData = result?.init_data;
  } catch (err) {
    // USER_CANCELLED is not an error; the sheet was dismissed.
    return { ok: false, code: err?.code ?? 'FAILED', message: err?.message ?? '' };
  }

  if (!initData) {
    return { ok: false, code: 'FAILED', message: 'No se recibió la identidad.' };
  }

  try {
    const res = await fetchImpl(LOGIN_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'text/plain', accept: 'application/json' },
      body: initData,
      credentials: 'same-origin',
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { ok: false, code: body.error ?? 'LOGIN_REJECTED', message: '' };
    }
    const data = await res.json();
    session = { linked: true, uuid: data.uuid ?? null, username: data.username ?? null };
    return { ok: true, session: getSession() };
  } catch {
    return { ok: false, code: 'NETWORK', message: '' };
  }
}

/** Test helper: reset the cached session. */
export function __setSessionForTests(next) {
  session = { linked: false, uuid: null, username: null, ...next };
}
