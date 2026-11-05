// QvaPay mini-app SDK adapter.
//
// The native app injects `window.QvaPay` before our page loads, only for the
// origins listed in the app's allowed origins. Outside the app the object does
// not exist, which is exactly what production behaves like.
//
// Capability detection is by presence, never by version number: QvaPay.version
// is the bridge protocol version ("1") and stays constant across app releases.
// See docs/qvapay-sdk-notes.md for the verified surface.

/**
 * Resolve the SDK, or null when the page is not running inside QvaPay.
 * @param {object} [scope] injectable for tests; defaults to the global object.
 */
export function getQvaPay(scope = globalThis) {
  const sdk = scope?.QvaPay;
  return sdk && typeof sdk === 'object' ? sdk : null;
}

/**
 * Run `start` as soon as the SDK is available.
 *
 * The simulator loads `sdk-sim.js` asynchronously, so a page whose code runs
 * first must wait for the `qvapay:ready` event rather than polling.
 *
 * @returns {() => void} unsubscribe (no-op when `start` ran immediately)
 */
export function whenReady(start, scope = globalThis) {
  if (typeof start !== 'function') throw new TypeError('whenReady requires a function');

  if (getQvaPay(scope)) {
    start(getQvaPay(scope));
    return () => {};
  }

  const onReady = () => {
    const sdk = getQvaPay(scope);
    if (sdk) start(sdk);
  };
  scope.addEventListener?.('qvapay:ready', onReady, { once: true });
  return () => scope.removeEventListener?.('qvapay:ready', onReady);
}

/**
 * Feature detection, by method presence.
 *
 * `ui.header` and the automatic back button shipped together in app 3.7.0;
 * `ui.colors` in 3.7.1. Below those versions the methods are absent and the
 * page must keep its own chrome.
 */
export function capabilities(sdk) {
  return Object.freeze({
    present: Boolean(sdk),
    header: Boolean(sdk?.ui?.header?.set),
    colors: Boolean(sdk?.ui?.colors?.set),
    mainButton: Boolean(sdk?.ui?.mainButton?.set),
    backButton: Boolean(sdk?.ui?.backButton?.set),
    haptic: typeof sdk?.ui?.haptic === 'function',
    toast: typeof sdk?.ui?.toast === 'function',
    auth: Boolean(sdk?.auth?.requestLogin),
    payments: Boolean(sdk?.payments?.payInvoice),
    share: typeof sdk?.share === 'function',
    openLink: typeof sdk?.openLink === 'function',
    getTheme: typeof sdk?.getTheme === 'function',
  });
}

/**
 * Apply the host theme to the document, and keep following it.
 *
 * Returns a cleanup function that unsubscribes from `themeChanged`.
 */
export async function applyTheme(sdk, doc = globalThis.document, scope = globalThis) {
  if (!sdk || typeof sdk.getTheme !== 'function') return () => {};

  const paint = (theme) => {
    const colors = theme?.colors;
    if (!colors || !doc?.body) return;
    // Drive the CSS custom properties the stylesheet builds on, so every
    // surface (cards, borders, accents) follows the host theme. Setting only
    // body.background leaves the cards on the file defaults.
    if (colors.bg) doc.body.style.setProperty('--bg', colors.bg);
    if (colors.text) doc.body.style.setProperty('--text', colors.text);
    if (colors.surface) doc.body.style.setProperty('--surface', colors.surface);
    if (colors.primary) doc.body.style.setProperty('--primary', colors.primary);
    if (colors.bg) doc.body.style.background = colors.bg;
    if (colors.text) doc.body.style.color = colors.text;
    // Paint <html> too: it is the canvas the page overscrolls onto, and with
    // scrollbar-gutter removed it is what shows at the edges.
    if (colors.bg) doc.documentElement?.style?.setProperty('background', colors.bg);
    doc.body.dataset.themeMode = theme.mode ?? 'light';
  };

  // A theme failure must never take the page down: the app may reject while a
  // sheet is open or on a host that does not implement the method.
  try {
    paint(await sdk.getTheme());
  } catch {
    // Keep our own palette and carry on; still subscribe for later changes.
  }

  const onChange = (theme) => {
    try {
      paint(theme);
    } catch {
      /* ignore a malformed theme push */
    }
  };
  if (typeof sdk.on === 'function') sdk.on('themeChanged', onChange);
  void scope;
  return () => {
    if (typeof sdk.off === 'function') sdk.off('themeChanged', onChange);
  };
}

/**
 * Configure the native header and mark that we integrate with it.
 *
 * Adds `in-qvapay` to <html> so the page's own CSS can hide a local header and
 * avoid stacking two bars. Only applied when the host supports `ui.header`.
 */
export async function configureHeader(sdk, { subtitle = null, actions = null } = {}, doc = globalThis.document) {
  const caps = capabilities(sdk);
  if (!caps.header) return false;

  const state = {};
  // `set` only changes what is sent, so pass only the fields in play.
  if (subtitle !== null) state.subtitle = subtitle;
  if (actions !== null) state.actions = actions;
  if (Object.keys(state).length > 0) await sdk.ui.header.set(state);

  doc?.documentElement?.classList?.add('in-qvapay');
  return true;
}

/**
 * Drive the native main button.
 *
 * Always send `text` and `visible` together: in app versions before 3.7.0 each
 * `set` replaced the whole button, so a partial update would hide it.
 */
export async function setMainButton(sdk, { text, visible = true, enabled = true, loading = false }) {
  if (!capabilities(sdk).mainButton) return false;
  const state = { text: String(text ?? '').slice(0, LIMITS.mainButton), visible, enabled, loading };
  await sdk.ui.mainButton.set(state);
  return true;
}

