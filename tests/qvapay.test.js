// Tests for src/sdk/qvapay.js
//
// The SDK is injected by QvaPay and absent everywhere else, so every test builds
// a fake scope. This keeps the adapter honest about capability detection and the
// compatibility rules the official docs call out.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getQvaPay,
  whenReady,
  capabilities,
  applyTheme,
  configureHeader,
  setMainButton,
  describeSdkError,
} from '../src/sdk/qvapay.js';

/** Minimal SDK double mirroring the surface documented for QvaPay 3.7.1. */
function fakeSdk(overrides = {}) {
  const calls = { headerSet: [], mainButtonSet: [], colorsSet: [], toasts: [], haptics: [] };
  const listeners = new Map();
  const sdk = {
    version: '1',
    launchParams: { slug: 'charada', language: 'es' },
    theme: null,
    ready: async () => null,
    close: async () => null,
    getTheme: async () => ({ mode: 'dark', colors: { bg: '#000000', surface: '#111111', text: '#ffffff', primary: '#0a84ff' } }),
    on(event, cb) {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event).push(cb);
    },
    off(event, cb) {
      const list = listeners.get(event) ?? [];
      listeners.set(event, list.filter((fn) => fn !== cb));
    },
    emit(event, payload) {
      for (const fn of listeners.get(event) ?? []) fn(payload);
    },
    openLink: async () => null,
    share: async () => null,
    auth: { requestLogin: async () => ({ init_data: 'a=1&hash=x', hash: 'x', scopes: ['profile'] }) },
    payments: { payInvoice: async () => ({ status: 'paid', transaction_uuid: 't' }) },
    ui: {
      header: { set: async (s) => { calls.headerSet.push(s); return null; } },
      mainButton: { set: async (s) => { calls.mainButtonSet.push(s); return null; } },
      backButton: { set: async () => null },
      colors: { set: async (s) => { calls.colorsSet.push(s); return null; } },
      haptic: async (t) => { calls.haptics.push(t); return null; },
      toast: async (m, o) => { calls.toasts.push({ m, o }); return null; },
    },
    ...overrides,
  };
  return { sdk, calls };
}

/** Minimal document double. */
function fakeDoc() {
  const classes = new Set();
  return {
    body: { style: { setProperty(k, v) { this[k] = v; } }, dataset: {} },
    documentElement: { classList: { add: (c) => classes.add(c) } },
    _classes: classes,
  };
}

// --- Presence ---------------------------------------------------------------

test('returns null when the page is outside QvaPay', () => {
  assert.equal(getQvaPay({}), null);
  assert.equal(getQvaPay({ QvaPay: null }), null);
  assert.equal(getQvaPay({ QvaPay: 'nope' }), null);
});

test('returns the SDK when present', () => {
  const { sdk } = fakeSdk();
  assert.equal(getQvaPay({ QvaPay: sdk }), sdk);
});

// --- whenReady --------------------------------------------------------------

test('runs immediately when the SDK is already present', () => {
  const { sdk } = fakeSdk();
  let received = null;
  const cleanup = whenReady((s) => { received = s; }, { QvaPay: sdk });
  assert.equal(received, sdk);
  assert.equal(typeof cleanup, 'function');
});

test('waits for qvapay:ready when the SDK is not yet injected', () => {
  const scope = new EventTarget();
  scope.QvaPay = undefined;
  let received = null;
  whenReady((s) => { received = s; }, scope);
  assert.equal(received, null);

  const { sdk } = fakeSdk();
  scope.QvaPay = sdk;
  scope.dispatchEvent(new Event('qvapay:ready'));
  assert.equal(received, sdk);
});

test('does not call start twice when ready fires after SDK appeared', () => {
  const { sdk } = fakeSdk();
  const scope = new EventTarget();
  let count = 0;
  whenReady(() => { count += 1; }, scope);
  scope.QvaPay = sdk;
  scope.dispatchEvent(new Event('qvapay:ready'));
  scope.dispatchEvent(new Event('qvapay:ready'));
  assert.equal(count, 1);
});

test('whenReady rejects a non-function', () => {
  assert.throws(() => whenReady(null), /requires a function/);
});

// --- Capability detection ---------------------------------------------------

test('detects every documented capability', () => {
  const { sdk } = fakeSdk();
  const caps = capabilities(sdk);
  assert.equal(caps.present, true);
  assert.equal(caps.header, true);
  assert.equal(caps.colors, true);
  assert.equal(caps.mainButton, true);
  assert.equal(caps.auth, true);
  assert.equal(caps.payments, true);
});

test('reports no capabilities when the SDK is absent', () => {
  const caps = capabilities(null);
  assert.equal(caps.present, false);
  assert.equal(caps.header, false);
});

test('detects a pre-3.7.0 host that lacks ui.header', () => {
  const { sdk } = fakeSdk();
  delete sdk.ui.header;
  const caps = capabilities(sdk);
  assert.equal(caps.header, false);
  assert.equal(caps.mainButton, true);
});

test('detects a pre-3.7.1 host that lacks ui.colors', () => {
  const { sdk } = fakeSdk();
  delete sdk.ui.colors;
  assert.equal(capabilities(sdk).colors, false);
});

// --- Theme ------------------------------------------------------------------

