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
  const state = { text, visible, enabled, loading };
  Object.keys(state).forEach((k) => state[k] === undefined && delete state[k]);
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
