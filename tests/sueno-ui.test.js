// Structural tests for the "Cuéntame tu sueño" screen.
//
// public/app.js cannot be imported without a DOM, so what has to be pinned here
// is the wiring the screen depends on — tile, route, chrome, request paths and
// error sentences — read from the source as text, the same way
// ui-session.test.js pins the session headers. Behaviour lives in the route
// tests; this file guards against a refactor silently dropping a piece.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
const styles = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8');

const SECTION_START = '// ---------- Cuéntame tu sueño';
const SECTION_END = '// ---------- Router';

/** The screen's own block, from its banner to the router table. */
function suenoBlock() {
  const start = source.indexOf(SECTION_START);
  assert.ok(start !== -1, `the sueno section moved: update this test (${SECTION_START})`);
  const end = source.indexOf(SECTION_END, start);
  assert.ok(end !== -1, `the router moved: update this test (${SECTION_END})`);
  return source.slice(start, end);
}

/** Text between a marker and the next one, so a slice cannot drift into a neighbour. */
function between(text, from, to) {
  const start = text.indexOf(from);
  assert.ok(start !== -1, `missing marker: ${from}`);
  const end = text.indexOf(to, start + from.length);
  assert.ok(end !== -1, `missing end marker: ${to}`);
  return text.slice(start, end);
}

test('the sueno tile is ready and promises text, not voice', () => {
  const tile = between(source, "id: 'sueno'", '},');

  assert.match(tile, /status: 'ready'/, 'the tile must be offered under the ready tools');
  assert.match(tile, /needsAccount: true/, 'the screen still needs a linked account (S7)');
  assert.ok(
    tile.includes("blurb: 'Cuéntanos lo que soñaste, con tus palabras, y te lo leemos en clave de charada.'"),
    'the blurb must be the agreed sentence',
  );
  // S1: no voice recording, in the wording or anywhere in the tile.
  assert.doesNotMatch(tile, /voz|grab/i, 'S1: the entry is text, so no voice wording');
});