test('paints the host theme and follows themeChanged', async () => {
  const { sdk } = fakeSdk();
  const doc = fakeDoc();
  const stop = await applyTheme(sdk, doc, {});

  assert.equal(doc.body.style.background, '#000000');
  assert.equal(doc.body.style.color, '#ffffff');
  assert.equal(doc.body.dataset.themeMode, 'dark');
  // Custom properties must be set too, or the cards keep the stylesheet defaults
  // and go unreadable when the host switches to a light theme.
  assert.equal(doc.body.style['--bg'], '#000000');
  assert.equal(doc.body.style['--text'], '#ffffff');

  sdk.emit('themeChanged', { mode: 'light', colors: { bg: '#ffffff', text: '#000000' } });
  assert.equal(doc.body.style.background, '#ffffff');
  assert.equal(doc.body.dataset.themeMode, 'light');

  stop();
  sdk.emit('themeChanged', { mode: 'dark', colors: { bg: '#000000', text: '#fff' } });
  assert.equal(doc.body.style.background, '#ffffff');
});

test('a rejecting getTheme never breaks the page', async () => {
  const { sdk } = fakeSdk();
  sdk.getTheme = async () => { throw { code: 'FAILED', message: 'Unknown error' }; };
  const doc = fakeDoc();
  const stop = await applyTheme(sdk, doc, {});
  assert.equal(typeof stop, 'function');
  // Palette untouched, page keeps rendering.
  assert.equal(doc.body.style.background, undefined);
});

test('still subscribes to themeChanged when the initial fetch fails', async () => {
  const { sdk } = fakeSdk();
  sdk.getTheme = async () => { throw { code: 'FAILED' }; };
  const doc = fakeDoc();
  await applyTheme(sdk, doc, {});
  sdk.emit('themeChanged', { mode: 'light', colors: { bg: '#fff', text: '#000' } });
  assert.equal(doc.body.style.background, '#fff');
});

test('a malformed theme push is ignored rather than throwing', async () => {
  const { sdk } = fakeSdk();
  const doc = fakeDoc();
  await applyTheme(sdk, doc, {});
  sdk.emit('themeChanged', null);
  assert.equal(doc.body.style.background, '#000000');
});

test('applyTheme is a no-op without an SDK', async () => {
  const doc = fakeDoc();
  const stop = await applyTheme(null, doc, {});
  assert.equal(typeof stop, 'function');
  assert.equal(doc.body.style.background, undefined);
});

// --- Header -----------------------------------------------------------------

test('configures the header and marks the page as integrated', async () => {
  const { sdk, calls } = fakeSdk();
  const doc = fakeDoc();
  const ok = await configureHeader(sdk, { subtitle: 'Charada de hoy', actions: [{ id: 'cart', icon: 'cart', label: 'Carrito' }] }, doc);
  assert.equal(ok, true);
  assert.equal(calls.headerSet.length, 1);
  assert.equal(calls.headerSet[0].subtitle, 'Charada de hoy');
  assert.ok(doc._classes.has('in-qvapay'));
});

test('sends only the fields in play', async () => {
  const { sdk, calls } = fakeSdk();
  await configureHeader(sdk, { subtitle: 'Hola' }, fakeDoc());
  assert.deepEqual(Object.keys(calls.headerSet[0]), ['subtitle']);
});

test('clears the subtitle when passed null explicitly is skipped, empty string clears', async () => {
  const { sdk, calls } = fakeSdk();
  await configureHeader(sdk, { subtitle: '' }, fakeDoc());
  assert.equal(calls.headerSet[0].subtitle, '');
});

test('does nothing on a host without ui.header', async () => {
  const { sdk } = fakeSdk();
  delete sdk.ui.header;
  const doc = fakeDoc();
  const ok = await configureHeader(sdk, { subtitle: 'x' }, doc);
  assert.equal(ok, false);
  assert.equal(doc._classes.has('in-qvapay'), false);
});

// --- Main button ------------------------------------------------------------

test('always sends text and visible together for old-host compatibility', async () => {
  const { sdk, calls } = fakeSdk();
  await setMainButton(sdk, { text: 'Ver cargador' });
  const sent = calls.mainButtonSet[0];
  assert.equal(sent.text, 'Ver cargador');
  assert.equal(sent.visible, true);
  assert.equal(sent.enabled, true);
  assert.equal(sent.loading, false);
});

test('passes loading through without dropping text', async () => {
  const { sdk, calls } = fakeSdk();
  await setMainButton(sdk, { text: 'Pagar', loading: true });
  assert.deepEqual(calls.mainButtonSet[0], { text: 'Pagar', visible: true, enabled: true, loading: true });
});

test('setMainButton is a no-op without support', async () => {
  const { sdk } = fakeSdk();
  delete sdk.ui.mainButton;
  assert.equal(await setMainButton(sdk, { text: 'x' }), false);
});

// --- Errors -----------------------------------------------------------------

test('USER_CANCELLED is not an error and shows nothing', () => {
  const d = describeSdkError({ code: 'USER_CANCELLED', message: 'Cancelado' });
  assert.equal(d.silent, true);
  assert.equal(d.retryable, false);
});

test('BUSY is retryable', () => {
  assert.equal(describeSdkError({ code: 'BUSY', message: 'Ocupado' }).retryable, true);
});

test('FILE mismatches and invalid params are not retryable', () => {
  for (const code of ['NOT_ALLOWED', 'INVALID_PARAMS', 'INVOICE_APP_MISMATCH']) {
    assert.equal(describeSdkError({ code }).retryable, false, code);
  }
});

test('an unknown code falls back safely rather than throwing', () => {
  const d = describeSdkError({ code: 'WAT' });
  assert.equal(d.code, 'WAT');
  assert.equal(d.silent, false);
  const none = describeSdkError(undefined);
  assert.equal(none.code, 'UNKNOWN');
});