/**
 * Map a rejected SDK promise to something safe to show.
 *
 * The `message` the app returns is already user-facing and localized. The only
 * codes that also need page-side handling are USER_CANCELLED (not an error,
 * show nothing) and BUSY (another sheet is open).
 */
export function describeSdkError(error) {
  const code = error?.code ?? 'UNKNOWN';
  const message = error?.message ?? '';
  switch (code) {
    case 'USER_CANCELLED':
      return { code, message, silent: true, retryable: false };
    case 'BUSY':
      return { code, message, silent: false, retryable: true };
    case 'NETWORK':
      return { code, message, silent: false, retryable: true };
    case 'NOT_ALLOWED':
    case 'INVALID_PARAMS':
    case 'UNKNOWN_METHOD':
    case 'INVOICE_APP_MISMATCH':
      return { code, message, silent: false, retryable: false };
    case 'FAILED':
    default:
      return { code, message, silent: false, retryable: true };
  }
}

// --- Per-screen chrome ------------------------------------------------------
//
// Header, main button, colours and notices are per screen, so they get a small
// layer on top of the raw calls: capability-guarded (absent SDK or absent
// method is a silent no-op), input-normalised so the host never has to reject,
// and honest about which calls actually happened.

/** Limits the host enforces; clamped here so it never has to reject. */
export const LIMITS = Object.freeze({ subtitle: 48, mainButton: 32, toast: 120, share: 200 });

/** The closed icon catalogue `ui.header.set` accepts. */
export const HEADER_ICONS = Object.freeze([
  'cart', 'search', 'filter', 'sort', 'share', 'heart', 'star', 'bookmark',
  'bell', 'user', 'settings', 'help', 'plus', 'edit', 'chat', 'calendar',
  'wallet', 'ticket', 'home', 'location', 'refresh',
]);

const ACTION_ID = /^[A-Za-z0-9_-]{1,32}$/;

const clamp = (text, max) => String(text ?? '').slice(0, max);

/**
 * Keep only the header actions the host will accept, and at most two.
 *
 * Dropping an invalid action is better than letting `set` reject and leave the
 * whole header unchanged: the screen keeps the actions that do work.
 *
 * @param {Array<{id: string, icon: string, label: string, badge?: number}>} actions
 * @param {number} [limit]
 */
export function normaliseActions(actions, limit = 2) {
  if (!Array.isArray(actions)) return [];
  const seen = new Set();
  const out = [];
  for (const action of actions) {
    if (!action || typeof action.id !== 'string' || !ACTION_ID.test(action.id)) continue;
    if (!HEADER_ICONS.includes(action.icon)) continue;
    if (typeof action.label !== 'string' || action.label.trim() === '') continue;
    if (seen.has(action.id)) continue;
    seen.add(action.id);
    /** @type {{id: string, icon: string, label: string, badge?: number}} */
    const kept = { id: action.id, icon: action.icon, label: action.label };
    if (typeof action.badge === 'number' && action.badge > 0) {
      kept.badge = Math.min(Math.floor(action.badge), 99);
    }
    out.push(kept);
    if (out.length === limit) break;
  }
  return out;
}

/**
 * Set the header subtitle and/or actions for the current screen.
 *
 * `subtitle: null` leaves it alone, `''` clears it; `actions: []` clears them.
 */
export async function setHeader(sdk, { subtitle = null, actions = null } = {}) {
  if (!capabilities(sdk).header) return false;
  /** @type {{subtitle?: string|null, actions?: object[]}} */
  const state = {};
  if (subtitle !== null) state.subtitle = subtitle === '' ? null : clamp(subtitle, LIMITS.subtitle);
  if (actions !== null) state.actions = normaliseActions(actions);
  if (Object.keys(state).length === 0) return false;
  await sdk.ui.header.set(state);
  return true;
}

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** Paint the host surfaces. Opaque hex only; anything else is refused locally. */
export async function setColors(sdk, { header = null, background = null } = {}) {
  if (!capabilities(sdk).colors) return false;
  /** @type {{header?: string, background?: string}} */
  const state = {};
  if (header !== null) {
    if (!HEX.test(header)) return false;
    state.header = header;
  }
  if (background !== null) {
    if (!HEX.test(background)) return false;
    state.background = background;
  }
  if (Object.keys(state).length === 0) return false;
  await sdk.ui.colors.set(state);
  return true;
}

/** Short vibration. Defaults to the lightest tap, which is the common case. */
export async function haptic(sdk, type = 'light') {
  if (!capabilities(sdk).haptic) return false;
  await sdk.ui.haptic(type);
  return true;
}

/** Native notice, already truncated to what the host accepts. */
export async function toast(sdk, message, { type = 'info' } = {}) {
  if (!capabilities(sdk).toast) return false;
  const text = clamp(message, LIMITS.toast);
  if (text === '') return false;
  await sdk.ui.toast(text, { type });
  return true;
}

/**
 * Open the native share sheet. Rejections propagate: `USER_CANCELLED` is a
 * dismissal, not an error, and the caller decides what to show.
 */
export async function share(sdk, { text } = {}) {
  if (!capabilities(sdk).share) return false;
  /** @type {{text?: string}} */
  const params = {};
  if (text !== undefined) params.text = clamp(text, LIMITS.share);
  await sdk.share(params);
  return true;
}

/** Leave the mini-app through the system browser. https only, as the host demands. */
export async function openLink(sdk, url) {
  if (!capabilities(sdk).openLink) return false;
  const target = String(url ?? '');
  if (!/^https:\/\/[^\s]+$/i.test(target) || target.length > 2048) return false;
  await sdk.openLink(target);
  return true;
}