test('openTool routes the sueno tile to its screen', () => {
  const body = between(source, 'async function openTool', 'async function linkAndRetry');
  assert.match(body, /if \(tool\.id === 'sueno'\) \{\s*navigate\('sueno'\);\s*return;/, 
    'sueno must navigate before the "coming soon" branch');
});

test('the router and the chrome know the sueno screen', () => {
  const views = between(source, 'const VIEWS = {', '};');
  assert.match(views, /sueno: viewSueno/);

  const chrome = between(source, 'function chromeFor', 'function syncChrome');
  const at = chrome.indexOf("case 'sueno':");
  assert.ok(at !== -1, 'chromeFor needs a sueno case');
  const block = chrome.slice(at, chrome.indexOf('case ', at + "case 'sueno':".length));
  assert.ok(block.includes('Cuéntame tu sueño'), 'the host subtitle names the screen');
  assert.match(block, /main: null/, 'the screen owns its action, like the analyser');
});

test('the screen posts the dream and reads the weekly counter', () => {
  const block = suenoBlock();
  assert.ok(block.includes("postJson('/api/sueno'"), 'the dream goes to POST /api/sueno');
  assert.ok(block.includes("getJson('/api/sueno/senales?dias=7')"),
    'the counter is read before anything is submitted (S3)');
});

test('the dream is typed in a bounded textarea the app owns', () => {
  const block = suenoBlock();
  assert.ok(block.includes("el('textarea', 'sueno__input'"), 'the entry is a textarea (S1)');
  assert.ok(block.includes("setAttribute('maxlength', '2000')"), 'the server cap is the field cap');
  assert.ok(block.includes("setAttribute('rows', '6')"), 'room for a paragraph');
  assert.ok(block.includes('Anoche soñé que…'), 'the placeholder invites the dream');
  assert.ok(block.includes("'sueno__go"), 'the round button is the only submit');
  assert.ok(block.includes('Interpretar'));
  // Enter inserts a newline: a dream is prose, and a stray Enter must not send it.
  assert.ok(!block.includes("'Enter'"), 'Enter must not submit the dream');
});

test('the heading steps aside inside the WebView', () => {
  const block = suenoBlock();
  assert.ok(block.includes('isHosted()'), 'the host bar already names the screen');
  assert.ok(block.includes('Cuéntame tu sueño'));
  assert.ok(block.includes('Queda guardado en tu cuenta, para que puedas volver a leerlo; nadie más lo ve.'),
    'the promise of S9 is on screen: the dream is stored for its author');
});

test('every error code of the route has a sentence', () => {
  const block = suenoBlock();
  for (const code of ['cuenta_requerida', 'sueno_vacio', 'sueno_largo', 'no_configurado']) {
    assert.ok(block.includes(code), `missing the ${code} branch`);
  }
  assert.ok(block.includes('Escribe tu sueño primero.'));
  assert.ok(block.includes('Tu sueño es muy largo: resúmelo en 2000 caracteres.'));
  assert.ok(block.includes('La interpretación todavía no está encendida en este servidor.'));
});

test('the result reads only what the route sends', () => {
  const block = suenoBlock();
  for (const key of ['elementos', 'resumen', 'senales', 'coincidencias', 'parecidos', 'muestra', 'compartidas']) {
    assert.ok(block.includes(key), `the result must read ${key}`);
  }
  // S4: of another person the screen shows their public profile and a count.
  for (const key of ['match.nombre', 'match.avatar', 'match.compartidas']) {
    assert.ok(block.includes(key), `the row must read ${key}`);
  }
  // Never their dream: not its text, not its signals, not its id.
  for (const forbidden of ['match.texto', 'match.senales', 'suenoId']) {
    assert.ok(!block.includes(forbidden), `must never render ${forbidden}`);
  }
});

test('the tabs are always there and the reading starts locked', () => {
  const block = suenoBlock();
  for (const label of ["'Mi sueño'", "'La interpretación'"]) {
    assert.ok(block.includes(label), `${label} is one of the two tabs`);
  }
  assert.ok(block.includes('is-locked'), 'the reading tab shows a locked state');
  assert.ok(block.includes('const locked = !suenoResult && !suenoLoading'),
    'it is locked until there is a reading or one on the way');
  assert.ok(block.includes("suenoTab = 'lectura'"), 'submitting opens the reading tab');
  assert.ok(block.includes('suenoSkeleton()'), 'the reading tab shows the skeleton while it waits');
  assert.ok(block.includes('typeResumen'), 'the reading is written out character by character');
});

test('the stored dreams are the author\'s own', () => {
  const block = suenoBlock();
  assert.ok(block.includes("getJson('/api/suenos')"), 'the history is read from its own route');
  assert.ok(block.includes("getJson(`/api/sueno/lectura?id="), 'a row opens one stored dream');
  assert.ok(block.includes('Tus sueños anteriores'));
});

test('the week is offered as play, not as a forecast', () => {
  const block = suenoBlock();
  for (const key of ['combinaciones', 'fijos', 'corridos', 'parles']) {
    assert.ok(block.includes(key), `the play panel must read ${key}`);
  }
  assert.ok(block.includes('Para jugar esta semana'));
  assert.ok(block.includes('no un pronóstico'));
});

test('the new block stays inside the sueno routes', () => {
  const block = suenoBlock();
  for (const other of ['/api/analisis', '/api/adivinanza', '/api/cultura',
    '/api/significados', '/api/dias', '/api/tiro']) {
    assert.ok(!block.includes(other), `the sueno block must not reach ${other}`);
  }
});

test('the tools next to sueno still open their own screens', () => {
  const body = between(source, 'async function openTool', 'async function linkAndRetry');
  for (const id of ['adivinanza', 'significados', 'cultura']) {
    assert.match(body, new RegExp(`tool\\.id === '${id}'\\s*\\)\\s*\\{\\s*navigate\\('${id}'\\)`),
      `the ${id} route must survive the new branch`);
  }
  assert.match(body, /tool\.status === 'soon'/, 'a pending tool still explains itself');
});

test('the chrome of the other screens is untouched', () => {
  const chrome = between(source, 'function chromeFor', 'function syncChrome');
  for (const [name, subtitle] of [
    ['tiros', 'El cargador de hoy'],
    ['historial', 'Historial'],
    ['analisis', 'Análisis'],
    ['adivinanza', 'La adivinanza'],
  ]) {
    assert.ok(chrome.includes(`case '${name}':`), `lost the ${name} chrome`);
    assert.ok(chrome.includes(subtitle), `lost the ${name} subtitle`);
  }
});

test('the stylesheet owns the textarea and the tap surfaces', () => {
  assert.ok(styles.includes('.sueno__input'), 'the textarea has its own rule, not browser chrome');
  assert.ok(styles.includes('.sueno__go'), 'the submit button has its own rule');
  const groupStart = styles.indexOf('Tap surfaces are not text to copy');
  assert.ok(groupStart !== -1, 'the tap-surface group moved: update this test');
  const group = styles.slice(groupStart, styles.indexOf('}', groupStart));
  assert.ok(group.includes('.sueno__go'), 'the submit button joins the tap surfaces');
});
