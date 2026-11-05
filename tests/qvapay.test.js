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
  normaliseActions,
  setHeader,
  setColors,
  haptic,
  toast,
  share,
  openLink,
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

// --- Per-screen chrome ------------------------------------------------------
//
// One screen sends one header, one main-button state. The adapter's job is to
// keep that payload inside the host contract, and to stay silent when the host
// (or that part of it) is not there.

test('normaliseActions keeps the valid ones and drops the rest', () => {
  const kept = normaliseActions([
    { id: 'calendar', icon: 'calendar', label: 'Elegir fecha' },
    { id: 'con espacio', icon: 'search', label: 'Buscar' },
    { id: 'unknown-icon', icon: 'sparkles', label: 'Nada' },
    { id: 'no-label', icon: 'search', label: '' },
    { id: 'share', icon: 'share', label: 'Compartir' },
  ]);
  assert.deepEqual(kept.map((a) => a.id), ['calendar', 'share']);
});

test('normaliseActions caps at two actions and dedupes ids', () => {
  const kept = normaliseActions([
    { id: 'a', icon: 'search', label: 'A' },
    { id: 'a', icon: 'share', label: 'A otra vez' },
    { id: 'b', icon: 'calendar', label: 'B' },
    { id: 'c', icon: 'user', label: 'C' },
  ]);
  assert.deepEqual(kept.map((a) => a.id), ['a', 'b']);
});

test('normaliseActions clamps the badge into the host range', () => {
  const [kept] = normaliseActions([{ id: 'x', icon: 'bell', label: 'Avisos', badge: 140 }]);
  assert.equal(kept.badge, 99);
});

test('setHeader is a no-op without an SDK', async () => {
  assert.equal(await setHeader(null, { subtitle: 'Hola' }), false);
});

test('setHeader is a no-op when the host has no header', async () => {
  const { sdk, calls } = fakeSdk();
  delete sdk.ui.header;
  assert.equal(await setHeader(sdk, { subtitle: 'Hola' }), false);
  assert.equal(calls.headerSet.length, 0);
});

test('setHeader truncates the subtitle to 48 characters', async () => {
  const { sdk, calls } = fakeSdk();
  await setHeader(sdk, { subtitle: 'x'.repeat(80) });
  assert.equal(calls.headerSet[0].subtitle.length, 48);
});

test('setHeader clears the subtitle with an empty string', async () => {
  const { sdk, calls } = fakeSdk();
  await setHeader(sdk, { subtitle: '' });
  assert.equal(calls.headerSet[0].subtitle, null);
});

test('setHeader leaves the subtitle alone when it is not sent', async () => {
  const { sdk, calls } = fakeSdk();
  await setHeader(sdk, { actions: [{ id: 'search', icon: 'search', label: 'Buscar' }] });
  assert.equal('subtitle' in calls.headerSet[0], false);
  assert.equal(calls.headerSet[0].actions.length, 1);
});

test('setColors refuses anything that is not an opaque hex', async () => {
  const { sdk, calls } = fakeSdk();
  assert.equal(await setColors(sdk, { header: 'rgb(0, 0, 0)' }), false);
  assert.equal(await setColors(sdk, { background: '#12345' }), false);
  assert.equal(calls.colorsSet.length, 0);
});

test('setColors paints both surfaces when the values are valid', async () => {
  const { sdk, calls } = fakeSdk();
  assert.equal(await setColors(sdk, { header: '#0e1116', background: '#0E1116' }), true);
  assert.deepEqual(calls.colorsSet[0], { header: '#0e1116', background: '#0E1116' });
});

test('toast truncates to 120 characters and refuses an empty message', async () => {
  const { sdk, calls } = fakeSdk();
  await toast(sdk, 'y'.repeat(200), { type: 'error' });
  assert.equal(calls.toasts[0].m.length, 120);
  assert.equal(calls.toasts[0].o.type, 'error');
  assert.equal(await toast(sdk, ''), false);
});

test('share truncates to 200 characters', async () => {
  const { sdk } = fakeSdk();
  const seen = [];
  sdk.share = async (params) => { seen.push(params); return null; };
  await share(sdk, { text: 'z'.repeat(260) });
  assert.equal(seen[0].text.length, 200);
});

test('openLink accepts https only', async () => {
  const { sdk } = fakeSdk();
  const seen = [];
  sdk.openLink = async (url) => { seen.push(url); return null; };
  assert.equal(await openLink(sdk, 'http://floridalottery.com'), false);
  assert.equal(await openLink(sdk, 'javascript:alert(1)'), false);
  assert.equal(await openLink(sdk, 'https://floridalottery.com/'), true);
  assert.deepEqual(seen, ['https://floridalottery.com/']);
});

test('haptic defaults to the lightest tap', async () => {
  const { sdk, calls } = fakeSdk();
  await haptic(sdk);
  assert.deepEqual(calls.haptics, ['light']);
});

test('setMainButton always sends text and visible together', async () => {
  const { sdk, calls } = fakeSdk();
  await setMainButton(sdk, { text: 'Analizar', loading: true });
  assert.equal(calls.mainButtonSet[0].text, 'Analizar');
  assert.equal(calls.mainButtonSet[0].visible, true);
  await setMainButton(sdk, { text: 'w'.repeat(50) });
  assert.equal(calls.mainButtonSet[1].text.length, 32);
});
